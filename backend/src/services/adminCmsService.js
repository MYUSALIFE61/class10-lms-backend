import crypto from 'node:crypto';
import { assertSubjectScope } from './adminRbac.js';
import { saveUploadedFile, resolveUploadedFilePath } from '../repositories/adminStoreExtension.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export const CONTENT_STATUSES = ['draft', 'under_review', 'approved', 'scheduled', 'published', 'archived'];

const ALLOWED_RESOURCE_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/markdown',
  'text/plain',
]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeBoardCodes(boardCodes, fallbackBoard = 'BOTH') {
  if (Array.isArray(boardCodes) && boardCodes.length > 0) {
    return [...new Set(boardCodes.map((b) => String(b).toUpperCase()))];
  }
  if (fallbackBoard === 'AP' || fallbackBoard === 'TS') return [fallbackBoard];
  return ['AP', 'TS'];
}

function boardCodesToLegacyBoard(codes) {
  if (codes.includes('AP') && codes.includes('TS')) return 'BOTH';
  if (codes.includes('AP')) return 'AP';
  if (codes.includes('TS')) return 'TS';
  return 'BOTH';
}

export class AdminCmsService {
  constructor({ store, adminAuthService, curriculumService, playbackService, videoSyncService = null }) {
    this.store = store;
    this.adminAuthService = adminAuthService;
    this.curriculumService = curriculumService;
    this.playbackService = playbackService;
    this.videoSyncService = videoSyncService;
  }

  _invalidateCatalogCache() {
    this.curriculumService?.catalogCache?.clear?.();
  }

  // ---- Boards ----
  async listBoards() {
    return this.store.listBoards();
  }

  async createBoard({ admin, data, ipAddress }) {
    const rec = await this.store.createBoard({
      code: data.code.toUpperCase(),
      name: data.name.trim(),
      short_name: (data.shortName || data.code).trim(),
      syllabus_version: data.syllabusVersion || 'SSC-2026',
      description: data.description || '',
      is_active: data.isActive !== false,
    });
    await this.adminAuthService.recordAudit({
      admin,
      action: 'board.create',
      entityType: 'board',
      entityId: rec.id,
      summary: `Created board ${rec.code} (${rec.name})`,
      ipAddress,
    });
    return rec;
  }

