import { TtlCache } from '../utils/cache.js';
import { NotFoundError } from '../utils/errors.js';

export class CurriculumService {
  constructor({ store, subscriptionService, videoSyncService = null }) {
    this.store = store;
    this.subscriptionService = subscriptionService;
    this.videoSyncService = videoSyncService;
    this.catalogCache = new TtlCache({ maxEntries: 300, defaultTtlMs: 5 * 60 * 1000 });
  }

  async getDashboard(user) {
    const [subjects, progressRows, subscriptionStatus, syncedRows] = await Promise.all([
      this.listSubjects({ board: user.board }),
      this.store.listUserProgress(user.id),
      this.subscriptionService.getStatus(user.id),
      typeof this.store.listSyncedVideoLessons === 'function'
        ? this.store.listSyncedVideoLessons()
        : Promise.resolve([]),
    ]);

    const completedCount = progressRows.filter((p) => p.is_completed).length;
    const inProgressCount = progressRows.filter((p) => !p.is_completed && p.last_position_seconds > 0).length;
    const progressByLesson = new Map(progressRows.map((p) => [p.lesson_id, p]));

    const syncedVideos = syncedRows.map((l) => {
      const prog = progressByLesson.get(l.id);
      return {
        id: l.id,
        subjectId: l.subject_id,
        chapterId: l.chapter_id,
        title: l.title,
        description: l.description,
        fileName: l.source_file_name || l.title,
        sizeLabel: l.source_size_label || '',
        folderName: l.source_folder_name || 'Uploaded Videos',
        folderPath: l.source_folder_path || l.source_folder_name || 'Uploaded Videos',
        videoType: l.video_type || 'concept',
        videoTypeLabel: l.video_type_label || 'Video Lesson',
        specialZone: l.special_zone || null,
        provider: l.source_provider || 'pikpak_local',
        durationSeconds: l.duration_seconds || 0,
        isPremium: Boolean(l.is_premium),
        locked: Boolean(l.is_premium && !subscriptionStatus.isActive),
        progress: prog
          ? {
              lastPositionSeconds: prog.last_position_seconds,
              completionPercent: prog.completion_percent,
              isCompleted: prog.is_completed,
            }
          : { lastPositionSeconds: 0, completionPercent: 0, isCompleted: false },
      };
    });

    return {
      student: {
        fullName: user.full_name,
        board: user.board,
        studentCode: user.student_code,
      },
      subscription: subscriptionStatus,
      stats: {
        totalSubjects: subjects.length,
        completedLessons: completedCount,
        inProgressLessons: inProgressCount,
        syncedVideosCount: syncedVideos.length,
      },
      videoProvider: this.videoSyncService
        ? this.videoSyncService.getProviderMeta()
        : { enabled: false, provider: 'none', isCommercialSafe: true, lastSyncedAt: null },
      syncedVideos,
      subjects,
      recentProgress: progressRows.slice(0, 5).map((p) => ({
        lessonId: p.lesson_id,
        completionPercent: p.completion_percent,
        isCompleted: p.is_completed,
        lastPositionSeconds: p.last_position_seconds,
        updatedAt: p.updated_at,
      })),
    };
  }

  async listSubjects({ board } = {}) {
    const cacheKey = `subjects:${board || 'ALL'}`;
    const cached = this.catalogCache.get(cacheKey);
    if (cached) return cached;

    const rows = await this.store.listSubjects({ board });
    const formatted = rows.map((s) => ({
      id: s.id,
      board: s.board,
      slug: s.slug,
      title: s.title,
      description: s.description,
      iconKey: s.icon_key,
      accentColor: s.accent_color,
      displayOrder: s.display_order,
    }));
    this.catalogCache.set(cacheKey, formatted);
    return formatted;
  }

  async listChapters(subjectId) {
    const subject = await this.store.getSubjectById(subjectId);
    if (!subject) {
      throw new NotFoundError('Subject not found', 'SUBJECT_NOT_FOUND');
    }

    const cacheKey = `chapters:${subjectId}`;
    const cached = this.catalogCache.get(cacheKey);
    if (cached) return { subject, chapters: cached };

    const chapters = await this.store.listChaptersBySubject(subjectId);
    const formatted = await Promise.all(
      chapters.map(async (c) => {
        const lessonInfo = await this.store.listLessonsByChapter(c.id, { page: 1, limit: 1 });
        return {
          id: c.id,
          subjectId: c.subject_id,
          chapterNumber: c.chapter_number,
          title: c.title,
          summary: c.summary,
          displayOrder: c.display_order,
          videoCount: lessonInfo.total || 0,
          testCount: Math.max(1, Math.min(2, lessonInfo.total || 1)),
        };
      })
    );
    this.catalogCache.set(cacheKey, formatted);
    return { subject, chapters: formatted };
  }

