import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HardDrive,
  Play,
  Trash2,
  ShieldCheck,
  WifiOff,
  Clock,
  BookOpen,
} from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { EmptyState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useNetwork } from '../context/NetworkContext.jsx';
import {
  DOWNLOAD_STATES,
  formatBytes,
  formatDurationCompact,
  offlineDownloadService,
} from '../services/offlineDownloadService.js';
import { InAppVideoPlayer } from '../components/offline/InAppVideoPlayer.jsx';

/**
 * MyDownloadsScreen
 *
 * Works 100% offline. Displays verified encrypted downloaded lessons inside app-private storage,
 * storage usage summary, Watch Now (launches InAppVideoPlayer / Android Media3 ExoPlayer),
 * and Delete Download.
 */
export function MyDownloadsScreen() {
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const navigate = useNavigate();

  const [downloads, setDownloads] = useState([]);
  const [totalUsedBytes, setTotalUsedBytes] = useState(0);
  const [availableStorageBytes, setAvailableStorageBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState(null);

  const studentId = user?.id || '';

  const loadDownloads = useCallback(async () => {
    if (!studentId) {
      setDownloads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await offlineDownloadService.listVerifiedDownloads({ studentId });
      setDownloads(res.items || []);
      setTotalUsedBytes(Number(res.totalUsedBytes || 0));
      setAvailableStorageBytes(Number(res.availableStorageBytes || 0));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadDownloads();
  }, [loadDownloads]);

  useEffect(() => {
    if (!studentId) return undefined;
    return offlineDownloadService.subscribe((evt) => {
      if (evt.studentId === studentId) {
        loadDownloads();
      }
    });
  }, [studentId, loadDownloads]);

  const handleDelete = async (item) => {
    if (activeLesson?.lessonId === item.lessonId) {
      setActiveLesson(null);
    }
    await offlineDownloadService.deleteDownload({
      studentId,
      lessonId: item.lessonId,
      downloadId: item.downloadId,
    });
    await loadDownloads();
  };

  const verifiedItems = downloads.filter((d) => d.status === DOWNLOAD_STATES.DOWNLOADED);

  return (
    <AppLayout title="My Downloads" subtitle="Encrypted Offline Lessons" showBack>
      {/* Storage Summary Card */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #eff6ff 0%, #f8fbff 100%)',
          border: '1px solid #bfdbfe',
          padding: '14px 16px',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: '#1152d4',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HardDrive size={19} />
            </span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.94rem', color: '#0f214d' }}>
                Private Encrypted Storage
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                {verifiedItems.length} verified lesson{verifiedItems.length === 1 ? '' : 's'} &bull;{' '}
                {formatBytes(totalUsedBytes)} used
                {availableStorageBytes > 0 ? ` • ${formatBytes(availableStorageBytes)} free` : ''}
              </div>
            </div>
          </div>
          {!isOnline && (
            <span className="badge badge-emerald" style={{ fontSize: '0.7rem' }}>
              <WifiOff size={12} /> Offline Mode
            </span>
          )}
        </div>
      </div>

      {/* Active Offline In-App Player */}
      {activeLesson && (
        <div style={{ marginBottom: 16 }}>
          <InAppVideoPlayer
            studentId={studentId}
            lessonId={activeLesson.lessonId}
            title={activeLesson.title}
            resumeSeconds={activeLesson.lastPositionSeconds || 0}
            durationSeconds={activeLesson.durationSeconds || 0}
            completed={Boolean(activeLesson.completed)}
            watermark={{
              studentCode: user?.studentCode || '',
              identifier: activeLesson.watermarkText || user?.email || '',
            }}
            onMissingFile={() => {
              setActiveLesson(null);
              loadDownloads();
            }}
            onClose={() => {
              setActiveLesson(null);
              loadDownloads();
            }}
          />
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : verifiedItems.length === 0 ? (
        <EmptyState
          title="No Offline Lessons Saved Yet"
          description="Open any Class 10 lesson and tap Download Video to save it privately inside the app for offline watching."
          action={
            <button type="button" className="btn btn-primary" onClick={() => navigate('/courses')}>
              Browse Class 10 Courses
            </button>
          }
        />
      ) : (
        <div data-testid="my-downloads-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {verifiedItems.map((item) => (
            <div
              key={item.lessonId}
              data-testid={`downloaded-item-${item.lessonId}`}
              className="card"
              style={{ padding: 14, marginBottom: 0 }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 84,
                    height: 58,
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <BookOpen size={22} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text)' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {item.subjectTitle || 'Class 10 SSC'}
                    {item.chapterTitle ? ` • ${item.chapterTitle}` : ''}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginTop: 6,
                      fontSize: '0.73rem',
                      color: '#065f46',
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <ShieldCheck size={13} /> {formatBytes(item.fileSize)}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#475569' }}>
                      <Clock size={12} /> {formatDurationCompact(item.durationSeconds)}
                    </span>
                    {item.lastPositionSeconds > 0 && (
                      <span style={{ color: '#1152d4' }}>
                        Resume {formatDurationCompact(item.lastPositionSeconds)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  data-testid={`my-downloads-watch-${item.lessonId}`}
                  className="btn btn-emerald"
                  style={{ flex: 1, minHeight: 42, fontSize: '0.88rem', fontWeight: 800 }}
                  onClick={() => setActiveLesson(item)}
                >
                  <Play size={16} fill="#ffffff" /> Watch Now
                </button>
                <button
                  type="button"
                  data-testid={`my-downloads-delete-${item.lessonId}`}
                  className="btn btn-soft-danger"
                  style={{ minHeight: 42, padding: '0 14px', fontSize: '0.82rem' }}
                  aria-label={`Delete ${item.title}`}
                  onClick={() => handleDelete(item)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}

