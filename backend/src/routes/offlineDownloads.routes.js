import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';

const uuidParam = (name) =>
  z.object({
    [name]: z.string().uuid(`Valid ${name} UUID is required`),
  });

const initiateDownloadSchema = z.object({
  qualityLabel: z.string().max(32).optional(),
  forceRedownload: z.boolean().optional().default(false),
  deviceId: z.string().min(8).max(128).optional(),
});

const syncStatusSchema = z.object({
  status: z.enum(['queued', 'downloading', 'completed', 'failed', 'cancelled', 'file_missing']),
  bytesDownloaded: z.number().int().min(0).optional(),
  verifiedChecksum: z.string().regex(/^[a-fA-F0-9]{64}$/, 'Valid 64-char SHA-256 hex checksum required').optional(),
  fileSize: z.number().int().min(0).optional(),
  lastPlayedPosition: z.number().min(0).max(86400).optional(),
});

const lessonProgressSchema = z.object({
  positionSeconds: z.number().min(0).max(86400),
  durationSeconds: z.number().min(0).max(86400).optional(),
  markCompleted: z.boolean().optional().default(false),
});

const registerExternalAssetSchema = z.object({
  storageProvider: z.enum(['cloudflare_r2', 'supabase_storage', 'pikpak_local', 'persistent_disk']),
  storageKey: z.string().min(1).max(512),
  originalFileName: z.string().max(180).optional(),
  qualityLabel: z.string().max(32).optional().default('720p'),
  fileSizeBytes: z.number().int().positive(),
  durationSeconds: z.number().int().min(0).optional().default(0),
  sha256Checksum: z.string().regex(/^[a-fA-F0-9]{64}$/, 'Valid 64-char SHA-256 hex checksum required'),
});

/**
 * Student Offline Video Download & Safe Lesson Detail Routes (mounted at /api/v1).
 *
 * Implements:
 * - GET    /api/v1/lessons/:lessonId
 * - GET    /api/v1/lessons/:lessonId/download-info
 * - POST   /api/v1/lessons/:lessonId/download
 * - POST   /api/v1/lessons/:lessonId/progress
 * - GET    /api/v1/downloads
 * - GET    /api/v1/downloads/:downloadId/status
 * - PATCH  /api/v1/downloads/:downloadId/status
 * - GET    /api/v1/downloads/:downloadId/manifest
 * - GET    /api/v1/downloads/:downloadId/stream  (+ HEAD, Range 206 resumable)
 * - DELETE /api/v1/downloads/:downloadId
 */
