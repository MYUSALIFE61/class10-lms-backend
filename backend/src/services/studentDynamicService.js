import { ForbiddenError, NotFoundError } from '../utils/errors.js';

function matchesBoard(codes, fallbackBoard, board) {
  if (!board) return true;
  if (Array.isArray(codes) && codes.length > 0) {
    return codes.includes(board) || codes.includes('BOTH');
  }
  if (!fallbackBoard || fallbackBoard === 'BOTH') return true;
  return fallbackBoard === board;
}

export class StudentDynamicService {
  constructor({ store, subscriptionService, curriculumService, paymentService }) {
    this.store = store;
    this.subscriptionService = subscriptionService;
    this.curriculumService = curriculumService;
    this.paymentService = paymentService;
  }

  async getHome(user) {
    const [
      appConfig,
      boards,
      subjects,
      chapters,
      allLessons,
      progressRows,
      subStatus,
      plans,
      exams,
      quizzes,
      notifRecs,
      allNotifs,
      legacyDash,
    ] = await Promise.all([
      this.store.getAppConfig(),
      this.store.listBoards(),
      this.store.listSubjects({ board: user.board }),
      this.store.listAllChapters(),
      this.store.listAllLessons(),
      this.store.listUserProgress(user.id),
      this.subscriptionService.getStatus(user.id),
      this.paymentService.listPlans(),
      this.store.listExams({ board: user.board, includeAll: false }),
      this.store.listQuizzes({ board: user.board, includeAll: false }),
      this.store.listNotificationRecipients({ userId: user.id }),
      this.store.listNotifications(),
      this.curriculumService.getDashboard(user),
    ]);

    const hiddenSlugs = new Set(appConfig.hiddenSubjectSlugs || []);
    const visibleSubjects = subjects.filter((s) => !hiddenSlugs.has(s.slug));

    const publishedLessons = allLessons.filter(
      (l) =>
        l.is_active !== false &&
        (!l.status || l.status === 'published') &&
        matchesBoard(l.board_codes, null, user.board)
    );
    const publishedChapters = chapters.filter(
      (c) =>
        c.is_active !== false &&
        (!c.status || c.status === 'published') &&
        matchesBoard(c.board_codes, null, user.board)
    );

    const progressByLesson = new Map(progressRows.map((p) => [p.lesson_id, p]));

    const enrichedSubjects = visibleSubjects
      .slice()
      .sort((a, b) => (a.display_order ?? 99) - (b.display_order ?? 99))
      .map((sub) => {
        const subCh = publishedChapters.filter((c) => c.subject_id === sub.id);
        const subLs = publishedLessons.filter((l) => l.subject_id === sub.id);
        const completed = subLs.filter((l) => progressByLesson.get(l.id)?.is_completed).length;
        const pct = subLs.length > 0 ? Math.round((completed / subLs.length) * 100) : 0;
        return {
          id: sub.id,
          code: sub.slug,
          board: sub.board,
          className: 'Class 10',
          slug: sub.slug,
          title: sub.title,
          description: sub.description,
          iconKey: sub.icon_key,
          accentColor: sub.accent_color,
          displayOrder: sub.display_order,
          chapterCount: subCh.length,
          lessonCount: subLs.length,
          completedLessons: completed,
          progressPercent: pct,
        };
      });

    const boardMeta = boards.find((b) => b.code === user.board) || {
      code: user.board,
      name: user.board === 'TS' ? 'Telangana SSC' : 'Andhra Pradesh SSC',
      short_name: `${user.board} SSC`,
    };

    const notifMap = new Map(allNotifs.map((n) => [n.id, n]));
    const notifications = notifRecs
      .map((rec) => {
        const n = notifMap.get(rec.notification_id);
        if (!n) return null;
        return {
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.notification_type,
          deepLink: n.deep_link || '/dashboard',
          isRead: rec.is_read,
          sentAt: n.sent_at,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

    const unreadNotificationsCount = notifications.filter((n) => !n.isRead).length;
    const totalPublishedLessons = publishedLessons.length;
    const completedLessons = publishedLessons.filter((l) => progressByLesson.get(l.id)?.is_completed).length;
    const overallProgressPct =
      totalPublishedLessons > 0 ? Math.round((completedLessons / totalPublishedLessons) * 100) : 0;

    // Featured lessons from appConfig or latest published lessons
    const featuredIds = new Set(appConfig.featuredLessonIds || []);
    const featuredLessons = (
      featuredIds.size > 0
        ? publishedLessons.filter((l) => featuredIds.has(l.id))
        : publishedLessons.slice(0, 5)
    ).map((l) => ({
      id: l.id,
      subjectId: l.subject_id,
      chapterId: l.chapter_id,
      title: l.title,
      durationSeconds: l.duration_seconds || 0,
      isPremium: Boolean(l.is_premium),
      locked: Boolean(l.is_premium && !subStatus.isActive),
      progress: progressByLesson.get(l.id)
        ? {
            lastPositionSeconds: progressByLesson.get(l.id).last_position_seconds,
            completionPercent: progressByLesson.get(l.id).completion_percent,
            isCompleted: progressByLesson.get(l.id).is_completed,
          }
        : { lastPositionSeconds: 0, completionPercent: 0, isCompleted: false },
    }));

    const subjectMap = new Map(visibleSubjects.map((s) => [s.id, s]));
    const chapterMap = new Map(publishedChapters.map((c) => [c.id, c]));
    const lessonMap = new Map(publishedLessons.map((l) => [l.id, l]));

    const recentlyAccessedLessons = progressRows
      .slice()
      .sort(
        (a, b) =>
          new Date(b.last_accessed_at || b.updated_at || 0) -
          new Date(a.last_accessed_at || a.updated_at || 0)
      )
      .map((p) => {
        const l = lessonMap.get(p.lesson_id);
        if (!l) return null;
        const sub = subjectMap.get(l.subject_id);
        const ch = chapterMap.get(l.chapter_id);
        return {
          id: l.id,
          subjectId: l.subject_id,
          subjectTitle: sub?.title || 'Class 10 SSC',
          chapterId: l.chapter_id,
          chapterNumber: ch?.chapter_number || null,
          chapterTitle: ch?.title || '',
          title: l.title,
          teacherName: l.teacher_name || '',
          durationSeconds: l.duration_seconds || 0,
          thumbnailUrl: l.thumbnail_url || null,
          isPremium: Boolean(l.is_premium),
          locked: Boolean(l.is_premium && !subStatus.isActive),
          progress: {
            lastPositionSeconds: p.last_position_seconds || 0,
            completionPercent: p.completion_percent || 0,
            isCompleted: Boolean(p.is_completed),
            lastAccessedAt: p.last_accessed_at || p.updated_at || null,
          },
        };
      })
      .filter(Boolean)
      .slice(0, 6);

    const visibleSubjectIds = new Set(visibleSubjects.map((s) => s.id));
    const totalChapters = publishedChapters.filter((c) => visibleSubjectIds.has(c.subject_id)).length;

    return {
      student: {
        id: user.id,
        fullName: user.full_name,
        username: user.username || null,
        email: user.email,
        board: user.board,
        medium: user.medium || 'EN',
        studentCode: user.student_code,
      },
      board: {
        code: boardMeta.code,
        name: boardMeta.name,
        shortName: boardMeta.short_name,
      },
      appConfig,
      subscription: subStatus,
      activePlan: plans[0] || null,
      stats: {
        totalSubjects: enrichedSubjects.length,
        totalChapters,
        totalLessons: totalPublishedLessons,
        completedLessons,
        inProgressLessons: progressRows.filter((p) => !p.is_completed && p.last_position_seconds > 0).length,
        overallProgressPercent: overallProgressPct,
        syncedVideosCount: legacyDash.syncedVideos.length,
        unreadNotificationsCount,
      },
      videoProvider: legacyDash.videoProvider,
      subjects: enrichedSubjects,
      recentlyAccessedLessons,
      syncedVideos: legacyDash.syncedVideos.filter((v) => {
        const lesson = allLessons.find((l) => l.id === v.id);
        return !lesson || ((!lesson.status || lesson.status === 'published') && matchesBoard(lesson.board_codes, null, user.board));
      }),
      featuredLessons,
      upcomingExams: exams.map((e) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        examType: e.exam_type,
        examDate: e.exam_date,
        durationMinutes: e.duration_minutes,
        totalMarks: e.total_marks,
        questionCount: (e.question_ids || []).length,
      })),
      publishedQuizzesCount: quizzes.length,
      notifications: notifications.slice(0, 15),
    };
  }

  async getChaptersForStudent(user, subjectId) {
    const subject = await this.store.getSubjectById(subjectId);
    if (!subject) throw new NotFoundError('Subject not found');
    const [chapters, topics, quizzes, progressRows, subStatus] = await Promise.all([
      this.store.listChaptersBySubject(subjectId, { board: user.board }),
      this.store.listTopics({ subjectId, includeAll: false }),
      this.store.listQuizzes({ subjectId, board: user.board, includeAll: false }),
      this.store.listUserProgress(user.id),
      this.subscriptionService.getStatus(user.id),
    ]);
    const progMap = new Map(progressRows.map((p) => [p.lesson_id, p]));
    const orderedChapters = chapters
      .slice()
      .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));

