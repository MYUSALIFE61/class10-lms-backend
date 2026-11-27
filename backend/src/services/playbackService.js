import crypto from 'node:crypto';
import { isValidYouTubeVideoId, maskPhoneOrEmail, generateRandomId } from '../utils/crypto.js';
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors.js';

function signBunnyStyleStreamUrl(rawUrl, tokenKey, ttlSeconds = 1800) {
  if (!tokenKey) return rawUrl;
  const parsed = new URL(rawUrl);
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const hashableBase = `${tokenKey}${parsed.pathname}${expires}`;
  const token = crypto
    .createHash('sha256')
    .update(hashableBase)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  parsed.searchParams.set('token', token);
  parsed.searchParams.set('expires', String(expires));
  return parsed.toString();
}

export class PlaybackService {
  constructor({
    store,
    subscriptionService,
    deviceService,
    integrityService,
    videoProvider = null,
    offlineStorageService = null,
    config = {},
  }) {
    this.store = store;
    this.subscriptionService = subscriptionService;
    this.deviceService = deviceService;
    this.integrityService = integrityService;
    this.videoProvider = videoProvider;
    this.offlineStorageService = offlineStorageService;
    this.config = config;
  }

  _getStreamSigningSecret() {
    return (
      this.config.JWT_ACCESS_SECRET ||
      this.config.PRIVATE_STREAM_TOKEN_KEY ||
      'dev-fallback-stream-signing-secret-32chars'
    );
  }