  async updateBoard({ admin, id, patch, ipAddress }) {
    const updated = await this.store.updateBoard(id, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.shortName !== undefined ? { short_name: patch.shortName.trim() } : {}),
      ...(patch.syllabusVersion !== undefined ? { syllabus_version: patch.syllabusVersion } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.isActive !== undefined ? { is_active: Boolean(patch.isActive) } : {}),
    });
    if (!updated) throw new NotFoundError('Board not found');
    await this.adminAuthService.recordAudit({
      admin,
      action: 'board.update',
      entityType: 'board',
      entityId: id,
      summary: `Updated board ${updated.code}`,
      ipAddress,
    });
    return updated;
  }

  // ---- Academic Years ----
  async listAcademicYears() {
    return this.store.listAcademicYears();
  }

  async createAcademicYear({ admin, data, ipAddress }) {
    const rec = await this.store.createAcademicYear({
      name: data.name.trim(),
      start_date: data.startDate,
      end_date: data.endDate,
      syllabus_version: data.syllabusVersion || 'SSC-2026',
      is_active: data.isActive !== false,
      is_archived: false,
    });
    await this.adminAuthService.recordAudit({
      admin,
      action: 'academic_year.create',
      entityType: 'academic_year',
      entityId: rec.id,
      summary: `Created academic year ${rec.name}`,
      ipAddress,
    });
    return rec;
  }

  async updateAcademicYear({ admin, id, patch, ipAddress }) {
    const updated = await this.store.updateAcademicYear(id, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.startDate !== undefined ? { start_date: patch.startDate } : {}),
      ...(patch.endDate !== undefined ? { end_date: patch.endDate } : {}),
      ...(patch.syllabusVersion !== undefined ? { syllabus_version: patch.syllabusVersion } : {}),
      ...(patch.isActive !== undefined ? { is_active: Boolean(patch.isActive) } : {}),
      ...(patch.isArchived !== undefined ? { is_archived: Boolean(patch.isArchived) } : {}),
    });
    if (!updated) throw new NotFoundError('Academic year not found');
    await this.adminAuthService.recordAudit({
      admin,
      action: 'academic_year.update',
      entityType: 'academic_year',
      entityId: id,
      summary: `Updated academic year ${updated.name}`,
      ipAddress,
    });
    return updated;
  }

  // ---- Subjects ----
  async listSubjects({ board = null } = {}) {
    const subjects = await this.store.listSubjects({ board, includeAll: true });
    const chapters = await this.store.listAllChapters();
    const lessons = await this.store.listAllLessons();
    return subjects.map((s) => {
      const subCh = chapters.filter((c) => c.subject_id === s.id && c.is_active !== false);
      const subLs = lessons.filter((l) => l.subject_id === s.id && l.is_active !== false);
      return {
        ...s,
        boardCodes: normalizeBoardCodes(s.board_codes, s.board),
        status: s.status || 'published',
        chapterCount: subCh.length,
        lessonCount: subLs.length,
      };
    });
  }

  async createSubject({ admin, data, ipAddress }) {
    const boardCodes = normalizeBoardCodes(data.boardCodes, data.board);
    const status = data.status || 'published';
    const rec = await this.store.createSubject({
      title: data.title.trim(),
      slug: data.slug ? slugify(data.slug) : slugify(data.title),
      description: data.description || '',
      board: boardCodesToLegacyBoard(boardCodes),
      board_codes: boardCodes,
      academic_year_id: data.academicYearId || null,
      language_category: data.languageCategory || 'core',
      icon_key: data.iconKey || 'book-open',
      accent_color: data.accentColor || '#155EEF',
      display_order: Number(data.displayOrder || 1),
      status,
      is_active: status !== 'archived',
    });
    this._invalidateCatalogCache();
    await this.adminAuthService.recordAudit({
      admin,
      action: 'subject.create',
      entityType: 'subject',
      entityId: rec.id,
      summary: `Created subject "${rec.title}" (${boardCodes.join(', ')})`,
      ipAddress,
    });
    return rec;
  }

  async updateSubject({ admin, id, patch, ipAddress }) {
    assertSubjectScope(admin, id);
    const dbPatch = {};
    if (patch.title !== undefined) dbPatch.title = patch.title.trim();
    if (patch.slug !== undefined) dbPatch.slug = slugify(patch.slug);
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.boardCodes !== undefined || patch.board !== undefined) {
      const codes = normalizeBoardCodes(patch.boardCodes, patch.board);
      dbPatch.board_codes = codes;
      dbPatch.board = boardCodesToLegacyBoard(codes);
    }
    if (patch.academicYearId !== undefined) dbPatch.academic_year_id = patch.academicYearId;
    if (patch.languageCategory !== undefined) dbPatch.language_category = patch.languageCategory;
    if (patch.iconKey !== undefined) dbPatch.icon_key = patch.iconKey;
    if (patch.accentColor !== undefined) dbPatch.accent_color = patch.accentColor;
    if (patch.displayOrder !== undefined) dbPatch.display_order = Number(patch.displayOrder);
    if (patch.status !== undefined) {
      dbPatch.status = patch.status;
      dbPatch.is_active = patch.status !== 'archived';
    }
    if (patch.isActive !== undefined) dbPatch.is_active = Boolean(patch.isActive);

    const updated = await this.store.updateSubject(id, dbPatch);
    if (!updated) throw new NotFoundError('Subject not found');
    this._invalidateCatalogCache();
    await this.adminAuthService.recordAudit({
      admin,
      action: 'subject.update',
      entityType: 'subject',
      entityId: id,
      summary: `Updated subject "${updated.title}"`,
      ipAddress,
    });
    return updated;
  }

  async deleteSubject({ admin, id, ipAddress }) {
    assertSubjectScope(admin, id);
    await this.store.deleteSubject(id);
    this._invalidateCatalogCache();
    await this.adminAuthService.recordAudit({
      admin,
      action: 'subject.archive',
      entityType: 'subject',
      entityId: id,
      summary: `Archived subject ${id}`,
      ipAddress,
    });
    return { archived: true };
  }

  // ---- Chapters ----
  async listChapters({ subjectId = null } = {}) {
    const chapters = await this.store.listAllChapters({ subjectId });
    const topics = await this.store.listTopics({ subjectId, includeAll: true });
    const lessons = await this.store.listAllLessons({ subjectId });
    return chapters.map((c) => ({
      ...c,
      boardCodes: normalizeBoardCodes(c.board_codes),
      status: c.status || 'published',
      topicCount: topics.filter((t) => t.chapter_id === c.id).length,
      lessonCount: lessons.filter((l) => l.chapter_id === c.id && l.is_active !== false).length,
    }));
  }

  async createChapter({ admin, data, ipAddress }) {
    assertSubjectScope(admin, data.subjectId);
    const boardCodes = normalizeBoardCodes(data.boardCodes);
    const status = data.status || 'published';
    const rec = await this.store.createChapter({
      subject_id: data.subjectId,
      chapter_number: Number(data.chapterNumber || 1),
      title: data.title.trim(),
      summary: data.summary || '',
      thumbnail_url: data.thumbnailUrl || null,
      board_codes: boardCodes,
      display_order: Number(data.displayOrder ?? data.chapterNumber ?? 1),
      status,
      is_active: status !== 'archived',
    });
    this._invalidateCatalogCache();
    await this.adminAuthService.recordAudit({
      admin,
      action: 'chapter.create',
      entityType: 'chapter',
      entityId: rec.id,
      summary: `Created chapter "${rec.title}"`,
      ipAddress,
    });
    return rec;
  }

  async updateChapter({ admin, id, patch, ipAddress }) {
    const existing = await this.store.getChapterById(id);
    if (!existing) throw new NotFoundError('Chapter not found');
    assertSubjectScope(admin, existing.subject_id);

    const dbPatch = {};
    if (patch.subjectId !== undefined) dbPatch.subject_id = patch.subjectId;
    if (patch.chapterNumber !== undefined) dbPatch.chapter_number = Number(patch.chapterNumber);
    if (patch.title !== undefined) dbPatch.title = patch.title.trim();
    if (patch.summary !== undefined) dbPatch.summary = patch.summary;
    if (patch.thumbnailUrl !== undefined) dbPatch.thumbnail_url = patch.thumbnailUrl;
    if (patch.boardCodes !== undefined) dbPatch.board_codes = normalizeBoardCodes(patch.boardCodes);
    if (patch.displayOrder !== undefined) dbPatch.display_order = Number(patch.displayOrder);
    if (patch.status !== undefined) {
      dbPatch.status = patch.status;
      dbPatch.is_active = patch.status !== 'archived';
    }
    if (patch.isActive !== undefined) dbPatch.is_active = Boolean(patch.isActive);

    const updated = await this.store.updateChapter(id, dbPatch);
    this._invalidateCatalogCache();
    await this.adminAuthService.recordAudit({
      admin,
      action: 'chapter.update',
      entityType: 'chapter',
      entityId: id,
      summary: `Updated chapter "${updated.title}"`,
      ipAddress,
    });
    return updated;
  }

  // ---- Topics ----
  async listTopics({ subjectId = null, chapterId = null } = {}) {
    return this.store.listTopics({ subjectId, chapterId, includeAll: true });
  }

  async createTopic({ admin, data, ipAddress }) {
    const chapter = await this.store.getChapterById(data.chapterId);
    if (!chapter) throw new NotFoundError('Chapter not found');
    assertSubjectScope(admin, chapter.subject_id);

    const status = data.status || 'published';
    const rec = await this.store.createTopic({
      subject_id: data.subjectId || chapter.subject_id,
      chapter_id: chapter.id,
      title: data.title.trim(),
      description: data.description || '',
      learning_objectives: data.learningObjectives || '',
      display_order: Number(data.displayOrder || 1),
      status,
      is_active: status !== 'archived',
    });
    this._invalidateCatalogCache();
    await this.adminAuthService.recordAudit({
      admin,
      action: 'topic.create',
      entityType: 'topic',
      entityId: rec.id,
      summary: `Created topic "${rec.title}"`,
      ipAddress,
    });
    return rec;
  }

  async updateTopic({ admin, id, patch, ipAddress }) {
    const existing = await this.store.getTopicById(id);
    if (!existing) throw new NotFoundError('Topic not found');
    assertSubjectScope(admin, existing.subject_id);

    const dbPatch = {};
    if (patch.title !== undefined) dbPatch.title = patch.title.trim();
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.learningObjectives !== undefined) dbPatch.learning_objectives = patch.learningObjectives;
    if (patch.displayOrder !== undefined) dbPatch.display_order = Number(patch.displayOrder);
    if (patch.status !== undefined) {
      dbPatch.status = patch.status;
      dbPatch.is_active = patch.status !== 'archived';
    }

    const updated = await this.store.updateTopic(id, dbPatch);
    this._invalidateCatalogCache();
    await this.adminAuthService.recordAudit({
      admin,
      action: 'topic.update',
      entityType: 'topic',
      entityId: id,
      summary: `Updated topic "${updated.title}"`,
      ipAddress,
    });
    return updated;
  }

  // ---- Lessons + Drag-Drop Ordering + Publishing Workflow ----
  async listLessons({ subjectId = null, chapterId = null, topicId = null, status = null } = {}) {
    const [lessons, videoSources, resources] = await Promise.all([
      this.store.listAllLessons({ subjectId, chapterId, topicId, status }),
      this.store.listAllVideoSources(),
      this.store.listStudyResources({ subjectId, chapterId, includeAll: true }),
    ]);
    const videoByLesson = new Map(videoSources.map((v) => [v.lesson_id, v]));

    return lessons.map((l) => {
      const src = videoByLesson.get(l.id);
      return {
        ...l,
        boardCodes: normalizeBoardCodes(l.board_codes),
        status: l.status || (l.is_active === false ? 'archived' : 'published'),
        videoLanguage: l.video_language || src?.language_code || 'TE_EN_MIX',
        videoSource: src
          ? {
              provider: src.provider,
              providerFileId: src.provider_file_id || null,
              youtubeVideoId: src.youtube_video_id || null,
              originalFileName: src.original_file_name || src.file_name || l.source_file_name || null,
              displayTitle: src.display_title || l.title,
              languageCode: src.language_code || 'TE_EN_MIX',
              quality: src.quality || '720p',
              fileSizeBytes: src.file_size_bytes || 0,
            }
          : null,
        resourceCount: resources.filter((r) => r.lesson_id === l.id).length,
      };
    });
  }

  async createLesson({ admin, data, ipAddress }) {
    const chapter = await this.store.getChapterById(data.chapterId);
    if (!chapter) throw new NotFoundError('Chapter not found');
    const subjectId = data.subjectId || chapter.subject_id;
    assertSubjectScope(admin, subjectId);

    const boardCodes = normalizeBoardCodes(data.boardCodes);
    const status = data.status || 'draft';
    const lesson = await this.store.createLesson({
      subject_id: subjectId,
      chapter_id: chapter.id,
      topic_id: data.topicId || null,
      title: data.title.trim(),
      description: data.description || '',
      thumbnail_url: data.thumbnailUrl || null,
      lesson_type: data.lessonType || 'concept',
      video_type: data.lessonType || 'concept',
      video_type_label: data.lessonType ? data.lessonType.replace(/_/g, ' ') : 'Concept Video',
      duration_seconds: Number(data.durationSeconds || 0),
      display_order: Number(data.displayOrder || 1),
      is_premium: Boolean(data.isPremium),
      board_codes: boardCodes,
      video_language: data.videoLanguage || 'TE_EN_MIX',
      status,
      scheduled_publish_at: data.scheduledPublishAt || null,
      published_at: status === 'published' ? new Date().toISOString() : null,
      is_active: status !== 'archived',
    });

    // Optional video attachment in same call
    if (data.videoSource && data.videoSource.provider) {
      await this.store.upsertVideoSource(lesson.id, {
        provider: data.videoSource.provider,
        provider_file_id: data.videoSource.providerFileId || null,
        youtube_video_id: data.videoSource.youtubeVideoId || null,
        stream_url: data.videoSource.streamUrl || null,
        file_name: data.videoSource.fileName || data.videoSource.originalFileName || `${slugify(lesson.title)}.mp4`,
        original_file_name: data.videoSource.originalFileName || data.videoSource.fileName || null,
        display_title: lesson.title,
        mime_type: data.videoSource.mimeType || 'video/mp4',
        language_code: data.videoLanguage || 'TE_EN_MIX',
        quality: data.videoSource.quality || '720p',
        duration_seconds: Number(data.durationSeconds || 0),
        status,
      });
    }

    this._invalidateCatalogCache();
    await this.adminAuthService.recordAudit({
      admin,
      action: 'lesson.create',
      entityType: 'lesson',
      entityId: lesson.id,
      summary: `Created lesson "${lesson.title}" [${status}] (${boardCodes.join(', ')})`,
      ipAddress,
    });
    return lesson;
  }

  async updateLesson({ admin, id, patch, ipAddress }) {
    const existing = await this.store.getLessonById(id);
    if (!existing) throw new NotFoundError('Lesson not found');
    assertSubjectScope(admin, existing.subject_id);

    const dbPatch = {};
    if (patch.subjectId !== undefined) dbPatch.subject_id = patch.subjectId;
    if (patch.chapterId !== undefined) dbPatch.chapter_id = patch.chapterId;
    if (patch.topicId !== undefined) dbPatch.topic_id = patch.topicId;
    if (patch.title !== undefined) dbPatch.title = patch.title.trim();
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.thumbnailUrl !== undefined) dbPatch.thumbnail_url = patch.thumbnailUrl;
    if (patch.lessonType !== undefined) {
      dbPatch.lesson_type = patch.lessonType;
      dbPatch.video_type = patch.lessonType;
    }
    if (patch.durationSeconds !== undefined) dbPatch.duration_seconds = Number(patch.durationSeconds);
    if (patch.displayOrder !== undefined) dbPatch.display_order = Number(patch.displayOrder);
    if (patch.isPremium !== undefined) dbPatch.is_premium = Boolean(patch.isPremium);
    if (patch.boardCodes !== undefined) dbPatch.board_codes = normalizeBoardCodes(patch.boardCodes);
    if (patch.videoLanguage !== undefined) dbPatch.video_language = patch.videoLanguage;
    if (patch.scheduledPublishAt !== undefined) dbPatch.scheduled_publish_at = patch.scheduledPublishAt;
    if (patch.status !== undefined) {
      if (!CONTENT_STATUSES.includes(patch.status)) {
        throw new ValidationError(`Invalid publishing status: ${patch.status}`);
      }
      dbPatch.status = patch.status;
      dbPatch.is_active = patch.status !== 'archived';
      if (patch.status === 'published') {
        dbPatch.published_at = new Date().toISOString();
      }
    }

    const updated = await this.store.updateLesson(id, dbPatch);

    if (patch.videoSource && patch.videoSource.provider) {
      await this.store.upsertVideoSource(id, {
        provider: patch.videoSource.provider,
        provider_file_id: patch.videoSource.providerFileId || null,
        youtube_video_id: patch.videoSource.youtubeVideoId || null,
        stream_url: patch.videoSource.streamUrl || null,
        file_name: patch.videoSource.fileName || undefined,
        original_file_name: patch.videoSource.originalFileName || patch.videoSource.fileName || undefined,
        display_title: updated.title,
        language_code: patch.videoLanguage || updated.video_language || 'TE_EN_MIX',
        quality: patch.videoSource.quality || '720p',
        status: updated.status || 'published',
      });
    }

    this._invalidateCatalogCache();
    await this.adminAuthService.recordAudit({
      admin,
      action: 'lesson.update',
      entityType: 'lesson',
      entityId: id,
      summary: `Updated lesson "${updated.title}" [${updated.status || 'published'}]`,
      metadata: { fields: Object.keys(dbPatch) },
      ipAddress,
    });
    return updated;
  }

  async reorderLessons({ admin, orderedIds, ipAddress }) {
    for (let i = 0; i < orderedIds.length; i += 1) {
      await this.store.updateLesson(orderedIds[i], { display_order: i + 1 });
    }
    this._invalidateCatalogCache();
    await this.adminAuthService.recordAudit({
      admin,
      action: 'lesson.reorder',
      entityType: 'lesson',
      summary: `Reordered ${orderedIds.length} lessons`,
      ipAddress,
    });
    return { reordered: orderedIds.length };
  }

  // ---- Video Library & PikPak Raw Filename Mapping (Non-Destructive) ----
  async listVideos() {
    const [lessons, sources, subjects, chapters] = await Promise.all([
      this.store.listAllLessons(),
      this.store.listAllVideoSources(),
      this.store.listSubjects({ includeAll: true }),
      this.store.listAllChapters(),
    ]);
    const lessonById = new Map(lessons.map((l) => [l.id, l]));
    const subjectById = new Map(subjects.map((s) => [s.id, s]));
    const chapterById = new Map(chapters.map((c) => [c.id, c]));

    const items = sources.map((src) => {
      const lesson = lessonById.get(src.lesson_id);
      const subject = lesson ? subjectById.get(lesson.subject_id) : null;
      const chapter = lesson ? chapterById.get(lesson.chapter_id) : null;
      return {
        lessonId: src.lesson_id,
        displayTitle: src.display_title || lesson?.title || src.file_name || 'Untitled Video',
        originalFileName: src.original_file_name || src.file_name || lesson?.source_file_name || '',
        provider: src.provider,
        providerFileId: src.provider_file_id || null,
        youtubeVideoId: src.youtube_video_id || null,
        mimeType: src.mime_type || 'video/mp4',
        languageCode: src.language_code || lesson?.video_language || 'TE_EN_MIX',
        quality: src.quality || '720p',
        durationSeconds: src.duration_seconds || lesson?.duration_seconds || 0,
        sizeLabel: lesson?.source_size_label || '',
        folderPath: lesson?.source_folder_path || lesson?.source_folder_name || '',
        subjectId: lesson?.subject_id || null,
        subjectTitle: subject?.title || 'Unassigned',
        chapterId: lesson?.chapter_id || null,
        chapterTitle: chapter?.title || 'Unassigned',
        topicId: lesson?.topic_id || null,
        boardCodes: normalizeBoardCodes(lesson?.board_codes),
        status: lesson?.status || src.status || 'published',
        isPremium: Boolean(lesson?.is_premium),
      };
    });

    return {
      provider: this.videoSyncService?.getProviderMeta?.() || { enabled: false, provider: 'none' },
      items,
    };
  }

  /**
   * Maps an existing uploaded PikPak/R2 video (e.g., VID-20261108-WA0001.mp4) to a clean
   * display title, subject, chapter, topic, board mapping, and TE_EN_MIX language WITHOUT
   * modifying or deleting the underlying storage file!
   */
  async mapExistingVideo({ admin, lessonId, data, ipAddress }) {
    const lesson = await this.store.getLessonById(lessonId);
    const source = await this.store.getLessonVideoSource(lessonId);
    if (!lesson || !source) {
      throw new NotFoundError('Uploaded video record not found', 'VIDEO_NOT_FOUND');
    }

    const targetSubjectId = data.subjectId || lesson.subject_id;
    assertSubjectScope(admin, targetSubjectId);

    const boardCodes = normalizeBoardCodes(data.boardCodes || lesson.board_codes);
    const status = data.status || lesson.status || 'published';

    const updatedLesson = await this.store.updateLesson(lessonId, {
      title: data.displayTitle ? data.displayTitle.trim() : lesson.title,
      description: data.description !== undefined ? data.description : lesson.description,
      subject_id: targetSubjectId,
      chapter_id: data.chapterId || lesson.chapter_id,
      topic_id: data.topicId !== undefined ? data.topicId : lesson.topic_id || null,
      display_order: data.displayOrder !== undefined ? Number(data.displayOrder) : lesson.display_order,
      duration_seconds: data.durationSeconds !== undefined ? Number(data.durationSeconds) : lesson.duration_seconds,
      thumbnail_url: data.thumbnailUrl !== undefined ? data.thumbnailUrl : lesson.thumbnail_url,
      board_codes: boardCodes,
      video_language: data.languageCode || 'TE_EN_MIX',
      is_premium: data.isPremium !== undefined ? Boolean(data.isPremium) : lesson.is_premium,
      status,
      is_active: status !== 'archived',
    });

    // Preserve original_file_name & provider_file_id untouched!
    await this.store.upsertVideoSource(lessonId, {
      ...source,
      original_file_name: source.original_file_name || source.file_name,
      display_title: updatedLesson.title,
      language_code: data.languageCode || 'TE_EN_MIX',
      quality: data.quality || source.quality || '720p',
      duration_seconds: updatedLesson.duration_seconds,
      status,
    });

    this._invalidateCatalogCache();
    await this.adminAuthService.recordAudit({
      admin,
      action: 'video.map',
      entityType: 'video',
      entityId: lessonId,
      summary: `Mapped video "${source.file_name}" -> "${updatedLesson.title}" (${boardCodes.join(', ')})`,
      ipAddress,
    });

    return updatedLesson;
  }

  async createAdminVideoPreview({ admin, lessonId, apiBaseUrl }) {
    const lesson = await this.store.getLessonById(lessonId);
    const source = await this.store.getLessonVideoSource(lessonId);
    if (!lesson || !source) throw new NotFoundError('Video not found');

    if (source.provider === 'pikpak_local' && source.provider_file_id) {
      const token = this.playbackService.signStreamToken({
        lessonId: lesson.id,
        fileId: source.provider_file_id,
        userId: admin.id,
        deviceId: 'admin-preview',
        mimeType: source.mime_type || 'video/mp4',
        ttlSeconds: 600,
      });
      const base = (apiBaseUrl || '').replace(/\/+$/, '');
      return {
        provider: source.provider,
        streamUrl: `${base}/api/v1/playback/stream/${token}`,
        title: lesson.title,
        originalFileName: source.original_file_name || source.file_name,
      };
    }

    if (source.provider === 'youtube_unlisted') {
      return {
        provider: source.provider,
        youtubeVideoId: source.youtube_video_id,
        title: lesson.title,
      };
    }

    return {
      provider: source.provider,
      streamUrl: source.stream_url || null,
      title: lesson.title,
    };
  }

  // ---- Study Materials & Protected PDF/Image Uploads ----
  async listResources(filters = {}) {
    return this.store.listStudyResources({ ...filters, includeAll: true });
  }

  async createResource({ admin, data, ipAddress }) {
    assertSubjectScope(admin, data.subjectId);
    let storagePath = null;
    let fileSizeBytes = Number(data.fileSizeBytes || 0);
    const mimeType = data.mimeType || 'application/pdf';

    if (data.contentBase64) {
      if (!ALLOWED_RESOURCE_MIMES.has(mimeType)) {
        throw new ValidationError(`Unsupported file MIME type: ${mimeType}`);
      }
      const rawSize = Buffer.byteLength(data.contentBase64, 'base64');
      if (rawSize > MAX_UPLOAD_BYTES) {
        throw new ValidationError('File exceeds 15 MB upload limit');
      }
      const saved = saveUploadedFile({
        fileName: data.fileName || `${slugify(data.title)}.pdf`,
        mimeType,
        contentBase64: data.contentBase64,
      });
      storagePath = saved.storagePath;
      fileSizeBytes = saved.fileSizeBytes;
    }

    const boardCodes = normalizeBoardCodes(data.boardCodes);
    const status = data.status || 'published';
    const rec = await this.store.createStudyResource({
      title: data.title.trim(),
      description: data.description || '',
      subject_id: data.subjectId,
      chapter_id: data.chapterId || null,
      topic_id: data.topicId || null,
      lesson_id: data.lessonId || null,
      resource_type: data.resourceType || 'chapter_notes',
      board_codes: boardCodes,
      academic_year_id: data.academicYearId || null,
      medium: data.medium || 'EN', // Separate from video language TE_EN_MIX!
      file_name: data.fileName || `${slugify(data.title)}.pdf`,
      mime_type: mimeType,
      file_size_bytes: fileSizeBytes,
      storage_path: storagePath,
      content_markdown: data.contentMarkdown || '',
      is_downloadable: data.isDownloadable !== false,
      is_premium: Boolean(data.isPremium),
      status,
    });

    await this.adminAuthService.recordAudit({
      admin,
      action: 'resource.create',
      entityType: 'study_resource',
      entityId: rec.id,
      summary: `Uploaded ${rec.resource_type} "${rec.title}" (Medium: ${rec.medium})`,
      ipAddress,
    });
    return rec;
  }

  async updateResource({ admin, id, patch, ipAddress }) {
    const existing = await this.store.getStudyResourceById(id);
    if (!existing) throw new NotFoundError('Study resource not found');
    assertSubjectScope(admin, existing.subject_id);

    const dbPatch = {};
    if (patch.title !== undefined) dbPatch.title = patch.title.trim();
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.resourceType !== undefined) dbPatch.resource_type = patch.resourceType;
    if (patch.medium !== undefined) dbPatch.medium = patch.medium;
    if (patch.boardCodes !== undefined) dbPatch.board_codes = normalizeBoardCodes(patch.boardCodes);
    if (patch.chapterId !== undefined) dbPatch.chapter_id = patch.chapterId;
    if (patch.topicId !== undefined) dbPatch.topic_id = patch.topicId;
    if (patch.lessonId !== undefined) dbPatch.lesson_id = patch.lessonId;
    if (patch.contentMarkdown !== undefined) dbPatch.content_markdown = patch.contentMarkdown;
    if (patch.isDownloadable !== undefined) dbPatch.is_downloadable = Boolean(patch.isDownloadable);
    if (patch.isPremium !== undefined) dbPatch.is_premium = Boolean(patch.isPremium);
    if (patch.status !== undefined) dbPatch.status = patch.status;

    if (patch.contentBase64) {
      const mimeType = patch.mimeType || existing.mime_type || 'application/pdf';
      if (!ALLOWED_RESOURCE_MIMES.has(mimeType)) {
        throw new ValidationError(`Unsupported MIME type: ${mimeType}`);
      }
      const saved = saveUploadedFile({
        fileName: patch.fileName || existing.file_name || 'resource.pdf',
        mimeType,
        contentBase64: patch.contentBase64,
      });
      dbPatch.storage_path = saved.storagePath;
      dbPatch.file_size_bytes = saved.fileSizeBytes;
      dbPatch.mime_type = mimeType;
      if (patch.fileName) dbPatch.file_name = patch.fileName;
    }

    const updated = await this.store.updateStudyResource(id, dbPatch);
    await this.adminAuthService.recordAudit({
      admin,
      action: 'resource.update',
      entityType: 'study_resource',
      entityId: id,
      summary: `Updated study resource "${updated.title}" [${updated.status}]`,
      ipAddress,
    });
    return updated;
  }

  getResourceDiskPath(resource) {
    return resolveUploadedFilePath(resource.storage_path);
  }
}
