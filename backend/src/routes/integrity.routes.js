import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const verifySchema = z.object({
  integrityToken: z.string().min(10).max(4096),
});

export function createIntegrityRoutes({ integrityService, requireAuth }) {
  const router = Router();

  router.post('/nonce', requireAuth, (req, res) => {
    const result = integrityService.issueNonce({
      userId: req.user.id,
      deviceId: req.device?.id || null,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: result });
  });

  router.post(
    '/verify',
    requireAuth,
    validate({ body: verifySchema }),
    async (req, res, next) => {
      try {
        const result = await integrityService.verifyIntegrityToken({
          userId: req.user.id,
          deviceId: req.device?.id || null,
          integrityToken: req.body.integrityToken,
          ipAddress: req.ip,
        });
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
