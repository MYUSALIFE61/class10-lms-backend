import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { AppError, NotFoundError } from '../utils/errors.js';

const securityEventSchema = z.object({
  lessonId: z.string().max(100).optional().nullable(),
  deviceId: z.string().max(120).optional().nullable(),
  eventType: z.enum([
    'screen_recording_detected',
    'screen_recording_stopped',
    'screen_sharing_display_detected',
    'screen_sharing_display_stopped',
    'playback_resumed_after_capture',
    'screenshot_attempt_blocked',
  ]),
  timestamp: z.string().max(40).optional(),
  androidApiLevel: z.number().int().min(1).max(99).optional().default(0),
  protectionAction: z.string().min(1).max(120),
});

export function createStudentRoutes({
  studentDynamicService,
  assessmentService,
  adminCmsService,
  store = null,
  requireAuth,
}) {
  const router = Router();
  const dedupCache = new Map();
  const burstBuckets = new Map();

  router.get('/home', requireAuth, async (req, res, next) => {
    try {
      const data = await studentDynamicService.getHome(req.user);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/subjects', requireAuth, async (req, res, next) => {
    try {
      const home = await studentDynamicService.getHome(req.user);
      res.json({ success: true, data: { subjects: home.subjects } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/subjects/:subjectId/chapters', requireAuth, async (req, res, next) => {
    try {
      const data = await studentDynamicService.getChaptersForStudent(req.user, req.params.subjectId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/chapters/:chapterId/lessons', requireAuth, async (req, res, next) => {
    try {
      const data = await studentDynamicService.getLessonsForStudent(req.user, req.params.chapterId, {
        page: Number(req.query.page || 1),
        limit: Number(req.query.limit || 50),
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/resources', requireAuth, async (req, res, next) => {
    try {
      const items = await studentDynamicService.getResourcesForStudent(req.user, {
        subjectId: req.query.subjectId || null,
        chapterId: req.query.chapterId || null,
        lessonId: req.query.lessonId || null,
        medium: req.query.medium || null,
      });
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/resources/:id/download', requireAuth, async (req, res, next) => {
    try {
      const resource = await studentDynamicService.getAuthorizedResourceForDownload(req.user, req.params.id);
      const diskPath = adminCmsService.getResourceDiskPath(resource);
      if (!diskPath) throw new NotFoundError('Resource file not found on server');
      res.type(resource.mime_type || 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${resource.file_name || 'resource.pdf'}"`);
      res.sendFile(diskPath);
    } catch (err) {
      next(err);
    }
  });

  router.get('/quizzes', requireAuth, async (req, res, next) => {
    try {
      const items = await assessmentService.listQuizzes({
        includeAll: false,
        subjectId: req.query.subjectId || null,
        chapterId: req.query.chapterId || null,
        board: req.user.board,
      });
      res.json({
        success: true,
        data: {
          items: items.map((q) => ({
            id: q.id,
            title: q.title,
            description: q.description,
            quizType: q.quiz_type,
            subjectId: q.subject_id,
            chapterId: q.chapter_id,
            questionCount: (q.question_ids || []).length,
            totalMarks: q.total_marks,
            passingMarks: q.passing_marks,
            durationMinutes: q.duration_minutes,
            attemptsAllowed: q.attempts_allowed,
            isPremium: Boolean(q.is_premium),
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/quizzes/:quizId/start', requireAuth, async (req, res, next) => {
    try {
      const data = await assessmentService.startStudentQuiz({
        user: req.user,
        quizId: req.params.quizId,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/quizzes/:quizId/submit', requireAuth, async (req, res, next) => {
    try {
      const data = await assessmentService.submitStudentQuiz({
        user: req.user,
        quizId: req.params.quizId,
        attemptId: req.body.attemptId,
        answers: req.body.answers || [],
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/exams', requireAuth, async (req, res, next) => {
    try {
      const items = await assessmentService.listExams({
        includeAll: false,
        subjectId: req.query.subjectId || null,
        board: req.user.board,
      });
      res.json({
        success: true,
        data: {
          items: items.map((e) => ({
            id: e.id,
            name: e.name,
            description: e.description,
            examType: e.exam_type,
            examDate: e.exam_date,
            durationMinutes: e.duration_minutes,
            totalMarks: e.total_marks,
            questionCount: (e.question_ids || []).length,
            instructions: e.instructions,
            resultsPublished: Boolean(e.results_published),
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/exams/:examId/start', requireAuth, async (req, res, next) => {
    try {
      const data = await assessmentService.startStudentExam({ user: req.user, examId: req.params.examId });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/exams/:examId/submit', requireAuth, async (req, res, next) => {
    try {
      const data = await assessmentService.submitStudentExam({
        user: req.user,
        examId: req.params.examId,
        attemptId: req.body.attemptId,
        answers: req.body.answers || [],
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/progress', requireAuth, async (req, res, next) => {
    try {
      const data = await studentDynamicService.getProgressSummary(req.user);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/notifications', requireAuth, async (req, res, next) => {
    try {
      const items = await studentDynamicService.getNotifications(req.user);
      res.json({
        success: true,
        data: { items, unreadCount: items.filter((n) => !n.isRead).length },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/:id/read', requireAuth, async (req, res, next) => {
    try {
      await studentDynamicService.markNotificationRead(req.user, req.params.id);
      res.json({ success: true, data: { read: true } });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Native Android Screen Capture & Recording Security Event Reporting.
   * Rate-limited & deduplicated; stores ONLY minimal authorized telemetry in security_events.
   */
  router.post(
    '/security/events',
    requireAuth,
    validate({ body: securityEventSchema }),
    async (req, res, next) => {
      try {
        const now = Date.now();
        const userId = req.user.id;
        const { lessonId = null, deviceId = null, eventType, timestamp, androidApiLevel, protectionAction } =
          req.body;

        // Per-student burst rate limit (max 25 events / 60s)
        const recent = (burstBuckets.get(userId) || []).filter((ts) => now - ts < 60_000);
        if (recent.length >= 25) {
          throw new AppError(
            'Too many security events submitted. Please try again shortly.',
            429,
            'SECURITY_EVENT_RATE_LIMITED'
          );
        }
        recent.push(now);
        burstBuckets.set(userId, recent);

        // Per-(user, lesson, eventType) deduplication (5s window)
        const dedupKey = `${userId}:${lessonId || 'none'}:${eventType}`;
        const lastSeen = dedupCache.get(dedupKey);
        if (lastSeen && now - lastSeen < 5_000) {
          return res.status(202).json({
            success: true,
            data: { accepted: true, logged: false, deduplicated: true },
          });
        }
        dedupCache.set(dedupKey, now);

        const appConfig = store?.getAppConfig ? await store.getAppConfig() : null;
        if (appConfig?.videoSecurity?.securityEventLogging === false) {
          return res.json({
            success: true,
            data: { accepted: true, logged: false, reason: 'disabled_by_policy' },
          });
        }

        if (store?.logSecurityEvent) {
          const isThreatStart =
            eventType === 'screen_recording_detected' ||
            eventType === 'screen_sharing_display_detected' ||
            eventType === 'screenshot_attempt_blocked';
          await store.logSecurityEvent({
            user_id: userId,
            device_id: req.device?.id || req.session?.device_id || null,
            event_type: eventType,
            severity: isThreatStart ? 'high' : 'info',
            ip_address: req.ip || null,
            details_json: {
              lessonId: lessonId || null,
              clientDeviceId: deviceId || null,
              eventTimestamp: timestamp || new Date(now).toISOString(),
              androidApiLevel,
              protectionAction,
            },
          });
        }

        return res.status(201).json({
          success: true,
          data: { accepted: true, logged: true, deduplicated: false },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
