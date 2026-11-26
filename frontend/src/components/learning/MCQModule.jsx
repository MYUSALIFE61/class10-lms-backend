import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Award } from 'lucide-react';
import { lmsApi } from '../../services/lmsApi.js';
import { EmptyState, ErrorState, LoadingSkeleton } from '../common/StateViews.jsx';

export function MCQModule({ lessonId }) {
  const [mcqs, setMcqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const loadMcqs = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected({});
    try {
      const data = await lmsApi.getLessonMcqs(lessonId);
      setMcqs(data.mcqs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (lessonId) loadMcqs();
  }, [lessonId]);

  const handleSubmit = async () => {
    const answers = Object.entries(selected).map(([mcqId, selectedOptionIndex]) => ({
      mcqId,
      selectedOptionIndex,
    }));
    if (answers.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const graded = await lmsApi.submitLessonMcqs(lessonId, answers);
      setResult(graded);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSkeleton rows={2} />;
  if (error) return <ErrorState message={error} onRetry={loadMcqs} />;
  if (mcqs.length === 0) {
    return (
      <EmptyState
        title="Practice MCQs Coming Soon"
        description="No multiple-choice questions have been published for this lesson yet."
      />
    );
  }

  const resultMap = new Map((result?.results || []).map((r) => [r.mcqId, r]));

  return (
    <section aria-label="Lesson MCQs">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: '1.02rem' }}>Practice MCQs ({mcqs.length})</h3>
        {result && (
          <span className="badge badge-emerald">
            <Award size={14} /> Score: {result.score}/{result.totalQuestions} ({result.percentage}%)
          </span>
        )}
      </div>

      {mcqs.map((q, index) => {
        const graded = resultMap.get(q.id);
        return (
          <div key={q.id} className="card">
            <div style={{ fontWeight: 600, marginBottom: 10, fontSize: '0.94rem' }}>
              Q{index + 1}. {q.questionText}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {q.options.map((opt, optIdx) => {
                const isChosen = selected[q.id] === optIdx;
                let borderColor = isChosen ? 'var(--primary-light)' : 'var(--border)';
                let bg = isChosen ? 'var(--primary-soft)' : '#fff';

                if (graded) {
                  if (optIdx === graded.correctOptionIndex) {
                    borderColor = 'var(--emerald)';
                    bg = 'var(--emerald-soft)';
                  } else if (isChosen && !graded.isCorrect) {
                    borderColor = 'var(--danger)';
                    bg = 'var(--danger-soft)';
                  }
                }

                return (
                  <button
                    key={optIdx}
                    type="button"
                    disabled={Boolean(result)}
                    onClick={() => setSelected((prev) => ({ ...prev, [q.id]: optIdx }))}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1.5px solid ${borderColor}`,
                      background: bg,
                      cursor: result ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.9rem',
                      color: 'var(--text)',
                    }}
                  >
                    <span>
                      <strong>{String.fromCharCode(65 + optIdx)}.</strong> {opt}
                    </span>
                    {graded && optIdx === graded.correctOptionIndex && (
                      <CheckCircle2 size={17} color="#059669" />
                    )}
                    {graded && isChosen && !graded.isCorrect && (
                      <XCircle size={17} color="#dc2626" />
                    )}
                  </button>
                );
              })}
            </div>
            {graded?.explanation && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: '#f8fafc',
                  fontSize: '0.84rem',
                  color: 'var(--text-muted)',
                }}
              >
                <strong>Explanation:</strong> {graded.explanation}
              </div>
            )}
          </div>
        );
      })}

      {!result ? (
        <button
          className="btn btn-primary btn-block"
          onClick={handleSubmit}
          disabled={submitting || Object.keys(selected).length === 0}
        >
          {submitting ? 'Checking Answers...' : 'Submit Answers'}
        </button>
      ) : (
        <button className="btn btn-outline btn-block" onClick={loadMcqs}>
          Retry Practice Quiz
        </button>
      )}
    </section>
  );
}