  /**
   * Signs a short-lived HMAC-SHA256 stream token bound to (userId, lessonId, deviceId, fileId, exp).
   * Clients receive only this token in the backend stream URL — never PikPak credentials or signed CDN URLs.
   */
  signStreamToken({ lessonId, fileId = null, assetId = null, userId, deviceId, mimeType = 'video/mp4', ttlSeconds = null }) {
    const ttl = ttlSeconds || this.config.STREAM_TOKEN_TTL_SECONDS || 900;
    const payload = {
      lid: lessonId,
      ...(fileId ? { fid: fileId } : {}),
      ...(assetId ? { aid: assetId } : {}),
      uid: userId,
      did: deviceId || '',
      mime: mimeType,
      exp: Math.floor(Date.now() / 1000) + ttl,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', this._getStreamSigningSecret())
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${sig}`;
  }

  verifyStreamToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      throw new UnauthorizedError('Invalid playback stream token', 'INVALID_STREAM_TOKEN');
    }
    const [encoded, providedSig] = token.split('.');
    if (!encoded || !providedSig) {
      throw new UnauthorizedError('Malformed playback stream token', 'INVALID_STREAM_TOKEN');
    }
    const expectedSig = crypto
      .createHmac('sha256', this._getStreamSigningSecret())
      .update(encoded)
      .digest('base64url');

    const a = Buffer.from(providedSig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedError('Stream token signature verification failed', 'INVALID_STREAM_TOKEN');
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedError('Corrupted stream token payload', 'INVALID_STREAM_TOKEN');
    }

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedError('Playback stream token has expired', 'STREAM_TOKEN_EXPIRED');
    }
    if ((!payload.fid && !payload.aid) || !payload.lid) {
      throw new UnauthorizedError('Incomplete stream token payload', 'INVALID_STREAM_TOKEN');
    }
    return payload;
  }

  async streamAuthorizedToken({ streamToken, req, res }) {
    const claims = this.verifyStreamToken(streamToken);
    if (claims.aid) {
      if (!this.offlineStorageService || typeof this.offlineStorageService.streamAssetToResponse !== 'function') {
        throw new AppError(
          'Private offline asset streaming service is not configured.',
          503,
          'VIDEO_PROVIDER_UNAVAILABLE'
        );
      }
      const asset = await this.store.getLessonVideoAssetById(claims.aid);
      if (!asset || !asset.is_downloadable || asset.transcoding_status !== 'ready') {
        throw new NotFoundError('Authorized lesson video asset is unavailable.', 'VIDEO_UNAVAILABLE');
      }
      return this.offlineStorageService.streamAssetToResponse({
        asset,
        userId: claims.uid,
        deviceId: claims.did || '',
        req,
        res,
      });
    }
    if (!this.videoProvider || typeof this.videoProvider.streamVideoToResponse !== 'function') {
      throw new AppError(
        'Local video streaming provider is not enabled on this server.',
        503,
        'VIDEO_PROVIDER_UNAVAILABLE'
      );
    }

    await this.videoProvider.streamVideoToResponse({
      fileId: claims.fid,
      mimeType: claims.mime || 'video/mp4',
      req,
      res,
    });
  }

  /**
   * 7-step backend-enforced playback authorization flow:
   * 1. Authenticated student (enforced by requireAuth middleware)
   * 2. Verify active registered device & device binding
   * 3. Verify lesson exists & is active
   * 4. For premium lessons: verify subscription status, verified payment & expiry
   * 5. Optional Play Integrity token verification
   * 6. Fetch video source from backend-only vault & mint short-lived authorized playback handle
   * 7. Record playback audit log & return resume position + watermark payload
   */
  async authorizePlayback({
    user,
    session,
    device,
    lessonId,
    rawDeviceId = null,
    integrityToken = null,
    ipAddress = null,
    apiBaseUrl = null,
  }) {
    // Step 2: Cross-verify device if header/body provided
    if (rawDeviceId) {
      await this.deviceService.verifyDeviceActive({
        userId: user.id,
        rawDeviceId,
        boundDeviceId: session.device_id,
      });
    } else if (!device || !device.is_active) {
      await this._audit(user.id, device?.id, lessonId, false, 'DEVICE_NOT_REGISTERED', ipAddress);
      throw new ForbiddenError('Device is not registered or active', 'DEVICE_NOT_REGISTERED');
    }

    // Step 3: Verify lesson exists, is active/published & mapped to student's board
    const lesson = await this.store.getLessonById(lessonId);
    const isUnpublished = lesson?.status && lesson.status !== 'published';
    if (!lesson || !lesson.is_active || isUnpublished) {
      await this._audit(user.id, device?.id, lessonId, false, 'LESSON_NOT_FOUND', ipAddress);
      throw new NotFoundError('Lesson not found or inactive', 'LESSON_NOT_FOUND');
    }
    if (
      Array.isArray(lesson.board_codes) &&
      lesson.board_codes.length > 0 &&
      user.board &&
      !lesson.board_codes.includes(user.board) &&
      !lesson.board_codes.includes('BOTH')
    ) {
      await this._audit(user.id, device?.id, lessonId, false, 'BOARD_MISMATCH', ipAddress);
      throw new ForbiddenError('This lesson is not mapped to your selected SSC board.', 'BOARD_FORBIDDEN');
    }

    // Step 4: Backend subscription gate for premium lessons
    if (lesson.is_premium) {
      try {
        await this.subscriptionService.assertActiveSubscription(user.id);
      } catch (err) {
        await this._audit(user.id, device?.id, lessonId, false, err.code || 'SUBSCRIPTION_DENIED', ipAddress);
        throw err;
      }
    }

    // Step 5: Play Integrity evaluation (if token supplied)
    let integrityVerdict = device?.integrity_verdict || 'UNCHECKED';
    if (integrityToken && this.integrityService) {
      try {
        const result = await this.integrityService.verifyIntegrityToken({
          userId: user.id,
          deviceId: device?.id,
          integrityToken,
          ipAddress,
        });
        integrityVerdict = result.verdict;
      } catch (err) {
        await this._audit(user.id, device?.id, lessonId, false, 'PLAY_INTEGRITY_FAILED', ipAddress);
        throw err;
      }
    }

    // Step 6: Fetch video source from lesson_video_sources, falling back to ready lesson_video_assets
    let source = await this.store.getLessonVideoSource(lesson.id);
    if (!source && typeof this.store.getDefaultDownloadableAssetForLesson === 'function') {
      const asset = await this.store.getDefaultDownloadableAssetForLesson(lesson.id);
      if (asset && asset.transcoding_status === 'ready') {
        source = {
          provider: 'private_asset_stream',
          asset_id: asset.id,
          mime_type: asset.mime_type || 'video/mp4',
        };
      }
    }
    if (!source) {
      await this._audit(user.id, device?.id, lessonId, false, 'VIDEO_SOURCE_MISSING', ipAddress);
      throw new NotFoundError('Video source is not configured for this lesson yet.', 'VIDEO_UNAVAILABLE');
    }

    let signedStreamUrl = null;
    if (source.provider === 'private_asset_stream') {
      const streamToken = this.signStreamToken({
        lessonId: lesson.id,
        assetId: source.asset_id,
        userId: user.id,
        deviceId: device?.id || session?.device_id || '',
        mimeType: source.mime_type || 'video/mp4',
      });
      const base = (
        this.config.PUBLIC_API_BASE_URL ||
        apiBaseUrl ||
        `http://127.0.0.1:${this.config.PORT || 4000}`
      ).replace(/\/+$/, '');
      signedStreamUrl = `${base}/api/v1/playback/stream/${streamToken}`;
    } else if (source.provider === 'youtube_unlisted') {
      if (!isValidYouTubeVideoId(source.youtube_video_id)) {
        await this._audit(user.id, device?.id, lessonId, false, 'INVALID_YOUTUBE_VIDEO_ID', ipAddress);
        throw new AppError(
          'Configured YouTube video identifier is invalid.',
          422,
          'INVALID_VIDEO_ID'
        );
      }
    } else if (source.provider === 'private_stream') {
      const candidateUrl = source.stream_url || source.drm_manifest_url || '';
      let validHttps = false;
      try {
        const u = new URL(candidateUrl);
        validHttps = u.protocol === 'https:';
      } catch {
        validHttps = false;
      }
      if (!validHttps) {
        await this._audit(user.id, device?.id, lessonId, false, 'INVALID_STREAM_URL', ipAddress);
        throw new AppError(
          'Configured private stream URL must be a valid HTTPS URL.',
          422,
          'INVALID_VIDEO_ID'
        );
      }
      signedStreamUrl = signBunnyStyleStreamUrl(
        candidateUrl,
        this.config.PRIVATE_STREAM_TOKEN_KEY,
        this.config.PRIVATE_STREAM_TOKEN_TTL_SECONDS || 1800
      );
    } else if (source.provider === 'pikpak_local') {
      if (!source.provider_file_id) {
        await this._audit(user.id, device?.id, lessonId, false, 'MISSING_PROVIDER_FILE_ID', ipAddress);
        throw new AppError('Synced video file identifier is missing.', 422, 'INVALID_VIDEO_ID');
      }
      const streamToken = this.signStreamToken({
        lessonId: lesson.id,
        fileId: source.provider_file_id,
        userId: user.id,
        deviceId: device?.id || session?.device_id || '',
        mimeType: source.mime_type || 'video/mp4',
      });
      const base = (
        this.config.PUBLIC_API_BASE_URL ||
        apiBaseUrl ||
        `http://127.0.0.1:${this.config.PORT || 4000}`
      ).replace(/\/+$/, '');
      signedStreamUrl = `${base}/api/v1/playback/stream/${streamToken}`;
    } else if (source.provider === 'cloudflare_r2' || source.provider === 'supabase_storage' || source.provider === 'aws_s3' || source.provider === 'firebase_storage') {
      await this._audit(user.id, device?.id, lessonId, false, 'CLOUD_STORAGE_DISABLED', ipAddress);
      throw new AppError(
        'Third-party cloud object storage is disabled by architecture policy. Stream from authorized private server disk assets instead.',
        410,
        'CLOUD_STORAGE_DISABLED'
      );
    }

