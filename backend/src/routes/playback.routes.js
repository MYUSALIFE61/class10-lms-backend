import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const authorizeSchema = z.object({
  lessonId: z.string().uuid('Valid lesson UUID required'),
  deviceId: z.string().min(8).max(128).optional(),
  integrityToken: z.string().min(10).max(4096).optional(),
});

const progressSchema = z.object({
  lessonId: z.string().uuid('Valid lesson UUID required'),
  positionSeconds: z.number().min(0).max(86400),
  durationSeconds: z.number().min(0).max(86400).optional(),
  markCompleted: z.boolean().optional().default(false),
});

export function createPlaybackRoutes({ playbackService, requireAuth, playbackLimiter }) {
  const router = Router();

  router.post(
    '/authorize',
    requireAuth,
    playbackLimiter,
    validate({ body: authorizeSchema }),
    async (req, res, next) => {
      try {
        const apiBaseUrl = `${req.protocol}://${req.get('host')}`;
        const payload = await playbackService.authorizePlayback({
          user: req.user,
          session: req.session,
          device: req.device,
          lessonId: req.body.lessonId,
          rawDeviceId: req.body.deviceId || req.get('x-device-id') || null,
          integrityToken: req.body.integrityToken || req.get('x-play-integrity-token') || null,
          ipAddress: req.ip,
          apiBaseUrl,
        });
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, data: payload });
      } catch (err) {
        next(err);
      }
    }
  );

  // Authenticated short-lived HMAC-signed Range streaming endpoint (for local PikPak adapter)
  // Media3 ExoPlayer and HTML5 <video> stream byte ranges directly from here without ever seeing PikPak URLs
  const handleStreamRequest = async (req, res, next) => {
    try {
      await playbackService.streamAuthorizedToken({
        streamToken: req.params.streamToken,
        req,
        res,
      });
    } catch (err) {
      if (!res.headersSent) {
        next(err);
      } else {
        res.destroy();
      }
    }
  };
  router.get('/stream/:streamToken', handleStreamRequest);
  router.head('/stream/:streamToken', handleStreamRequest);

  router.post(
    '/progress',
    requireAuth,
    validate({ body: progressSchema }),
    async (req, res, next) => {
      try {
        const saved = await playbackService.saveProgress({
          userId: req.user.id,
          lessonId: req.body.lessonId,
          positionSeconds: req.body.positionSeconds,
          durationSeconds: req.body.durationSeconds,
          markCompleted: req.body.markCompleted,
        });
        res.json({ success: true, data: { progress: saved } });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