  async listLessons({ userId, chapterId, page = 1, limit = 50 }) {
    const [{ items, total }, progressRows, subStatus] = await Promise.all([
      this.store.listLessonsByChapter(chapterId, { page, limit }),
      this.store.listUserProgress(userId),
      this.subscriptionService.getStatus(userId),
    ]);

    const progressByLesson = new Map(progressRows.map((p) => [p.lesson_id, p]));

    // Explicitly omit any YouTube video IDs from listing responses
    const lessons = items.map((l) => {
      const prog = progressByLesson.get(l.id);
      return {
        id: l.id,
        subjectId: l.subject_id,
        chapterId: l.chapter_id,
        title: l.title,
        description: l.description,
        thumbnailUrl: l.thumbnail_url,
        durationSeconds: l.duration_seconds,
        displayOrder: l.display_order,
        videoType: l.video_type || 'concept',
        videoTypeLabel: l.video_type_label || 'Concept Video',
        sizeLabel: l.source_size_label || '',
        isPremium: l.is_premium,
        locked: Boolean(l.is_premium && !subStatus.isActive),
        progress: prog
          ? {
              lastPositionSeconds: prog.last_position_seconds,
              completionPercent: prog.completion_percent,
              isCompleted: prog.is_completed,
            }
          : { lastPositionSeconds: 0, completionPercent: 0, isCompleted: false },
      };
    });

    return {
      items: lessons,
      pagination: { page, limit, total, hasMore: page * limit < total },
    };
  }

  async getLessonMcqs({ userId, lessonId }) {
    const lesson = await this.store.getLessonById(lessonId);
    if (!lesson || !lesson.is_active) {
      throw new NotFoundError('Lesson not found', 'LESSON_NOT_FOUND');
    }
    if (lesson.is_premium) {
      await this.subscriptionService.assertActiveSubscription(userId);
    }

    const mcqs = await this.store.listLessonMcqs(lessonId);
    // Strip correct_option_index so client cannot inspect answers before submission
    return mcqs.map((m) => ({
      id: m.id,
      lessonId: m.lesson_id,
      questionText: m.question_text,
      options: m.options_json,
      difficulty: m.difficulty,
      displayOrder: m.display_order,
    }));
  }

  async submitLessonMcqs({ userId, lessonId, answers }) {
    const lesson = await this.store.getLessonById(lessonId);
    if (!lesson || !lesson.is_active) {
      throw new NotFoundError('Lesson not found', 'LESSON_NOT_FOUND');
    }
    if (lesson.is_premium) {
      await this.subscriptionService.assertActiveSubscription(userId);
    }

    const mcqs = await this.store.listLessonMcqs(lessonId);
    if (mcqs.length === 0) {
      throw new NotFoundError('No MCQs available for this lesson', 'NO_MCQS');
    }

    const answerMap = new Map(answers.map((a) => [a.mcqId, a.selectedOptionIndex]));
    let score = 0;

    const results = mcqs.map((m) => {
      const selected = answerMap.has(m.id) ? answerMap.get(m.id) : null;
      const isCorrect = selected === m.correct_option_index;
      if (isCorrect) score += 1;
      return {
        mcqId: m.id,
        selectedOptionIndex: selected,
        correctOptionIndex: m.correct_option_index,
        isCorrect,
        explanation: m.explanation,
      };
    });

    const attempt = await this.store.createMcqAttempt({
      user_id: userId,
      lesson_id: lessonId,
      score,
      total_questions: mcqs.length,
      answers_json: results,
    });

    return {
      attemptId: attempt.id,
      score,
      totalQuestions: mcqs.length,
      percentage: Math.round((score / mcqs.length) * 100),
      results,
    };
  }

  async getNotes({ userId, subjectId, chapterId, lessonId, page = 1, limit = 30 }) {
    const subStatus = await this.subscriptionService.getStatus(userId);
    const { items, total } = await this.store.listNotes({
      subjectId,
      chapterId,
      lessonId,
      page,
      limit,
    });

    const filtered = items.map((n) => {
      const locked = Boolean(n.is_premium && !subStatus.isActive);
      return {
        id: n.id,
        subjectId: n.subject_id,
        chapterId: n.chapter_id,
        lessonId: n.lesson_id,
        title: n.title,
        isPremium: n.is_premium,
        locked,
        contentMarkdown: locked ? null : n.content_markdown,
      };
    });

    return { items: filtered, pagination: { page, limit, total, hasMore: page * limit < total } };
  }

  async getPyqs({ userId, subjectId, chapterId, board, page = 1, limit = 30 }) {
    const subStatus = await this.subscriptionService.getStatus(userId);
    const { items, total } = await this.store.listPyqs({
      subjectId,
      chapterId,
      board,
      page,
      limit,
    });

    const formatted = items.map((p) => {
      const locked = Boolean(p.is_premium && !subStatus.isActive);
      return {
        id: p.id,
        subjectId: p.subject_id,
        chapterId: p.chapter_id,
        board: p.board,
        examYear: p.exam_year,
        marks: p.marks,
        questionText: p.question_text,
        isPremium: p.is_premium,
        locked,
        modelAnswer: locked ? null : p.model_answer,
      };
    });

    return { items: formatted, pagination: { page, limit, total, hasMore: page * limit < total } };
  }

  async getFormulas({ userId, subjectId, chapterId, page = 1, limit = 50 }) {
    const subStatus = await this.subscriptionService.getStatus(userId);
    const { items, total } = await this.store.listFormulas({
      subjectId,
      chapterId,
      page,
      limit,
    });

    const formatted = items.map((f) => {
      const locked = Boolean(f.is_premium && !subStatus.isActive);
      return {
        id: f.id,
        subjectId: f.subject_id,
        chapterId: f.chapter_id,
        title: f.title,
        isPremium: f.is_premium,
        locked,
        formulaExpression: locked ? null : f.formula_expression,
        explanation: locked ? null : f.explanation,
      };
    });

    return { items: formatted, pagination: { page, limit, total, hasMore: page * limit < total } };
  }
}
