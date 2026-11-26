import express from 'express';
import { applySecurityMiddleware } from './middleware/security.js';
import { createRateLimiters } from './middleware/rateLimiters.js';
import { createAuthMiddleware } from './middleware/authMiddleware.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { DeviceService } from './services/deviceService.js';
import { AuthService } from './services/authService.js';
import { SubscriptionService, PaymentService } from './services/paymentService.js';
import { IntegrityService } from './services/integrityService.js';
import { PlaybackService } from './services/playbackService.js';
import { CurriculumService } from './services/curriculumService.js';
import { createVideoProvider } from './services/videoProviders/index.js';
import { VideoSyncService } from './services/videoSyncService.js';
import { createHealthRoutes } from './routes/health.routes.js';
import { createAuthRoutes } from './routes/auth.routes.js';
import { createDeviceRoutes } from './routes/devices.routes.js';
import { createSubscriptionRoutes } from './routes/subscriptions.routes.js';
import { createPaymentRoutes } from './routes/payments.routes.js';
import { createCurriculumRoutes } from './routes/curriculum.routes.js';
import { createPlaybackRoutes } from './routes/playback.routes.js';
import { createIntegrityRoutes } from './routes/integrity.routes.js';
import { ensureAdminStoreSupport } from './repositories/adminStoreExtension.js';
import { AdminAuthService } from './services/adminAuthService.js';
import { createAdminAuthMiddleware } from './middleware/adminAuthMiddleware.js';
import { AdminCmsService } from './services/adminCmsService.js';
import { AssessmentService } from './services/assessmentService.js';
import { AdminOperationsService } from './services/adminOperationsService.js';
import { StudentDynamicService } from './services/studentDynamicService.js';
import { createAdminRoutes } from './routes/admin.routes.js';
import { createStudentRoutes } from './routes/student.routes.js';
import { ensureGamificationStoreSupport } from './repositories/gamificationStoreExtension.js';
import { GamifiedQuizService } from './services/gamifiedQuizService.js';
import {
  createAdminVideoQuizRoutes,
  createStudentVideoQuizRoutes,
} from './routes/gamifiedQuiz.routes.js';
import { ensureOfflineDownloadStoreSupport } from './repositories/offlineDownloadStoreExtension.js';
import { FfmpegProcessor } from './services/ffmpegProcessor.js';
import {
  DEFAULT_OFFLINE_TEMP_DIR,
  OfflineStorageService,
} from './services/offlineStorageService.js';
import { OfflineDownloadService } from './services/offlineDownloadService.js';
import {
  createAdminOfflineAssetRoutes,
  createOfflineDownloadRoutes,
} from './routes/offlineDownloads.routes.js';

