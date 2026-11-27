import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, CheckCircle2, Trophy, Clock, ChevronRight } from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { lmsApi } from '../services/lmsApi.js';

export function ProgressPage() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lmsApi.getStudentProgress();
      setProgress(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const computedPct = progress?.overallProgressPct ?? 0;
  const ringRadius = 56;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringOffset = ringCirc * (1 - computedPct / 100);

  return (
    <AppLayout title="My Progress" showBack>
      {loading && <LoadingSkeleton rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={loadData} />}

      {!loading && !error && progress && (
        <>
          <div style={{ textAlign: 'center', padding: '10px 0 18px' }}>
            <div style={{ position: 'relative', width: 146, height: 146, margin: '0 auto' }}>
              <svg width="146" height="146" viewBox="0 0 146 146">
                <circle cx="73" cy="73" r={ringRadius} fill="#ffffff" stroke="#dce9ff" strokeWidth="12" />
                <circle
                  cx="73"
                  cy="73"
                  r={ringRadius}
                  fill="none"
                  stroke="#1152d4"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={ringCirc}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 73 73)"
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.95rem', fontWeight: 800, color: 'var(--text)' }}>
                {computedPct}%
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              Overall Learning Progress
              {typeof progress.totalChapters === 'number' ? ` • ${progress.totalChapters} Chapters` : ''}
              {typeof progress.inProgressLessons === 'number' && progress.inProgressLessons > 0
                ? ` • ${progress.inProgressLessons} In Progress`
                : ''}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ marginBottom: 0, textAlign: 'center', background: '#e8f1ff', borderColor: '#d2e3ff', padding: 14 }}>
              <PlayCircle size={24} color="#1e64f0" />
              <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 4 }}>{progress.totalLessons}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Published Lessons</div>
            </div>

            <div className="card" style={{ marginBottom: 0, textAlign: 'center', background: '#e7f9f0', borderColor: '#c6f1dc', padding: 14 }}>
              <CheckCircle2 size={24} color="#10b981" />
              <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 4 }}>{progress.completedLessons}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Completed</div>
            </div>

            <div className="card" style={{ marginBottom: 0, textAlign: 'center', background: '#fef6e4', borderColor: '#fde6b3', padding: 14 }}>
              <Trophy size={24} color="#f59e0b" />
              <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 4 }}>{progress.badgesCount}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Achievements</div>
            </div>

            <div className="card" style={{ marginBottom: 0, textAlign: 'center', background: '#eef0ff', borderColor: '#d9ddff', padding: 14 }}>
              <Clock size={24} color="#2563eb" />
              <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 4 }}>{progress.learningMinutes}m</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Watch Time</div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 800 }}>Subject-wise Progress</h2>
            {(progress.subjectBreakdown || []).length === 0 ? (
              <EmptyState title="No Subjects Enrolled" description="Subjects published for your board will appear here." />
            ) : (
              progress.subjectBreakdown.map((item) => (
                <div key={item.subjectId} style={{ marginBottom: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: 700, marginBottom: 5 }}>
                    <span>{item.title}</span>
                    <span>{item.completedLessons}/{item.totalLessons} ({item.progressPct}%)</span>
                  </div>
                  <div className="progress-bar-track" style={{ height: 8 }}>
                    <div className="progress-bar-fill" style={{ width: `${item.progressPct}%`, background: item.accentColor || '#1e64f0' }} />
                  </div>
                </div>
              ))
            )}
          </div>

          {(progress.recentLessons || []).length > 0 && (
            <div className="card">
              <h2 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 800 }}>Recently Accessed Lessons</h2>
              {progress.recentLessons.map((item) => (
                <button
                  key={item.lessonId}
                  type="button"
                  onClick={() => navigate(`/lessons/${item.lessonId}`)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #eef4ff',
                    padding: '10px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text)' }}>{item.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {item.subjectTitle} &bull; {item.chapterTitle}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span className={`badge ${item.isCompleted ? 'badge-green' : 'badge-blue'}`} style={{ fontSize: '0.7rem' }}>
                      {item.isCompleted ? 'Completed' : `${item.completionPercent ?? 0}%`}
                    </span>
                    <ChevronRight size={16} color="#64748b" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {(progress.recentQuizzes || []).length > 0 && (
            <div className="card">
              <h2 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 800 }}>Recent Quiz Attempts</h2>
              {progress.recentQuizzes.map((q) => (
                <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eef4ff', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 700 }}>{q.title}</span>
                  <span style={{ fontWeight: 800, color: q.passed ? '#059669' : '#d97706' }}>
                    {q.score}/{q.totalMarks} ({q.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
