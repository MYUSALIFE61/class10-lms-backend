import React, { useEffect, useState, useCallback } from 'react';
import {
  Clock,
  BookOpen,
  ShieldCheck,
  Trash2,
  Lock,
  Crown,
  WifiOff,
  PlayCircle,
} from 'lucide-react';
import {
  DOWNLOAD_STATES,
  formatBytes,
  formatDurationCompact,
  offlineDownloadService,
} from '../../services/offlineDownloadService.js';
import { VideoDownloadButton } from './VideoDownloadButton.jsx';
import { DownloadProgressComponent } from './DownloadProgressComponent.jsx';
import { DownloadErrorComponent } from './DownloadErrorComponent.jsx';
import { InAppVideoPlayer } from './InAppVideoPlayer.jsx';

/**
 * LessonDetailsScreen
 *
 * Implements the exact Stage 1 -> Stage 4 offline video student workflow:
 * - Stage 1 (Before download): Shows thumbnail, title, chapter, duration, and ONLY
 *   "Download Video" (NEVER exposes YouTube URLs and NEVER shows "Watch Now" before
 *   a verified download completes).
 * - Stage 2 (Download process): Verifies auth/eligibility, shows live % & MB downloaded,
 *   supports cancellation, retries, and duplicate prevention.
 * - Stage 3 (Auto state change): Automatically transitions Download Video -> Watch Now
 *   ONLY after local file existence + SHA-256 verification succeeds; restores Download Video
 *   immediately if the file is missing/deleted or corrupted.
 * - Stage 4 (Watch Now): Opens InAppVideoPlayer (Android Media3 ExoPlayer) offline.
 */
