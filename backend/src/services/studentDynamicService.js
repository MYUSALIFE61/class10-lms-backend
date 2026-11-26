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

    const enrichedSubjects = visibleSubjects.map((sub) => {
      const subCh = publishedChapters.filter((c) => c.subject_id === sub.id);
      const subLs = publishedLessons.filter((l) => l.subject_id === sub.id);
      const completed = subLs.filter((l) => progressByLesson.get(l.id)?.is_completed).length;
      const pct = subLs.length > 0 ? Math.round((completed / subLs.length) * 100) : 0;
      return {
        id: sub.id,
        board: sub.board,
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

    return {
      student: {
        id: user.id,
        fullName: user.full_name,
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
        totalLessons: totalPublishedLessons,
        completedLessons,
        inProgressLessons: progressRows.filter((p) => !p.is_completed && p.last_position_seconds > 0).length,
        overallProgressPercent: overallProgressPct,
        syncedVideosCount: legacyDash.syncedVideos.length,
        unreadNotificationsCount,
      },
      videoProvider: legacyDash.videoProvider,
      subjects: enrichedSubjects,
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
    const chapters = await this.store.listChaptersBySubject(subjectId, { board: user.board });
    const topics = await this.store.listTopics({ subjectId, includeAll: false });
    const quizzes = await this.store.listQuizzes({ subjectId, board: user.board, includeAll: false });

    const formatted = await Promise.all(
      chapters.map(async (c) => {
        const lessonRes = await this.store.listLessonsByChapter(c.id, {
          page: 1,
          limit: 1,
          board: user.board,
        });
        return {
          id: c.id,
          subjectId: c.subject_id,
          chapterNumber: c.chapter_number,
          title: c.title,
          summary: c.summary,
          thumbnailUrl: c.thumbnail_url || null,
          displayOrder: c.display_order,
          topicCount: topics.filter((t) => t.chapter_id === c.id).length,
          videoCount: lessonRes.total || 0,
          testCount: quizzes.filter((q) => q.chapter_id === c.id).length,
        };
      })
    );
    return { subject, chapters: formatted };
  }

  async getLessonsForStudent(user, chapterId, { page = 1, limit = 50 } = {}) {
    const [{ items, total }, topics, progressRows, subStatus] = await Promise.all([
      this.store.listLessonsByChapter(chapterId, { page, limit, board: user.board }),
      this.store.listTopics({ chapterId, includeAll: false }),
      this.store.listUserProgress(user.id),
      this.subscriptionService.getStatus(user.id),
    ]);
    const progMap = new Map(progressRows.map((p) => [p.lesson_id, p]));
    const topicMap = new Map(topics.map((t) => [t.id, t.title]));

    return {
      topics: topics.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        learningObjectives: t.learning_objectives,
        displayOrder: t.display_order,
      })),
      items: items.map((l) => {
        const p = progMap.get(l.id);
        return {
          id: l.id,
          subjectId: l.subject_id,
          chapterId: l.chapter_id,
          topicId: l.topic_id || null,
          topicTitle: l.topic_id ? topicMap.get(l.topic_id) || null : null,
          title: l.title,
          description: l.description,
          thumbnailUrl: l.thumbnail_url || null,
          durationSeconds: l.duration_seconds || 0,
          displayOrder: l.display_order,
          lessonType: l.lesson_type || l.video_type || 'concept',
          videoTypeLabel: l.video_type_label || l.lesson_type || 'Concept Video',
          videoLanguage: l.video_language || 'TE_EN_MIX',
          sizeLabel: l.source_size_label || '',
          isPremium: Boolean(l.is_premium),
          locked: Boolean(l.is_premium && !subStatus.isActive),
          progress: p
            ? {
                lastPositionSeconds: p.last_position_seconds,
                completionPercent: p.completion_percent,
                isCompleted: p.is_completed,
              }
            : { lastPositionSeconds: 0, completionPercent: 0, isCompleted: false },
        };
      }),
      pagination: { page, limit, total, hasMore: page * limit < total },
    };
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
    const [subjects, lessons, progressRows, quizAttempts, examAttempts, quizzes, exams] = await Promise.all([
      this.store.listSubjects({ board: user.board }),
      this.store.listAllLessons(),
      this.store.listUserProgress(user.id),
      this.store.listQuizAttempts({ userId: user.id }),
      this.store.listExamAttempts({ userId: user.id }),
      this.store.listQuizzes({ board: user.board, includeAll: false }),
      this.store.listExams({ board: user.board, includeAll: false }),
    ]);

    const publishedLessons = lessons.filter(
      (l) => l.is_active !== false && (!l.status || l.status === 'published') && matchesBoard(l.board_codes, null, user.board)
    );
    const progMap = new Map(progressRows.map((p) => [p.lesson_id, p]));
    const quizMap = new Map(quizzes.map((q) => [q.id, q.title]));
    const examMap = new Map(exams.map((e) => [e.id, e.name]));

    const subjectBreakdown = subjects.map((sub) => {
      const subLessons = publishedLessons.filter((l) => l.subject_id === sub.id);
      const completed = subLessons.filter((l) => progMap.get(l.id)?.is_completed).length;
      const pct = subLessons.length > 0 ? Math.round((completed / subLessons.length) * 100) : 0;
      return {
        subjectId: sub.id,
        title: sub.title,
        accentColor: sub.accent_color || '#155EEF',
        totalLessons: subLessons.length,
        completedLessons: completed,
        progressPct: pct,
      };
    });

    const completedLessons = publishedLessons.filter((l) => progMap.get(l.id)?.is_completed).length;
    const totalLessons = publishedLessons.length;
    const overallProgressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    const totalWatchSeconds = progressRows.reduce(
      (acc, p) => acc + Number(p.watch_time_seconds || p.last_position_seconds || 0),
      0
    );

    const submittedQuizzes = quizAttempts.filter((a) => a.status !== 'in_progress');
    return {
      overallProgressPct,
      totalLessons,
      completedLessons,
      badgesCount: completedLessons + submittedQuizzes.filter((q) => q.passed).length,
      learningMinutes: Math.round(totalWatchSeconds / 60),
      subjectBreakdown,
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
