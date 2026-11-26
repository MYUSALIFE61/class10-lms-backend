import crypto from 'node:crypto';
import { UnauthorizedError, ConflictError } from '../../src/utils/errors.js';

export function makeTestConfig(overrides = {}) {
  return {
    NODE_ENV: 'test',
    PORT: 4000,
    TRUST_PROXY: 1,
    ALLOWED_ORIGINS: 'https://localhost,http://localhost:5173',
    allowedOrigins: ['https://localhost', 'http://localhost:5173'],
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key-12345678901234567890',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key-12345678901234567890',
    JWT_ACCESS_SECRET: 'test-access-secret-must-be-32-chars-minimum-01',
    JWT_REFRESH_SECRET: 'test-refresh-secret-must-be-32-chars-minimum-02',
    DEVICE_HASH_SECRET: 'test-device-hmac-secret-must-be-32-chars-min-03',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL_DAYS: 7,
    SUBSCRIPTION_PLAN_CODE: 'CLASS10_ANNUAL_499',
    MAX_DEVICES_PER_STUDENT: 1,
    CONCURRENT_SESSION_WINDOW_MINUTES: 10,
    RAZORPAY_KEY_ID: 'rzp_test_1234567890',
    RAZORPAY_KEY_SECRET: 'rzp_test_secret_9876543210',
    RAZORPAY_WEBHOOK_SECRET: 'rzp_webhook_secret_abcdef1234',
    GOOGLE_PLAY_PACKAGE_NAME: 'in.class10lms.ssc',
    GOOGLE_CLOUD_PROJECT_NUMBER: '',
    GOOGLE_SERVICE_ACCOUNT_JSON: '',
    INTEGRITY_DISTRIBUTION_MODE: 'sideload',
    INTEGRITY_ENFORCEMENT_MODE: 'monitor',
    VIDEO_STORAGE_PROVIDER: 'none',
    PIKPAK_CLI_PATH: '',
    PUBLIC_API_BASE_URL: '',
    R2_CUSTOM_DOMAIN: '',
    R2_SIGNING_SECRET: '',
    STREAM_TOKEN_TTL_SECONDS: 900,
    ...overrides,
  };
}

export class InMemoryAuthProvider {
  constructor() {
    this.users = new Map();
  }

  async signUp({ email, password }) {
    const key = email.toLowerCase();
    if (this.users.has(key)) {
      throw new ConflictError('An account with this email already exists', 'EMAIL_EXISTS');
    }
    const id = crypto.randomUUID();
    this.users.set(key, { id, email: key, password });
    return { id, email: key };
  }

  async verifyCredentials({ email, password }) {
    const u = this.users.get(email.toLowerCase());
    if (!u || u.password !== password) {
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    return { id: u.id, email: u.email };
  }
}

/**
 * Strictly for automated tests in tests/*.test.js — never imported by production code.
 */
export class InMemoryDataStore {
  constructor() {
    this.profiles = new Map();
    this.devices = new Map();
    this.sessions = new Map();
    this.securityEvents = [];
    this.plans = new Map();
    this.subscriptions = new Map();
    this.payments = new Map();
    this.subjects = new Map();
    this.chapters = new Map();
    this.lessons = new Map();
    this.videoSources = new Map();
    this.mcqs = new Map();
    this.mcqAttempts = [];
    this.notes = new Map();
    this.pyqs = new Map();
    this.formulas = new Map();
    this.progress = new Map();
    this.playbackLogs = [];

    const planId = crypto.randomUUID();
    this.plans.set(planId, {
      id: planId,
      code: 'CLASS10_ANNUAL_499',
      name: 'Class 10 Complete AP & TS SSC Pass',
      description: 'Annual Class 10 subscription',
      price_paise: 49900,
      currency: 'INR',
      duration_days: 365,
      is_active: true,
    });
  }

  async getProfileById(id) {
    return this.profiles.get(id) || null;
  }

