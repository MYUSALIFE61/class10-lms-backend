import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Crown, Lock, CheckCircle2, Cast } from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { ErrorState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { MCQModule } from '../components/learning/MCQModule.jsx';
import { GamifiedVideoQuizPlayer } from '../components/learning/GamifiedVideoQuizPlayer.jsx';
import { NotesPanel } from '../components/learning/ResourcePanels.jsx';
import { LMSVideoPlayer } from '../components/video/LMSVideoPlayer.jsx';
import { LessonDetailsScreen } from '../components/offline/LessonDetailsScreen.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useNetwork } from '../context/NetworkContext.jsx';
import { lmsApi } from '../services/lmsApi.js';
import { setFlagSecure } from '../services/nativeBridge.js';
import {
  DOWNLOAD_STATES,
  offlineDownloadService,
} from '../services/offlineDownloadService.js';

export function LessonPlayerPage() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOnline } = useNetwork();

  const [lessonDetails, setLessonDetails] = useState(null);
  const [onlineAuthData, setOnlineAuthData] = useState(null);
  const [showOnlinePlayer, setShowOnlinePlayer] = useState(false);
  const [lessonNotes, setLessonNotes] = useState([]);
  const [videoQuizzes, setVideoQuizzes] = useState([]);
  const [activeGameQuizId, setActiveGameQuizId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessDeniedCode, setAccessDeniedCode] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState('info'); // info | notes | qa

  const studentId = user?.id || '';

  useEffect(() => {
    setFlagSecure(true);
    return () => {
      setFlagSecure(false);
    };
  }, []);

  const loadLesson = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccessDeniedCode(null);
    setShowOnlinePlayer(false);
    setOnlineAuthData(null);

    try {
      // Stage 1: Fetch safe lesson details without exposing raw YouTube or storage URLs
      const details = await lmsApi.getLessonDetails(lessonId);
      setLessonDetails(details);
      setCompleted(Boolean(details.progress?.isCompleted));

      lmsApi
        .getNotes({ lessonId })
        .then((res) => setLessonNotes(res.items || []))
        .catch(() => setLessonNotes([]));
      lmsApi
        .getStudentVideoQuizzes({ lessonId })
        .then((res) => setVideoQuizzes(res.items || []))
        .catch(() => setVideoQuizzes([]));
      setActiveGameQuizId(null);
    } catch (err) {
      // Offline fallback: if student already has a verified downloaded copy, load directly from vault
      if (studentId && (err?.code === 'NETWORK_OFFLINE' || err?.code === 'REQUEST_TIMEOUT' || !isOnline)) {
        const local = await offlineDownloadService.getVerifiedLessonState({ studentId, lessonId });
        if (local?.status === DOWNLOAD_STATES.DOWNLOADED && local.record) {
          setLessonDetails({
            lesson: {
              id: lessonId,
              title: local.record.title || 'Downloaded Lesson',
              description: '',
              subjectTitle: local.record.subjectTitle || 'Class 10 SSC',
              chapterTitle: local.record.chapterTitle || 'Offline Lesson',
              thumbnailUrl: local.record.thumbnailUrl || null,
              durationSeconds: local.record.durationSeconds || 0,
              isPremium: false,
              locked: false,
            },
            progress: {
              lastPositionSeconds: local.record.lastPositionSeconds || 0,
              completionPercent: local.record.completed ? 100 : 0,
              isCompleted: Boolean(local.record.completed),
            },
            playbackCapabilities: {
              hasDownloadableAsset: true,
              hasOnlinePlayback: false,
            },
            offlineAsset: {
              videoAssetId: local.record.videoAssetId,
              fileSize: local.record.fileSize,
              qualityLabel: local.record.qualityLabel || '720p',
              sha256Checksum: local.record.sha256Checksum,
              isDownloadable: true,
            },
            watermark: {
              studentCode: user?.studentCode || '',
              identifier: local.record.watermarkText || user?.email || '',
            },
            videoSecurity: {
              protectedPlaybackEnabled: true,
              studentWatermarkEnabled: true,
              screenSharingProtection: true,
            },
          });
          setCompleted(Boolean(local.record.completed));
          setLoading(false);
          return;
        }
      }

      if (
        [
          'SUBSCRIPTION_REQUIRED',
          'SUBSCRIPTION_EXPIRED',
          'SUBSCRIPTION_UNPAID',
          'SUBSCRIPTION_REVOKED',
          'PAYMENT_UNVERIFIED',
        ].includes(err.code)
      ) {
        setAccessDeniedCode(err.code);
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [lessonId, studentId, isOnline, user?.studentCode, user?.email]);

  useEffect(() => {
    loadLesson();
  }, [loadLesson]);

  const handleRequestOnlineStream = useCallback(async () => {
    setError(null);
    try {
      const data = await lmsApi.authorizePlayback(lessonId);
      setOnlineAuthData(data);
      setShowOnlinePlayer(true);
    } catch (err) {
      if (
        [
          'SUBSCRIPTION_REQUIRED',
          'SUBSCRIPTION_EXPIRED',
          'SUBSCRIPTION_UNPAID',
          'SUBSCRIPTION_REVOKED',
          'PAYMENT_UNVERIFIED',
        ].includes(err.code)
      ) {
        setAccessDeniedCode(err.code);
      }
      setError(err.message);
    }
  }, [lessonId]);

  const handleProgressSync = useCallback(
    async ({ positionSeconds, durationSeconds, markCompleted }) => {
      try {
        const res = await lmsApi.saveLessonProgress(lessonId, {
          positionSeconds,
          durationSeconds,
          markCompleted,
        });
        if (res?.progress?.isCompleted) setCompleted(true);
      } catch {
        // Offline progress is already persisted locally & queued for reconnect sync
        if (markCompleted) setCompleted(true);
      }
    },
    [lessonId]
  );

  const lessonTitle = onlineAuthData?.lesson?.title || lessonDetails?.lesson?.title || 'Lesson Details';
  const lessonDescription = onlineAuthData?.lesson?.description || lessonDetails?.lesson?.description || '';
  const lessonDuration = onlineAuthData?.lesson?.durationSeconds || lessonDetails?.lesson?.durationSeconds || 1;
  const notesText = lessonNotes.map((n) => `${n.title}\n${n.contentMarkdown || ''}`).join('\n\n');

  return (
    <AppLayout
      title={lessonTitle}
      variant="dark"
      showBack
      fullBleed
      hideBottomNav
      rightAction={
        completed ? (
          <span className="badge badge-emerald">
            <CheckCircle2 size={13} /> Done
          </span>
        ) : (
          <Cast size={19} color="#cbd5e1" aria-hidden="true" />
        )
      }
    >
      {loading && (
        <div style={{ padding: 16 }}>
          <LoadingSkeleton rows={3} />
        </div>
      )}

      {!loading && accessDeniedCode && (
        <div style={{ padding: 16 }}>
          <div className="card" style={{ textAlign: 'center', padding: '26px 18px' }}>
            <Lock size={38} color="#d97706" style={{ marginBottom: 10 }} />
            <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>
              {accessDeniedCode === 'SUBSCRIPTION_EXPIRED'
                ? 'Your Subscription Has Expired'
                : 'Premium Class 10 Lesson'}
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {error}
            </p>
            <button className="btn btn-emerald" onClick={() => navigate('/subscription')}>
              <Crown size={17} /> View Class 10 Subscription Plans
            </button>
          </div>
        </div>
      )}

      {!loading && !accessDeniedCode && error && (
        <div style={{ padding: 16 }}>
          <ErrorState message={error} onRetry={loadLesson} />
        </div>
      )}

      {!loading && !error && lessonDetails && (
        <>
          {showOnlinePlayer && onlineAuthData ? (
            <LMSVideoPlayer
              lessonId={lessonId}
              provider={onlineAuthData.provider}
              videoId={onlineAuthData.playback.youtubeVideoId}
              streamUrl={onlineAuthData.playback.streamUrl}
              lessonTitle={onlineAuthData.lesson.title}
              lessonDescription={onlineAuthData.lesson.description}
              notesText={notesText}
              isCompleted={completed}
              hideHeader
              resumeSeconds={onlineAuthData.playback.resumePositionSeconds}
              watermark={onlineAuthData.watermark}
              videoSecurity={onlineAuthData.videoSecurity}
              previousLesson={onlineAuthData.navigation.previousLesson}
              nextLesson={onlineAuthData.navigation.nextLesson}
              onSelectLesson={(targetId) => navigate(`/lessons/${targetId}`)}
              onProgressSave={handleProgressSync}
            />
          ) : (
            <LessonDetailsScreen
              studentId={studentId}
              lessonDetails={lessonDetails}
              isOnline={isOnline}
              notesText={notesText}
              onUpgrade={() => navigate('/subscription')}
              onProgressSync={handleProgressSync}
              onRequestOnlineStream={handleRequestOnlineStream}
            />
          )}

          {/* Underline Tabs: Lesson Info | Notes | Q&A */}
          <div className="underline-tabs" role="tablist" aria-label="Lesson tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'info'}
              className={`underline-tab ${activeTab === 'info' ? 'active' : ''}`}
              onClick={() => setActiveTab('info')}
            >
              Lesson Info
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'notes'}
              className={`underline-tab ${activeTab === 'notes' ? 'active' : ''}`}
              onClick={() => setActiveTab('notes')}
            >
              Notes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'qa'}
              className={`underline-tab ${activeTab === 'qa' ? 'active' : ''}`}
              onClick={() => setActiveTab('qa')}
            >
              Q&amp;A
            </button>
          </div>

          <div style={{ padding: '18px 16px 24px' }}>
            {activeTab === 'info' && (
              <>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.12rem', fontWeight: 800, color: 'var(--text)' }}>
                  About this Lesson
                </h2>
                <p style={{ margin: '0 0 22px', fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  {lessonDescription ||
                    'Download this Class 10 SSC lesson once to watch privately offline inside our protected Media3 player.'}
                </p>

                <button
                  type="button"
                  className={`btn btn-block ${completed ? 'btn-emerald' : 'btn-primary'}`}
                  style={{ minHeight: 50, fontSize: '0.98rem' }}
                  onClick={() =>
                    handleProgressSync({
                      positionSeconds: lessonDuration,
                      durationSeconds: lessonDuration,
                      markCompleted: true,
                    })
                  }
                >
                  <CheckCircle2 size={19} />
                  <span>{completed ? 'Lesson Completed' : 'Mark as Complete'}</span>
                </button>
              </>
            )}

            {activeTab === 'notes' && (
              <div>
                {lessonNotes.length > 0 ? (
                  <NotesPanel notes={lessonNotes} onUpgrade={() => navigate('/subscription')} />
                ) : (
                  <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Revision notes for this lesson will appear here once published.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'qa' && (
              <div>
                {activeGameQuizId ? (
                  <GamifiedVideoQuizPlayer
                    quizId={activeGameQuizId}
                    onExit={() => setActiveGameQuizId(null)}
                  />
                ) : (
                  <>
                    {videoQuizzes.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        {videoQuizzes.map((vq) => (
                          <div
                            key={vq.id}
                            className="card"
                            style={{
                              background: 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)',
                              borderColor: '#bfdbfe',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12,
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.94rem', color: '#0f214d' }}>
                                ⚡ {vq.title}
                              </div>
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                4-Round Challenge &bull; {vq.questionCount} Qs &bull; +{vq.xpPerCorrect} XP/Q
                                {vq.bestScorePct !== null ? ` • Best: ${vq.bestScorePct}%` : ''}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ minHeight: 38, padding: '6px 14px', fontSize: '0.8rem' }}
                              onClick={() => setActiveGameQuizId(vq.id)}
                            >
                              Play Now
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <MCQModule lessonId={lessonId} />
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </AppLayout>
  );
}
