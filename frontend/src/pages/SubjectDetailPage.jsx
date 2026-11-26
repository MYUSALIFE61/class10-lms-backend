import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ChevronRight,
  PlayCircle,
  Lock,
  CheckCircle2,
  ClipboardCheck,
  BookOpen,
} from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { NotesPanel } from '../components/learning/ResourcePanels.jsx';
import { lmsApi } from '../services/lmsApi.js';
import { setFlagSecure } from '../services/nativeBridge.js';

const CHAPTER_CARD_GRADIENTS = [
  'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)',
  'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
  'linear-gradient(135deg, #0284c7 0%, #3b82f6 100%)',
  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
  'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
];

export function SubjectDetailPage() {
  const { subjectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [subject, setSubject] = useState(location.state?.subject || null);
  const [activeTab, setActiveTab] = useState('chapters'); // chapters | videos | tests | notes
  const [chapters, setChapters] = useState([]);
  const [allVideos, setAllVideos] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const secureNeeded = activeTab === 'notes';
    setFlagSecure(secureNeeded);
    return () => setFlagSecure(false);
  }, [activeTab]);

  const loadChapters = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lmsApi.getStudentChapters(subjectId).catch(() => lmsApi.getChapters(subjectId));
      setSubject(data.subject);
      setChapters(data.chapters || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChapters();
  }, [subjectId]);

  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    setError(null);
    if (tab === 'videos' && allVideos.length === 0 && chapters.length > 0) {
      setLoading(true);
      try {
        const results = await Promise.all(
          chapters.map((ch) => lmsApi.getLessons(ch.id).catch(() => ({ items: [] })))
        );
        const merged = results.flatMap((r, i) =>
          (r.items || []).map((lesson) => ({ ...lesson, chapterTitle: chapters[i]?.title || '' }))
        );
        setAllVideos(merged);
      } finally {
        setLoading(false);
      }
    } else if (tab === 'notes' && notes.length === 0) {
      setLoading(true);
      try {
        const data = await lmsApi.getNotes({ subjectId });
        setNotes(data.items || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <AppLayout title={subject?.title || 'Subject'} showBack fullBleed>
      {/* Vibrant Gradient Subject Hero Banner (Exact Screen 3 of Organisation Plan) */}
      <div
        className="subject-hero-banner"
        style={{
          background: 'linear-gradient(135deg, #2541c8 0%, #4f46e5 60%, #7c3aed 100%)',
          color: '#fff',
          padding: '16px 18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.7rem',
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {subject?.slug === 'mathematics' ? 'π' : <BookOpen size={26} />}
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.22rem', fontWeight: 800 }}>
            {subject?.title || 'Class 10 Subject'}
          </h2>
          <div style={{ fontSize: '0.82rem', opacity: 0.9, marginTop: 2, fontWeight: 600 }}>
            Class 10 &bull; {chapters.length || 0} Chapters
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 16px 20px' }}>
        {/* 4 Clean Pill Tabs: Chapters | Videos | Tests | Notes */}
        <div className="tabs-bar" role="tablist" aria-label="Subject sections">
          {[
            { key: 'chapters', label: 'Chapters' },
            { key: 'videos', label: 'Videos' },
            { key: 'tests', label: 'Tests' },
            { key: 'notes', label: 'Notes' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              className={`tab-pill ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => handleTabChange(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && <LoadingSkeleton rows={4} />}
        {!loading && error && <ErrorState message={error} onRetry={loadChapters} />}

        {/* Chapters List -> Click Opens ChapterDetailPage */}
        {!loading && !error && activeTab === 'chapters' && (
          <>
            {chapters.length === 0 ? (
              <EmptyState
                title="No Chapters Published Yet"
                description="Upload videos into Class_10 folders or add chapters to see them here."
              />
            ) : (
              chapters.map((ch, idx) => (
                <button
                  key={ch.id}
                  type="button"
                  className="course-card"
                  onClick={() =>
                    navigate(`/subjects/${subjectId}/chapters/${ch.id}`, {
                      state: { subject, chapter: ch },
                    })
                  }
                >
                  <div
                    className="course-icon-box"
                    style={{
                      width: 58,
                      height: 58,
                      background: CHAPTER_CARD_GRADIENTS[idx % CHAPTER_CARD_GRADIENTS.length],
                      fontSize: '1.1rem',
                      fontWeight: 800,
                    }}
                  >
                    Ch {ch.chapterNumber || idx + 1}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>
                      {ch.chapterNumber > 0 ? `${ch.chapterNumber}. ` : ''}
                      {ch.title}
                    </div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)', marginTop: 3, fontWeight: 600 }}>
                      {ch.videoCount ?? 0} Videos &bull; {ch.testCount ?? 1} Tests
                    </div>
                  </div>
                  <ChevronRight size={19} color="#64748b" />
                </button>
              ))
            )}
          </>
        )}

        {/* All Subject Videos */}
        {!loading && !error && activeTab === 'videos' && (
          <>
            {allVideos.length === 0 ? (
              <EmptyState
                title="No Videos in This Subject Yet"
                description="Upload MP4 videos to Class_10/<Subject>/Ch01_... and tap Sync Videos on Home."
              />
            ) : (
              allVideos.map((lesson) => (
                <button
                  key={lesson.id}
                  type="button"
                  className="course-card"
                  onClick={() =>
                    lesson.locked ? navigate('/subscription') : navigate(`/lessons/${lesson.id}`)
                  }
                >
                  {lesson.locked ? (
                    <Lock size={22} color="#d97706" />
                  ) : lesson.progress?.isCompleted ? (
                    <CheckCircle2 size={22} color="#10b981" />
                  ) : (
                    <PlayCircle size={24} color="#1152d4" />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>
                      {lesson.title}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {lesson.chapterTitle} &bull; {lesson.videoTypeLabel || 'Video Lesson'}
                    </div>
                  </div>
                  <ChevronRight size={18} color="#64748b" />
                </button>
              ))
            )}
          </>
        )}

        {/* Subject Tests Tab */}
        {!loading && !error && activeTab === 'tests' && (
          <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
            <ClipboardCheck size={36} color="#1152d4" style={{ marginBottom: 8 }} />
            <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>
              {subject?.title || 'Class 10'} Practice Tests
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.86rem', color: 'var(--text-muted)' }}>
              Practice chapter-wise MCQs and timed Class 10 SSC board tests with instant answers.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/exams')}>
              Start Timed Practice Test
            </button>
          </div>
        )}

        {/* Subject Notes Tab */}
        {!loading && !error && activeTab === 'notes' && (
          <NotesPanel notes={notes} onUpgrade={() => navigate('/subscription')} />
        )}
      </div>
    </AppLayout>
  );
}