    // Step 7: Fetch resume progress + sibling prev/next navigation
    const [progress, chapterLessons] = await Promise.all([
      this.store.getLessonProgress(user.id, lesson.id),
      this.store.listLessonsByChapter(lesson.chapter_id, { page: 1, limit: 100 }),
    ]);

    const sortedLessons = chapterLessons.items || [];
    const currentIndex = sortedLessons.findIndex((l) => l.id === lesson.id);
    const prevLesson = currentIndex > 0 ? sortedLessons[currentIndex - 1] : null;
    const nextLesson =
      currentIndex >= 0 && currentIndex < sortedLessons.length - 1
        ? sortedLessons[currentIndex + 1]
        : null;

    await this._audit(user.id, device?.id, lesson.id, true, null, ipAddress, integrityVerdict);

    const appConfig = this.store.getAppConfig ? await this.store.getAppConfig() : null;
    const videoSecurity = appConfig?.videoSecurity || {
      protectedPlaybackEnabled: true,
      screenshotProtection: true,
      screenRecordingWarning: true,
      screenSharingProtection: true,
      studentWatermarkEnabled: true,
      securityEventLogging: true,
      warningHeading: 'SCREEN RECORDING DETECTED!',
      warningMessage:
        'For the protection of educational content, video playback has been temporarily paused.\n\nPlease stop screen recording or screen sharing to continue watching your lesson.',
      securityPolicy: 'strict',
      mandatoryProtectionFloorActive: true,
    };

