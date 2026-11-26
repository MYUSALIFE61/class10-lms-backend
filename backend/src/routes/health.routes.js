import { Router } from 'express';

export function createHealthRoutes() {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({
      success: true,
      status: 'ok',
      service: 'class10-lms-backend',
      timestamp: new Date().toISOString(),
    });
  });
  return router;
}
