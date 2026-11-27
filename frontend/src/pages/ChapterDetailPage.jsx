import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Play,
  ChevronRight,
  Lock,
  CheckCircle2,
  ClipboardCheck,
} from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { FormulaSheet, NotesPanel, PYQPanel } from '../components/learning/ResourcePanels.jsx';
import { lmsApi } from '../services/lmsApi.js';

const THUMB_GRADIENTS = [
  'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #10b981 0%, #0ea5a4 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
  'linear-gradient(135deg, #1d4ed8 0%, #0284c7 100%)',
];

function formatDurationBadge(sec, sizeLabel) {
  if (sec && sec > 0) {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${mins}:${String(rem).padStart(2, '0')}`;
  }
  return sizeLabel || 'Video';
}

export function ChapterDetailPage() {
  const { subjectId, chapterId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [chapter, setChapter] = useState(location.state?.chapter || null);
  const [activeTab, setActiveTab] = useState('videos'); // videos | practice | notes | more
  const [lessons, setLessons] = useState([]);
  const [notes, setNotes] = useState([]);
  const [pyqs, setPyqs] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadChapterContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const [lessonsRes, chaptersRes] = await Promise.all([
        lmsApi.getStudentLessons(chapterId).catch(() => lmsApi.getLessons(chapterId)),
        chapter ? Promise.resolve(null) : lmsApi.getStudentChapters(subjectId).catch(() => lmsApi.getChapters(subjectId)).catch(() => null),
      ]);
      setLessons(lessonsRes.items || []);
      if (!chapter && chaptersRes?.chapters) {
        const matched = chaptersRes.chapters.find((c) => c.id === chapterId);
        if (matched) setChapter(matched);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChapterContent();
  }, [chapterId]);

  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    if (tab === 'notes' && notes.length === 0) {
      const [legacyNotes, dynResources] = await Promise.all([
        lmsApi.getNotes({ chapterId }).catch(() => ({ items: [] })),
        lmsApi.getStudentResources({ chapterId }).catch(() => ({ items: [] })),
      ]);
      const mappedRes = (dynResources.items || []).map((r) => ({
        id: r.id,
        title: `${r.title} (${r.medium})`,
        contentMarkdown: r.contentMarkdown || (r.hasFile ? `Attached Document: ${r.fileName}` : ''),
        isPremium: r.isPremium,
        locked: r.locked,
      }));
      setNotes([...mappedRes, ...(legacyNotes.items || [])]);
    } else if (tab === 'more' && pyqs.length === 0 && formulas.length === 0) {
      const [pRes, fRes] = await Promise.all([
        lmsApi.getPyqs({ chapterId }).catch(() => ({ items: [] })),
        lmsApi.getFormulas({ chapterId }).catch(() => ({ items: [] })),
      ]);
      setPyqs(pRes.items || []);
      setFormulas(fRes.items || []);
    }
  };

  const nextPlayableLesson =
    lessons.find((l) => !l.locked && !l.progress?.isCompleted) ||
    lessons.find((l) => !l.locked) ||
    null;

  return (
    <AppLayout
      title={chapter ? `Chapter ${chapter.chapterNumber || ''}` : 'Chapter'}
      subtitle={chapter?.title || 'Video Lessons & Practice'}
      showBack
      fullBleed
    >
      {/* Gradient Chapter Banner */}
      <div
        className="subject-hero-banner"
        style={{
          background: 'linear-gradient(135deg, #1d4ed8 0%, #4338ca 100%)',
          color: '#fff',
          padding: '12px 18px 18px',
        }}
      >
        <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>
          {chapter?.title || 'Chapter Lessons'}
        </div>
        {chapter?.summary && (
          <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: 4 }}>{chapter.summary}</div>
        )}
      </div>

      <div style={{ padding: '14px 16px 24px' }}>
        {/* 4 Pill Tabs: Videos | Practice | Notes | More (Exact Screen 4 of Plan) */}
        <div className="tabs-bar" role="tablist" aria-label="Chapter content tabs">
          {[
            { key: 'videos', label: 'Videos' },
            { key: 'practice', label: 'Practice' },
            { key: 'notes', label: 'Notes' },
            { key: 'more', label: 'More' },
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
        {!loading && error && <ErrorState message={error} onRetry={loadChapterContent} />}

        {/* Videos / Lessons List */}
        {!loading && !error && activeTab === 'videos' && (
          <>
            {lessons.length === 0 ? (
              <EmptyState
                title="No Lessons Published in This Chapter Yet"
                description="Published Class 10 SSC video lessons and notes for this chapter will appear here."
              />
            ) : (
              <>
                {lessons.map((lesson, idx) => {
                  const statusLabel =
                    lesson.progressStatus === 'completed' || lesson.progress?.isCompleted
                      ? 'Completed'
                      : lesson.progressStatus === 'in_progress' || (lesson.progress?.completionPercent || 0) > 0
                        ? `In Progress (${lesson.progress?.completionPercent || 0}%)`
                        : 'Not Started';
                  const statusBadgeClass =
                    statusLabel === 'Completed'
                      ? 'badge-emerald'
                      : statusLabel.startsWith('In Progress')
                        ? 'badge-blue'
                        : 'badge-amber';

                  return (
                    <div key={lesson.id} className="card lesson-card-rich">
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        {/* Thumbnail + Play Overlay + Duration Badge */}
                        <button
                          type="button"
                          onClick={() =>
                            lesson.locked ? navigate('/subscription') : navigate(`/lessons/${lesson.id}`)
                          }
                          aria-label={`Watch ${lesson.title}`}
                          style={{
                            width: 100,
                            height: 68,
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            borderRadius: 12,
                            background: THUMB_GRADIENTS[idx % THUMB_GRADIENTS.length],
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            flexShrink: 0,
                            overflow: 'hidden',
                          }}
                        >
                          {lesson.thumbnailUrl && (
                            <img
                              src={lesson.thumbnailUrl}
                              alt=""
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          )}
                          <span
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              background: 'rgba(15, 23, 42, 0.76)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              position: 'relative',
                              zIndex: 1,
                            }}
                          >
                            {lesson.locked ? (
                              <Lock size={14} color="#fbbf24" />
                            ) : lesson.progress?.isCompleted ? (
                              <CheckCircle2 size={15} color="#34d399" />
                            ) : (
                              <Play size={14} fill="#ffffff" />
                            )}
                          </span>
                          <span
                            style={{
                              position: 'absolute',
                              right: 5,
                              bottom: 4,
                              background: 'rgba(2, 6, 23, 0.84)',
                              color: '#fff',
                              fontSize: '0.64rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              zIndex: 1,
                            }}
                          >
                            {formatDurationBadge(lesson.durationSeconds, lesson.sizeLabel)}
                          </span>
                        </button>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text)' }}>
                            Lesson {lesson.lessonNumber || idx + 1}: {lesson.title}
                          </div>
                          {lesson.teacherName && (
                            <div style={{ fontSize: '0.76rem', color: '#1152d4', fontWeight: 700, marginTop: 2 }}>
                              {lesson.teacherName}
                            </div>
                          )}
                          {lesson.description && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {lesson.description}
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                            <span className={`badge ${statusBadgeClass}`} style={{ fontSize: '0.66rem' }}>
                              {statusLabel}
                            </span>
                            {lesson.hasNotes && (
                              <span className="badge badge-blue" style={{ fontSize: '0.66rem' }}>
                                Notes Available
                              </span>
                            )}
                            {lesson.downloadStatus === 'completed' && (
                              <span className="badge badge-emerald" style={{ fontSize: '0.66rem' }}>
                                Downloaded
                              </span>
                            )}
                            {lesson.downloadStatus === 'downloading' && (
                              <span className="badge badge-blue" style={{ fontSize: '0.66rem' }}>
                                Downloading
                              </span>
                            )}
                            {lesson.downloadStatus === 'failed' && (
                              <span className="badge badge-danger" style={{ fontSize: '0.66rem' }}>
                                Download Failed
                              </span>
                            )}
                            {lesson.locked && (
                              <span className="badge badge-amber" style={{ fontSize: '0.66rem' }}>
                                Premium
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="lesson-card-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ minHeight: 36, fontSize: '0.8rem', flex: 1 }}
                          onClick={() =>
                            lesson.locked ? navigate('/subscription') : navigate(`/lessons/${lesson.id}`)
                          }
                        >
                          <Play size={14} fill="#ffffff" />
                          <span>
                            {statusLabel.startsWith('In Progress') ? 'Continue Learning' : 'Watch Lesson'}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ minHeight: 36, fontSize: '0.8rem' }}
                          onClick={() =>
                            lesson.locked
                              ? navigate('/subscription')
                              : navigate(`/lessons/${lesson.id}?tab=notes`)
                          }
                        >
                          View Notes
                        </button>
                      </div>
                    </div>
                  );
                })}

                {nextPlayableLesson && (
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    style={{ marginTop: 12, minHeight: 50 }}
                    onClick={() => navigate(`/lessons/${nextPlayableLesson.id}`)}
                  >
                    <Play size={18} fill="#ffffff" />
                    <span>Continue Learning</span>
                  </button>
                )}
              </>
            )}
          </>
        )}

        {/* Practice Tab */}
        {!loading && !error && activeTab === 'practice' && (
          <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
            <ClipboardCheck size={34} color="#1152d4" style={{ marginBottom: 8 }} />
            <h3 style={{ margin: '0 0 6px', fontSize: '1.02rem' }}>Chapter Practice &amp; MCQs</h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.86rem', color: 'var(--text-muted)' }}>
              Test your mastery of {chapter?.title || 'this chapter'} with interactive SSC board questions.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/exams')}>
              Launch Chapter Practice Test
            </button>
          </div>
        )}

        {/* Notes Tab */}
        {!loading && !error && activeTab === 'notes' && (
          <NotesPanel notes={notes} onUpgrade={() => navigate('/subscription')} />
        )}

        {/* More Tab (Important Questions, PYQs & Formulas) */}
        {!loading && !error && activeTab === 'more' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: '0.96rem' }}>Previous Exam Questions (PYQs)</h3>
              <PYQPanel pyqs={pyqs} onUpgrade={() => navigate('/subscription')} />
            </div>
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: '0.96rem' }}>Important Formulas</h3>
              <FormulaSheet formulas={formulas} onUpgrade={() => navigate('/subscription')} />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