export function createOfflineDownloadRoutes({ offlineDownloadService, requireAuth, playbackLimiter }) {
  const router = Router();

  router.get(
    '/lessons/:lessonId',
    requireAuth,
    validate({ params: uuidParam('lessonId') }),
    async (req, res, next) => {
      try {
        const data = await offlineDownloadService.getSafeLessonDetails({
          user: req.user,
          device: req.device,
          lessonId: req.params.lessonId,
        });
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/lessons/:lessonId/download-info',
    requireAuth,
    validate({ params: uuidParam('lessonId') }),
    async (req, res, next) => {
      try {
        const data = await offlineDownloadService.getDownloadInfo({
          user: req.user,
          session: req.session,
          device: req.device,
          lessonId: req.params.lessonId,
          rawDeviceId: req.get('x-device-id') || null,
        });
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/lessons/:lessonId/download',
    requireAuth,
    playbackLimiter,
    validate({ params: uuidParam('lessonId'), body: initiateDownloadSchema }),
    async (req, res, next) => {
      try {
        const apiBaseUrl = `${req.protocol}://${req.get('host')}`;
        const data = await offlineDownloadService.initiateDownload({
          user: req.user,
          session: req.session,
          device: req.device,
          lessonId: req.params.lessonId,
          rawDeviceId: req.body.deviceId || req.get('x-device-id') || null,
          qualityLabel: req.body.qualityLabel || null,
          forceRedownload: Boolean(req.body.forceRedownload),
          apiBaseUrl,
        });
        res.set('Cache-Control', 'no-store');
        res.status(data.duplicatePrevented ? 200 : 201).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/lessons/:lessonId/progress',
    requireAuth,
    validate({ params: uuidParam('lessonId'), body: lessonProgressSchema }),
    async (req, res, next) => {
      try {
        const data = await offlineDownloadService.saveOfflineAwareProgress({
          userId: req.user.id,
          lessonId: req.params.lessonId,
          positionSeconds: req.body.positionSeconds,
          durationSeconds: req.body.durationSeconds,
          markCompleted: req.body.markCompleted,
        });
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/downloads', requireAuth, async (req, res, next) => {
    try {
      const data = await offlineDownloadService.listStudentDownloads({
        user: req.user,
        device: req.device,
      });
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    '/downloads/:downloadId/status',
    requireAuth,
    validate({ params: uuidParam('downloadId') }),
    async (req, res, next) => {
      try {
        const data = await offlineDownloadService.getDownloadStatus({
          user: req.user,
          downloadId: req.params.downloadId,
        });
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    '/downloads/:downloadId/status',
    requireAuth,
    validate({ params: uuidParam('downloadId'), body: syncStatusSchema }),
    async (req, res, next) => {
      try {
        const data = await offlineDownloadService.syncDownloadStatus({
          user: req.user,
          downloadId: req.params.downloadId,
          ...req.body,
        });
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/downloads/:downloadId/manifest',
    requireAuth,
    playbackLimiter,
    validate({ params: uuidParam('downloadId') }),
    async (req, res, next) => {
      try {
        const apiBaseUrl = `${req.protocol}://${req.get('host')}`;
        const data = await offlineDownloadService.getDownloadManifest({
          user: req.user,
          session: req.session,
          device: req.device,
          downloadId: req.params.downloadId,
          apiBaseUrl,
        });
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  const handleStream = async (req, res, next) => {
    try {
      const token = String(req.query.token || req.get('x-download-token') || '').trim();
      await offlineDownloadService.streamAuthorizedDownload({
        downloadId: req.params.downloadId,
        downloadToken: token,
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

  router.get('/downloads/:downloadId/stream', validate({ params: uuidParam('downloadId') }), handleStream);
  router.head('/downloads/:downloadId/stream', validate({ params: uuidParam('downloadId') }), handleStream);

  router.delete(
    '/downloads/:downloadId',
    requireAuth,
    validate({ params: uuidParam('downloadId') }),
    async (req, res, next) => {
      try {
        const data = await offlineDownloadService.deleteDownload({
          user: req.user,
          downloadId: req.params.downloadId,
        });
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

/**
 * Admin Authorized MP4 Ingestion Routes (mounted at /api/v1/admin).
 * Supports zero-buffer binary MP4 upload streaming + optional FFmpeg processing,
 * as well as attaching existing Cloudflare R2 / Supabase Storage / PikPak MP4 assets.
 */
export function createAdminOfflineAssetRoutes({
  offlineDownloadService,
  requireAdmin,
  requirePermission,
}) {
  const router = Router();

  router.get(
    '/lessons/:lessonId/offline-assets',
    requireAdmin,
    requirePermission(['videos:manage', 'content:read']),
    validate({ params: uuidParam('lessonId') }),
    async (req, res, next) => {
      try {
        const items = await offlineDownloadService.listAdminLessonAssets(req.params.lessonId);
        res.json({
          success: true,
          data: {
            items,
            storage: offlineDownloadService.storageService.getStorageSummary(),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Raw binary streaming upload (Content-Type: video/mp4 or application/octet-stream)
  // Streams directly to temp file without express.json() heap buffering.
  router.post(
    '/lessons/:lessonId/offline-assets/upload',
    requireAdmin,
    requirePermission('videos:manage'),
    validate({ params: uuidParam('lessonId') }),
    async (req, res, next) => {
      try {
        const originalFileName = req.get('x-file-name') || String(req.query.fileName || 'lesson.mp4');
        const qualityLabel = String(req.query.qualityLabel || req.get('x-quality-label') || '720p');
        const targetHeight = req.query.targetHeight ? Number(req.query.targetHeight) : null;
        const durationSeconds = req.query.durationSeconds ? Number(req.query.durationSeconds) : 0;

        const data = await offlineDownloadService.uploadAuthorizedMp4Asset({
          admin: req.admin,
          lessonId: req.params.lessonId,
          readableStream: req,
          originalFileName,
          qualityLabel,
          targetHeight,
          durationSeconds,
          ipAddress: req.ip,
        });
        res.status(201).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/lessons/:lessonId/offline-assets',
    requireAdmin,
    requirePermission('videos:manage'),
    validate({ params: uuidParam('lessonId'), body: registerExternalAssetSchema }),
    async (req, res, next) => {
      try {
        const data = await offlineDownloadService.registerExternalOfflineAsset({
          admin: req.admin,
          lessonId: req.params.lessonId,
          ...req.body,
          ipAddress: req.ip,
        });
        res.status(201).json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    '/offline-assets/:assetId',
    requireAdmin,
    requirePermission('videos:manage'),
    validate({ params: uuidParam('assetId') }),
    async (req, res, next) => {
      try {
        const data = await offlineDownloadService.deleteAdminOfflineAsset({
          admin: req.admin,
          assetId: req.params.assetId,
          ipAddress: req.ip,
        });
        res.json({ success: true, data });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

