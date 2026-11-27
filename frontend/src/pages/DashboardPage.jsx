import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  CheckCircle2,
  TrendingUp,
  Play,
  ChevronRight,
  Calendar,
  FileText,
  HelpCircle,
  ClipboardCheck,
  BarChart3,
  RefreshCw,
  Crown,
  GraduationCap,
  Calculator,
  FlaskConical,
  Leaf,
  Globe,
  Languages,
  Megaphone,
  AlertTriangle,
} from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { ErrorState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { lmsApi } from '../services/lmsApi.js';

const SUBJECT_CARD_STYLES = {
  mathematics: { bg: '#e5f0ff', iconColor: '#2563eb', barColor: '#2563eb', icon: Calculator },
  'physical-science': { bg: '#dff6f2', iconColor: '#0d9488', barColor: '#10b981', icon: FlaskConical },
  'biological-science': { bg: '#e7f7e6', iconColor: '#16a34a', barColor: '#7c3aed', icon: Leaf },
  'social-studies': { bg: '#fff2e2', iconColor: '#ea580c', barColor: '#f59e0b', icon: Globe },
  english: { bg: '#f8e9f8', iconColor: '#c026d3', barColor: '#db2777', icon: BookOpen },
  telugu: { bg: '#feeef2', iconColor: '#e11d48', barColor: '#e11d48', icon: Languages },
};

function formatDurationTag(sec, sizeLabel) {
  if (sec && sec > 0) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return sizeLabel || 'Video';
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      // Dynamic Admin-controlled student home API (with graceful fallback for unit test mocks)
      const data = await lmsApi.getStudentHome().catch(() => lmsApi.getDashboard());
      setDashboard(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncVideos = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const res = await lmsApi.syncVideos();
      setSyncNotice(`Synced ${res.syncedCount} video(s) into Continue Learning.`);
      await loadDashboard();
    } catch (err) {
      setSyncNotice(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const sub = dashboard?.subscription;
  const appConfig = dashboard?.appConfig || {};
  const activePlan = dashboard?.activePlan || null;
  const subjects = dashboard?.subjects || [];
  const syncedVideos = dashboard?.syncedVideos || [];
  const featuredLessons = dashboard?.featuredLessons || [];
  const upcomingExams = dashboard?.upcomingExams || [];
  const videoProvider = dashboard?.videoProvider;
  const firstName = user?.fullName?.split(' ')[0] || 'Student';
  const totalCourses = dashboard?.stats?.totalSubjects ?? subjects.length;
  const totalChapters = dashboard?.stats?.totalChapters ?? subjects.reduce((acc, s) => acc + (s.chapterCount || 0), 0);
  const totalLessons = dashboard?.stats?.totalLessons ?? subjects.reduce((acc, s) => acc + (s.lessonCount || 0), 0);
  const completedCount = dashboard?.stats?.completedLessons ?? 0;
  const progressPct = dashboard?.stats?.overallProgressPercent ?? 0;
  const unreadCount = dashboard?.stats?.unreadNotificationsCount ?? 0;
  const recentLessons = dashboard?.recentlyAccessedLessons || [];
  const expiryLabel = sub?.expiresAt
    ? new Date(sub.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const featuredVideo = recentLessons[0] || syncedVideos[0] || featuredLessons[0] || null;
  const extraSyncedVideos = syncedVideos.length > 0 ? syncedVideos.slice(1) : [];
  const featuredPercent = featuredVideo
    ? Math.max(0, Math.min(100, featuredVideo.progress?.completionPercent ?? 0))
    : 0;
  const nextExam = upcomingExams[0] || null;

  return (
    <AppLayout
      title="My LMS"
      titleIcon={<GraduationCap size={24} strokeWidth={2.2} />}
      showMenu
      fullBleed
      rightAction={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="icon-btn ghost"
            aria-label="Notifications"
            onClick={() => navigate('/profile')}
            style={{ position: 'relative' }}
          >
            <Bell size={21} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  right: 3,
                  minWidth: 17,
                  height: 17,
                  padding: '0 4px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '0.64rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1.5px solid #1759df',
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate('/profile')}
            aria-label="Account avatar"
            style={{
              padding: 0,
              border: '2px solid rgba(255,255,255,0.9)',
              borderRadius: '50%',
              width: 36,
              height: 36,
              overflow: 'hidden',
              background: '#dbeafe',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <img
              src="/illustrations/student-hero.jpg"
              alt="Student avatar"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
            />
          </button>
        </div>
      }
    >
      {loading && (
        <div style={{ padding: 16 }}>
          <LoadingSkeleton rows={5} />
        </div>
      )}
      {!loading && error && (
        <div style={{ padding: 16 }}>
          <ErrorState message={error} onRetry={loadDashboard} />
        </div>
      )}

      {!loading && !error && dashboard && (
        <div className="lms-home-body">
          {/* Dynamic Maintenance / Announcement Banners from Admin Portal */}
          {appConfig.maintenanceMode && appConfig.maintenanceMessage && (
            <div className="card" style={{ background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e', padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
              <AlertTriangle size={16} />
              <span>{appConfig.maintenanceMessage}</span>
            </div>
          )}
          {appConfig.announcementEnabled && appConfig.announcementText && (
            <div className="card" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8', padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
              <Megaphone size={16} />
              <span>{appConfig.announcementText}</span>
            </div>
          )}

          {/* 1. Dynamic Greeting Hero Card */}
          <section className="lms-hero-card" aria-label="Student greeting">
            <div className="lms-hero-doodles" aria-hidden="true" />
            <div className="lms-hero-copy">
              <h2 className="lms-hero-greeting">Hello, {firstName}! 👋</h2>
              <div className="lms-hero-board">
                <strong>{appConfig.homeBannerTitle || `Class 10 – ${dashboard.board?.shortName || 'SSC'}`}</strong>
              </div>
              <div className="lms-hero-sub">
                {appConfig.homeBannerSubtitle || "Keep Learning... You're Doing Great!"}
              </div>
              <button
                type="button"
                className="lms-premium-pill"
                onClick={() => navigate('/subscription')}
              >
                <Crown size={13} fill="#b45309" color="#b45309" />
                <span>
                  {sub?.isActive
                    ? `Active Class 10 SSC Pass${expiryLabel ? ` • Valid till ${expiryLabel}` : ''}`
                    : activePlan
                      ? `Unlock ${activePlan.name} (₹${activePlan.priceRupees})`
                      : 'Unlock Premium – Full Access'}
                </span>
              </button>
            </div>

            <img
              src="/illustrations/student-hero.jpg"
              alt="Class 10 Student"
              className="lms-hero-student-img"
            />
          </section>

          {/* 2. Live Database Stats Cards */}
          <section className="lms-stats-row lms-stats-row-4" aria-label="Learning summary">
            <button type="button" className="lms-stat-card-v2" onClick={() => navigate('/courses')}>
              <BookOpen size={20} color="#1d5ef2" strokeWidth={2.1} />
              <div className="lms-stat-label">Subjects</div>
              <div className="lms-stat-value">{totalCourses}</div>
              <div className="lms-stat-sub">{totalChapters} Ch</div>
            </button>

            <button type="button" className="lms-stat-card-v2" onClick={() => navigate('/courses')}>
              <Play size={20} color="#7c3aed" strokeWidth={2.1} />
              <div className="lms-stat-label">Lessons</div>
              <div className="lms-stat-value">{totalLessons}</div>
              <div className="lms-stat-sub">Published</div>
            </button>

            <button type="button" className="lms-stat-card-v2" onClick={() => navigate('/progress')}>
              <CheckCircle2 size={20} color="#16a34a" strokeWidth={2.1} />
              <div className="lms-stat-label">Completed</div>
              <div className="lms-stat-value">{completedCount}</div>
              <div className="lms-stat-sub">Lessons</div>
            </button>

            <button type="button" className="lms-stat-card-v2" onClick={() => navigate('/progress')}>
              <TrendingUp size={20} color="#1d5ef2" strokeWidth={2.2} />
              <div className="lms-stat-label">Progress</div>
              <div className="lms-stat-value">{progressPct}%</div>
              <div className="lms-stat-sub">Overall</div>
            </button>
          </section>

          {/* 3. Dynamic My Subjects Strip (Real DB Subjects, Chapters, Lessons & Completion %) */}
          <section className="lms-section">
            <div className="lms-section-head">
              <h3>My Subjects</h3>
              <button type="button" className="lms-link-btn" onClick={() => navigate('/courses')}>
                View All &gt;
              </button>
            </div>

            <div className="lms-subjects-strip" role="list" aria-label="Class 10 subjects">
              {subjects.map((subject) => {
                const st = SUBJECT_CARD_STYLES[subject.slug] || {
                  bg: '#e5f0ff',
                  iconColor: subject.accentColor || '#2563eb',
                  barColor: subject.accentColor || '#2563eb',
                  icon: BookOpen,
                };
                const Icon = st.icon;
                const pct = subject.progressPercent ?? 0;
                const shortTitle = subject.title.replace(/\s*\(.*?\)\s*/g, '');

                return (
                  <button
                    key={subject.id}
                    type="button"
                    role="listitem"
                    className="lms-subject-mini"
                    style={{ background: st.bg }}
                    onClick={() => navigate(`/subjects/${subject.id}`, { state: { subject } })}
                  >
                    <div className="lms-subject-mini-icon">
                      <Icon size={24} color={st.iconColor} strokeWidth={2} />
                    </div>
                    <div className="lms-subject-mini-name">{shortTitle}</div>
                    <div className="lms-subject-mini-counts">
                      {subject.chapterCount ?? 0} Ch &bull; {subject.lessonCount ?? 0} Ls
                    </div>
                    <div className="lms-subject-mini-pct">{pct}%</div>
                    <div className="lms-mini-bar-track">
                      <div className="lms-mini-bar-fill" style={{ width: `${pct}%`, background: st.barColor }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3b. Recently Accessed Lessons (Real Student History Only) */}
          {recentLessons.length > 0 && (
            <section className="lms-section" aria-label="Recently accessed lessons">
              <div className="lms-section-head">
                <h3>Recently Accessed</h3>
                <button type="button" className="lms-link-btn" onClick={() => navigate('/progress')}>
                  History &gt;
                </button>
              </div>
              <div className="lms-extra-videos-list">
                {recentLessons.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="lms-extra-video-row"
                    onClick={() => navigate(`/lessons/${item.id}`)}
                  >
                    <span className="lms-extra-play-icon">
                      {item.progress?.isCompleted ? (
                        <CheckCircle2 size={15} color="#10b981" />
                      ) : (
                        <Play size={14} fill="#1152d4" color="#1152d4" />
                      )}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div className="lms-extra-video-title">{item.title}</div>
                      <div className="lms-extra-video-meta">
                        {item.subjectTitle}
                        {item.chapterTitle ? ` • ${item.chapterTitle}` : ''} &bull;{' '}
                        {item.progress?.isCompleted
                          ? 'Completed'
                          : `${item.progress?.completionPercent || 0}% watched`}
                      </div>
                    </div>
                    <ChevronRight size={17} color="#64748b" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* 4. Dynamic Continue Learning Section */}
          <section className="lms-section" data-testid="synced-videos-section">
            <div className="lms-section-head">
              <h3>Continue Learning</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {videoProvider?.enabled && (
                  <button type="button" className="lms-sync-pill" onClick={handleSyncVideos} disabled={syncing}>
                    <RefreshCw size={13} className={syncing ? 'spin-loader' : ''} />
                    <span>{syncing ? 'Syncing...' : 'Sync Videos'}</span>
                  </button>
                )}
                <button type="button" className="lms-link-btn" onClick={() => navigate('/courses')}>
                  See All &gt;
                </button>
              </div>
            </div>

            {syncNotice && <div className="lms-sync-notice">{syncNotice}</div>}

            {featuredVideo ? (
              <div className="lms-continue-card">
                <button
                  type="button"
                  className="lms-continue-thumb"
                  aria-label={`Play ${featuredVideo.title}`}
                  onClick={() => navigate(`/lessons/${featuredVideo.id}`)}
                >
                  <img src="/illustrations/continue-learning-thumb.svg" alt="" className="lms-continue-thumb-img" />
                  <span className="lms-thumb-play-circle">
                    <Play size={18} fill="#ffffff" color="#ffffff" />
                  </span>
                  <span className="lms-thumb-duration">
                    {formatDurationTag(featuredVideo.durationSeconds, featuredVideo.sizeLabel)}
                  </span>
                </button>

                <div className="lms-continue-info">
                  <span className="lms-chapter-chip">
                    {featuredVideo.folderPath || featuredVideo.folderName || 'Published Lesson'}
                  </span>
                  <div className="lms-continue-title">{featuredVideo.title}</div>

                  <div className="lms-continue-progress-row">
                    <div className="lms-continue-bar-track">
                      <div className="lms-continue-bar-fill" style={{ width: `${featuredPercent}%` }} />
                    </div>
                    <span className="lms-continue-pct">{featuredPercent}% Complete</span>
                  </div>

                  <button
                    type="button"
                    className="lms-resume-btn"
                    onClick={() => navigate(`/lessons/${featuredVideo.id}`)}
                  >
                    <span>{featuredPercent > 0 ? 'Resume' : 'Start Lesson'}</span>
                    <Play size={13} fill="#ffffff" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                Published lessons will appear here as soon as your teacher publishes them in the Admin Portal.
              </div>
            )}

            {extraSyncedVideos.length > 0 && (
              <div className="lms-extra-videos-list">
                {extraSyncedVideos.map((vid) => (
                  <button
                    key={vid.id}
                    type="button"
                    className="lms-extra-video-row"
                    onClick={() => navigate(`/lessons/${vid.id}`)}
                  >
                    <span className="lms-extra-play-icon">
                      <Play size={14} fill="#1152d4" color="#1152d4" />
                    </span>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div className="lms-extra-video-title">{vid.title}</div>
                      <div className="lms-extra-video-meta">
                        {vid.folderPath || vid.folderName || 'Uploaded'}
                        {vid.sizeLabel ? ` • ${vid.sizeLabel}` : ''}
                      </div>
                    </div>
                    <ChevronRight size={17} color="#64748b" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 5. Dynamic Upcoming Exam Card (Rendered Only When Real Exam Data Exists) */}
          {nextExam && (
            <section className="lms-section">
              <div className="lms-section-head">
                <h3>Upcoming Exam</h3>
                <button type="button" className="lms-link-btn" onClick={() => navigate('/exams')}>
                  See All &gt;
                </button>
              </div>

              <button type="button" className="lms-exam-card" onClick={() => navigate('/exams')}>
                <div className="lms-exam-left">
                  <div className="lms-exam-icon">
                    <Calendar size={22} color="#e11d48" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="lms-exam-title">{nextExam.name}</div>
                    <div className="lms-exam-sub">
                      {nextExam.questionCount || nextExam.totalMarks} Marks &bull; {nextExam.durationMinutes} Min Timed
                    </div>
                  </div>
                </div>
                <div className="lms-exam-right">
                  <span className="lms-exam-date-pill">
                    <Calendar size={12} />
                    <span>{new Date(nextExam.examDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </span>
                  <ChevronRight size={18} color="#64748b" />
                </div>
              </button>
            </section>
          )}

          {/* 6. Quick Access Row */}
          <section className="lms-section" style={{ marginBottom: 4 }}>
            <div className="lms-section-head">
              <h3>Quick Access</h3>
            </div>

            <div className="quick-access-grid">
              <button type="button" className="quick-tile-v2" style={{ background: '#fef6dc' }} onClick={() => navigate('/courses')}>
                <FileText size={23} color="#d97706" />
                <span className="quick-tile-title">Notes &amp; PDFs</span>
              </button>

              <button type="button" className="quick-tile-v2" style={{ background: '#def7ec' }} onClick={() => navigate('/revision')}>
                <HelpCircle size={23} color="#10b981" />
                <span className="quick-tile-title">Doubts</span>
                <span className="quick-tile-sub">(Ask Teacher)</span>
              </button>

              <button type="button" className="quick-tile-v2" style={{ background: '#e3f1ff' }} onClick={() => navigate('/exams')}>
                <ClipboardCheck size={23} color="#1e64f0" />
                <span className="quick-tile-title">Practice</span>
                <span className="quick-tile-sub">(MCQs)</span>
              </button>

              <button type="button" className="quick-tile-v2" style={{ background: '#efe6ff' }} onClick={() => navigate('/progress')}>
                <BarChart3 size={23} color="#7c3aed" />
                <span className="quick-tile-title">Results &amp; Analysis</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </AppLayout>
  );
}
