import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { maskPhoneOrEmail } from '../utils/crypto.js';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors.js';
import { sanitizeMediaFileName } from './ffmpegProcessor.js';

const ACTIVE_STATUSES = new Set(['queued', 'downloading', 'completed']);
const ALLOWED_SYNC_STATUSES = new Set([
  'queued',
  'downloading',
  'completed',
  'failed',
  'cancelled',
  'file_missing',
]);

export class OfflineDownloadService {
  constructor({
    store,
    subscriptionService,
    deviceService,
    playbackService,
    storageService,
    ffmpegProcessor,
    adminAuthService = null,
    config = {},
  }) {
    this.store = store;
    this.subscriptionService = subscriptionService;
    this.deviceService = deviceService;
    this.playbackService = playbackService;
    this.storageService = storageService;
    this.ffmpegProcessor = ffmpegProcessor;
    this.adminAuthService = adminAuthService;
    this.config = config;
  }

  _getSigningSecret() {
    return (
      this.config.JWT_ACCESS_SECRET ||
      this.config.PRIVATE_STREAM_TOKEN_KEY ||
      'dev-fallback-offline-download-secret-32c'
    );
  }

  signDownloadToken({ downloadId, studentId, deviceId, lessonId, assetId, ttlSeconds = null }) {
    const ttl = ttlSeconds || this.config.OFFLINE_DOWNLOAD_TOKEN_TTL_SECONDS || 1800;
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const payload = {
      did: downloadId,
      uid: studentId,
      dev: deviceId || '',
      lid: lessonId,
      aid: assetId,
      exp,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', this._getSigningSecret())
      .update(encoded)
      .digest('base64url');
    return {
      token: `${encoded}.${sig}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  verifyDownloadToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) {
      throw new UnauthorizedError('Invalid offline download token.', 'INVALID_DOWNLOAD_TOKEN');
    }
    const [encoded, providedSig] = token.split('.');
    if (!encoded || !providedSig) {
      throw new UnauthorizedError('Malformed offline download token.', 'INVALID_DOWNLOAD_TOKEN');
    }
    const expectedSig = crypto
      .createHmac('sha256', this._getSigningSecret())
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(providedSig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedError('Download token signature mismatch.', 'INVALID_DOWNLOAD_TOKEN');
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedError('Corrupted offline download token.', 'INVALID_DOWNLOAD_TOKEN');
    }
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedError('Offline download token expired. Please retry download.', 'DOWNLOAD_TOKEN_EXPIRED');
    }
    if (!payload.did || !payload.uid || !payload.aid || !payload.lid) {
      throw new UnauthorizedError('Incomplete offline download token.', 'INVALID_DOWNLOAD_TOKEN');
    }
    return payload;
  }

  async _resolveChapterAndSubject(lesson) {
    const [subject, chapters] = await Promise.all([
      this.store.getSubjectById(lesson.subject_id).catch(() => null),
      this.store.listChaptersBySubject(lesson.subject_id).catch(() => []),
    ]);
    const chapter = (chapters || []).find((c) => c.id === lesson.chapter_id) || null;
    return {
      subjectTitle: subject?.title || 'Class 10 SSC',
      chapterNumber: chapter?.chapter_number || null,
      chapterTitle: chapter?.title || 'Chapter Lesson',
    };
  }

  async _assertLessonEligibility({ user, session, device, lessonId, rawDeviceId = null }) {
    if (rawDeviceId) {
      await this.deviceService.verifyDeviceActive({
        userId: user.id,
        rawDeviceId,
        boundDeviceId: session?.device_id,
      });
    } else if (!device || !device.is_active) {
      throw new ForbiddenError('Device is not registered or active.', 'DEVICE_NOT_REGISTERED');
    }

    const lesson = await this.store.getLessonById(lessonId);
    const isUnpublished = lesson?.status && lesson.status !== 'published';
    if (!lesson || !lesson.is_active || isUnpublished) {
      throw new NotFoundError('Lesson not found or not published.', 'LESSON_NOT_FOUND');
    }

    if (
      Array.isArray(lesson.board_codes) &&
      lesson.board_codes.length > 0 &&
      user.board &&
      !lesson.board_codes.includes(user.board) &&
      !lesson.board_codes.includes('BOTH')
    ) {
      throw new ForbiddenError('This lesson is not mapped to your selected SSC board.', 'BOARD_FORBIDDEN');
    }

    if (lesson.is_premium) {
      await this.subscriptionService.assertActiveSubscription(user.id);
    }

    return lesson;
  }

  _formatDownloadRecord(rec) {
    if (!rec) return null;
    return {
      id: rec.id,
      studentId: rec.student_id,
      lessonId: rec.lesson_id,
      videoAssetId: rec.video_asset_id,
      deviceId: rec.device_id || null,
      downloadStatus: rec.download_status,
      fileSize: Number(rec.file_size || 0),
      bytesDownloaded: Number(rec.bytes_downloaded || 0),
      fileChecksum: rec.file_checksum || '',
      downloadedAt: rec.downloaded_at || null,
      lastPlayedPosition: Number(rec.last_played_position || 0),
      createdAt: rec.created_at,
      updatedAt: rec.updated_at,
    };
  }

  _formatPublicAsset(asset) {
    if (!asset) return null;
    // STRICT SECURITY: Never expose storage_key or storage_provider credentials
    return {
      videoAssetId: asset.id,
      qualityLabel: asset.quality_label || '720p',
      mimeType: asset.mime_type || 'video/mp4',
      fileSize: Number(asset.file_size_bytes || 0),
      durationSeconds: Number(asset.duration_seconds || 0),
      sha256Checksum: asset.sha256_checksum,
      isDownloadable: Boolean(asset.is_downloadable && asset.transcoding_status === 'ready'),
    };
  }

  async _getVideoSecurityAndWatermark(user) {
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
    const watermark = {
      studentCode: user.student_code,
      identifier: maskPhoneOrEmail(user.phone, user.email),
      studentName: user.full_name,
      issuedAt: new Date().toISOString(),
    };
    return { videoSecurity, watermark };
  }

  /**
   * GET /api/v1/lessons/:lessonId
   * Returns safe lesson details for LessonDetailsScreen WITHOUT exposing raw YouTube URLs or storage keys.
   */
  async getSafeLessonDetails({ user, device, lessonId }) {
    const lesson = await this.store.getLessonById(lessonId);
    const isUnpublished = lesson?.status && lesson.status !== 'published';
    if (!lesson || !lesson.is_active || isUnpublished) {
      throw new NotFoundError('Lesson not found.', 'LESSON_NOT_FOUND');
    }
    if (
      Array.isArray(lesson.board_codes) &&
      lesson.board_codes.length > 0 &&
      user.board &&
      !lesson.board_codes.includes(user.board) &&
      !lesson.board_codes.includes('BOTH')
    ) {
      throw new ForbiddenError('This lesson is not mapped to your selected SSC board.', 'BOARD_FORBIDDEN');
    }

    const [meta, subStatus, progress, source, asset, downloadRecord, sec] = await Promise.all([
      this._resolveChapterAndSubject(lesson),
      this.subscriptionService.getStatus(user.id),
      this.store.getLessonProgress(user.id, lesson.id),
      this.store.getLessonVideoSource(lesson.id),
      this.store.getDefaultDownloadableAssetForLesson(lesson.id),
      this.store.getActiveStudentDownload({
        studentId: user.id,
        lessonId: lesson.id,
        deviceId: device?.id || null,
      }),
      this._getVideoSecurityAndWatermark(user),
    ]);

    const locked = Boolean(lesson.is_premium && !subStatus.isActive);

    return {
      lesson: {
        id: lesson.id,
        subjectId: lesson.subject_id,
        subjectTitle: meta.subjectTitle,
        chapterId: lesson.chapter_id,
        chapterNumber: meta.chapterNumber,
        chapterTitle: meta.chapterTitle,
        title: lesson.title,
        description: lesson.description || '',
        thumbnailUrl: lesson.thumbnail_url || null,
        durationSeconds: Number(lesson.duration_seconds || asset?.duration_seconds || 0),
        isPremium: Boolean(lesson.is_premium),
        locked,
      },
      progress: {
        lastPositionSeconds: Number(
          Math.max(progress?.last_position_seconds || 0, downloadRecord?.last_played_position || 0)
        ),
        completionPercent: Number(progress?.completion_percent || 0),
        isCompleted: Boolean(progress?.is_completed),
      },
      playbackCapabilities: {
        hasDownloadableAsset: Boolean(asset),
        hasOnlinePlayback: Boolean(source),
        onlineProviderType: source ? (source.provider === 'youtube_unlisted' ? 'online_embedded' : 'protected_stream') : null,
      },
      offlineAsset: locked ? null : this._formatPublicAsset(asset),
      download: this._formatDownloadRecord(downloadRecord),
      retentionPolicy: this.config.OFFLINE_RETENTION_POLICY || 'wipe_on_logout',
      watermark: sec.watermark,
      videoSecurity: sec.videoSecurity,
    };
  }

  /**
   * GET /api/v1/lessons/:lessonId/download-info
   * Verifies student auth, device binding, and course/subscription eligibility before revealing asset metadata.
   */
  async getDownloadInfo({ user, session, device, lessonId, rawDeviceId = null }) {
    const lesson = await this._assertLessonEligibility({ user, session, device, lessonId, rawDeviceId });
    const [assets, existingDownload, meta] = await Promise.all([
      this.store.listLessonVideoAssets(lesson.id, { onlyReady: true }),
      this.store.getActiveStudentDownload({
        studentId: user.id,
        lessonId: lesson.id,
        deviceId: device?.id || session?.device_id || null,
      }),
      this._resolveChapterAndSubject(lesson),
    ]);

    const defaultAsset = assets[0] || null;
    return {
      lessonId: lesson.id,
      title: lesson.title,
      chapterTitle: meta.chapterTitle,
      subjectTitle: meta.subjectTitle,
      thumbnailUrl: lesson.thumbnail_url || null,
      durationSeconds: Number(lesson.duration_seconds || defaultAsset?.duration_seconds || 0),
      downloadable: Boolean(defaultAsset),
      asset: this._formatPublicAsset(defaultAsset),
      variants: assets.map((a) => this._formatPublicAsset(a)),
      existingDownload: this._formatDownloadRecord(existingDownload),
      retentionPolicy: this.config.OFFLINE_RETENTION_POLICY || 'wipe_on_logout',
    };
  }

  /**
   * POST /api/v1/lessons/:lessonId/download
   * Authorizes a student download, prevents duplicate active downloads, and mints a short-lived signed token.
   */
  async initiateDownload({
    user,
    session,
    device,
    lessonId,
    rawDeviceId = null,
    qualityLabel = null,
    forceRedownload = false,
    apiBaseUrl = null,
  }) {
    const lesson = await this._assertLessonEligibility({ user, session, device, lessonId, rawDeviceId });
    const assets = await this.store.listLessonVideoAssets(lesson.id, { onlyReady: true });
    const asset =
      (qualityLabel ? assets.find((a) => a.quality_label === qualityLabel) : null) || assets[0] || null;

    if (!asset) {
      throw new NotFoundError(
        'An authorized downloadable MP4 asset is not yet available for this lesson.',
        'DOWNLOAD_ASSET_UNAVAILABLE'
      );
    }

    const deviceId = device?.id || session?.device_id || null;
    const existing = await this.store.getActiveStudentDownload({
      studentId: user.id,
      lessonId: lesson.id,
      deviceId,
    });

    let record;
    let duplicatePrevented = false;

    if (existing && !forceRedownload && ACTIVE_STATUSES.has(existing.download_status)) {
      record = existing;
      duplicatePrevented = true;
    } else if (existing) {
      record = await this.store.updateStudentDownload(existing.id, {
        video_asset_id: asset.id,
        download_status: 'queued',
        file_size: Number(asset.file_size_bytes),
        bytes_downloaded: 0,
        file_checksum: asset.sha256_checksum,
        downloaded_at: null,
      });
    } else {
      record = await this.store.createStudentDownload({
        student_id: user.id,
        lesson_id: lesson.id,
        video_asset_id: asset.id,
        device_id: deviceId,
        download_status: 'queued',
        file_size: Number(asset.file_size_bytes),
        bytes_downloaded: 0,
        file_checksum: asset.sha256_checksum,
        downloaded_at: null,
        last_played_position: 0,
      });
    }

    const { token, expiresAt } = this.signDownloadToken({
      downloadId: record.id,
      studentId: user.id,
      deviceId,
      lessonId: lesson.id,
      assetId: asset.id,
    });

    const base = (this.config.PUBLIC_API_BASE_URL || apiBaseUrl || '').replace(/\/+$/, '');
    const streamPath = `/api/v1/downloads/${record.id}/stream?token=${encodeURIComponent(token)}`;
    const manifestPath = `/api/v1/downloads/${record.id}/manifest`;

    return {
      duplicatePrevented,
      download: this._formatDownloadRecord(record),
      asset: this._formatPublicAsset(asset),
      downloadToken: token,
      expiresAt,
      streamUrl: base ? `${base}${streamPath}` : streamPath,
      manifestUrl: base ? `${base}${manifestPath}` : manifestPath,
    };
  }

  /**
   * GET /api/v1/downloads/:downloadId/status
   */
  async getDownloadStatus({ user, downloadId }) {
    const record = await this.store.getStudentDownloadById(downloadId);
    if (!record || record.download_status === 'deleted') {
      throw new NotFoundError('Download record not found.', 'DOWNLOAD_NOT_FOUND');
    }
    if (record.student_id !== user.id) {
      throw new ForbiddenError('You do not have access to this download record.', 'DOWNLOAD_FORBIDDEN');
    }
    return { download: this._formatDownloadRecord(record) };
  }

  /**
   * PATCH /api/v1/downloads/:downloadId/status
   * Synchronizes verified download status from mobile client.
   * Strictly rejects `completed` unless checksum and byte size match the vault asset.
   */
  async syncDownloadStatus({
    user,
    downloadId,
    status,
    bytesDownloaded = undefined,
    verifiedChecksum = undefined,
    fileSize = undefined,
    lastPlayedPosition = undefined,
  }) {
    if (!ALLOWED_SYNC_STATUSES.has(status)) {
      throw new ValidationError(`Invalid download status: ${status}`);
    }

    const record = await this.store.getStudentDownloadById(downloadId);
    if (!record || record.download_status === 'deleted') {
      throw new NotFoundError('Download record not found.', 'DOWNLOAD_NOT_FOUND');
    }
    if (record.student_id !== user.id) {
      throw new ForbiddenError('You do not have access to this download record.', 'DOWNLOAD_FORBIDDEN');
    }

    const asset = await this.store.getLessonVideoAssetById(record.video_asset_id);
    if (!asset) {
      throw new NotFoundError('Associated offline video asset no longer exists.', 'ASSET_NOT_FOUND');
    }

    const patch = { download_status: status };
    if (bytesDownloaded !== undefined) {
      patch.bytes_downloaded = Math.max(0, Math.floor(Number(bytesDownloaded) || 0));
    }
    if (lastPlayedPosition !== undefined) {
      patch.last_played_position = Math.max(0, Math.floor(Number(lastPlayedPosition) || 0));
    }

    if (status === 'completed') {
      const providedChecksum = String(verifiedChecksum || '').trim().toLowerCase();
      const expectedChecksum = String(asset.sha256_checksum || '').trim().toLowerCase();
      const providedSize = Number(fileSize ?? bytesDownloaded ?? 0);
      const expectedSize = Number(asset.file_size_bytes || 0);

      if (!providedChecksum || providedChecksum !== expectedChecksum) {
        await this.store.updateStudentDownload(downloadId, { download_status: 'failed' });
        throw new AppError(
          'Downloaded file failed SHA-256 integrity verification and cannot be marked completed.',
          422,
          'CHECKSUM_MISMATCH'
        );
      }
      if (providedSize !== expectedSize) {
        await this.store.updateStudentDownload(downloadId, { download_status: 'failed' });
        throw new AppError(
          `Downloaded file size mismatch (received ${providedSize} bytes, expected ${expectedSize} bytes).`,
          422,
          'FILE_SIZE_MISMATCH'
        );
      }

      patch.bytes_downloaded = expectedSize;
      patch.file_size = expectedSize;
      patch.file_checksum = expectedChecksum;
      patch.downloaded_at = record.downloaded_at || new Date().toISOString();
    } else if (status === 'file_missing' || status === 'cancelled' || status === 'failed') {
      patch.downloaded_at = null;
    }

    const updated = await this.store.updateStudentDownload(downloadId, patch);
    return { download: this._formatDownloadRecord(updated) };
  }

  /**
   * GET /api/v1/downloads/:downloadId/manifest
   * Issues a fresh short-lived streaming download manifest without exposing storage credentials or raw URLs.
   */
  async getDownloadManifest({ user, session, device, downloadId, apiBaseUrl = null }) {
    const record = await this.store.getStudentDownloadById(downloadId);
    if (!record || record.download_status === 'deleted') {
      throw new NotFoundError('Download record not found.', 'DOWNLOAD_NOT_FOUND');
    }
    if (record.student_id !== user.id) {
      throw new ForbiddenError('You do not have access to this download manifest.', 'DOWNLOAD_FORBIDDEN');
    }

    const lesson = await this._assertLessonEligibility({
      user,
      session,
      device,
      lessonId: record.lesson_id,
    });
    const asset = await this.store.getLessonVideoAssetById(record.video_asset_id);
    if (!asset || !asset.is_downloadable || asset.transcoding_status !== 'ready') {
      throw new NotFoundError('Authorized offline video asset is unavailable.', 'DOWNLOAD_ASSET_UNAVAILABLE');
    }

    const deviceId = device?.id || session?.device_id || record.device_id || null;
    const { token, expiresAt } = this.signDownloadToken({
      downloadId: record.id,
      studentId: user.id,
      deviceId,
      lessonId: lesson.id,
      assetId: asset.id,
    });

    const [meta, sec] = await Promise.all([
      this._resolveChapterAndSubject(lesson),
      this._getVideoSecurityAndWatermark(user),
    ]);

    const base = (this.config.PUBLIC_API_BASE_URL || apiBaseUrl || '').replace(/\/+$/, '');
    const streamPath = `/api/v1/downloads/${record.id}/stream?token=${encodeURIComponent(token)}`;

    return {
      downloadId: record.id,
      lessonId: lesson.id,
      videoAssetId: asset.id,
      streamUrl: base ? `${base}${streamPath}` : streamPath,
      supportsRange: true,
      mimeType: asset.mime_type || 'video/mp4',
      qualityLabel: asset.quality_label || '720p',
      fileSize: Number(asset.file_size_bytes),
      sha256Checksum: asset.sha256_checksum,
      expiresAt,
      lesson: {
        id: lesson.id,
        title: lesson.title,
        description: lesson.description || '',
        chapterTitle: meta.chapterTitle,
        subjectTitle: meta.subjectTitle,
        thumbnailUrl: lesson.thumbnail_url || null,
        durationSeconds: Number(lesson.duration_seconds || asset.duration_seconds || 0),
      },
      watermark: sec.watermark,
      videoSecurity: sec.videoSecurity,
      retentionPolicy: this.config.OFFLINE_RETENTION_POLICY || 'wipe_on_logout',
    };
  }

  /**
   * GET / HEAD /api/v1/downloads/:downloadId/stream?token=...
   * Zero-buffer HTTP 200/206/416 streaming for resumable mobile downloads.
   */
  async streamAuthorizedDownload({ downloadId, downloadToken, req, res }) {
    const claims = this.verifyDownloadToken(downloadToken);
    if (claims.did !== downloadId) {
      throw new ForbiddenError('Download token does not match requested download.', 'DOWNLOAD_TOKEN_MISMATCH');
    }

    const record = await this.store.getStudentDownloadById(downloadId);
    if (!record || record.download_status === 'deleted') {
      throw new NotFoundError('Download record not found.', 'DOWNLOAD_NOT_FOUND');
    }
    if (record.student_id !== claims.uid) {
      throw new ForbiddenError('Unauthorized download stream access.', 'DOWNLOAD_FORBIDDEN');
    }

    const asset = await this.store.getLessonVideoAssetById(claims.aid);
    if (!asset || !asset.is_downloadable || asset.transcoding_status !== 'ready') {
      throw new NotFoundError('Offline video asset is unavailable.', 'DOWNLOAD_ASSET_UNAVAILABLE');
    }

    if (record.download_status === 'queued') {
      await this.store.updateStudentDownload(downloadId, { download_status: 'downloading' }).catch(() => {});
    }

    await this.storageService.streamAssetToResponse({
      asset,
      userId: claims.uid,
      deviceId: claims.dev || '',
      req,
      res,
    });
  }

  /**
   * GET /api/v1/downloads
   * Lists all student downloads enriched with safe lesson/chapter metadata for MyDownloadsScreen.
   */
  async listStudentDownloads({ user, device }) {
    const rows = await this.store.listStudentDownloads(user.id, {
      deviceId: device?.id || null,
      includeDeleted: false,
    });

    const enriched = await Promise.all(
      rows.map(async (rec) => {
        const lesson = await this.store.getLessonById(rec.lesson_id);
        if (!lesson) return null;
        const meta = await this._resolveChapterAndSubject(lesson);
        return {
          ...this._formatDownloadRecord(rec),
          lesson: {
            id: lesson.id,
            title: lesson.title,
            description: lesson.description || '',
            chapterTitle: meta.chapterTitle,
            subjectTitle: meta.subjectTitle,
            thumbnailUrl: lesson.thumbnail_url || null,
            durationSeconds: Number(lesson.duration_seconds || 0),
          },
        };
      })
    );

    return { items: enriched.filter(Boolean) };
  }

  /**
   * DELETE /api/v1/downloads/:downloadId
   */
  async deleteDownload({ user, downloadId }) {
    const record = await this.store.getStudentDownloadById(downloadId);
    if (!record) {
      throw new NotFoundError('Download record not found.', 'DOWNLOAD_NOT_FOUND');
    }
    if (record.student_id !== user.id) {
      throw new ForbiddenError('You cannot delete another student download.', 'DOWNLOAD_FORBIDDEN');
    }
    await this.store.updateStudentDownload(downloadId, {
      download_status: 'deleted',
      downloaded_at: null,
    });
    return { deleted: true, downloadId };
  }

  /**
   * POST /api/v1/lessons/:lessonId/progress
   * Reuses existing playbackService.saveProgress() AND mirrors last_played_position onto student_video_downloads.
   */
  async saveOfflineAwareProgress({ userId, lessonId, positionSeconds, durationSeconds, markCompleted = false }) {
    const progress = await this.playbackService.saveProgress({
      userId,
      lessonId,
      positionSeconds,
      durationSeconds,
      markCompleted,
    });
    await this.store.updateStudentDownloadPositionByLesson({
      studentId: userId,
      lessonId,
      positionSeconds: progress.lastPositionSeconds,
    });
    return { progress };
  }

  // ---- Admin Authorized MP4 Ingestion ----

  async listAdminLessonAssets(lessonId) {
    const assets = await this.store.listLessonVideoAssets(lessonId, { onlyReady: false });
    return assets.map((a) => ({
      id: a.id,
      lessonId: a.lesson_id,
      storageProvider: a.storage_provider,
      originalFileName: a.original_file_name,
      qualityLabel: a.quality_label,
      mimeType: a.mime_type,
      fileSizeBytes: Number(a.file_size_bytes || 0),
      durationSeconds: Number(a.duration_seconds || 0),
      sha256Checksum: a.sha256_checksum,
      isDownloadable: Boolean(a.is_downloadable),
      isDefault: Boolean(a.is_default),
      transcodingStatus: a.transcoding_status,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    }));
  }

  /**
   * Streams an organization-owned MP4 upload straight to a temp job file, enforces max byte limit,
   * validates MP4 header, runs optional FFmpeg faststart/transcoding, computes SHA-256, commits to
   * permanent storage, and records metadata in lesson_video_assets.
   */
  async uploadAuthorizedMp4Asset({
    admin,
    lessonId,
    readableStream,
    originalFileName = 'lesson.mp4',
    qualityLabel = '720p',
    targetHeight = null,
    durationSeconds = 0,
    ipAddress = null,
  }) {
    const lesson = await this.store.getLessonById(lessonId);
    if (!lesson) {
      throw new NotFoundError('Lesson not found.', 'LESSON_NOT_FOUND');
    }

    const maxBytes = (this.config.OFFLINE_MAX_UPLOAD_MB || 1024) * 1024 * 1024;
    const jobDir = this.ffmpegProcessor.createJobDir();
    const safeName = sanitizeMediaFileName(originalFileName, 'lesson.mp4');
    const rawPath = path.join(jobDir, `raw_${safeName}`);
    const processedPath = path.join(jobDir, `ready_${safeName}`);

    try {
      await new Promise((resolve, reject) => {
        let received = 0;
        let aborted = false;
        const writer = fs.createWriteStream(rawPath);

        const fail = (err) => {
          if (aborted) return;
          aborted = true;
          writer.destroy();
          reject(err);
        };

        readableStream.on('data', (chunk) => {
          if (aborted) return;
          received += chunk.length;
          if (received > maxBytes) {
            fail(
              new AppError(
                `Uploaded MP4 exceeds configured limit of ${this.config.OFFLINE_MAX_UPLOAD_MB || 1024} MB.`,
                413,
                'PAYLOAD_TOO_LARGE'
              )
            );
            readableStream.pause();
          }
        });
        readableStream.on('error', fail);
        writer.on('error', fail);
        writer.on('finish', () => {
          if (!aborted) resolve(received);
        });
        readableStream.pipe(writer);
      });

      const prepared = await this.ffmpegProcessor.prepareOfflineMp4({
        inputPath: rawPath,
        outputPath: processedPath,
        targetHeight,
      });

      const finalQuality = qualityLabel || prepared.qualityLabel || '720p';
      const stored = await this.storageService.commitPreparedFile({
        lessonId: lesson.id,
        qualityLabel: finalQuality,
        originalFileName: safeName,
        sourceFilePath: processedPath,
      });

      const asset = await this.store.upsertLessonVideoAsset({
        lesson_id: lesson.id,
        storage_provider: stored.storageProvider,
        storage_key: stored.storageKey,
        original_file_name: safeName,
        quality_label: finalQuality,
        mime_type: 'video/mp4',
        file_size_bytes: prepared.fileSizeBytes,
        duration_seconds: prepared.durationSeconds || Number(durationSeconds || lesson.duration_seconds || 0),
        sha256_checksum: prepared.sha256Checksum,
        is_downloadable: true,
        is_default: true,
        transcoding_status: 'ready',
        uploaded_by: admin?.id || null,
      });

      if (this.adminAuthService?.recordAudit && admin) {
        await this.adminAuthService.recordAudit({
          admin,
          action: 'offline_asset.upload',
          entityType: 'lesson_video_asset',
          entityId: asset.id,
          summary: `Uploaded authorized offline MP4 (${finalQuality}, ${prepared.fileSizeBytes} bytes, ffmpeg=${prepared.transcodedWithFfmpeg}) for lesson "${lesson.title}"`,
          ipAddress,
        });
      }

      return {
        asset: {
          id: asset.id,
          lessonId: asset.lesson_id,
          storageProvider: asset.storage_provider,
          originalFileName: asset.original_file_name,
          qualityLabel: asset.quality_label,
          fileSizeBytes: Number(asset.file_size_bytes),
          durationSeconds: Number(asset.duration_seconds),
          sha256Checksum: asset.sha256_checksum,
          transcodedWithFfmpeg: prepared.transcodedWithFfmpeg,
          isDownloadable: true,
        },
      };
    } finally {
      await this.ffmpegProcessor.cleanupJobDir(jobDir);
    }
  }

  /**
   * Registers an already-stored authorized private MP4 (Cloudflare R2 / Supabase Storage / PikPak)
   * without duplicating files.
   */
  async registerExternalOfflineAsset({
    admin,
    lessonId,
    storageProvider,
    storageKey,
    originalFileName = 'lesson.mp4',
    qualityLabel = '720p',
    fileSizeBytes,
    durationSeconds = 0,
    sha256Checksum,
    ipAddress = null,
  }) {
    const lesson = await this.store.getLessonById(lessonId);
    if (!lesson) throw new NotFoundError('Lesson not found.', 'LESSON_NOT_FOUND');

    const asset = await this.store.upsertLessonVideoAsset({
      lesson_id: lesson.id,
      storage_provider: storageProvider,
      storage_key: storageKey,
      original_file_name: sanitizeMediaFileName(originalFileName, 'lesson.mp4'),
      quality_label: qualityLabel || '720p',
      mime_type: 'video/mp4',
      file_size_bytes: Number(fileSizeBytes),
      duration_seconds: Number(durationSeconds || lesson.duration_seconds || 0),
      sha256_checksum: String(sha256Checksum).toLowerCase(),
      is_downloadable: true,
      is_default: true,
      transcoding_status: 'ready',
      uploaded_by: admin?.id || null,
    });

    if (this.adminAuthService?.recordAudit && admin) {
      await this.adminAuthService.recordAudit({
        admin,
        action: 'offline_asset.register',
        entityType: 'lesson_video_asset',
        entityId: asset.id,
        summary: `Registered ${storageProvider} offline MP4 (${qualityLabel}) for lesson "${lesson.title}"`,
        ipAddress,
      });
    }

    return {
      asset: {
        id: asset.id,
        lessonId: asset.lesson_id,
        storageProvider: asset.storage_provider,
        qualityLabel: asset.quality_label,
        fileSizeBytes: Number(asset.file_size_bytes),
        durationSeconds: Number(asset.duration_seconds),
        sha256Checksum: asset.sha256_checksum,
        isDownloadable: true,
      },
    };
  }

  async deleteAdminOfflineAsset({ admin, assetId, ipAddress = null }) {
    const asset = await this.store.getLessonVideoAssetById(assetId);
    if (!asset) throw new NotFoundError('Offline video asset not found.', 'ASSET_NOT_FOUND');
    await this.storageService.deleteStoredAsset(asset);
    await this.store.deleteLessonVideoAsset(assetId);
    if (this.adminAuthService?.recordAudit && admin) {
      await this.adminAuthService.recordAudit({
        admin,
        action: 'offline_asset.delete',
        entityType: 'lesson_video_asset',
        entityId: assetId,
        summary: `Removed offline video asset ${assetId} from lesson ${asset.lesson_id}`,
        ipAddress,
      });
    }
    return { deleted: true, assetId };
  }
}