export function LessonDetailsScreen({
  studentId,
  lessonDetails,
  isOnline = true,
  notesText = '',
  onUpgrade,
  onProgressSync,
  onRequestOnlineStream,
}) {
  const lesson = lessonDetails?.lesson || null;
  const offlineAsset = lessonDetails?.offlineAsset || null;
  const capabilities = lessonDetails?.playbackCapabilities || {};
  const lessonId = lesson?.id || '';

  const [dlState, setDlState] = useState({
    status: DOWNLOAD_STATES.NOT_DOWNLOADED,
    percent: 0,
    bytesDownloaded: 0,
    totalBytes: Number(offlineAsset?.fileSize || 0),
    downloadId: lessonDetails?.download?.id || '',
    errorCode: '',
    errorMessage: '',
    record: null,
  });
  const [playingOffline, setPlayingOffline] = useState(false);
  const [checkingLocal, setCheckingLocal] = useState(true);

  const verifyLocalFile = useCallback(
    async ({ showLoading = false } = {}) => {
      if (!studentId || !lessonId) {
        setCheckingLocal(false);
        return;
      }
      if (showLoading) setCheckingLocal(true);
      try {
        const verified = await offlineDownloadService.getVerifiedLessonState({
          studentId,
          lessonId,
          deepVerify: false,
        });
        setDlState((prev) => ({
          ...prev,
          ...verified,
          totalBytes: verified.totalBytes || Number(offlineAsset?.fileSize || prev.totalBytes || 0),
        }));
      } finally {
        setCheckingLocal(false);
      }
    },
    [studentId, lessonId, offlineAsset?.fileSize]
  );

  useEffect(() => {
    verifyLocalFile({ showLoading: true });
  }, [verifyLocalFile]);

  // Live subscription to background download progress & state transitions
  useEffect(() => {
    if (!studentId || !lessonId) return undefined;
    return offlineDownloadService.subscribe((evt) => {
      if (evt.studentId === studentId && evt.lessonId === lessonId) {
        setDlState((prev) => ({
          ...prev,
          ...evt,
          totalBytes: evt.totalBytes || prev.totalBytes || Number(offlineAsset?.fileSize || 0),
        }));
      }
    });
  }, [studentId, lessonId, offlineAsset?.fileSize]);

  if (!lesson) return null;

  const isLocked = Boolean(lesson.locked);
  const hasDownloadableAsset = Boolean(
    capabilities.hasDownloadableAsset || offlineAsset || dlState.status === DOWNLOAD_STATES.DOWNLOADED
  );
  const effectiveStatus = dlState.status || DOWNLOAD_STATES.NOT_DOWNLOADED;
  const fileSizeBytes = Number(dlState.totalBytes || offlineAsset?.fileSize || 0);
  const resumeSeconds = Math.max(
    Number(dlState.record?.lastPositionSeconds || 0),
    Number(lessonDetails?.progress?.lastPositionSeconds || 0)
  );

  const handleStartDownload = async (forceRedownload = false) => {
    if (isLocked) {
      onUpgrade?.();
      return;
    }
    if (!isOnline) {
      setDlState((prev) => ({
        ...prev,
        status: DOWNLOAD_STATES.DOWNLOAD_FAILED,
        errorCode: 'NETWORK_OFFLINE',
        errorMessage: 'Connect to mobile data or Wi-Fi to download this lesson for offline viewing.',
      }));
      return;
    }
    await offlineDownloadService.startLessonDownload({
      studentId,
      lessonId,
      qualityLabel: offlineAsset?.qualityLabel || '720p',
      forceRedownload,
    });
  };

  const handleCancelDownload = async () => {
    await offlineDownloadService.cancelDownload({
      studentId,
      lessonId,
      downloadId: dlState.downloadId,
    });
  };

  const handleWatchNow = async () => {
    // Re-verify actual local file existence right before opening InAppVideoPlayer
    const latest = await offlineDownloadService.getVerifiedLessonState({
      studentId,
      lessonId,
      deepVerify: false,
    });
    if (latest.status !== DOWNLOAD_STATES.DOWNLOADED) {
      setDlState((prev) => ({ ...prev, ...latest }));
      setPlayingOffline(false);
      return;
    }
    setPlayingOffline(true);
  };

  const handleDeleteOfflineCopy = async () => {
    setPlayingOffline(false);
    await offlineDownloadService.deleteDownload({
      studentId,
      lessonId,
      downloadId: dlState.downloadId,
    });
  };

  return (
    <div data-testid="lesson-details-screen">
      {/* Stage 4: In-App Verified Offline Player (when student clicks Watch Now) */}
      {playingOffline && effectiveStatus === DOWNLOAD_STATES.DOWNLOADED ? (
        <div style={{ padding: '12px 12px 0' }}>
          <InAppVideoPlayer
            studentId={studentId}
            lessonId={lessonId}
            title={lesson.title}
            description={lesson.description}
            notesText={notesText}
            resumeSeconds={resumeSeconds}
            durationSeconds={lesson.durationSeconds}
            completed={Boolean(lessonDetails?.progress?.isCompleted || dlState.record?.completed)}
            watermark={lessonDetails?.watermark}
            videoSecurity={lessonDetails?.videoSecurity}
            onProgressSaved={(p) => onProgressSync?.(p)}
            onMissingFile={() => {
              setPlayingOffline(false);
              verifyLocalFile({ showLoading: false });
            }}
            onClose={() => {
              setPlayingOffline(false);
            }}
          />
        </div>
      ) : (
        /* Stage 1-3: Protected Lesson Preview Hero (Thumbnail, Title, Chapter, Duration) */
        <div
          style={{
            background: 'linear-gradient(155deg, #0b1a3d 0%, #163274 60%, #1d4ed8 100%)',
            color: '#ffffff',
            padding: '18px 16px 20px',
          }}
        >
          <div
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: 16,
              overflow: 'hidden',
              position: 'relative',
              background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #0ea5e9 100%)',
              boxShadow: '0 14px 32px rgba(2, 6, 23, 0.35)',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {lesson.thumbnailUrl ? (
              <img
                src={lesson.thumbnailUrl}
                alt={lesson.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 18 }}>
                <BookOpen size={40} color="#bfdbfe" style={{ marginBottom: 8 }} />
                <div style={{ fontWeight: 800, fontSize: '0.96rem', color: '#eff6ff' }}>
                  {lesson.subjectTitle || 'Class 10 SSC'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#bfdbfe', marginTop: 2 }}>
                  {lesson.chapterTitle || 'Video Lesson'}
                </div>
              </div>
            )}

            {/* Duration Pill */}
            <span
              data-testid="lesson-duration-badge"
              style={{
                position: 'absolute',
                right: 10,
                bottom: 10,
                background: 'rgba(2, 6, 23, 0.85)',
                color: '#ffffff',
                fontSize: '0.74rem',
                fontWeight: 800,
                padding: '4px 9px',
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Clock size={13} />
              {formatDurationCompact(lesson.durationSeconds)}
            </span>

            {/* Verified Offline Badge (ONLY when DOWNLOADED) */}
            {effectiveStatus === DOWNLOAD_STATES.DOWNLOADED && (
              <span
                data-testid="offline-verified-badge"
                style={{
                  position: 'absolute',
                  left: 10,
                  top: 10,
                  background: 'rgba(6, 78, 59, 0.92)',
                  color: '#6ee7b7',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '4px 10px',
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ShieldCheck size={13} /> Saved Offline
              </span>
            )}
          </div>

          <div style={{ fontSize: '0.78rem', color: '#bfdbfe', fontWeight: 700, marginBottom: 4 }}>
            {lesson.subjectTitle || 'Class 10 SSC'} &bull; {lesson.chapterTitle || 'Chapter'}
          </div>
          <h2
            data-testid="lesson-details-title"
            style={{ margin: '0 0 8px', fontSize: '1.16rem', fontWeight: 800, lineHeight: 1.3 }}
          >
            {lesson.title}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: '0.76rem', color: '#dbeafe' }}>
            <span>Duration: {formatDurationCompact(lesson.durationSeconds)}</span>
            {fileSizeBytes > 0 && <span>&bull; Size: {formatBytes(fileSizeBytes)}</span>}
            {offlineAsset?.qualityLabel && <span>&bull; {offlineAsset.qualityLabel} MP4</span>}
            {resumeSeconds > 5 && <span>&bull; Resume at {formatDurationCompact(resumeSeconds)}</span>}
          </div>
        </div>
      )}

      {/* Action Area: Download / Progress / Watch Now */}
      <div style={{ padding: '14px 16px 4px' }}>
        {isLocked ? (
          <div className="card" style={{ textAlign: 'center', padding: '18px 16px', marginBottom: 12 }}>
            <Lock size={30} color="#d97706" style={{ marginBottom: 6 }} />
            <div style={{ fontWeight: 800, fontSize: '0.96rem', marginBottom: 4 }}>
              Premium Class 10 SSC Lesson
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Activate your Class 10 annual subscription to download and watch this lesson offline.
            </p>
            <button type="button" className="btn btn-emerald btn-block" onClick={onUpgrade}>
              <Crown size={17} /> Unlock Full Class 10 Access
            </button>
          </div>
        ) : hasDownloadableAsset ? (
          <>
            {effectiveStatus === DOWNLOAD_STATES.DOWNLOADING && (
              <DownloadProgressComponent
                percent={dlState.percent}
                bytesDownloaded={dlState.bytesDownloaded}
                totalBytes={fileSizeBytes}
                onCancel={handleCancelDownload}
              />
            )}

            {(effectiveStatus === DOWNLOAD_STATES.DOWNLOAD_FAILED ||
              effectiveStatus === DOWNLOAD_STATES.FILE_MISSING) && (
              <DownloadErrorComponent
                errorCode={dlState.errorCode}
                message={dlState.errorMessage}
                onRetry={() => handleStartDownload(true)}
                onUpgrade={onUpgrade}
              />
            )}

            <div style={{ marginBottom: 10 }}>
              <VideoDownloadButton
                status={effectiveStatus}
                percent={dlState.percent}
                fileSizeLabel={fileSizeBytes > 0 ? formatBytes(fileSizeBytes) : ''}
                disabled={checkingLocal}
                onDownload={() => handleStartDownload(false)}
                onCancel={handleCancelDownload}
                onWatchNow={handleWatchNow}
                onRetry={() => handleStartDownload(true)}
              />
            </div>

            {effectiveStatus === DOWNLOAD_STATES.DOWNLOADED && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 12,
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  fontSize: '0.76rem',
                  color: '#065f46',
                  marginBottom: 10,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700 }}>
                  <WifiOff size={14} /> Ready for offline playback in private encrypted storage
                </span>
                <button
                  type="button"
                  data-testid="btn-delete-offline-copy"
                  onClick={handleDeleteOfflineCopy}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#dc2626',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            )}
          </>
        ) : (
          /* Legacy YouTube-only lesson (no authorized offline MP4 uploaded yet) */
          <div
            data-testid="online-only-lesson-notice"
            className="card"
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '14px 16px',
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f214d', marginBottom: 4 }}>
              Offline MP4 Not Yet Uploaded
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Offline download requires an authorized MP4 uploaded by the administrator. You can still stream this lesson online inside the app.
            </p>
            {capabilities.hasOnlinePlayback && onRequestOnlineStream && (
              <button
                type="button"
                data-testid="btn-stream-online-legacy"
                className="btn btn-primary btn-block"
                onClick={onRequestOnlineStream}
              >
                <PlayCircle size={18} /> Stream Lesson Online
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
