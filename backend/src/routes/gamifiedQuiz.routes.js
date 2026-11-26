import { Router } from 'express';

export function createAdminVideoQuizRoutes({
  gamifiedQuizService,
  requireAdmin,
  requirePermission,
}) {
  const router = Router();

  // List all video-linked gamified quizzes
  router.get('/', requireAdmin, requirePermission('quizzes:manage'), async (_req, res, next) => {
    try {
      const items = await gamifiedQuizService.listAdminVideoQuizzes();
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });

  // Update lesson transcript & key concepts
  router.patch('/lessons/:lessonId/transcript', requireAdmin, requirePermission('content:write'), async (req, res, next) => {
    try {
      const data = await gamifiedQuizService.updateLessonTranscript({
        admin: req.admin,
        lessonId: req.params.lessonId,
        transcriptText: req.body.transcriptText,
        keyConcepts: req.body.keyConcepts || [],
        ipAddress: req.ip,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // AI-generate draft MCQs grounded strictly in video transcript (pending admin approval)
  router.post('/generate-ai', requireAdmin, requirePermission('questions:write'), async (req, res, next) => {
    try {
      const data = await gamifiedQuizService.generateAiQuestionsForLesson({
        admin: req.admin,
        lessonId: req.body.lessonId,
        transcriptText: req.body.transcriptText ?? null,
        count: req.body.count || 6,
        roundType: req.body.roundType || null,
        ipAddress: req.ip,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // List all questions (pending AI + approved manual) for a specific video lesson
  router.get('/lessons/:lessonId/questions', requireAdmin, requirePermission('questions:read'), async (req, res, next) => {
    try {
      const items = await gamifiedQuizService.listLessonQuestionsForAdmin(req.params.lessonId);
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });

  // Manually create a 4-option gamified video MCQ
  router.post('/lessons/:lessonId/questions', requireAdmin, requirePermission('questions:write'), async (req, res, next) => {
    try {
      const data = await gamifiedQuizService.createManualVideoQuestion({
        admin: req.admin,
        lessonId: req.params.lessonId,
        data: req.body,
        ipAddress: req.ip,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // Approve or reject AI-generated question (required before publishing!)
  router.post('/questions/:questionId/review', requireAdmin, requirePermission('questions:write'), async (req, res, next) => {
    try {
      const data = await gamifiedQuizService.reviewAiQuestion({
        admin: req.admin,
        questionId: req.params.questionId,
        decision: req.body.decision,
        patch: req.body.patch || {},
        ipAddress: req.ip,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // Create or update a video-linked gamified quiz
  router.post('/', requireAdmin, requirePermission('quizzes:manage'), async (req, res, next) => {
    try {
      const data = await gamifiedQuizService.createOrUpdateVideoQuiz({
        admin: req.admin,
        data: req.body,
        ipAddress: req.ip,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:quizId', requireAdmin, requirePermission('quizzes:manage'), async (req, res, next) => {
    try {
      const data = await gamifiedQuizService.createOrUpdateVideoQuiz({
        admin: req.admin,
        quizId: req.params.quizId,
        data: req.body,
        ipAddress: req.ip,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // Question-wise accuracy & difficult concepts analytics
  router.get('/analytics', requireAdmin, requirePermission(['progress:read', 'quizzes:manage']), async (req, res, next) => {
    try {
      const data = await gamifiedQuizService.getVideoQuizAnalytics({
        lessonId: req.query.lessonId || null,
        subjectId: req.query.subjectId || null,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createStudentVideoQuizRoutes({ gamifiedQuizService, requireAuth }) {
  const router = Router();

  router.get('/video-quizzes', requireAuth, async (req, res, next) => {
    try {
      const items = await gamifiedQuizService.listStudentVideoQuizzes({
        user: req.user,
        lessonId: req.query.lessonId || null,
        subjectId: req.query.subjectId || null,
      });
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/video-quizzes/:quizId/start', requireAuth, async (req, res, next) => {
    try {
      const data = await gamifiedQuizService.startGamifiedQuiz({
        user: req.user,
        quizId: req.params.quizId,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/video-quizzes/attempts/:attemptId/answer', requireAuth, async (req, res, next) => {
    try {
      const data = await gamifiedQuizService.answerGamifiedQuestion({
        user: req.user,
        attemptId: req.params.attemptId,
        questionId: req.body.questionId,
        selectedOptionIndex: req.body.selectedOptionIndex,
        skipped: Boolean(req.body.skipped),
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/video-quizzes/attempts/:attemptId/complete', requireAuth, async (req, res, next) => {
    try {
      const data = await gamifiedQuizService.completeGamifiedQuiz({
        user: req.user,
        attemptId: req.params.attemptId,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/gamification/profile', requireAuth, async (req, res, next) => {
    try {
      const data = await gamifiedQuizService.getStudentGamificationProfile(req.user);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/gamification/leaderboard', requireAuth, async (req, res, next) => {
    try {
      const data = await gamifiedQuizService.getOptionalLeaderboard(req.user);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
