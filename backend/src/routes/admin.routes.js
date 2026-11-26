import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { NotFoundError } from '../utils/errors.js';

const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export function createAdminRoutes({
  adminAuthService,
  adminCmsService,
  assessmentService,
  adminOperationsService,
  videoSyncService = null,
  requireAdmin,
  requirePermission,
  authLimiter,
}) {
  const router = Router();

  // ---- Admin Auth ----
  router.post('/auth/login', authLimiter, validate({ body: adminLoginSchema }), async (req, res, next) => {
    try {
      const data = await adminAuthService.login({
        email: req.body.email,
        password: req.body.password,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth/me', requireAdmin, async (req, res) => {
    res.json({ success: true, data: { admin: adminAuthService.sanitizeAdmin(req.admin) } });
  });

  router.post('/auth/logout', requireAdmin, async (req, res, next) => {
    try {
      const data = await adminAuthService.logout({
        sessionId: req.adminSession?.id,
        admin: req.admin,
        ipAddress: req.ip,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ---- Dashboard Analytics ----
  router.get('/dashboard', requireAdmin, requirePermission('dashboard:view'), async (req, res, next) => {
    try {
      const data = await adminOperationsService.getDashboardAnalytics({
        board: req.query.board || null,
        subjectId: req.query.subjectId || null,
        academicYearId: req.query.academicYearId || null,
        fromDate: req.query.fromDate || null,
        toDate: req.query.toDate || null,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ---- Student Management ----
  router.get('/students', requireAdmin, requirePermission('students:read'), async (req, res, next) => {
    try {
      const items = await adminOperationsService.listStudents({
        search: req.query.search || '',
        board: req.query.board || null,
        status: req.query.status || null,
        subscriptionStatus: req.query.subscriptionStatus || null,
      });
      res.json({ success: true, data: { items, total: items.length } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/students/:id', requireAdmin, requirePermission('students:read'), async (req, res, next) => {
    try {
      const data = await adminOperationsService.getStudentDetail(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/students/:id', requireAdmin, requirePermission('students:write'), async (req, res, next) => {
    try {
      const data = await adminOperationsService.updateStudent({
        admin: req.admin,
        studentId: req.params.id,
        patch: req.body,
        ipAddress: req.ip,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/students/:id/reset-password',
    requireAdmin,
    requirePermission('students:write'),
    async (req, res, next) => {
      try {
        const data = await adminOperationsService.resetStudentPassword({
          admin: req.admin,
          studentId: req.params.id,
          newPassword: req.body.newPassword,
          ipAddress: req.ip,
        });
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  // ---- Boards & Academic Years ----
  router.get('/boards', requireAdmin, requirePermission('academic:read'), async (_req, res, next) => {
    try {
      res.json({ success: true, data: { items: await adminCmsService.listBoards() } });
    } catch (err) {
      next(err);
    }
  });
  router.post('/boards', requireAdmin, requirePermission('academic:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.createBoard({ admin: req.admin, data: req.body, ipAddress: req.ip });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/boards/:id', requireAdmin, requirePermission('academic:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.updateBoard({ admin: req.admin, id: req.params.id, patch: req.body, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/academic-years', requireAdmin, requirePermission('academic:read'), async (_req, res, next) => {
    try {
      res.json({ success: true, data: { items: await adminCmsService.listAcademicYears() } });
    } catch (err) {
      next(err);
    }
  });
  router.post('/academic-years', requireAdmin, requirePermission('academic:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.createAcademicYear({ admin: req.admin, data: req.body, ipAddress: req.ip });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/academic-years/:id', requireAdmin, requirePermission('academic:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.updateAcademicYear({ admin: req.admin, id: req.params.id, patch: req.body, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ---- Subjects, Chapters, Topics & Lessons ----
  router.get('/subjects', requireAdmin, requirePermission('academic:read'), async (req, res, next) => {
    try {
      const items = await adminCmsService.listSubjects({ board: req.query.board || null });
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });
  router.post('/subjects', requireAdmin, requirePermission('academic:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.createSubject({ admin: req.admin, data: req.body, ipAddress: req.ip });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/subjects/:id', requireAdmin, requirePermission('academic:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.updateSubject({ admin: req.admin, id: req.params.id, patch: req.body, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.delete('/subjects/:id', requireAdmin, requirePermission('academic:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.deleteSubject({ admin: req.admin, id: req.params.id, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/chapters', requireAdmin, requirePermission('academic:read'), async (req, res, next) => {
    try {
      const items = await adminCmsService.listChapters({ subjectId: req.query.subjectId || null });
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });
  router.post('/chapters', requireAdmin, requirePermission('academic:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.createChapter({ admin: req.admin, data: req.body, ipAddress: req.ip });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/chapters/:id', requireAdmin, requirePermission('academic:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.updateChapter({ admin: req.admin, id: req.params.id, patch: req.body, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/topics', requireAdmin, requirePermission('academic:read'), async (req, res, next) => {
    try {
      const items = await adminCmsService.listTopics({
        subjectId: req.query.subjectId || null,
        chapterId: req.query.chapterId || null,
      });
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });
  router.post('/topics', requireAdmin, requirePermission('academic:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.createTopic({ admin: req.admin, data: req.body, ipAddress: req.ip });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/topics/:id', requireAdmin, requirePermission('academic:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.updateTopic({ admin: req.admin, id: req.params.id, patch: req.body, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/lessons', requireAdmin, requirePermission('content:read'), async (req, res, next) => {
    try {
      const items = await adminCmsService.listLessons({
        subjectId: req.query.subjectId || null,
        chapterId: req.query.chapterId || null,
        topicId: req.query.topicId || null,
        status: req.query.status || null,
      });
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });
  router.post('/lessons', requireAdmin, requirePermission('content:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.createLesson({ admin: req.admin, data: req.body, ipAddress: req.ip });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/lessons/:id', requireAdmin, requirePermission('content:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.updateLesson({ admin: req.admin, id: req.params.id, patch: req.body, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.post('/lessons/reorder', requireAdmin, requirePermission('content:write'), async (req, res, next) => {
    try {
      const data = await adminCmsService.reorderLessons({
        admin: req.admin,
        orderedIds: req.body.orderedIds || [],
        ipAddress: req.ip,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ---- Video Library & PikPak Sync/Mapping ----
  router.get('/videos', requireAdmin, requirePermission(['videos:manage', 'content:read']), async (_req, res, next) => {
    try {
      res.json({ success: true, data: await adminCmsService.listVideos() });
    } catch (err) {
      next(err);
    }
  });
  router.post('/videos/sync', requireAdmin, requirePermission('videos:manage'), async (req, res, next) => {
    try {
      if (!videoSyncService) {
        return res.status(400).json({
          success: false,
          error: { code: 'VIDEO_SYNC_UNAVAILABLE', message: 'Video storage sync is not configured.' },
        });
      }
      const data = await videoSyncService.syncVideos();
      await adminAuthService.recordAudit({
        admin: req.admin,
        action: 'video.sync',
        entityType: 'video',
        summary: `Synced ${data.syncedCount} video(s) from ${data.provider}`,
        ipAddress: req.ip,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/videos/:lessonId/map', requireAdmin, requirePermission('videos:manage'), async (req, res, next) => {
    try {
      const data = await adminCmsService.mapExistingVideo({
        admin: req.admin,
        lessonId: req.params.lessonId,
        data: req.body,
        ipAddress: req.ip,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.post('/videos/:lessonId/preview', requireAdmin, requirePermission(['videos:manage', 'content:read']), async (req, res, next) => {
    try {
      const apiBaseUrl = `${req.protocol}://${req.get('host')}`;
      const data = await adminCmsService.createAdminVideoPreview({
        admin: req.admin,
        lessonId: req.params.lessonId,
        apiBaseUrl,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ---- Study Materials & Protected File Uploads ----
  router.get('/resources', requireAdmin, requirePermission(['resources:manage', 'content:read']), async (req, res, next) => {
    try {
      const items = await adminCmsService.listResources({
        subjectId: req.query.subjectId || null,
        chapterId: req.query.chapterId || null,
        resourceType: req.query.resourceType || null,
        medium: req.query.medium || null,
      });
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });
  router.post('/resources', requireAdmin, requirePermission('resources:manage'), async (req, res, next) => {
    try {
      const data = await adminCmsService.createResource({ admin: req.admin, data: req.body, ipAddress: req.ip });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/resources/:id', requireAdmin, requirePermission('resources:manage'), async (req, res, next) => {
    try {
      const data = await adminCmsService.updateResource({ admin: req.admin, id: req.params.id, patch: req.body, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.get('/resources/:id/file', requireAdmin, requirePermission(['resources:manage', 'content:read']), async (req, res, next) => {
    try {
      const items = await adminCmsService.listResources();
      const resource = items.find((r) => r.id === req.params.id);
      if (!resource) throw new NotFoundError('Resource not found');
      const diskPath = adminCmsService.getResourceDiskPath(resource);
      if (!diskPath) throw new NotFoundError('No uploaded file attached to this resource');
      res.type(resource.mime_type || 'application/pdf');
      res.sendFile(diskPath);
    } catch (err) {
      next(err);
    }
  });

  // ---- Question Bank (CRUD + Validation + Bulk CSV/Excel Import & Export) ----
  router.get('/questions', requireAdmin, requirePermission('questions:read'), async (req, res, next) => {
    try {
      const items = await assessmentService.listQuestions({
        subjectId: req.query.subjectId || null,
        chapterId: req.query.chapterId || null,
        topicId: req.query.topicId || null,
        difficulty: req.query.difficulty || null,
        questionType: req.query.questionType || null,
        board: req.query.board || null,
        status: req.query.status || null,
        search: req.query.search || null,
      });
      res.json({ success: true, data: { items, total: items.length } });
    } catch (err) {
      next(err);
    }
  });
  router.post('/questions', requireAdmin, requirePermission('questions:write'), async (req, res, next) => {
    try {
      const data = await assessmentService.createQuestion({ admin: req.admin, data: req.body, ipAddress: req.ip });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/questions/:id', requireAdmin, requirePermission('questions:write'), async (req, res, next) => {
    try {
      const data = await assessmentService.updateQuestion({ admin: req.admin, id: req.params.id, patch: req.body, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.post('/questions/bulk-import', requireAdmin, requirePermission('questions:write'), async (req, res, next) => {
    try {
      const data = await assessmentService.bulkImportQuestions({
        admin: req.admin,
        subjectId: req.body.subjectId,
        chapterId: req.body.chapterId || null,
        rows: req.body.rows || [],
        ipAddress: req.ip,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.get('/questions/export', requireAdmin, requirePermission('questions:read'), async (req, res, next) => {
    try {
      const csv = await assessmentService.exportQuestionsCsv({
        subjectId: req.query.subjectId || null,
        chapterId: req.query.chapterId || null,
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="class10-question-bank.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  });

  // ---- Quizzes ----
  router.get('/quizzes', requireAdmin, requirePermission('quizzes:manage'), async (req, res, next) => {
    try {
      const items = await assessmentService.listQuizzes({
        includeAll: true,
        subjectId: req.query.subjectId || null,
        chapterId: req.query.chapterId || null,
      });
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });
  router.post('/quizzes', requireAdmin, requirePermission('quizzes:manage'), async (req, res, next) => {
    try {
      const data = await assessmentService.createQuiz({ admin: req.admin, data: req.body, ipAddress: req.ip });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/quizzes/:id', requireAdmin, requirePermission('quizzes:manage'), async (req, res, next) => {
    try {
      const data = await assessmentService.updateQuiz({ admin: req.admin, id: req.params.id, patch: req.body, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ---- Exams ----
  router.get('/exams', requireAdmin, requirePermission(['exams:manage', 'exams:grade']), async (req, res, next) => {
    try {
      const items = await assessmentService.listExams({ includeAll: true, subjectId: req.query.subjectId || null });
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });
  router.post('/exams', requireAdmin, requirePermission('exams:manage'), async (req, res, next) => {
    try {
      const data = await assessmentService.createExam({ admin: req.admin, data: req.body, ipAddress: req.ip });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/exams/:id', requireAdmin, requirePermission('exams:manage'), async (req, res, next) => {
    try {
      const data = await assessmentService.updateExam({ admin: req.admin, id: req.params.id, patch: req.body, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.get('/exams/:id/attempts', requireAdmin, requirePermission(['exams:manage', 'exams:grade']), async (req, res, next) => {
    try {
      const items = await assessmentService.listExamAttempts({ examId: req.params.id });
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });
  router.post('/exams/attempts/:attemptId/evaluate', requireAdmin, requirePermission('exams:grade'), async (req, res, next) => {
    try {
      const data = await assessmentService.evaluateExamAttempt({
        admin: req.admin,
        attemptId: req.params.attemptId,
        descriptiveScore: req.body.descriptiveScore,
        evaluatorNotes: req.body.evaluatorNotes || '',
        ipAddress: req.ip,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ---- Reports, Notifications, Subscriptions, App Config, RBAC, Audit ----
  router.get('/reports', requireAdmin, requirePermission('progress:read'), async (req, res, next) => {
    try {
      const data = await adminOperationsService.getProgressReports({
        board: req.query.board || null,
        subjectId: req.query.subjectId || null,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/notifications', requireAdmin, requirePermission('notifications:manage'), async (_req, res, next) => {
    try {
      res.json({ success: true, data: { items: await adminOperationsService.listNotifications() } });
    } catch (err) {
      next(err);
    }
  });
  router.post('/notifications', requireAdmin, requirePermission('notifications:manage'), async (req, res, next) => {
    try {
      const data = await adminOperationsService.sendNotification({ admin: req.admin, data: req.body, ipAddress: req.ip });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/subscriptions', requireAdmin, requirePermission('subscriptions:manage'), async (_req, res, next) => {
    try {
      res.json({ success: true, data: await adminOperationsService.listSubscriptionOverview() });
    } catch (err) {
      next(err);
    }
  });
  router.post('/subscriptions/plans', requireAdmin, requirePermission('subscriptions:manage'), async (req, res, next) => {
    try {
      const data = await adminOperationsService.createPlan({ admin: req.admin, data: req.body, ipAddress: req.ip });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/subscriptions/plans/:id', requireAdmin, requirePermission('subscriptions:manage'), async (req, res, next) => {
    try {
      const data = await adminOperationsService.updatePlan({ admin: req.admin, id: req.params.id, patch: req.body, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.post('/subscriptions/assign', requireAdmin, requirePermission('subscriptions:manage'), async (req, res, next) => {
    try {
      const data = await adminOperationsService.assignOrExtendSubscription({
        admin: req.admin,
        studentId: req.body.studentId,
        planId: req.body.planId,
        extendDays: req.body.extendDays,
        status: req.body.status || 'active',
        ipAddress: req.ip,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/settings', requireAdmin, requirePermission(['config:manage', 'dashboard:view']), async (_req, res, next) => {
    try {
      res.json({ success: true, data: await adminOperationsService.getAppConfig() });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/settings', requireAdmin, requirePermission('config:manage'), async (req, res, next) => {
    try {
      const data = await adminOperationsService.updateAppConfig({ admin: req.admin, patch: req.body, ipAddress: req.ip });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/admins', requireAdmin, requirePermission('admins:manage'), async (_req, res, next) => {
    try {
      res.json({
        success: true,
        data: { items: await adminAuthService.listAdmins(), roles: adminAuthService.listRoles() },
      });
    } catch (err) {
      next(err);
    }
  });
  router.post('/admins', requireAdmin, requirePermission('admins:manage'), async (req, res, next) => {
    try {
      const data = await adminAuthService.createAdmin({
        actor: req.admin,
        ...req.body,
        ipAddress: req.ip,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  router.patch('/admins/:id', requireAdmin, requirePermission('admins:manage'), async (req, res, next) => {
    try {
      const data = await adminAuthService.updateAdmin({
        actor: req.admin,
        adminId: req.params.id,
        patch: req.body,
        ipAddress: req.ip,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/audit-logs', requireAdmin, requirePermission('audit:read'), async (req, res, next) => {
    try {
      const items = await adminOperationsService.listAuditLogs({
        limit: Number(req.query.limit || 100),
        action: req.query.action || null,
        entityType: req.query.entityType || null,
      });
      res.json({ success: true, data: { items } });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    '/security-events',
    requireAdmin,
    requirePermission(['audit:read', 'config:manage']),
    async (req, res, next) => {
      try {
        const items = await adminOperationsService.listSecurityEvents({
          limit: Number(req.query.limit || 100),
          eventType: req.query.eventType || null,
          userId: req.query.userId || null,
        });
        res.json({ success: true, data: { items, total: items.length } });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
