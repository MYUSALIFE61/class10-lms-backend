import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const deviceSchema = z.object({
  deviceId: z.string().min(8, 'deviceId must be at least 8 characters').max(128),
  deviceName: z.string().min(2).max(100).default('Android Phone'),
  manufacturer: z.string().max(80).optional(),
  osVersion: z.string().max(40).optional(),
  appVersion: z.string().max(32).optional(),
  platform: z.enum(['android', 'web']).default('android'),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  fullName: z.string().min(2).max(100),
  phone: z
    .string()
    .regex(/^[0-9+\-\s]{10,15}$/, 'Valid phone number required')
    .optional(),
  board: z.enum(['AP', 'TS']).default('AP'),
  device: deviceSchema,
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
  device: deviceSchema,
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
  deviceId: z.string().min(8).max(128).optional(),
});

const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  phone: z
    .string()
    .regex(/^[0-9+\-\s]{10,15}$/, 'Valid phone number required')
    .optional(),
  board: z.enum(['AP', 'TS']).optional(),
});

const logoutSchema = z.object({
  allDevices: z.boolean().optional().default(false),
});

export function createAuthRoutes({ authService, store, requireAuth, authLimiter }) {
  const router = Router();

  router.post(
    '/register',
    authLimiter,
    validate({ body: registerSchema }),
    async (req, res, next) => {
      try {
        const result = await authService.register({
          ...req.body,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') || null,
        });
        res.status(201).json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/login',
    authLimiter,
    validate({ body: loginSchema }),
    async (req, res, next) => {
      try {
        const result = await authService.login({
          ...req.body,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') || null,
        });
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/refresh',
    authLimiter,
    validate({ body: refreshSchema }),
    async (req, res, next) => {
      try {
        const tokens = await authService.refresh({
          refreshToken: req.body.refreshToken,
          rawDeviceId: req.body.deviceId || req.get('x-device-id'),
          ipAddress: req.ip,
        });
        res.json({ success: true, data: { tokens } });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/logout',
    requireAuth,
    validate({ body: logoutSchema }),
    async (req, res, next) => {
      try {
        const result = await authService.logout({
          sessionId: req.session.id,
          userId: req.user.id,
          allDevices: req.body.allDevices,
        });
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/me', requireAuth, async (req, res, next) => {
    try {
      const sub = await store.getLatestSubscription(req.user.id);
      const isActive =
        Boolean(sub) &&
        sub.status === 'active' &&
        new Date(sub.expires_at).getTime() > Date.now();
      res.json({
        success: true,
        data: {
          user: {
            id: req.user.id,
            fullName: req.user.full_name,
            email: req.user.email,
            phone: req.user.phone,
            board: req.user.board,
            studentCode: req.user.student_code,
            role: req.user.role,
          },
          device: req.device
            ? { id: req.device.id, deviceName: req.device.device_name }
            : null,
          subscription: sub
            ? {
                id: sub.id,
                status: isActive ? 'active' : sub.status === 'active' ? 'expired' : sub.status,
                isActive,
                startsAt: sub.starts_at,
                expiresAt: sub.expires_at,
              }
            : { status: 'none', isActive: false, startsAt: null, expiresAt: null },
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    '/me',
    requireAuth,
    validate({ body: updateProfileSchema }),
    async (req, res, next) => {
      try {
        const patch = {};
        if (req.body.fullName !== undefined) patch.full_name = req.body.fullName.trim();
        if (req.body.phone !== undefined) patch.phone = req.body.phone;
        if (req.body.board !== undefined) patch.board = req.body.board;
        const updated = await store.updateProfile(req.user.id, patch);
        res.json({
          success: true,
          data: {
            user: {
              id: updated.id,
              fullName: updated.full_name,
              email: updated.email,
              phone: updated.phone,
              board: updated.board,
              studentCode: updated.student_code,
              role: updated.role,
            },
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