  async createProfile(profile) {
    const row = { ...profile, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    this.profiles.set(row.id, row);
    return row;
  }

  async updateProfile(id, patch) {
    const row = { ...this.profiles.get(id), ...patch, updated_at: new Date().toISOString() };
    this.profiles.set(id, row);
    return row;
  }

  async listUserDevices(userId, { activeOnly = false } = {}) {
    return [...this.devices.values()].filter(
      (d) => d.user_id === userId && (!activeOnly || d.is_active)
    );
  }

  async getDeviceByUserAndHash(userId, hash) {
    return (
      [...this.devices.values()].find(
        (d) => d.user_id === userId && d.device_id_hash === hash
      ) || null
    );
  }

  async getDeviceById(id) {
    return this.devices.get(id) || null;
  }

  async upsertDevice(device) {
    const existing = await this.getDeviceByUserAndHash(device.user_id, device.device_id_hash);
    if (existing) {
      return this.updateDevice(existing.id, device);
    }
    const row = { id: crypto.randomUUID(), integrity_verdict: 'UNCHECKED', ...device };
    this.devices.set(row.id, row);
    return row;
  }

  async updateDevice(id, patch) {
    const row = { ...this.devices.get(id), ...patch };
    this.devices.set(id, row);
    return row;
  }

  async createSession(session) {
    const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...session };
    this.sessions.set(row.id, row);
    return row;
  }

  async getSessionById(id) {
    return this.sessions.get(id) || null;
  }

  async getSessionByRefreshHash(hash) {
    return [...this.sessions.values()].find((s) => s.refresh_token_hash === hash) || null;
  }

  async listActiveSessionsForUser(userId) {
    const now = Date.now();
    return [...this.sessions.values()].filter(
      (s) => s.user_id === userId && !s.is_revoked && new Date(s.expires_at).getTime() > now
    );
  }

  async updateSession(id, patch) {
    const row = { ...this.sessions.get(id), ...patch };
    this.sessions.set(id, row);
    return row;
  }

  async revokeSessionsByDevice(userId, deviceId, reason) {
    for (const s of this.sessions.values()) {
      if (s.user_id === userId && s.device_id === deviceId && !s.is_revoked) {
        s.is_revoked = true;
        s.revoked_reason = reason;
      }
    }
  }

  async revokeAllSessionsForUser(userId, reason, { exceptSessionId = null } = {}) {
    for (const s of this.sessions.values()) {
      if (s.user_id === userId && !s.is_revoked && s.id !== exceptSessionId) {
        s.is_revoked = true;
        s.revoked_reason = reason;
      }
    }
  }

