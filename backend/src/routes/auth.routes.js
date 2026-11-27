import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { formatStudentProfileDto } from '../services/authService.js';
import { buildSubscriptionSummary } from '../services/paymentService.js';

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{4,32}$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

const deviceSchema = z.object({
  deviceId: z.string().min(8, 'deviceId must be at least 8 characters').max(128),
  deviceName: z.string().min(2).max(100).default('Android Phone'),
  manufacturer: z.string().max(80).optional(),
  osVersion: z.string().max(40).optional(),
  appVersion: z.string().max(32).optional(),
  platform: z.enum(['android', 'web']).default('android'),
});

const registerSchema = z
  .object({
    email: z.string().trim().email('Valid email address required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128)
      .regex(
        STRONG_PASSWORD_REGEX,
        'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number'
      ),
    confirmPassword: z.string().optional(),
    fullName: z.string().trim().min(2, 'Full Name must be at least 2 characters').max(100),
    username: z
      .string()
      .trim()
      .regex(
        USERNAME_REGEX,
        'Username must be 4-32 characters (letters, numbers, dot, underscore, hyphen)'
      )
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s]{10,15}$/, 'Valid mobile number required')
      .optional(),
    state: z.string().trim().min(2).max(80).optional(),
    district: z.string().trim().max(80).optional().default(''),
    schoolName: z.string().trim().max(150).optional().default(''),
    className: z.string().trim().min(2).max(40).optional().default('Class 10'),
    board: z.enum(['AP', 'TS']).default('AP'),
    device: deviceSchema,
  })
  .superRefine((data, ctx) => {
    if (data.confirmPassword !== undefined && data.confirmPassword !== data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Confirm password does not match password',
      });
    }
  });

const checkUsernameQuerySchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(64),
});

const loginSchema = z.object({
  email: z.string().trim().min(3, 'Email or username is required').max(150),
  password: z.string().min(1, 'Password is required'),
  device: deviceSchema,
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
  deviceId: z.string().min(8).max(128).optional(),
});

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{10,15}$/, 'Valid phone number required')
    .optional(),
  board: z.enum(['AP', 'TS']).optional(),
  state: z.string().trim().min(2).max(80).optional(),
  district: z.string().trim().max(80).optional(),
  schoolName: z.string().trim().max(150).optional(),
  className: z.string().trim().min(2).max(40).optional(),
});

const logoutSchema = z.object({
  allDevices: z.boolean().optional().default(false),
});

export function createAuthRoutes({ authService, store, requireAuth, authLimiter }) {
  const router = Router();

  router.get(
    '/check-username',
    authLimiter,
    validate({ query: checkUsernameQuerySchema }),
    async (req, res, next) => {
      try {
        const normalizedUsername = req.query.username.trim().toLowerCase();
        if (!USERNAME_REGEX.test(normalizedUsername)) {
          return res.json({
            success: true,
            data: {
              available: false,
              valid: false,
              normalizedUsername,
              message:
                'Username must be 4-32 characters (letters, numbers, dot, underscore, hyphen).',
            },
          });
        }

        const existing = store.getProfileByUsername
          ? await store.getProfileByUsername(normalizedUsername)
          : null;

        res.json({
          success: true,
          data: {
            available: !existing,
            valid: true,
            normalizedUsername,
            message: existing ? 'Username is already taken.' : 'Username is available.',
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

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
      res.json({
        success: true,
        data: {
          user: formatStudentProfileDto(req.user),
          device: req.device
            ? { id: req.device.id, deviceName: req.device.device_name }
            : null,
          subscription: buildSubscriptionSummary(sub),
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
        if (req.body.state !== undefined) patch.state = req.body.state.trim();
        if (req.body.district !== undefined) patch.district = req.body.district.trim();
        if (req.body.schoolName !== undefined) patch.school = req.body.schoolName.trim();
        if (req.body.className !== undefined) patch.class_name = req.body.className.trim();
        const updated = await store.updateProfile(req.user.id, patch);
        res.json({
          success: true,
          data: {
            user: formatStudentProfileDto(updated),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
