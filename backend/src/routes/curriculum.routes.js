import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const uuidParam = (name) =>
  z.object({
    [name]: z.string().uuid(`Valid ${name} UUID is required`),
  });

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const resourceFilterQuery = paginationQuery.extend({
  subjectId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
  lessonId: z.string().uuid().optional(),
  board: z.enum(['AP', 'TS']).optional(),
});

const submitMcqSchema = z.object({
  answers: z
    .array(
      z.object({
        mcqId: z.string().uuid(),
        selectedOptionIndex: z.number().int().min(0).max(10),
      })
    )
    .min(1),
});

export function createCurriculumRoutes({ curriculumService, videoSyncService = null, requireAuth }) {
  const router = Router();

  router.get('/dashboard', requireAuth, async (req, res, next) => {
    try {
      const data = await curriculumService.getDashboard(req.user);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/videos/sync', requireAuth, async (_req, res, next) => {
    try {
      if (!videoSyncService) {
        return res.status(400).json({
          success: false,
          error: { code: 'VIDEO_SYNC_UNAVAILABLE', message: 'Video sync service is not enabled.' },
        });
      }
      const result = await videoSyncService.syncVideos();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  router.get('/subjects', requireAuth, async (req, res, next) => {
    try {
      const board = req.query.board === 'AP' || req.query.board === 'TS' ? req.query.board : req.user.board;
      const subjects = await curriculumService.listSubjects({ board });
      res.set('Cache-Control', 'private, max-age=120');
      res.json({ success: true, data: { subjects } });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    '/subjects/:subjectId/chapters',
    requireAuth,
    validate({ params: uuidParam('subjectId') }),
    async (req, res, next) => {
      try {
        const data = await curriculumService.listChapters(req.params.subjectId);
        res.set('Cache-Control', 'private, max-age=120');
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/chapters/:chapterId/lessons',
    requireAuth,
    validate({ params: uuidParam('chapterId'), query: paginationQuery }),
    async (req, res, next) => {
      try {
        const data = await curriculumService.listLessons({
          userId: req.user.id,
          chapterId: req.params.chapterId,
          page: req.query.page,
          limit: req.query.limit,
        });
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/lessons/:lessonId/mcqs',
    requireAuth,
    validate({ params: uuidParam('lessonId') }),
    async (req, res, next) => {
      try {
        const mcqs = await curriculumService.getLessonMcqs({
          userId: req.user.id,
          lessonId: req.params.lessonId,
        });
        res.json({ success: true, data: { mcqs } });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/lessons/:lessonId/mcqs/submit',
    requireAuth,
    validate({ params: uuidParam('lessonId'), body: submitMcqSchema }),
    async (req, res, next) => {
      try {
        const result = await curriculumService.submitLessonMcqs({
          userId: req.user.id,
          lessonId: req.params.lessonId,
          answers: req.body.answers,
        });
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/notes',
    requireAuth,
    validate({ query: resourceFilterQuery }),
    async (req, res, next) => {
      try {
        const data = await curriculumService.getNotes({
          userId: req.user.id,
          ...req.query,
        });
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/pyqs',
    requireAuth,
    validate({ query: resourceFilterQuery }),
    async (req, res, next) => {
      try {
        const data = await curriculumService.getPyqs({
          userId: req.user.id,
          ...req.query,
          board: req.query.board || req.user.board,
        });
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/formulas',
    requireAuth,
    validate({ query: resourceFilterQuery }),
    async (req, res, next) => {
      try {
        const data = await curriculumService.getFormulas({
          userId: req.user.id,
          ...req.query,
        });
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