  async logSecurityEvent(event) {
    this.securityEvents.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...event });
  }

  async getPlanByCode(code) {
    return [...this.plans.values()].find((p) => p.code === code && p.is_active) || null;
  }

  async listActivePlans() {
    return [...this.plans.values()].filter((p) => p.is_active);
  }

  async getLatestSubscription(userId) {
    const rows = [...this.subscriptions.values()]
      .filter((s) => s.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return rows[0] || null;
  }

  async getActiveSubscription(userId) {
    const now = Date.now();
    const rows = [...this.subscriptions.values()]
      .filter(
        (s) =>
          s.user_id === userId &&
          s.status === 'active' &&
          s.expires_at &&
          new Date(s.expires_at).getTime() > now
      )
      .sort((a, b) => new Date(b.expires_at) - new Date(a.expires_at));
    return rows[0] || null;
  }

  async createSubscription(sub) {
    const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...sub };
    this.subscriptions.set(row.id, row);
    return row;
  }

  async updateSubscription(id, patch) {
    const row = { ...this.subscriptions.get(id), ...patch, updated_at: new Date().toISOString() };
    this.subscriptions.set(id, row);
    return row;
  }

  async createPaymentTransaction(tx) {
    const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...tx };
    this.payments.set(row.id, row);
    return row;
  }

  async getPaymentByOrderId(orderId) {
    return [...this.payments.values()].find((p) => p.razorpay_order_id === orderId) || null;
  }

  async getPaymentById(id) {
    return this.payments.get(id) || null;
  }

  async updatePaymentTransaction(id, patch) {
    const row = { ...this.payments.get(id), ...patch, updated_at: new Date().toISOString() };
    this.payments.set(id, row);
    return row;
  }

  async listSubjects({ board } = {}) {
    return [...this.subjects.values()]
      .filter((s) => s.is_active && (!board || s.board === board || s.board === 'BOTH'))
      .sort((a, b) => a.display_order - b.display_order);
  }

  async getSubjectById(id) {
    const s = this.subjects.get(id);
    return s && s.is_active ? s : null;
  }

  async listChaptersBySubject(subjectId) {
    return [...this.chapters.values()]
      .filter((c) => c.subject_id === subjectId && c.is_active)
      .sort((a, b) => a.display_order - b.display_order);
  }

  async listLessonsByChapter(chapterId, { page = 1, limit = 50 } = {}) {
    const all = [...this.lessons.values()]
      .filter((l) => l.chapter_id === chapterId && l.is_active)
      .sort((a, b) => a.display_order - b.display_order);
    const start = (page - 1) * limit;
    return { items: all.slice(start, start + limit), total: all.length };
  }

  async getLessonById(id) {
    return this.lessons.get(id) || null;
  }

  async getLessonVideoSource(lessonId) {
    return this.videoSources.get(lessonId) || null;
  }

  async ensureSyncedVideoChapter() {
    let existingChapter = [...this.chapters.values()].find(
      (c) => c.slug === 'uploaded-video-lessons' || c.title === 'Uploaded Video Lessons'
    );
    if (existingChapter) return existingChapter;

    let subject = [...this.subjects.values()]
      .filter((s) => s.is_active)
      .sort((a, b) => a.display_order - b.display_order)[0];
    if (!subject) {
      const subId = crypto.randomUUID();
      subject = {
        id: subId,
        board: 'BOTH',
        slug: 'uploaded-videos',
        title: 'Uploaded Video Lessons',
        description: 'Synced Class 10 video lessons played in your own LMS player.',
        icon_key: 'book-open',
        accent_color: '#1D4ED8',
        display_order: 0,
        is_active: true,
      };
      this.subjects.set(subId, subject);
    }

    const chapterId = crypto.randomUUID();
    existingChapter = {
      id: chapterId,
      subject_id: subject.id,
      slug: 'uploaded-video-lessons',
      chapter_number: 0,
      title: 'Uploaded Video Lessons',
      summary: 'Videos synced automatically from your configured video storage provider.',
      display_order: 0,
      is_active: true,
    };
    this.chapters.set(chapterId, existingChapter);
    return existingChapter;
  }

  async resolveOrganisedChapter({ subjectSlug = null, chapterNumber = null, chapterTitle = null }) {
    const subjects = [...this.subjects.values()].filter((s) => s.is_active);
    let subject = subjectSlug
      ? subjects.find((s) => s.slug === subjectSlug)
      : subjects.sort((a, b) => a.display_order - b.display_order)[0];
    if (!subject) return null;

    const existingChapters = [...this.chapters.values()].filter(
      (c) => c.subject_id === subject.id && c.is_active
    );

    if (chapterNumber != null) {
      const byNum = existingChapters.find((c) => Number(c.chapter_number) === Number(chapterNumber));
      if (byNum) return byNum;

      const chId = crypto.randomUUID();
      const created = {
        id: chId,
        subject_id: subject.id,
        chapter_number: chapterNumber,
        title: chapterTitle || `Chapter ${chapterNumber}`,
        summary: `Auto-organised Class 10 ${subject.title} videos.`,
        display_order: chapterNumber,
        is_active: true,
      };
      this.chapters.set(chId, created);
      return created;
    }

    return existingChapters.sort((a, b) => a.display_order - b.display_order)[0] || null;
  }

  async upsertSyncedVideoLesson({ lesson, videoSource }) {
    const existing = this.lessons.get(lesson.id);
    const mergedLesson = { ...existing, ...lesson, is_active: true };
    this.lessons.set(lesson.id, mergedLesson);
    this.videoSources.set(lesson.id, { ...videoSource });
    return mergedLesson;
  }

  async deactivateMissingSyncedLessons(provider, activeLessonIds = []) {
    const keep = new Set(activeLessonIds);
    for (const [lessonId, src] of this.videoSources.entries()) {
      if (src.provider === provider && !keep.has(lessonId)) {
        const l = this.lessons.get(lessonId);
        // Only deactivate auto-synced lessons removed from storage — never archive manually curated Admin CMS lessons
        if (l && l.is_auto_synced) this.lessons.set(lessonId, { ...l, is_active: false });
      }
    }
  }

  async listSyncedVideoLessons() {
    const syncedProviders = new Set(['pikpak_local', 'cloudflare_r2', 'private_stream']);
    const out = [];
    for (const [lessonId, src] of this.videoSources.entries()) {
      if (!syncedProviders.has(src.provider)) continue;
      const lesson = this.lessons.get(lessonId);
      if (!lesson || !lesson.is_active) continue;
      out.push({
        ...lesson,
        source_provider: src.provider,
        source_file_name: lesson.source_file_name || src.file_name || lesson.title,
      });
    }
    return out.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  }

  async listLessonMcqs(lessonId) {
    return [...this.mcqs.values()]
      .filter((m) => m.lesson_id === lessonId && m.is_active)
      .sort((a, b) => a.display_order - b.display_order);
  }

  async createMcqAttempt(attempt) {
    const row = { id: crypto.randomUUID(), attempted_at: new Date().toISOString(), ...attempt };
    this.mcqAttempts.push(row);
    return row;
  }

  async listNotes({ subjectId, chapterId, lessonId, page = 1, limit = 30 }) {
    const all = [...this.notes.values()]
      .filter(
        (n) =>
          n.is_active &&
          (!subjectId || n.subject_id === subjectId) &&
          (!chapterId || n.chapter_id === chapterId) &&
          (!lessonId || n.lesson_id === lessonId)
      )
      .sort((a, b) => a.display_order - b.display_order);
    const start = (page - 1) * limit;
    return { items: all.slice(start, start + limit), total: all.length };
  }

  async listPyqs({ subjectId, chapterId, board, page = 1, limit = 30 }) {
    const all = [...this.pyqs.values()]
      .filter(
        (p) =>
          p.is_active &&
          (!subjectId || p.subject_id === subjectId) &&
          (!chapterId || p.chapter_id === chapterId) &&
          (!board || p.board === board || p.board === 'BOTH')
      )
      .sort((a, b) => b.exam_year - a.exam_year);
    const start = (page - 1) * limit;
    return { items: all.slice(start, start + limit), total: all.length };
  }

  async listFormulas({ subjectId, chapterId, page = 1, limit = 50 }) {
    const all = [...this.formulas.values()]
      .filter(
        (f) =>
          f.is_active &&
          (!subjectId || f.subject_id === subjectId) &&
          (!chapterId || f.chapter_id === chapterId)
      )
      .sort((a, b) => a.display_order - b.display_order);
    const start = (page - 1) * limit;
    return { items: all.slice(start, start + limit), total: all.length };
  }

  async getLessonProgress(userId, lessonId) {
    return this.progress.get(`${userId}:${lessonId}`) || null;
  }

  async listUserProgress(userId) {
    return [...this.progress.values()].filter((p) => p.user_id === userId);
  }

  async upsertLessonProgress(row) {
    const key = `${row.user_id}:${row.lesson_id}`;
    const existing = this.progress.get(key);
    const next = {
      id: existing?.id || crypto.randomUUID(),
      ...existing,
      ...row,
      updated_at: new Date().toISOString(),
    };
    this.progress.set(key, next);
    return next;
  }

  async logPlaybackAudit(entry) {
    this.playbackLogs.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...entry });
  }
}
