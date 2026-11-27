import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Cast,
  CheckCircle2,
  Clock,
  Crown,
  FileText,
  GraduationCap,
  History,
  Lightbulb,
  Lock,
  PlayCircle,
  Sparkles,
  Target,
} from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { ErrorState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { MCQModule } from '../components/learning/MCQModule.jsx';
import { GamifiedVideoQuizPlayer } from '../components/learning/GamifiedVideoQuizPlayer.jsx';
import { HandwrittenNotesViewer } from '../components/learning/HandwrittenNotesViewer.jsx';
import {
  ImportantConceptsPanel,
  LessonPyqPanel,
  QuickRevisionPanel,
} from '../components/learning/LessonLearningTabs.jsx';
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

const LEARNING_TABS = [
  { key: 'video', label: 'Video', icon: PlayCircle },
  { key: 'notes', label: 'Handwritten Notes', icon: FileText },
  { key: 'concepts', label: 'Important Concepts', icon: Lightbulb },
  { key: 'revision', label: 'Quick Revision', icon: Sparkles },
  { key: 'pyqs', label: 'Previous Questions', icon: History },
];

function formatMinutesLabel(seconds) {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

export function LessonPlayerPage() {
  const { lessonId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOnline } = useNetwork();

  const initialTab = LEARNING_TABS.some((t) => t.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'video';

  const [lessonDetails, setLessonDetails] = useState(null);
  const [onlineAuthData, setOnlineAuthData] = useState(null);
  const [showOnlinePlayer, setShowOnlinePlayer] = useState(false);
  const [videoQuizzes, setVideoQuizzes] = useState([]);
  const [activeGameQuizId, setActiveGameQuizId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessDeniedCode, setAccessDeniedCode] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressNotice, setProgressNotice] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab);

  // Independent lesson-specific tab states (never shared across different lessons)
  const [tabState, setTabState] = useState({
    notes: { loaded: false, loading: false, error: null, items: [] },
    concepts: { loaded: false, loading: false, error: null, items: [] },
    revision: { loaded: false, loading: false, error: null, items: [] },
    pyqs: { loaded: false, loading: false, error: null, items: [] },
  });

  const studentId = user?.id || '';

  useEffect(() => {
    setFlagSecure(true);
    return () => {
      setFlagSecure(false);
    };
  }, []);

  const loadTabData = useCallback(
    async (tabKey, { force = false } = {}) => {
      if (!['notes', 'concepts', 'revision', 'pyqs'].includes(tabKey)) return;
      setTabState((prev) => {
        if (!force && (prev[tabKey].loaded || prev[tabKey].loading)) return prev;
        return { ...prev, [tabKey]: { ...prev[tabKey], loading: true, error: null } };
      });

      try {
        let res;
        if (tabKey === 'notes') res = await lmsApi.getLessonNotesTab(lessonId);
        else if (tabKey === 'concepts') res = await lmsApi.getLessonConceptsTab(lessonId);
        else if (tabKey === 'revision') res = await lmsApi.getLessonRevisionTab(lessonId);
        else res = await lmsApi.getLessonPyqsTab(lessonId);

        setTabState((prev) => ({
          ...prev,
          [tabKey]: {
            loaded: true,
            loading: false,
            error: null,
            items: res?.items || [],
          },
        }));
      } catch (err) {
        setTabState((prev) => ({
          ...prev,
          [tabKey]: {
            ...prev[tabKey],
            loaded: false,
            loading: false,
            error: err.message || `Unable to load ${tabKey} for this lesson.`,
          },
        }));
      }
    },
    [lessonId]
  );

  const loadLesson = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccessDeniedCode(null);
    setShowOnlinePlayer(false);
    setOnlineAuthData(null);
    setProgressNotice(null);
    setTabState({
      notes: { loaded: false, loading: false, error: null, items: [] },
      concepts: { loaded: false, loading: false, error: null, items: [] },
      revision: { loaded: false, loading: false, error: null, items: [] },
      pyqs: { loaded: false, loading: false, error: null, items: [] },
    });

    try {
      const details = await lmsApi.getLessonDetails(lessonId);
      setLessonDetails(details);
      setCompleted(Boolean(details.progress?.isCompleted));
      setProgressPct(Number(details.progress?.completionPercent || 0));

      lmsApi
        .getStudentVideoQuizzes({ lessonId })
        .then((res) => setVideoQuizzes(res.items || []))
        .catch(() => setVideoQuizzes([]));
      setActiveGameQuizId(null);
    } catch (err) {
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
              teacherName: '',
              learningObjectives: '',
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
          setProgressPct(local.record.completed ? 100 : 0);
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

  useEffect(() => {
    if (!loading && lessonDetails && activeTab !== 'video') {
      loadTabData(activeTab);
    }
  }, [activeTab, loading, lessonDetails, loadTabData]);

  const handleSelectTab = (tabKey) => {
    setActiveTab(tabKey);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tabKey);
    setSearchParams(nextParams, { replace: true });
    if (tabKey !== 'video') {
      loadTabData(tabKey);
    }
  };

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
      setProgressNotice(null);
      try {
        const res = await lmsApi.saveLessonProgress(lessonId, {
          positionSeconds,
          durationSeconds,
          markCompleted,
        });
        const prog = res?.progress;
        if (prog) {
          setProgressPct(Number(prog.completionPercent || 0));
          if (prog.isCompleted) {
            setCompleted(true);
            setProgressNotice('Lesson marked completed and synced to your progress.');
          } else if (markCompleted) {
            setProgressNotice(
              'Watch at least 80% of the lesson video to unlock completion verification.'
            );
          }
        }
      } catch {
        // Offline progress is persisted locally and queued for reconnect sync
      }
    },
    [lessonId]
  );

  const lessonMeta = lessonDetails?.lesson || {};
  const lessonTitle = onlineAuthData?.lesson?.title || lessonMeta.title || 'Lesson Player';
  const lessonDescription = onlineAuthData?.lesson?.description || lessonMeta.description || '';
  const lessonDuration = onlineAuthData?.lesson?.durationSeconds || lessonMeta.durationSeconds || 0;
  const durationLabel = formatMinutesLabel(lessonDuration);
  const notesText = tabState.notes.items
    .map((n) => `${n.title}\n${n.contentMarkdown || ''}`)
    .join('\n\n');

  return (
    <AppLayout
      title={lessonTitle}
      subtitle={
        lessonMeta.subjectTitle
          ? `${lessonMeta.subjectTitle}${lessonMeta.chapterTitle ? ` • ${lessonMeta.chapterTitle}` : ''}`
          : undefined
      }
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
          <LoadingSkeleton rows={4} />
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
        <div className="lesson-player-shell">
          {/* Authorized Video Player (Media3 Offline / Signed Online Stream / YouTube IFrame) */}
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

          {/* Lesson Metadata Summary Bar */}
          <div className="lesson-meta-strip">
            <div className="lesson-breadcrumb">
              <BookOpen size={14} color="var(--primary)" />
              <span>
                {lessonMeta.subjectTitle || 'Class 10 SSC'}
                {lessonMeta.chapterTitle ? ` › ${lessonMeta.chapterTitle}` : ''}
              </span>
            </div>
            <h2 className="lesson-meta-title">{lessonTitle}</h2>
            <div className="lesson-meta-chips">
              {lessonMeta.teacherName && (
                <span className="badge badge-blue">
                  <GraduationCap size={12} /> {lessonMeta.teacherName}
                </span>
              )}
              {durationLabel && (
                <span className="badge badge-amber">
                  <Clock size={12} /> {durationLabel}
                </span>
              )}
              <span className={`badge ${completed ? 'badge-emerald' : 'badge-blue'}`}>
                {completed ? 'Completed (100%)' : progressPct > 0 ? `In Progress (${progressPct}%)` : 'Not Started'}
              </span>
            </div>
          </div>

          {/* 5 Lesson-Specific Learning Tabs */}
          <div className="lesson-five-tabs" role="tablist" aria-label="Lesson learning sections">
            {LEARNING_TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.key}
                  className={`lesson-five-tab ${activeTab === t.key ? 'active' : ''}`}
                  onClick={() => handleSelectTab(t.key)}
                >
                  <Icon size={15} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="lesson-tab-content">
            {activeTab === 'video' && (
              <div style={{ display: 'grid', gap: 14 }}>
                <div className="card" style={{ marginBottom: 0 }}>
                  <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>
                    About this Lesson
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                    {lessonDescription ||
                      'Watch this Class 10 SSC lesson online or download it privately to study offline inside our encrypted Media3 player.'}
                  </p>

                  {lessonMeta.learningObjectives && (
                    <div className="lesson-objectives-box">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: '#1e3a8a', marginBottom: 4 }}>
                        <Target size={15} /> Learning Objectives
                      </div>
                      <div style={{ fontSize: '0.86rem', color: '#334155', lineHeight: 1.5 }}>
                        {lessonMeta.learningObjectives}
                      </div>
                    </div>
                  )}

                  {progressNotice && (
                    <div
                      role="status"
                      style={{
                        marginTop: 12,
                        padding: '8px 12px',
                        borderRadius: 10,
                        background: '#eff6ff',
                        color: '#1e40af',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      {progressNotice}
                    </div>
                  )}

                  <button
                    type="button"
                    className={`btn btn-block ${completed ? 'btn-emerald' : 'btn-primary'}`}
                    style={{ minHeight: 48, marginTop: 14, fontSize: '0.95rem' }}
                    onClick={() =>
                      handleProgressSync({
                        positionSeconds: Math.max(
                          lessonDuration,
                          lessonDetails?.progress?.lastPositionSeconds || 0
                        ),
                        durationSeconds: Math.max(lessonDuration, 1),
                        markCompleted: true,
                      })
                    }
                  >
                    <CheckCircle2 size={18} />
                    <span>{completed ? 'Lesson Completed' : 'Mark as Complete'}</span>
                  </button>
                </div>

                {/* Gamified Video Quiz + Lesson MCQs */}
                {activeGameQuizId ? (
                  <GamifiedVideoQuizPlayer
                    quizId={activeGameQuizId}
                    onExit={() => setActiveGameQuizId(null)}
                  />
                ) : (
                  <>
                    {videoQuizzes.length > 0 &&
                      videoQuizzes.map((vq) => (
                        <div
                          key={vq.id}
                          className="card"
                          style={{
                            marginBottom: 0,
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
                    <MCQModule lessonId={lessonId} />
                  </>
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <HandwrittenNotesViewer
                notes={tabState.notes.items}
                loading={tabState.notes.loading}
                error={tabState.notes.error}
                onRetry={() => loadTabData('notes', { force: true })}
                onUpgrade={() => navigate('/subscription')}
              />
            )}

            {activeTab === 'concepts' && (
              <ImportantConceptsPanel
                concepts={tabState.concepts.items}
                loading={tabState.concepts.loading}
                error={tabState.concepts.error}
                onRetry={() => loadTabData('concepts', { force: true })}
                onUpgrade={() => navigate('/subscription')}
              />
            )}

            {activeTab === 'revision' && (
              <QuickRevisionPanel
                lessonId={lessonId}
                points={tabState.revision.items}
                loading={tabState.revision.loading}
                error={tabState.revision.error}
                onRetry={() => loadTabData('revision', { force: true })}
                onUpgrade={() => navigate('/subscription')}
              />
            )}

            {activeTab === 'pyqs' && (
              <LessonPyqPanel
                pyqs={tabState.pyqs.items}
                loading={tabState.pyqs.loading}
                error={tabState.pyqs.error}
                onRetry={() => loadTabData('pyqs', { force: true })}
                onUpgrade={() => navigate('/subscription')}
              />
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