export function createApp({
  config,
  store,
  authProvider,
  paymentGateway = null,
  integrityProvider = null,
  videoProvider = undefined,
  disableRateLimit = false,
}) {
  ensureAdminStoreSupport(store);
  ensureGamificationStoreSupport(store);
  ensureOfflineDownloadStoreSupport(store);
  const app = express();

  applySecurityMiddleware(app, config);

  app.get('/health', (_req, res) => {
    res.status(200).json({
      success: true,
      status: 'ok',
      service: 'class10-lms-backend',
      timestamp: new Date().toISOString(),
    });
  });

  // Preserve rawBody for Razorpay webhook HMAC verification; allow up to 20mb for protected PDF/image uploads
  app.use(
    express.json({
      limit: '20mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  const limiters = createRateLimiters({ disabled: disableRateLimit });
  app.use('/api', (req, res, next) => {
    // Exempt binary byte-range chunks from general JSON API burst throttle
    if (
      req.path.startsWith('/v1/playback/stream/') ||
      /^\/v1\/downloads\/[^/]+\/stream$/.test(req.path)
    ) {
      return next();
    }
    return limiters.generalLimiter(req, res, next);
  });

  const resolvedVideoProvider =
    videoProvider !== undefined ? videoProvider : createVideoProvider({ config });

  const deviceService = new DeviceService({ store, config });
  const authService = new AuthService({ store, authProvider, deviceService, config });
  const subscriptionService = new SubscriptionService({ store });
  const paymentService = new PaymentService({ store, paymentGateway, config });
  const integrityService = integrityProvider
    ? new IntegrityService({ store, integrityProvider, config })
    : null;
  const playbackService = new PlaybackService({
    store,
    subscriptionService,
    deviceService,
    integrityService,
    videoProvider: resolvedVideoProvider,
    config,
  });
  const curriculumService = new CurriculumService({ store, subscriptionService });
  const videoSyncService = new VideoSyncService({
    store,
    videoProvider: resolvedVideoProvider,
    curriculumService,
  });
  curriculumService.videoSyncService = videoSyncService;
  const requireAuth = createAuthMiddleware({ store, config });

  app.use('/api/v1', createHealthRoutes());
  app.use(
    '/api/v1/auth',
    createAuthRoutes({ authService, store, requireAuth, authLimiter: limiters.authLimiter })
  );
  app.use('/api/v1/devices', createDeviceRoutes({ deviceService, requireAuth }));
  app.use(
    '/api/v1/subscriptions',
    createSubscriptionRoutes({ subscriptionService, paymentService, requireAuth })
  );
  app.use(
    '/api/v1/payments',
    createPaymentRoutes({ paymentService, requireAuth, paymentLimiter: limiters.paymentLimiter })
  );
  app.use(
    '/api/v1/curriculum',
    createCurriculumRoutes({ curriculumService, videoSyncService, requireAuth })
  );
  app.use(
    '/api/v1/playback',
    createPlaybackRoutes({
      playbackService,
      requireAuth,
      playbackLimiter: limiters.playbackLimiter,
    })
  );
  if (integrityService) {
    app.use('/api/v1/integrity', createIntegrityRoutes({ integrityService, requireAuth }));
  }

  // ---- Centralized Dynamic Admin Portal & Student Dynamic APIs ----
  const adminAuthService = new AdminAuthService({ store, config });
  const { requireAdmin, requirePermission } = createAdminAuthMiddleware({
    store,
    adminAuthService,
  });
  const adminCmsService = new AdminCmsService({
    store,
    adminAuthService,
    curriculumService,
    playbackService,
    videoSyncService,
  });
  const assessmentService = new AssessmentService({
    store,
    adminAuthService,
    subscriptionService,
  });
  const adminOperationsService = new AdminOperationsService({
    store,
    authProvider,
    adminAuthService,
    curriculumService,
  });
  const studentDynamicService = new StudentDynamicService({
    store,
    subscriptionService,
    curriculumService,
    paymentService,
  });

  app.use(
    '/api/v1/admin',
    createAdminRoutes({
      adminAuthService,
      adminCmsService,
      assessmentService,
      adminOperationsService,
      videoSyncService,
      requireAdmin,
      requirePermission,
      authLimiter: limiters.authLimiter,
    })
  );

  app.use(
    '/api/v1/student',
    createStudentRoutes({
      studentDynamicService,
      assessmentService,
      adminCmsService,
      store,
      requireAuth,
    })
  );

  // ---- Gamified Video-Based MCQ System (Extended on Existing DB & Auth) ----
  const gamifiedQuizService = new GamifiedQuizService({
    store,
    adminAuthService,
    subscriptionService,
  });

  app.use(
    '/api/v1/admin/video-quizzes',
    createAdminVideoQuizRoutes({
      gamifiedQuizService,
      requireAdmin,
      requirePermission,
    })
  );

  app.use(
    '/api/v1/student',
    createStudentVideoQuizRoutes({
      gamifiedQuizService,
      requireAuth,
    })
  );

  // ---- Authorized Offline Video Downloader & Encrypted In-App Playback ----
  const ffmpegProcessor = new FfmpegProcessor({
    tempDir: config.OFFLINE_VIDEO_TEMP_DIR || DEFAULT_OFFLINE_TEMP_DIR,
    ffmpegPath: config.FFMPEG_PATH || '',
    ffprobePath: config.FFPROBE_PATH || '',
  });
  if (config.NODE_ENV !== 'test') {
    ffmpegProcessor.startCleanupSchedule();
  }
  const offlineStorageService = new OfflineStorageService({
    config,
    videoProvider: resolvedVideoProvider,
    supabaseAdmin: store?.db || null,
  });
  const offlineDownloadService = new OfflineDownloadService({
    store,
    subscriptionService,
    deviceService,
    playbackService,
    storageService: offlineStorageService,
    ffmpegProcessor,
    adminAuthService,
    config,
  });

  app.use(
    '/api/v1/admin',
    createAdminOfflineAssetRoutes({
      offlineDownloadService,
      requireAdmin,
      requirePermission,
    })
  );

  app.use(
    '/api/v1',
    createOfflineDownloadRoutes({
      offlineDownloadService,
      requireAuth,
      playbackLimiter: limiters.playbackLimiter,
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return {
    app,
    services: {
      authService,
      deviceService,
      subscriptionService,
      paymentService,
      integrityService,
      playbackService,
      curriculumService,
      videoSyncService,
      videoProvider: resolvedVideoProvider,
      adminAuthService,
      adminCmsService,
      assessmentService,
      adminOperationsService,
      studentDynamicService,
      gamifiedQuizService,
      ffmpegProcessor,
      offlineStorageService,
      offlineDownloadService,
    },
  };
}