    const formatted = await Promise.all(
      orderedChapters.map(async (c) => {
        const lessonRes = await this.store.listLessonsByChapter(c.id, {
          page: 1,
          limit: 200,
          board: user.board,
        });
        const chapterLessons = lessonRes.items || [];
        const totalLessons = lessonRes.total || chapterLessons.length;
        const completedLessons = chapterLessons.filter((l) => progMap.get(l.id)?.is_completed).length;
        const progressPercent =
          totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
        const locked =
          chapterLessons.length > 0 &&
          chapterLessons.every((l) => Boolean(l.is_premium)) &&
          !subStatus.isActive;

        return {
          id: c.id,
          subjectId: c.subject_id,
          chapterNumber: c.chapter_number,
          title: c.title,
          summary: c.summary,
          description: c.summary,
          thumbnailUrl: c.thumbnail_url || null,
          displayOrder: c.display_order,
          topicCount: topics.filter((t) => t.chapter_id === c.id).length,
          totalLessons,
          completedLessons,
          progressPercent,
          locked,
          videoCount: totalLessons,
          testCount: quizzes.filter((q) => q.chapter_id === c.id).length,
        };
      })
    );
    return { subject, chapters: formatted };
  }

  async getLessonsForStudent(user, chapterId, { page = 1, limit = 50 } = {}) {
    const [{ items, total }, topics, progressRows, subStatus, chapterNotesRes, chapterResources, studentDownloads] =
      await Promise.all([
        this.store.listLessonsByChapter(chapterId, { page, limit, board: user.board }),
        this.store.listTopics({ chapterId, includeAll: false }),
        this.store.listUserProgress(user.id),
        this.subscriptionService.getStatus(user.id),
        this.store.listNotes({ chapterId, page: 1, limit: 200 }).catch(() => ({ items: [] })),
        this.store.listStudyResources
          ? this.store.listStudyResources({ chapterId, board: user.board, includeAll: false }).catch(() => [])
          : Promise.resolve([]),
        this.store.listStudentDownloads
          ? this.store.listStudentDownloads({ studentId: user.id }).catch(() => [])
          : Promise.resolve([]),
      ]);

    const progMap = new Map(progressRows.map((p) => [p.lesson_id, p]));
    const topicMap = new Map(topics.map((t) => [t.id, t.title]));
    const downloadMap = new Map();
    for (const d of studentDownloads || []) {
      if (d.lesson_id && !downloadMap.has(d.lesson_id)) {
        downloadMap.set(d.lesson_id, d.download_status || 'not_downloaded');
      }
    }

    const sortedItems = items
      .slice()
      .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));

    const enriched = await Promise.all(
      sortedItems.map(async (l) => {
        const p = progMap.get(l.id);
        const [videoSource, offlineAsset] = await Promise.all([
          this.store.getLessonVideoSource ? this.store.getLessonVideoSource(l.id).catch(() => null) : null,
          this.store.getDefaultDownloadableAssetForLesson
            ? this.store.getDefaultDownloadableAssetForLesson(l.id).catch(() => null)
            : null,
        ]);
        const notesCount =
          (chapterNotesRes.items || []).filter((n) => n.lesson_id === l.id).length +
          (chapterResources || []).filter((r) => r.lesson_id === l.id).length;

        const isCompleted = Boolean(p?.is_completed);
        const progressStatus = isCompleted
          ? 'completed'
          : p && (p.last_position_seconds > 0 || p.completion_percent > 0)
            ? 'in_progress'
            : 'not_started';

        return {
          id: l.id,
          lessonNumber: l.lesson_number || l.display_order || 1,
          subjectId: l.subject_id,
          chapterId: l.chapter_id,
          topicId: l.topic_id || null,
          topicTitle: l.topic_id ? topicMap.get(l.topic_id) || null : null,
          title: l.title,
          description: l.description,
          teacherName: l.teacher_name || '',
          learningObjectives: l.learning_objectives || '',
          thumbnailUrl: l.thumbnail_url || null,
          durationSeconds: l.duration_seconds || offlineAsset?.duration_seconds || 0,
          displayOrder: l.display_order,
          lessonType: l.lesson_type || l.video_type || 'concept',
          videoTypeLabel: l.video_type_label || l.lesson_type || 'Concept Video',
          videoLanguage: l.video_language || 'TE_EN_MIX',
          sizeLabel: l.source_size_label || '',
          hasVideo: Boolean(videoSource || offlineAsset),
          hasNotes: notesCount > 0,
          notesCount,
          downloadStatus: downloadMap.get(l.id) || 'not_downloaded',
          progressStatus,
          isPremium: Boolean(l.is_premium),
          locked: Boolean(l.is_premium && !subStatus.isActive),
          progress: p
            ? {
                lastPositionSeconds: p.last_position_seconds,
                completionPercent: p.completion_percent,
                isCompleted,
                lastAccessedAt: p.last_accessed_at || p.updated_at || null,
              }
            : { lastPositionSeconds: 0, completionPercent: 0, isCompleted: false, lastAccessedAt: null },
        };
      })
    );

    return {
      topics: topics.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        learningObjectives: t.learning_objectives,
        displayOrder: t.display_order,
      })),
      items: enriched,
      pagination: { page, limit, total, hasMore: page * limit < total },
    };
  }

  async _getPublishedLessonForBoard(user, lessonId) {
    const lesson = await this.store.getLessonById(lessonId);
    const isUnpublished = lesson?.status && lesson.status !== 'published';
    if (!lesson || !lesson.is_active || isUnpublished) {
      throw new NotFoundError('Lesson not found', 'LESSON_NOT_FOUND');
    }
    if (!matchesBoard(lesson.board_codes, null, user.board)) {
      throw new ForbiddenError('This lesson is not mapped to your board.', 'BOARD_FORBIDDEN');
    }
    return lesson;
  }

  async getLessonNotesForStudent(user, lessonId) {
    const lesson = await this._getPublishedLessonForBoard(user, lessonId);
    const [subStatus, legacyNotesRes, resources] = await Promise.all([
      this.subscriptionService.getStatus(user.id),
      this.store.listNotes({ lessonId, page: 1, limit: 50 }),
      this.store.listStudyResources
        ? this.store.listStudyResources({ lessonId, board: user.board, includeAll: false })
        : Promise.resolve([]),
    ]);

    const resourceItems = (resources || []).map((r) => {
      const locked = Boolean((r.is_premium || lesson.is_premium) && !subStatus.isActive);
      return {
        id: r.id,
        source: 'resource',
        title: r.title,
        description: r.description || '',
        medium: r.medium || 'EN',
        mimeType: r.mime_type || 'text/markdown',
        fileName: r.file_name || null,
        fileSizeBytes: r.file_size_bytes || 0,
        hasFile: Boolean(r.storage_path),
        isPdf: String(r.mime_type || '').toLowerCase().includes('pdf'),
        isImage: String(r.mime_type || '').toLowerCase().startsWith('image/'),
        isDownloadable: Boolean(r.is_downloadable && !locked && r.storage_path),
        locked,
        contentMarkdown: locked ? null : r.content_markdown || null,
        downloadUrl: !locked && r.storage_path ? `/api/v1/student/resources/${r.id}/download` : null,
      };
    });

    const noteItems = (legacyNotesRes.items || []).map((n) => {
      const locked = Boolean((n.is_premium || lesson.is_premium) && !subStatus.isActive);
      return {
        id: n.id,
        source: 'lesson_note',
        title: n.title,
        description: '',
        medium: 'EN',
        mimeType: 'text/markdown',
        fileName: null,
        fileSizeBytes: 0,
        hasFile: false,
        isPdf: false,
        isImage: false,
        isDownloadable: false,
        locked,
        contentMarkdown: locked ? null : n.content_markdown,
        downloadUrl: null,
      };
    });

    return {
      lessonId,
      isSubscriptionActive: subStatus.isActive,
      items: [...resourceItems, ...noteItems],
    };
  }

  async getLessonConceptsForStudent(user, lessonId) {
    const lesson = await this._getPublishedLessonForBoard(user, lessonId);
    const [subStatus, rows] = await Promise.all([
      this.subscriptionService.getStatus(user.id),
      this.store.listLessonConcepts ? this.store.listLessonConcepts({ lessonId }) : Promise.resolve([]),
    ]);

    return {
      lessonId,
      isSubscriptionActive: subStatus.isActive,
      items: (rows || []).map((c) => {
        const locked = Boolean((c.is_premium || lesson.is_premium) && !subStatus.isActive);
        return {
          id: c.id,
          title: c.title,
          explanationMarkdown: locked ? null : c.explanation_markdown || '',
          formulaExpression: locked ? null : c.formula_expression || '',
          diagramUrl: locked ? null : c.diagram_url || null,
          examples: locked ? [] : Array.isArray(c.examples_json) ? c.examples_json : [],
          definitions: locked ? [] : Array.isArray(c.definitions_json) ? c.definitions_json : [],
          displayOrder: c.display_order || 1,
          locked,
        };
      }),
    };
  }

  async getLessonRevisionForStudent(user, lessonId) {
    const lesson = await this._getPublishedLessonForBoard(user, lessonId);
    const [subStatus, rows] = await Promise.all([
      this.subscriptionService.getStatus(user.id),
      this.store.listLessonRevisionPoints
        ? this.store.listLessonRevisionPoints({ lessonId })
        : Promise.resolve([]),
    ]);

    return {
      lessonId,
      isSubscriptionActive: subStatus.isActive,
      items: (rows || []).map((r) => {
        const locked = Boolean((r.is_premium || lesson.is_premium) && !subStatus.isActive);
        return {
          id: r.id,
          pointType: r.point_type || 'key_point',
          title: r.title,
          contentMarkdown: locked ? null : r.content_markdown || '',
          formulaExpression: locked ? null : r.formula_expression || '',
          displayOrder: r.display_order || 1,
          locked,
        };
      }),
    };
  }

  async getLessonPyqsForStudent(user, lessonId) {
    const lesson = await this._getPublishedLessonForBoard(user, lessonId);
    const [subStatus, rows] = await Promise.all([
      this.subscriptionService.getStatus(user.id),
      this.store.listLessonPyqs
        ? this.store.listLessonPyqs({ lessonId, board: user.board })
        : Promise.resolve([]),
    ]);

    return {
      lessonId,
      isSubscriptionActive: subStatus.isActive,
      items: (rows || []).map((q) => {
        const locked = Boolean((q.is_premium || lesson.is_premium) && !subStatus.isActive);
        return {
          id: q.id,
          lessonId: q.lesson_id,
          board: q.board,
          examYear: q.exam_year,
          marks: q.marks,
          questionType: q.question_type || 'short_answer',
          questionText: q.question_text,
          questionImageUrl: q.question_image_url || null,
          options: Array.isArray(q.options_json) ? q.options_json : [],
          modelAnswer: locked ? null : q.model_answer,
          explanation: locked ? null : q.explanation || '',
          locked,
        };
      }),
    };
  }

  async getRecentLessonsForStudent(user, { limit = 8 } = {}) {
    const [subjects, chapters, lessons, progressRows, subStatus] = await Promise.all([
      this.store.listSubjects({ board: user.board }),
      this.store.listAllChapters(),
      this.store.listAllLessons(),
      this.store.listUserProgress(user.id),
      this.subscriptionService.getStatus(user.id),
    ]);
    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const chapterMap = new Map(chapters.map((c) => [c.id, c]));
    const lessonMap = new Map(
      lessons
        .filter((l) => l.is_active !== false && (!l.status || l.status === 'published'))
        .map((l) => [l.id, l])
    );

    return progressRows
      .slice()
      .sort(
        (a, b) =>
          new Date(b.last_accessed_at || b.updated_at || 0) -
          new Date(a.last_accessed_at || a.updated_at || 0)
      )
      .map((p) => {
        const l = lessonMap.get(p.lesson_id);
        if (!l) return null;
        const sub = subjectMap.get(l.subject_id);
        const ch = chapterMap.get(l.chapter_id);
        return {
          id: l.id,
          subjectId: l.subject_id,
          subjectTitle: sub?.title || 'Class 10 SSC',
          chapterId: l.chapter_id,
          chapterNumber: ch?.chapter_number || null,
          chapterTitle: ch?.title || '',
          title: l.title,
          teacherName: l.teacher_name || '',
          durationSeconds: l.duration_seconds || 0,
          locked: Boolean(l.is_premium && !subStatus.isActive),
          progress: {
            lastPositionSeconds: p.last_position_seconds || 0,
            completionPercent: p.completion_percent || 0,
            isCompleted: Boolean(p.is_completed),
            lastAccessedAt: p.last_accessed_at || p.updated_at || null,
          },
        };
      })
      .filter(Boolean)
      .slice(0, limit);
  }

  async getResourcesForStudent(user, { subjectId = null, chapterId = null, lessonId = null, medium = null } = {}) {
    const [resources, subStatus] = await Promise.all([
      this.store.listStudyResources({
        subjectId,
        chapterId,
        lessonId,
        medium: medium || user.medium || 'ALL',
        board: user.board,
        includeAll: false,
      }),
      this.subscriptionService.getStatus(user.id),
    ]);

    return resources.map((r) => {
      const locked = Boolean(r.is_premium && !subStatus.isActive);
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        subjectId: r.subject_id,
        chapterId: r.chapter_id,
        topicId: r.topic_id,
        lessonId: r.lesson_id,
        resourceType: r.resource_type,
        medium: r.medium,
        fileName: r.file_name,
        mimeType: r.mime_type,
        fileSizeBytes: r.file_size_bytes || 0,
        hasFile: Boolean(r.storage_path),
        isDownloadable: Boolean(r.is_downloadable && !locked),
        isPremium: Boolean(r.is_premium),
        locked,
        contentMarkdown: locked ? null : r.content_markdown,
        downloadUrl: !locked && r.storage_path ? `/api/v1/student/resources/${r.id}/download` : null,
      };
    });
  }

  async getAuthorizedResourceForDownload(user, resourceId) {
    const resource = await this.store.getStudyResourceById(resourceId);
    if (!resource || resource.status !== 'published') {
      throw new NotFoundError('Resource not found');
    }
    if (!matchesBoard(resource.board_codes, null, user.board)) {
      throw new ForbiddenError('Resource is not mapped to your board');
    }
    if (resource.is_premium) {
      await this.subscriptionService.assertActiveSubscription(user.id);
    }
    return resource;
  }

  async getProgressSummary(user) {
    const [subjects, chapters, lessons, progressRows, quizAttempts, examAttempts, quizzes, exams, recentLessons] =
      await Promise.all([
        this.store.listSubjects({ board: user.board }),
        this.store.listAllChapters(),
        this.store.listAllLessons(),
        this.store.listUserProgress(user.id),
        this.store.listQuizAttempts({ userId: user.id }),
        this.store.listExamAttempts({ userId: user.id }),
        this.store.listQuizzes({ board: user.board, includeAll: false }),
        this.store.listExams({ board: user.board, includeAll: false }),
        this.getRecentLessonsForStudent(user, { limit: 8 }),
      ]);

    const publishedLessons = lessons.filter(
      (l) => l.is_active !== false && (!l.status || l.status === 'published') && matchesBoard(l.board_codes, null, user.board)
    );
    const publishedChapters = chapters.filter(
      (c) => c.is_active !== false && (!c.status || c.status === 'published') && matchesBoard(c.board_codes, null, user.board)
    );
    const progMap = new Map(progressRows.map((p) => [p.lesson_id, p]));
    const quizMap = new Map(quizzes.map((q) => [q.id, q.title]));
    const examMap = new Map(exams.map((e) => [e.id, e.name]));

    const subjectBreakdown = subjects.map((sub) => {
      const subLessons = publishedLessons.filter((l) => l.subject_id === sub.id);
      const subChapters = publishedChapters.filter((c) => c.subject_id === sub.id);
      const completed = subLessons.filter((l) => progMap.get(l.id)?.is_completed).length;
      const pct = subLessons.length > 0 ? Math.round((completed / subLessons.length) * 100) : 0;
      return {
        subjectId: sub.id,
        title: sub.title,
        accentColor: sub.accent_color || '#155EEF',
        totalChapters: subChapters.length,
        totalLessons: subLessons.length,
        completedLessons: completed,
        progressPct: pct,
      };
    });

    const completedLessons = publishedLessons.filter((l) => progMap.get(l.id)?.is_completed).length;
    const inProgressLessons = publishedLessons.filter((l) => {
      const p = progMap.get(l.id);
      return p && !p.is_completed && (p.last_position_seconds > 0 || p.completion_percent > 0);
    }).length;
    const totalLessons = publishedLessons.length;
    const overallProgressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    const totalWatchSeconds = progressRows.reduce(
      (acc, p) => acc + Number(p.watch_time_seconds || p.last_position_seconds || 0),
      0
    );

    const submittedQuizzes = quizAttempts.filter((a) => a.status !== 'in_progress');
    return {
      overallProgressPct,
      totalSubjects: subjects.length,
      totalChapters: publishedChapters.length,
      totalLessons,
      completedLessons,
      inProgressLessons,
      badgesCount: completedLessons + submittedQuizzes.filter((q) => q.passed).length,
      learningMinutes: Math.round(totalWatchSeconds / 60),
      subjectBreakdown,
      recentLessons,
      recentQuizzes: submittedQuizzes.slice(0, 10).map((a) => ({
        id: a.id,
        title: quizMap.get(a.quiz_id) || 'Practice Quiz',
        score: a.score,
        totalMarks: a.total_marks,
        percentage: a.percentage,
        passed: a.passed,
        submittedAt: a.submitted_at || a.created_at,
      })),
      recentExams: examAttempts.slice(0, 10).map((a) => ({
        id: a.id,
        name: examMap.get(a.exam_id) || 'SSC Exam',
        totalScore: a.total_score,
        totalMarks: a.total_marks,
        status: a.status,
        submittedAt: a.submitted_at || a.created_at,
      })),
    };
  }

  async getNotifications(user) {
    const [recs, allNotifs] = await Promise.all([
      this.store.listNotificationRecipients({ userId: user.id }),
      this.store.listNotifications(),
    ]);
    const map = new Map(allNotifs.map((n) => [n.id, n]));
    return recs
      .map((r) => {
        const n = map.get(r.notification_id);
        if (!n) return null;
        return {
          id: n.id,
          title: n.title,
          message: n.message,
          type: n.notification_type,
          deepLink: n.deep_link || '/dashboard',
          isRead: r.is_read,
          readAt: r.read_at,
          sentAt: n.sent_at,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  }

  async markNotificationRead(user, notificationId) {
    return this.store.markNotificationRead(notificationId, user.id);
  }
}
