import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../services/adminRbac.js';
import { AppError } from '../utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DEFAULT_RESOURCES_UPLOAD_DIR = path.resolve(__dirname, '../../uploads/resources');
export const UPLOADS_DIR = DEFAULT_RESOURCES_UPLOAD_DIR;

export function resolveResourcesUploadDir(overrideDir = '') {
  const explicit = String(overrideDir || '').trim();
  if (explicit) return path.resolve(explicit);
  const fromEnv = String(process.env.RESOURCES_UPLOAD_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return DEFAULT_RESOURCES_UPLOAD_DIR;
}

export const DEFAULT_VIDEO_SECURITY = {
  protectedPlaybackEnabled: true,
  screenshotProtection: true,
  screenRecordingWarning: true,
  screenSharingProtection: true,
  studentWatermarkEnabled: true,
  securityEventLogging: true,
  warningHeading: 'SCREEN RECORDING DETECTED!',
  warningMessage:
    'For the protection of educational content, video playback has been temporarily paused.\n\nPlease stop screen recording or screen sharing to continue watching your lesson.',
  securityPolicy: 'strict',
};

/**
 * Enforces the mandatory video security protection floor:
 * Remote admin configuration can customize messaging, watermark visibility, and telemetry,
 * but can NEVER silently disable mandatory FLAG_SECURE or native recording block when
 * protected playback is active.
 */
export function enforceMandatoryVideoSecurityFloor(raw = {}) {
  const merged = { ...DEFAULT_VIDEO_SECURITY, ...(raw && typeof raw === 'object' ? raw : {}) };
  const protectedPlaybackEnabled = merged.protectedPlaybackEnabled !== false;
  const heading = String(merged.warningHeading || '').trim().slice(0, 100);
  const message = String(merged.warningMessage || '').trim().slice(0, 400);
  const policy = merged.securityPolicy === 'standard' ? 'standard' : 'strict';

  return {
    protectedPlaybackEnabled,
    screenshotProtection: protectedPlaybackEnabled ? true : Boolean(merged.screenshotProtection),
    screenRecordingWarning: protectedPlaybackEnabled ? true : Boolean(merged.screenRecordingWarning),
    screenSharingProtection: merged.screenSharingProtection !== false,
    studentWatermarkEnabled: merged.studentWatermarkEnabled !== false,
    securityEventLogging: merged.securityEventLogging !== false,
    warningHeading: heading || DEFAULT_VIDEO_SECURITY.warningHeading,
    warningMessage: message || DEFAULT_VIDEO_SECURITY.warningMessage,
    securityPolicy: policy,
    mandatoryProtectionFloorActive: protectedPlaybackEnabled,
  };
}

export const DEFAULT_APP_CONFIG = {
  homeBannerTitle: 'Class 10 – SSC (AP & Telangana)',
  homeBannerSubtitle: "Keep Learning... You're Doing Great!",
  announcementText: '',
  announcementEnabled: false,
  maintenanceMode: false,
  maintenanceMessage: 'We are performing scheduled maintenance. Please check back shortly.',
  minAndroidVersion: '1.0.0',
  latestAndroidVersion: '1.1.0',
  featuredLessonIds: [],
  hiddenSubjectSlugs: [],
  quickAccessItems: [
    { key: 'notes', title: 'Notes & PDFs', subtitle: '', route: '/courses', bg: '#fef6dc' },
    { key: 'doubts', title: 'Doubts', subtitle: '(Ask Teacher)', route: '/revision', bg: '#def7ec' },
    { key: 'practice', title: 'Practice', subtitle: '(MCQs)', route: '/exams', bg: '#e3f1ff' },
    { key: 'results', title: 'Results & Analysis', subtitle: '', route: '/progress', bg: '#efe6ff' },
  ],
  notificationsEnabled: true,
  videoSecurity: enforceMandatoryVideoSecurityFloor(DEFAULT_VIDEO_SECURITY),
};

function matchesBoard(recordBoardCodes, recordBoard, board) {
  if (!board) return true;
  if (Array.isArray(recordBoardCodes) && recordBoardCodes.length > 0) {
    return recordBoardCodes.includes(board) || recordBoardCodes.includes('BOTH');
  }
  if (!recordBoard || recordBoard === 'BOTH') return true;
  return recordBoard === board;
}

function isPublishedRecord(record) {
  if (!record) return false;
  if (record.is_active === false) return false;
  if (!record.status) return true; // Backward compatibility for legacy seeded rows
  if (record.status === 'published') return true;
  if (record.status === 'scheduled' && record.scheduled_publish_at) {
    return new Date(record.scheduled_publish_at).getTime() <= Date.now();
  }
  return false;
}

export function saveUploadedFile({ fileName, mimeType, contentBase64, uploadDir = '' }) {
  const targetDir = resolveResourcesUploadDir(uploadDir);
  fs.mkdirSync(targetDir, { recursive: true });
  const rawBase = path.basename(String(fileName || 'resource.pdf'));
  const safeBase = rawBase.replace(/[^a-zA-Z0-9._-]/g, '_') || 'resource.pdf';
  const storedName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}_${safeBase}`;
  const fullPath = path.join(targetDir, storedName);
  const buffer = Buffer.from(contentBase64, 'base64');
  fs.writeFileSync(fullPath, buffer);
  return {
    storagePath: storedName,
    fileSizeBytes: buffer.length,
    mimeType,
  };
}

export function resolveUploadedFilePath(storagePath, { uploadDir = '' } = {}) {
  if (!storagePath || typeof storagePath !== 'string') return null;
  if (
    storagePath.includes('\0') ||
    storagePath.includes('..') ||
    storagePath.includes('/') ||
    storagePath.includes('\\') ||
    path.isAbsolute(storagePath)
  ) {
    return null;
  }
  const targetDir = resolveResourcesUploadDir(uploadDir);
  const resolvedBase = path.resolve(targetDir);
  const resolved = path.resolve(resolvedBase, storagePath);
  if (!resolved.startsWith(`${resolvedBase}${path.sep}`)) {
    return null;
  }
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

function throwIfSbError(error, ctx) {
  if (error) throw new AppError(`${ctx}: ${error.message}`, 500, 'DATABASE_ERROR');
}

/**
 * Attaches complete Admin CMS, Assessment, Analytics, Notification, Config & RBAC
 * repository methods onto EITHER InMemoryDataStore OR SupabaseDataStore without
 * duplicating databases or breaking any existing student methods.
 */
export function ensureAdminStoreSupport(store, { seedDefaultAdmin = true } = {}) {
  if (store.__adminExtended) return store;
  store.__adminExtended = true;

  const isSupabase = Boolean(store.db && typeof store.db.from === 'function');
  if (isSupabase) {
    attachSupabaseAdminMethods(store);
    return store;
  }

  // ---- Initialize InMemory collections alongside existing student Maps ----
  store.boards = store.boards || new Map();
  store.academicYears = store.academicYears || new Map();
  store.topics = store.topics || new Map();
  store.studyResources = store.studyResources || new Map();
  store.questionBank = store.questionBank || new Map();
  store.quizzes = store.quizzes || new Map();
  store.quizAttempts = store.quizAttempts || [];
  store.exams = store.exams || new Map();
  store.examAttempts = store.examAttempts || [];
  store.notifications = store.notifications || new Map();
  store.notificationRecipients = store.notificationRecipients || [];
  store.adminUsers = store.adminUsers || new Map();
  store.adminSessions = store.adminSessions || new Map();
  store.adminAuditLogs = store.adminAuditLogs || [];
  store.appConfig = store.appConfig || { ...DEFAULT_APP_CONFIG };

  // Seed default Boards (AP & TS)
  if (store.boards.size === 0) {
    const apId = crypto.randomUUID();
    const tsId = crypto.randomUUID();
    store.boards.set(apId, {
      id: apId,
      code: 'AP',
      name: 'Andhra Pradesh SSC',
      short_name: 'AP SSC',
      syllabus_version: 'AP-SSC-2026',
      description: 'Board of Secondary Education, Andhra Pradesh Class 10',
      is_active: true,
      created_at: new Date().toISOString(),
    });
    store.boards.set(tsId, {
      id: tsId,
      code: 'TS',
      name: 'Telangana SSC',
      short_name: 'TS SSC',
      syllabus_version: 'TS-SSC-2026',
      description: 'Board of Secondary Education, Telangana Class 10',
      is_active: true,
      created_at: new Date().toISOString(),
    });
  }

  // Seed default Academic Year
  if (store.academicYears.size === 0) {
    const ayId = crypto.randomUUID();
    store.academicYears.set(ayId, {
      id: ayId,
      name: '2026-2027',
      start_date: '2026-06-01',
      end_date: '2027-04-30',
      syllabus_version: 'SSC-2026',
      is_active: true,
      is_archived: false,
      created_at: new Date().toISOString(),
    });
  }

  // Seed default Super Admin for local preview/tests (overrideable via env)
  if (seedDefaultAdmin && store.adminUsers.size === 0) {
    const superId = crypto.randomUUID();
    const email = (process.env.ADMIN_SEED_EMAIL || 'admin@class10lms.in').toLowerCase();
    const password = process.env.ADMIN_SEED_PASSWORD || 'Admin@1234';
    store.adminUsers.set(superId, {
      id: superId,
      full_name: 'Super Administrator',
      email,
      password_hash: hashPassword(password),
      role_code: 'super_admin',
      assigned_subject_ids: [],
      is_active: true,
      last_login_at: null,
      created_at: new Date().toISOString(),
    });
  }

  // Upgrade existing catalog queries to honour board_codes & status='published'
  store.listSubjects = async ({ board, includeAll = false } = {}) => {
    return [...store.subjects.values()]
      .filter((s) => {
        if (!includeAll && !isPublishedRecord(s)) return false;
        return matchesBoard(s.board_codes, s.board, board);
      })
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  };

  store.listChaptersBySubject = async (subjectId, { board = null, includeAll = false } = {}) => {
    return [...store.chapters.values()]
      .filter((c) => {
        if (c.subject_id !== subjectId) return false;
        if (!includeAll && !isPublishedRecord(c)) return false;
        return matchesBoard(c.board_codes, null, board);
      })
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  };

  store.listLessonsByChapter = async (
    chapterId,
    { page = 1, limit = 50, board = null, includeAll = false } = {}
  ) => {
    const all = [...store.lessons.values()]
      .filter((l) => {
        if (l.chapter_id !== chapterId) return false;
        if (!includeAll && !isPublishedRecord(l)) return false;
        return matchesBoard(l.board_codes, null, board);
      })
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const start = (page - 1) * limit;
    return { items: all.slice(start, start + limit), total: all.length };
  };

  // ---- Admin Auth & RBAC ----
  store.getAdminByEmail = async (email) =>
    [...store.adminUsers.values()].find((a) => a.email === email.toLowerCase()) || null;
  store.getAdminById = async (id) => store.adminUsers.get(id) || null;
  store.listAdminUsers = async () => [...store.adminUsers.values()];
  store.createAdminUser = async (row) => {
    const rec = { created_at: new Date().toISOString(), ...row };
    store.adminUsers.set(rec.id, rec);
    return rec;
  };
  store.updateAdminUser = async (id, patch) => {
    const existing = store.adminUsers.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
    store.adminUsers.set(id, next);
    return next;
  };
  store.createAdminSession = async (session) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...session };
    store.adminSessions.set(rec.id, rec);
    return rec;
  };
  store.getAdminSessionById = async (id) => store.adminSessions.get(id) || null;
  store.revokeAdminSession = async (id) => {
    const s = store.adminSessions.get(id);
    if (s) store.adminSessions.set(id, { ...s, is_revoked: true });
  };
  store.createAdminAuditLog = async (entry) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...entry };
    store.adminAuditLogs.unshift(rec);
    return rec;
  };
  store.listAdminAuditLogs = async ({ limit = 100, action = null, entityType = null } = {}) => {
    return store.adminAuditLogs
      .filter((l) => (!action || l.action.includes(action)) && (!entityType || l.entity_type === entityType))
      .slice(0, limit);
  };

  // ---- Students & Operations ----
  store.listAllProfiles = async () => [...store.profiles.values()];
  store.listAllSubscriptions = async () => [...store.subscriptions.values()];
  store.listAllPayments = async () => [...store.payments.values()];
  store.listAllPlans = async () => [...store.plans.values()];
  store.getPlanById = async (id) => store.plans.get(id) || null;
  store.createPlan = async (plan) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...plan };
    store.plans.set(rec.id, rec);
    return rec;
  };
  store.updatePlan = async (id, patch) => {
    const existing = store.plans.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
    store.plans.set(id, next);
    return next;
  };
  store.listAllProgress = async () => [...store.progress.values()];
  store.listAllPlaybackLogs = async () => [...store.playbackLogs];
  store.listAllMcqAttempts = async () => [...store.mcqAttempts];
  store.listUserMcqAttempts = async (userId) => store.mcqAttempts.filter((a) => a.user_id === userId);
  store.listUserPlaybackLogs = async (userId) => store.playbackLogs.filter((l) => l.user_id === userId);

  // ---- Boards & Academic Years ----
  store.listBoards = async () => [...store.boards.values()];
  store.getBoardById = async (id) => store.boards.get(id) || null;
  store.createBoard = async (row) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    store.boards.set(rec.id, rec);
    return rec;
  };
  store.updateBoard = async (id, patch) => {
    const existing = store.boards.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
    store.boards.set(id, next);
    return next;
  };

  store.listAcademicYears = async () => [...store.academicYears.values()];
  store.createAcademicYear = async (row) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    store.academicYears.set(rec.id, rec);
    return rec;
  };
  store.updateAcademicYear = async (id, patch) => {
    const existing = store.academicYears.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
    store.academicYears.set(id, next);
    return next;
  };

  // ---- Subjects / Chapters / Topics / Lessons / Videos CRUD ----
  store.getSubjectByIdRaw = async (id) => store.subjects.get(id) || null;
  store.createSubject = async (row) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    store.subjects.set(rec.id, rec);
    return rec;
  };
  store.updateSubject = async (id, patch) => {
    const existing = store.subjects.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
    store.subjects.set(id, next);
    return next;
  };
  store.deleteSubject = async (id) => {
    const existing = store.subjects.get(id);
    if (!existing) return false;
    store.subjects.set(id, { ...existing, is_active: false, status: 'archived' });
    return true;
  };

  store.listAllChapters = async ({ subjectId = null } = {}) =>
    [...store.chapters.values()]
      .filter((c) => !subjectId || c.subject_id === subjectId)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  store.getChapterById = async (id) => store.chapters.get(id) || null;
  store.createChapter = async (row) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    store.chapters.set(rec.id, rec);
    return rec;
  };
  store.updateChapter = async (id, patch) => {
    const existing = store.chapters.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
    store.chapters.set(id, next);
    return next;
  };

  store.listTopics = async ({ subjectId = null, chapterId = null, includeAll = false } = {}) =>
    [...store.topics.values()]
      .filter((t) => {
        if (subjectId && t.subject_id !== subjectId) return false;
        if (chapterId && t.chapter_id !== chapterId) return false;
        if (!includeAll && !isPublishedRecord(t)) return false;
        return true;
      })
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  store.getTopicById = async (id) => store.topics.get(id) || null;
  store.createTopic = async (row) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    store.topics.set(rec.id, rec);
    return rec;
  };
  store.updateTopic = async (id, patch) => {
    const existing = store.topics.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
    store.topics.set(id, next);
    return next;
  };

  store.listAllLessons = async ({ subjectId = null, chapterId = null, topicId = null, status = null } = {}) =>
    [...store.lessons.values()]
      .filter((l) => {
        if (subjectId && l.subject_id !== subjectId) return false;
        if (chapterId && l.chapter_id !== chapterId) return false;
        if (topicId && l.topic_id !== topicId) return false;
        if (status && (l.status || 'published') !== status) return false;
        return true;
      })
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  store.createLesson = async (row) => {
    const rec = { id: row.id || crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    store.lessons.set(rec.id, rec);
    return rec;
  };
  store.updateLesson = async (id, patch) => {
    const existing = store.lessons.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
    store.lessons.set(id, next);
    return next;
  };

  store.listAllVideoSources = async () => [...store.videoSources.values()];
  store.upsertVideoSource = async (lessonId, source) => {
    const existing = store.videoSources.get(lessonId);
    const next = {
      ...existing,
      ...source,
      lesson_id: lessonId,
      language_code: source.language_code || existing?.language_code || 'TE_EN_MIX',
      updated_at: new Date().toISOString(),
    };
    store.videoSources.set(lessonId, next);
    return next;
  };

  // ---- Study Resources & Notes ----
  store.listStudyResources = async ({
    subjectId = null,
    chapterId = null,
    topicId = null,
    lessonId = null,
    resourceType = null,
    medium = null,
    board = null,
    includeAll = false,
  } = {}) =>
    [...store.studyResources.values()]
      .filter((r) => {
        if (!includeAll && !isPublishedRecord(r)) return false;
        if (subjectId && r.subject_id !== subjectId) return false;
        if (chapterId && r.chapter_id !== chapterId) return false;
        if (topicId && r.topic_id !== topicId) return false;
        if (lessonId && r.lesson_id !== lessonId) return false;
        if (resourceType && r.resource_type !== resourceType) return false;
        if (medium && medium !== 'ALL' && r.medium !== 'BOTH' && r.medium !== medium) return false;
        if (!matchesBoard(r.board_codes, null, board)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  store.getStudyResourceById = async (id) => store.studyResources.get(id) || null;
  store.createStudyResource = async (row) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    store.studyResources.set(rec.id, rec);
    return rec;
  };
  store.updateStudyResource = async (id, patch) => {
    const existing = store.studyResources.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
    store.studyResources.set(id, next);
    return next;
  };

  // ---- Question Bank, Quizzes & Exams ----
  store.listQuestions = async ({
    subjectId = null,
    chapterId = null,
    topicId = null,
    lessonId = null,
    difficulty = null,
    questionType = null,
    board = null,
    status = null,
    search = null,
    includeAll = false,
  } = {}) => {
    const qLower = search ? search.toLowerCase() : null;
    return [...store.questionBank.values()]
      .filter((q) => {
        if (!includeAll && !isPublishedRecord(q)) return false;
        if (subjectId && q.subject_id !== subjectId) return false;
        if (chapterId && q.chapter_id !== chapterId) return false;
        if (topicId && q.topic_id !== topicId) return false;
        if (lessonId && q.lesson_id !== lessonId) return false;
        if (difficulty && q.difficulty !== difficulty) return false;
        if (questionType && q.question_type !== questionType) return false;
        if (status && (q.status || 'published') !== status) return false;
        if (!matchesBoard(q.board_codes, null, board)) return false;
        if (qLower && !q.question_text.toLowerCase().includes(qLower)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };
  store.getQuestionById = async (id) => store.questionBank.get(id) || null;
  store.createQuestion = async (row) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    store.questionBank.set(rec.id, rec);
    return rec;
  };
  store.updateQuestion = async (id, patch) => {
    const existing = store.questionBank.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
    store.questionBank.set(id, next);
    return next;
  };
  store.deleteQuestion = async (id) => store.questionBank.delete(id);

  store.listQuizzes = async ({ subjectId = null, chapterId = null, board = null, includeAll = false } = {}) =>
    [...store.quizzes.values()]
      .filter((q) => {
        if (!includeAll && !isPublishedRecord(q)) return false;
        if (subjectId && q.subject_id !== subjectId) return false;
        if (chapterId && q.chapter_id !== chapterId) return false;
        if (!matchesBoard(q.board_codes, null, board)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  store.getQuizById = async (id) => store.quizzes.get(id) || null;
  store.createQuiz = async (row) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    store.quizzes.set(rec.id, rec);
    return rec;
  };
  store.updateQuiz = async (id, patch) => {
    const existing = store.quizzes.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
    store.quizzes.set(id, next);
    return next;
  };
  store.createQuizAttempt = async (attempt) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...attempt };
    store.quizAttempts.push(rec);
    return rec;
  };
  store.getQuizAttemptById = async (id) => store.quizAttempts.find((a) => a.id === id) || null;
  store.updateQuizAttempt = async (id, patch) => {
    const idx = store.quizAttempts.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    store.quizAttempts[idx] = { ...store.quizAttempts[idx], ...patch };
    return store.quizAttempts[idx];
  };
  store.listQuizAttempts = async ({ userId = null, quizId = null } = {}) =>
    store.quizAttempts
      .filter((a) => (!userId || a.user_id === userId) && (!quizId || a.quiz_id === quizId))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  store.listExams = async ({ subjectId = null, board = null, includeAll = false } = {}) =>
    [...store.exams.values()]
      .filter((e) => {
        if (!includeAll && !isPublishedRecord(e)) return false;
        if (subjectId && e.subject_id !== subjectId) return false;
        if (!matchesBoard(e.board_codes, null, board)) return false;
        return true;
      })
      .sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date));
  store.getExamById = async (id) => store.exams.get(id) || null;
  store.createExam = async (row) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    store.exams.set(rec.id, rec);
    return rec;
  };
  store.updateExam = async (id, patch) => {
    const existing = store.exams.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updated_at: new Date().toISOString() };
    store.exams.set(id, next);
    return next;
  };
  store.createExamAttempt = async (attempt) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...attempt };
    store.examAttempts.push(rec);
    return rec;
  };
  store.getExamAttemptById = async (id) => store.examAttempts.find((a) => a.id === id) || null;
  store.updateExamAttempt = async (id, patch) => {
    const idx = store.examAttempts.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    store.examAttempts[idx] = { ...store.examAttempts[idx], ...patch };
    return store.examAttempts[idx];
  };
  store.listExamAttempts = async ({ userId = null, examId = null } = {}) =>
    store.examAttempts
      .filter((a) => (!userId || a.user_id === userId) && (!examId || a.exam_id === examId))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // ---- Notifications ----
  store.createNotification = async (notif) => {
    const rec = { id: crypto.randomUUID(), created_at: new Date().toISOString(), sent_at: new Date().toISOString(), ...notif };
    store.notifications.set(rec.id, rec);
    return rec;
  };
  store.listNotifications = async () =>
    [...store.notifications.values()].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
  store.addNotificationRecipients = async (rows) => {
    for (const r of rows) {
      store.notificationRecipients.push({
        id: crypto.randomUUID(),
        delivery_status: 'delivered',
        is_read: false,
        read_at: null,
        created_at: new Date().toISOString(),
        ...r,
      });
    }
  };
  store.listNotificationRecipients = async ({ notificationId = null, userId = null } = {}) =>
    store.notificationRecipients.filter(
      (r) => (!notificationId || r.notification_id === notificationId) && (!userId || r.user_id === userId)
    );
  store.markNotificationRead = async (notificationId, userId) => {
    const row = store.notificationRecipients.find(
      (r) => r.notification_id === notificationId && r.user_id === userId
    );
    if (row) {
      row.is_read = true;
      row.read_at = new Date().toISOString();
    }
    return row || null;
  };

  // ---- App Configuration & Security Events ----
  store.getAppConfig = async () => ({
    ...DEFAULT_APP_CONFIG,
    ...store.appConfig,
    videoSecurity: enforceMandatoryVideoSecurityFloor({
      ...DEFAULT_VIDEO_SECURITY,
      ...(store.appConfig?.videoSecurity || {}),
    }),
  });
  store.updateAppConfig = async (patch) => {
    const currentVideoSecurity = store.appConfig?.videoSecurity || DEFAULT_VIDEO_SECURITY;
    const nextVideoSecurity =
      patch?.videoSecurity !== undefined
        ? enforceMandatoryVideoSecurityFloor({ ...currentVideoSecurity, ...patch.videoSecurity })
        : enforceMandatoryVideoSecurityFloor(currentVideoSecurity);
    store.appConfig = {
      ...DEFAULT_APP_CONFIG,
      ...store.appConfig,
      ...patch,
      videoSecurity: nextVideoSecurity,
      updated_at: new Date().toISOString(),
    };
    return store.appConfig;
  };
  store.listSecurityEvents = async ({ limit = 100, eventType = null, userId = null } = {}) => {
    return [...(store.securityEvents || [])]
      .filter((ev) => {
        if (eventType && ev.event_type !== eventType) return false;
        if (userId && ev.user_id !== userId) return false;
        return true;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  };

  return store;
}

/**
 * Production Supabase PostgreSQL bindings for Migration 006 tables.
 */
function attachSupabaseAdminMethods(store) {
  const db = store.db;

  store.getAdminByEmail = async (email) => {
    const { data, error } = await db.from('admin_users').select('*').eq('email', email.toLowerCase()).maybeSingle();
    throwIfSbError(error, 'getAdminByEmail');
    return data;
  };
  store.getAdminById = async (id) => {
    const { data, error } = await db.from('admin_users').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getAdminById');
    return data;
  };
  store.listAdminUsers = async () => {
    const { data, error } = await db.from('admin_users').select('*').order('created_at', { ascending: false });
    throwIfSbError(error, 'listAdminUsers');
    return data || [];
  };
  store.createAdminUser = async (row) => {
    const { data, error } = await db.from('admin_users').insert(row).select('*').single();
    throwIfSbError(error, 'createAdminUser');
    return data;
  };
  store.updateAdminUser = async (id, patch) => {
    const { data, error } = await db.from('admin_users').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateAdminUser');
    return data;
  };
  store.createAdminSession = async (session) => {
    const { data, error } = await db.from('admin_sessions').insert(session).select('*').single();
    throwIfSbError(error, 'createAdminSession');
    return data;
  };
  store.getAdminSessionById = async (id) => {
    const { data, error } = await db.from('admin_sessions').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getAdminSessionById');
    return data;
  };
  store.revokeAdminSession = async (id) => {
    const { error } = await db.from('admin_sessions').update({ is_revoked: true }).eq('id', id);
    throwIfSbError(error, 'revokeAdminSession');
  };
  store.createAdminAuditLog = async (entry) => {
    const { data, error } = await db.from('admin_audit_logs').insert(entry).select('*').single();
    throwIfSbError(error, 'createAdminAuditLog');
    return data;
  };
  store.listAdminAuditLogs = async ({ limit = 100 } = {}) => {
    const { data, error } = await db.from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
    throwIfSbError(error, 'listAdminAuditLogs');
    return data || [];
  };

  store.listAllProfiles = async () => {
    const { data, error } = await db.from('profiles').select('*').order('created_at', { ascending: false });
    throwIfSbError(error, 'listAllProfiles');
    return data || [];
  };
  store.listAllSubscriptions = async () => {
    const { data, error } = await db.from('subscriptions').select('*').order('created_at', { ascending: false });
    throwIfSbError(error, 'listAllSubscriptions');
    return data || [];
  };
  store.listAllPayments = async () => {
    const { data, error } = await db.from('payment_transactions').select('*').order('created_at', { ascending: false });
    throwIfSbError(error, 'listAllPayments');
    return data || [];
  };
  store.listAllPlans = async () => {
    const { data, error } = await db.from('subscription_plans').select('*').order('price_paise', { ascending: true });
    throwIfSbError(error, 'listAllPlans');
    return data || [];
  };
  store.getPlanById = async (id) => {
    const { data, error } = await db.from('subscription_plans').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getPlanById');
    return data;
  };
  store.createPlan = async (row) => {
    const { data, error } = await db.from('subscription_plans').insert(row).select('*').single();
    throwIfSbError(error, 'createPlan');
    return data;
  };
  store.updatePlan = async (id, patch) => {
    const { data, error } = await db.from('subscription_plans').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updatePlan');
    return data;
  };
  store.listAllProgress = async () => {
    const { data, error } = await db.from('lesson_progress').select('*');
    throwIfSbError(error, 'listAllProgress');
    return data || [];
  };
  store.listAllPlaybackLogs = async () => {
    const { data, error } = await db.from('playback_audit_logs').select('*').order('created_at', { ascending: false }).limit(500);
    throwIfSbError(error, 'listAllPlaybackLogs');
    return data || [];
  };
  store.listAllMcqAttempts = async () => {
    const { data, error } = await db.from('mcq_attempts').select('*').order('attempted_at', { ascending: false });
    throwIfSbError(error, 'listAllMcqAttempts');
    return data || [];
  };
  store.listUserMcqAttempts = async (userId) => {
    const { data, error } = await db.from('mcq_attempts').select('*').eq('user_id', userId).order('attempted_at', { ascending: false });
    throwIfSbError(error, 'listUserMcqAttempts');
    return data || [];
  };
  store.listUserPlaybackLogs = async (userId) => {
    const { data, error } = await db.from('playback_audit_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
    throwIfSbError(error, 'listUserPlaybackLogs');
    return data || [];
  };

  store.listBoards = async () => {
    const { data, error } = await db.from('boards').select('*').order('code', { ascending: true });
    throwIfSbError(error, 'listBoards');
    return data || [];
  };
  store.getBoardById = async (id) => {
    const { data, error } = await db.from('boards').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getBoardById');
    return data;
  };
  store.createBoard = async (row) => {
    const { data, error } = await db.from('boards').insert(row).select('*').single();
    throwIfSbError(error, 'createBoard');
    return data;
  };
  store.updateBoard = async (id, patch) => {
    const { data, error } = await db.from('boards').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateBoard');
    return data;
  };

  store.listAcademicYears = async () => {
    const { data, error } = await db.from('academic_years').select('*').order('start_date', { ascending: false });
    throwIfSbError(error, 'listAcademicYears');
    return data || [];
  };
  store.createAcademicYear = async (row) => {
    const { data, error } = await db.from('academic_years').insert(row).select('*').single();
    throwIfSbError(error, 'createAcademicYear');
    return data;
  };
  store.updateAcademicYear = async (id, patch) => {
    const { data, error } = await db.from('academic_years').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateAcademicYear');
    return data;
  };

  store.getSubjectByIdRaw = async (id) => {
    const { data, error } = await db.from('subjects').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getSubjectByIdRaw');
    return data;
  };
  store.createSubject = async (row) => {
    const { data, error } = await db.from('subjects').insert(row).select('*').single();
    throwIfSbError(error, 'createSubject');
    return data;
  };
  store.updateSubject = async (id, patch) => {
    const { data, error } = await db.from('subjects').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateSubject');
    return data;
  };
  store.deleteSubject = async (id) => {
    const { error } = await db.from('subjects').update({ is_active: false, status: 'archived' }).eq('id', id);
    throwIfSbError(error, 'deleteSubject');
    return true;
  };

  store.listAllChapters = async ({ subjectId = null } = {}) => {
    let q = db.from('chapters').select('*').order('display_order', { ascending: true });
    if (subjectId) q = q.eq('subject_id', subjectId);
    const { data, error } = await q;
    throwIfSbError(error, 'listAllChapters');
    return data || [];
  };
  store.getChapterById = async (id) => {
    const { data, error } = await db.from('chapters').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getChapterById');
    return data;
  };
  store.createChapter = async (row) => {
    const { data, error } = await db.from('chapters').insert(row).select('*').single();
    throwIfSbError(error, 'createChapter');
    return data;
  };
  store.updateChapter = async (id, patch) => {
    const { data, error } = await db.from('chapters').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateChapter');
    return data;
  };

  store.listTopics = async ({ subjectId = null, chapterId = null, includeAll = false } = {}) => {
    let q = db.from('topics').select('*').order('display_order', { ascending: true });
    if (subjectId) q = q.eq('subject_id', subjectId);
    if (chapterId) q = q.eq('chapter_id', chapterId);
    if (!includeAll) q = q.eq('is_active', true).eq('status', 'published');
    const { data, error } = await q;
    throwIfSbError(error, 'listTopics');
    return data || [];
  };
  store.getTopicById = async (id) => {
    const { data, error } = await db.from('topics').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getTopicById');
    return data;
  };
  store.createTopic = async (row) => {
    const { data, error } = await db.from('topics').insert(row).select('*').single();
    throwIfSbError(error, 'createTopic');
    return data;
  };
  store.updateTopic = async (id, patch) => {
    const { data, error } = await db.from('topics').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateTopic');
    return data;
  };

  store.listAllLessons = async ({ subjectId = null, chapterId = null, topicId = null, status = null } = {}) => {
    let q = db.from('lessons').select('*').order('display_order', { ascending: true });
    if (subjectId) q = q.eq('subject_id', subjectId);
    if (chapterId) q = q.eq('chapter_id', chapterId);
    if (topicId) q = q.eq('topic_id', topicId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    throwIfSbError(error, 'listAllLessons');
    return data || [];
  };
  store.createLesson = async (row) => {
    const { data, error } = await db.from('lessons').insert(row).select('*').single();
    throwIfSbError(error, 'createLesson');
    return data;
  };
  store.updateLesson = async (id, patch) => {
    const { data, error } = await db.from('lessons').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateLesson');
    return data;
  };

  store.listAllVideoSources = async () => {
    const { data, error } = await db.from('lesson_video_sources').select('*');
    throwIfSbError(error, 'listAllVideoSources');
    return data || [];
  };
  store.upsertVideoSource = async (lessonId, source) => {
    const { data, error } = await db
      .from('lesson_video_sources')
      .upsert({ ...source, lesson_id: lessonId }, { onConflict: 'lesson_id' })
      .select('*')
      .single();
    throwIfSbError(error, 'upsertVideoSource');
    return data;
  };

  store.listStudyResources = async ({ subjectId, chapterId, lessonId, medium, includeAll = false } = {}) => {
    let q = db.from('study_resources').select('*').order('created_at', { ascending: false });
    if (subjectId) q = q.eq('subject_id', subjectId);
    if (chapterId) q = q.eq('chapter_id', chapterId);
    if (lessonId) q = q.eq('lesson_id', lessonId);
    if (medium && medium !== 'ALL') q = q.in('medium', [medium, 'BOTH']);
    if (!includeAll) q = q.eq('status', 'published');
    const { data, error } = await q;
    throwIfSbError(error, 'listStudyResources');
    return data || [];
  };
  store.getStudyResourceById = async (id) => {
    const { data, error } = await db.from('study_resources').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getStudyResourceById');
    return data;
  };
  store.createStudyResource = async (row) => {
    const { data, error } = await db.from('study_resources').insert(row).select('*').single();
    throwIfSbError(error, 'createStudyResource');
    return data;
  };
  store.updateStudyResource = async (id, patch) => {
    const { data, error } = await db.from('study_resources').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateStudyResource');
    return data;
  };

  store.listQuestions = async ({ subjectId, chapterId, difficulty, questionType, status, includeAll = false } = {}) => {
    let q = db.from('question_bank').select('*').order('created_at', { ascending: false });
    if (subjectId) q = q.eq('subject_id', subjectId);
    if (chapterId) q = q.eq('chapter_id', chapterId);
    if (difficulty) q = q.eq('difficulty', difficulty);
    if (questionType) q = q.eq('question_type', questionType);
    if (status) q = q.eq('status', status);
    else if (!includeAll) q = q.eq('status', 'published');
    const { data, error } = await q;
    throwIfSbError(error, 'listQuestions');
    return data || [];
  };
  store.getQuestionById = async (id) => {
    const { data, error } = await db.from('question_bank').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getQuestionById');
    return data;
  };
  store.createQuestion = async (row) => {
    const { data, error } = await db.from('question_bank').insert(row).select('*').single();
    throwIfSbError(error, 'createQuestion');
    return data;
  };
  store.updateQuestion = async (id, patch) => {
    const { data, error } = await db.from('question_bank').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateQuestion');
    return data;
  };
  store.deleteQuestion = async (id) => {
    const { error } = await db.from('question_bank').delete().eq('id', id);
    throwIfSbError(error, 'deleteQuestion');
    return true;
  };

  store.listQuizzes = async ({ subjectId, chapterId, includeAll = false } = {}) => {
    let q = db.from('quizzes').select('*').order('created_at', { ascending: false });
    if (subjectId) q = q.eq('subject_id', subjectId);
    if (chapterId) q = q.eq('chapter_id', chapterId);
    if (!includeAll) q = q.eq('status', 'published');
    const { data, error } = await q;
    throwIfSbError(error, 'listQuizzes');
    return data || [];
  };
  store.getQuizById = async (id) => {
    const { data, error } = await db.from('quizzes').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getQuizById');
    return data;
  };
  store.createQuiz = async (row) => {
    const { data, error } = await db.from('quizzes').insert(row).select('*').single();
    throwIfSbError(error, 'createQuiz');
    return data;
  };
  store.updateQuiz = async (id, patch) => {
    const { data, error } = await db.from('quizzes').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateQuiz');
    return data;
  };
  store.createQuizAttempt = async (row) => {
    const { data, error } = await db.from('quiz_attempts').insert(row).select('*').single();
    throwIfSbError(error, 'createQuizAttempt');
    return data;
  };
  store.getQuizAttemptById = async (id) => {
    const { data, error } = await db.from('quiz_attempts').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getQuizAttemptById');
    return data;
  };
  store.updateQuizAttempt = async (id, patch) => {
    const { data, error } = await db.from('quiz_attempts').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateQuizAttempt');
    return data;
  };
  store.listQuizAttempts = async ({ userId, quizId } = {}) => {
    let q = db.from('quiz_attempts').select('*').order('created_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    if (quizId) q = q.eq('quiz_id', quizId);
    const { data, error } = await q;
    throwIfSbError(error, 'listQuizAttempts');
    return data || [];
  };

  store.listExams = async ({ subjectId, includeAll = false } = {}) => {
    let q = db.from('exams').select('*').order('exam_date', { ascending: true });
    if (subjectId) q = q.eq('subject_id', subjectId);
    if (!includeAll) q = q.eq('status', 'published');
    const { data, error } = await q;
    throwIfSbError(error, 'listExams');
    return data || [];
  };
  store.getExamById = async (id) => {
    const { data, error } = await db.from('exams').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getExamById');
    return data;
  };
  store.createExam = async (row) => {
    const { data, error } = await db.from('exams').insert(row).select('*').single();
    throwIfSbError(error, 'createExam');
    return data;
  };
  store.updateExam = async (id, patch) => {
    const { data, error } = await db.from('exams').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateExam');
    return data;
  };
  store.createExamAttempt = async (row) => {
    const { data, error } = await db.from('exam_attempts').insert(row).select('*').single();
    throwIfSbError(error, 'createExamAttempt');
    return data;
  };
  store.getExamAttemptById = async (id) => {
    const { data, error } = await db.from('exam_attempts').select('*').eq('id', id).maybeSingle();
    throwIfSbError(error, 'getExamAttemptById');
    return data;
  };
  store.updateExamAttempt = async (id, patch) => {
    const { data, error } = await db.from('exam_attempts').update(patch).eq('id', id).select('*').single();
    throwIfSbError(error, 'updateExamAttempt');
    return data;
  };
  store.listExamAttempts = async ({ userId, examId } = {}) => {
    let q = db.from('exam_attempts').select('*').order('created_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    if (examId) q = q.eq('exam_id', examId);
    const { data, error } = await q;
    throwIfSbError(error, 'listExamAttempts');
    return data || [];
  };

  store.createNotification = async (row) => {
    const { data, error } = await db.from('notifications').insert(row).select('*').single();
    throwIfSbError(error, 'createNotification');
    return data;
  };
  store.listNotifications = async () => {
    const { data, error } = await db.from('notifications').select('*').order('sent_at', { ascending: false });
    throwIfSbError(error, 'listNotifications');
    return data || [];
  };
  store.addNotificationRecipients = async (rows) => {
    if (!rows.length) return;
    const { error } = await db.from('notification_recipients').upsert(rows, { onConflict: 'notification_id,user_id' });
    throwIfSbError(error, 'addNotificationRecipients');
  };
  store.listNotificationRecipients = async ({ notificationId, userId } = {}) => {
    let q = db.from('notification_recipients').select('*').order('created_at', { ascending: false });
    if (notificationId) q = q.eq('notification_id', notificationId);
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q;
    throwIfSbError(error, 'listNotificationRecipients');
    return data || [];
  };
  store.markNotificationRead = async (notificationId, userId) => {
    const { data, error } = await db
      .from('notification_recipients')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('notification_id', notificationId)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    throwIfSbError(error, 'markNotificationRead');
    return data;
  };

  store.getAppConfig = async () => {
    const { data, error } = await db.from('app_configurations').select('*').eq('key', 'mobile_app').maybeSingle();
    throwIfSbError(error, 'getAppConfig');
    const raw = data?.value_json || {};
    return {
      ...DEFAULT_APP_CONFIG,
      ...raw,
      videoSecurity: enforceMandatoryVideoSecurityFloor({
        ...DEFAULT_VIDEO_SECURITY,
        ...(raw.videoSecurity || {}),
      }),
    };
  };
  store.updateAppConfig = async (patch) => {
    const current = await store.getAppConfig();
    const nextVideoSecurity =
      patch?.videoSecurity !== undefined
        ? enforceMandatoryVideoSecurityFloor({ ...(current.videoSecurity || {}), ...patch.videoSecurity })
        : enforceMandatoryVideoSecurityFloor(current.videoSecurity || {});
    const next = { ...current, ...patch, videoSecurity: nextVideoSecurity };
    const { error } = await db
      .from('app_configurations')
      .upsert({ key: 'mobile_app', value_json: next, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    throwIfSbError(error, 'updateAppConfig');
    return next;
  };
  store.listSecurityEvents = async ({ limit = 100, eventType = null, userId = null } = {}) => {
    let q = db.from('security_events').select('*').order('created_at', { ascending: false }).limit(limit);
    if (eventType) q = q.eq('event_type', eventType);
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q;
    throwIfSbError(error, 'listSecurityEvents');
    return data || [];
  };
}
