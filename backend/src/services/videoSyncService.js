import crypto from 'node:crypto';
import { AppError } from '../utils/errors.js';
import { parseVideoOrganisation } from './videoOrganisation.js';

/**
 * Generates a deterministic RFC4122-shaped UUID from a provider + remote file ID
 * so repeated syncs keep the same lesson UUID and preserve student resume progress.
 */
export function deterministicLessonUuid(provider, providerFileId) {
  const hex = crypto
    .createHash('sha256')
    .update(`class10lms:video:${provider}:${providerFileId}`)
    .digest('hex')
    .slice(0, 32);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export class VideoSyncService {
  constructor({ store, videoProvider = null, curriculumService = null, logger = console }) {
    this.store = store;
    this.videoProvider = videoProvider;
    this.curriculumService = curriculumService;
    this.logger = logger;
    this.lastSyncedAt = null;
    this.lastSyncError = null;
  }

  getProviderMeta() {
    if (!this.videoProvider) {
      return {
        enabled: false,
        provider: 'none',
        isCommercialSafe: true,
        lastSyncedAt: this.lastSyncedAt,
      };
    }
    return {
      enabled: true,
      provider: this.videoProvider.name,
      isCommercialSafe: Boolean(this.videoProvider.isCommercialSafe),
      lastSyncedAt: this.lastSyncedAt,
      lastSyncError: this.lastSyncError,
    };
  }

  /**
   * Scans the active video provider (PikPak local CLI today, swappable to Cloudflare R2)
   * and upserts discovered video files into the LMS catalog so they appear immediately
   * on the Student Dashboard and inside the "Uploaded Video Lessons" chapter.
   */
  async syncVideos({ defaultPremium = false } = {}) {
    if (!this.videoProvider || typeof this.videoProvider.listVideos !== 'function') {
      throw new AppError(
        'No active video sync provider configured. Set VIDEO_STORAGE_PROVIDER=pikpak_local or cloudflare_r2.',
        400,
        'VIDEO_PROVIDER_NOT_CONFIGURED'
      );
    }

    if (typeof this.store.upsertSyncedVideoLesson !== 'function') {
      throw new AppError(
        'Configured data store does not support dynamic video sync.',
        501,
        'SYNC_UNSUPPORTED'
      );
    }

    try {
      const remoteVideos = await this.videoProvider.listVideos();
      const defaultChapter = await this.store.ensureSyncedVideoChapter();

      const activeLessonIds = [];
      const synced = [];

      for (let i = 0; i < remoteVideos.length; i += 1) {
        const v = remoteVideos[i];
        const org = parseVideoOrganisation({
          fileName: v.fileName,
          folderSegments: v.folderSegments || (v.folderName ? [v.folderName] : []),
        });

        let targetChapter = defaultChapter;
        if (
          typeof this.store.resolveOrganisedChapter === 'function' &&
          (org.subjectSlug || org.chapterNumber)
        ) {
          const resolved = await this.store.resolveOrganisedChapter({
            subjectSlug: org.subjectSlug,
            chapterNumber: org.chapterNumber,
            chapterTitle: org.chapterTitle,
          });
          if (resolved) targetChapter = resolved;
        }

        const lessonId = deterministicLessonUuid(v.provider, v.providerFileId);
        activeLessonIds.push(lessonId);

        const lesson = await this.store.upsertSyncedVideoLesson({
          lesson: {
            id: lessonId,
            subject_id: targetChapter.subject_id,
            chapter_id: targetChapter.id,
            title: org.displayTitle || v.title,
            description: `${org.videoTypeLabel} • ${v.fileName}${v.sizeLabel ? ` • ${v.sizeLabel}` : ''}${org.folderPath ? ` • ${org.folderPath}` : ''}`,
            thumbnail_url: null,
            duration_seconds: 0,
            display_order: org.displayOrder || i + 1,
            is_premium: defaultPremium,
            is_active: true,
            is_auto_synced: true,
            source_file_name: v.fileName,
            source_size_label: v.sizeLabel || '',
            source_folder_name: v.folderName || '',
            source_folder_path: org.folderPath,
            source_provider: v.provider,
            video_type: org.videoType,
            video_type_label: org.videoTypeLabel,
            special_zone: org.specialZone,
          },
          videoSource: {
            lesson_id: lessonId,
            provider: v.provider,
            provider_file_id: v.providerFileId,
            mime_type: v.mimeType || 'video/mp4',
            file_name: v.fileName,
            youtube_video_id: null,
            stream_url: null,
          },
        });

        synced.push({
          id: lesson.id,
          subjectId: lesson.subject_id,
          chapterId: lesson.chapter_id,
          title: lesson.title,
          fileName: v.fileName,
          sizeLabel: v.sizeLabel || '',
          folderName: v.folderName || '',
          folderPath: org.folderPath,
          videoType: org.videoType,
          videoTypeLabel: org.videoTypeLabel,
          specialZone: org.specialZone,
          mimeType: v.mimeType || 'video/mp4',
          provider: v.provider,
          isPremium: Boolean(lesson.is_premium),
        });
      }

      if (typeof this.store.deactivateMissingSyncedLessons === 'function') {
        await this.store.deactivateMissingSyncedLessons(
          this.videoProvider.name,
          activeLessonIds
        );
      }

      this.lastSyncedAt = new Date().toISOString();
      this.lastSyncError = null;
      this.curriculumService?.catalogCache?.clear?.();

      return {
        provider: this.videoProvider.name,
        isCommercialSafe: Boolean(this.videoProvider.isCommercialSafe),
        syncedAt: this.lastSyncedAt,
        syncedCount: synced.length,
        videos: synced,
      };
    } catch (err) {
      this.lastSyncError = err.message;
      this.logger.warn('[video-sync] Sync failed:', err.message);
      throw err;
    }
  }
}
