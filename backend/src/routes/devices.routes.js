import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const registerDeviceSchema = z.object({
  deviceId: z.string().min(8).max(128),
  deviceName: z.string().min(2).max(100).default('Android Phone'),
  manufacturer: z.string().max(80).optional(),
  osVersion: z.string().max(40).optional(),
  appVersion: z.string().max(32).optional(),
  platform: z.enum(['android', 'web']).default('android'),
});

const deviceIdParamSchema = z.object({
  deviceId: z.string().uuid('Valid device UUID required'),
});

export function createDeviceRoutes({ deviceService, requireAuth }) {
  const router = Router();

  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const devices = await deviceService.listDevices(req.user.id);
      res.json({
        success: true,
        data: {
          devices,
          currentDeviceId: req.device?.id || null,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/register',
    requireAuth,
    validate({ body: registerDeviceSchema }),
    async (req, res, next) => {
      try {
        const device = await deviceService.registerOrTouchDevice({
          userId: req.user.id,
          rawDeviceId: req.body.deviceId,
          deviceName: req.body.deviceName,
          manufacturer: req.body.manufacturer,
          osVersion: req.body.osVersion,
          appVersion: req.body.appVersion,
          platform: req.body.platform,
          ipAddress: req.ip,
        });
        res.status(200).json({
          success: true,
          data: {
            device: {
              id: device.id,
              deviceName: device.device_name,
              isActive: device.is_active,
              lastSeenAt: device.last_seen_at,
            },
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    '/:deviceId',
    requireAuth,
    validate({ params: deviceIdParamSchema }),
    async (req, res, next) => {
      try {
        const revoked = await deviceService.revokeDevice({
          userId: req.user.id,
          deviceId: req.params.deviceId,
          ipAddress: req.ip,
        });
        res.json({
          success: true,
          data: {
            revokedDeviceId: revoked.id,
            revokedAt: revoked.revoked_at,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