    return {
      authorized: true,
      sessionNonce: generateRandomId(12),
      provider: source.provider,
      lesson: {
        id: lesson.id,
        subjectId: lesson.subject_id,
        chapterId: lesson.chapter_id,
        title: lesson.title,
        description: lesson.description,
        durationSeconds: lesson.duration_seconds,
        isPremium: lesson.is_premium,
      },
      // Passed strictly for official YouTube IFrame API or private signed stream player
      playback: {
        youtubeVideoId: source.provider === 'youtube_unlisted' ? source.youtube_video_id : null,
        streamUrl: signedStreamUrl,
        resumePositionSeconds: progress?.last_position_seconds || 0,
        completionPercent: progress?.completion_percent || 0,
        isCompleted: progress?.is_completed || false,
      },
      navigation: {
        previousLesson: prevLesson ? { id: prevLesson.id, title: prevLesson.title } : null,
        nextLesson: nextLesson ? { id: nextLesson.id, title: nextLesson.title } : null,
      },
      watermark: {
        studentCode: user.student_code,
        identifier: maskPhoneOrEmail(user.phone, user.email),
        studentName: user.full_name,
        issuedAt: new Date().toISOString(),
      },
      videoSecurity,
    };
  }

  async saveProgress({ userId, lessonId, positionSeconds, durationSeconds, markCompleted = false }) {
    const lesson = await this.store.getLessonById(lessonId);
    if (!lesson || !lesson.is_active) {
      throw new NotFoundError('Lesson not found', 'LESSON_NOT_FOUND');
    }

    const effectiveDuration = Math.max(durationSeconds || lesson.duration_seconds || 0, 1);
    const clampedPos = Math.min(Math.max(0, Math.floor(positionSeconds)), effectiveDuration);
    const pct = Math.min(100, Math.round((clampedPos / effectiveDuration) * 100));

    const existing = await this.store.getLessonProgress(userId, lessonId);
    const prevPct = Number(existing?.completion_percent || 0);

    // Backend-enforced completion rule:
    // - Automatic completion at >= 90% watched duration
    // - Explicit markCompleted accepted only when watched >= 80% (or non-video lesson duration <= 1s)
    // - Never marks a lesson completed merely because it was opened (0% watched)
    const eligibleForCompletion =
      pct >= 90 || (Boolean(markCompleted) && (pct >= 80 || prevPct >= 80 || effectiveDuration <= 1));
    const finalCompleted = Boolean(existing?.is_completed || eligibleForCompletion);
    const finalPct = Math.max(prevPct, finalCompleted ? 100 : pct);
    const prevWatch = Number(existing?.watch_time_seconds || 0);
    const watchTimeSeconds = Math.max(prevWatch, clampedPos);
    const nowIso = new Date().toISOString();

    const saved = await this.store.upsertLessonProgress({
      user_id: userId,
      lesson_id: lessonId,
      last_position_seconds: clampedPos,
      duration_seconds: effectiveDuration,
      watch_time_seconds: watchTimeSeconds,
      completion_percent: finalPct,
      is_completed: finalCompleted,
      completed_at: finalCompleted ? existing?.completed_at || nowIso : null,
      last_accessed_at: nowIso,
    });

    return {
      lessonId: saved.lesson_id,
      subjectId: lesson.subject_id,
      chapterId: lesson.chapter_id,
      lastPositionSeconds: saved.last_position_seconds,
      durationSeconds: saved.duration_seconds,
      completionPercent: saved.completion_percent,
      isCompleted: saved.is_completed,
      completedAt: saved.completed_at || null,
      lastAccessedAt: saved.last_accessed_at || saved.updated_at || nowIso,
    };
  }

  async _audit(userId, deviceId, lessonId, granted, denialReason, ipAddress, integrityVerdict = null) {
    try {
      await this.store.logPlaybackAudit({
        user_id: userId,
        device_id: deviceId || null,
        lesson_id: lessonId,
        granted,
        denial_reason: denialReason,
        ip_address: ipAddress,
        integrity_verdict: integrityVerdict,
      });
    } catch {
      // Audit write failure should not mask auth denial errors
    }
  }
}
