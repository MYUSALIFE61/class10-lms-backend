import React, { useEffect, useState } from 'react';
import {
  BookMarked,
  CheckSquare,
  Eye,
  EyeOff,
  History,
  Lightbulb,
  Lock,
  Sigma,
  Sparkles,
  Square,
} from 'lucide-react';
import { EmptyState, ErrorState, LoadingSkeleton } from '../common/StateViews.jsx';

export function ImportantConceptsPanel({
  concepts = [],
  loading = false,
  error = null,
  onRetry,
  onUpgrade,
}) {
  if (loading) return <LoadingSkeleton rows={3} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!concepts.length) {
    return (
      <EmptyState
        title="No Concepts Published Yet"
        description="Important lesson concepts, formulas, and worked examples will appear here."
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {concepts.map((c, idx) => (
        <article key={c.id} className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="concept-index-pill">{idx + 1}</span>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>
                {c.title}
              </h3>
            </div>
            {c.locked && (
              <span className="badge badge-amber">
                <Lock size={12} /> Premium
              </span>
            )}
          </div>

          {c.locked ? (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: '0 0 10px', fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                Subscribe to unlock detailed concept explanations, formulas, and solved examples.
              </p>
              <button type="button" className="btn btn-primary" onClick={onUpgrade}>
                Unlock Full Access
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {c.explanationMarkdown && (
                <p style={{ margin: '0 0 10px', fontSize: '0.92rem', color: '#1e293b', lineHeight: 1.58 }}>
                  {c.explanationMarkdown}
                </p>
              )}

              {c.formulaExpression && (
                <div className="formula-box" aria-label="Mathematical formula">
                  {c.formulaExpression}
                </div>
              )}

              {c.diagramUrl && (
                <img
                  src={c.diagramUrl}
                  alt={c.title}
                  style={{
                    width: '100%',
                    maxHeight: 240,
                    objectFit: 'contain',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    margin: '8px 0',
                  }}
                />
              )}

              {Array.isArray(c.definitions) && c.definitions.length > 0 && (
                <div className="concept-subbox is-def">
                  <div className="concept-subbox-title">
                    <BookMarked size={14} /> Important Definitions
                  </div>
                  <ul>
                    {c.definitions.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(c.examples) && c.examples.length > 0 && (
                <div className="concept-subbox is-example">
                  <div className="concept-subbox-title">
                    <Lightbulb size={14} /> Worked Examples
                  </div>
                  <ul>
                    {c.examples.map((ex, i) => (
                      <li key={i}>{ex}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

const REVISION_TYPE_META = {
  key_point: { label: 'Key Point', badge: 'badge-blue' },
  formula: { label: 'Formula', badge: 'badge-emerald' },
  definition: { label: 'Definition', badge: 'badge-amber' },
  explanation: { label: 'Quick Explanation', badge: 'badge-blue' },
  fact: { label: 'Important Fact', badge: 'badge-emerald' },
  checklist: { label: 'Revision Check', badge: 'badge-amber' },
};

export function QuickRevisionPanel({
  lessonId,
  points = [],
  loading = false,
  error = null,
  onRetry,
  onUpgrade,
}) {
  const storageKey = `c10_revision_checked_${lessonId}`;
  const [checkedMap, setCheckedMap] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey) || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      setCheckedMap(JSON.parse(window.localStorage.getItem(storageKey) || '{}'));
    } catch {
      setCheckedMap({});
    }
  }, [storageKey]);

  const toggleCheck = (id) => {
    setCheckedMap((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Non-fatal
      }
      return next;
    });
  };

  if (loading) return <LoadingSkeleton rows={3} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!points.length) {
    return (
      <EmptyState
        title="No Quick Revision Points Yet"
        description="Key points, formulas, definitions, and checklists for this lesson will appear here."
      />
    );
  }

  const checklists = points.filter((p) => p.pointType === 'checklist');
  const regularPoints = points.filter((p) => p.pointType !== 'checklist');
  const completedChecks = checklists.filter((c) => checkedMap[c.id]).length;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {regularPoints.map((p) => {
        const meta = REVISION_TYPE_META[p.pointType] || REVISION_TYPE_META.key_point;
        return (
          <div key={p.id} className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <span className={`badge ${meta.badge}`}>
                {p.pointType === 'formula' ? <Sigma size={12} /> : <Sparkles size={12} />}
                {meta.label}
              </span>
              {p.locked && (
                <span className="badge badge-amber">
                  <Lock size={12} /> Premium
                </span>
              )}
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '0.96rem', fontWeight: 800, color: 'var(--text)' }}>
              {p.title}
            </h3>
            {p.locked ? (
              <button type="button" className="btn btn-outline" onClick={onUpgrade}>
                Unlock Quick Revision
              </button>
            ) : (
              <>
                {p.formulaExpression && <div className="formula-box">{p.formulaExpression}</div>}
                {p.contentMarkdown && (
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#334155', lineHeight: 1.5 }}>
                    {p.contentMarkdown}
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}

      {checklists.length > 0 && (
        <div className="card" style={{ marginBottom: 0, background: '#f8fbff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800 }}>Revision Checklist</h3>
            <span className="badge badge-emerald">
              {completedChecks}/{checklists.length} Checked
            </span>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {checklists.map((item) => {
              const isChecked = Boolean(checkedMap[item.id]);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`revision-check-row ${isChecked ? 'checked' : ''}`}
                  onClick={() => !item.locked && toggleCheck(item.id)}
                  aria-pressed={isChecked}
                >
                  {isChecked ? (
                    <CheckSquare size={18} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
                  ) : (
                    <Square size={18} color="#64748b" style={{ flexShrink: 0, marginTop: 2 }} />
                  )}
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{item.title}</div>
                    {!item.locked && item.contentMarkdown && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {item.contentMarkdown}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const QUESTION_TYPE_LABELS = {
  mcq: 'MCQ',
  short_answer: 'Short Answer',
  long_answer: 'Long Answer',
  numerical: 'Numerical',
};

export function LessonPyqPanel({
  pyqs = [],
  loading = false,
  error = null,
  onRetry,
  onUpgrade,
}) {
  const [revealedIds, setRevealedIds] = useState({});

  const toggleReveal = (id) => {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) return <LoadingSkeleton rows={3} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!pyqs.length) {
    return (
      <EmptyState
        title="No Previous Board Questions for This Lesson Yet"
        description="Official AP & Telangana SSC examination questions mapped to this lesson will appear here."
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {pyqs.map((q) => {
        const isRevealed = Boolean(revealedIds[q.id]);
        const typeLabel = QUESTION_TYPE_LABELS[q.questionType] || 'Board Question';
        return (
          <article key={q.id} className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <span className="badge badge-blue">
                <History size={12} /> {q.board} SSC {q.examYear}
              </span>
              <span className="badge badge-emerald">{q.marks} Marks</span>
              <span className="badge badge-amber">{typeLabel}</span>
            </div>

            <div style={{ fontWeight: 700, fontSize: '0.94rem', color: 'var(--text)', marginBottom: 8 }}>
              {q.questionText}
            </div>

            {q.questionImageUrl && (
              <img
                src={q.questionImageUrl}
                alt="Exam question diagram"
                style={{
                  width: '100%',
                  maxHeight: 220,
                  objectFit: 'contain',
                  borderRadius: 10,
                  marginBottom: 8,
                }}
              />
            )}

            {Array.isArray(q.options) && q.options.length > 0 && (
              <ol type="A" style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: '0.88rem', color: '#334155' }}>
                {q.options.map((opt, idx) => (
                  <li key={idx} style={{ marginBottom: 3 }}>
                    {opt}
                  </li>
                ))}
              </ol>
            )}

            {q.locked ? (
              <button type="button" className="btn btn-outline" onClick={onUpgrade}>
                <Lock size={15} /> Unlock Answer &amp; Solution
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ minHeight: 36, fontSize: '0.82rem' }}
                  onClick={() => toggleReveal(q.id)}
                >
                  {isRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                  <span>{isRevealed ? 'Hide Answer & Solution' : 'Reveal Answer & Solution'}</span>
                </button>

                {isRevealed && (
                  <div className="pyq-solution-box">
                    <div style={{ fontWeight: 800, color: '#065f46', marginBottom: 4 }}>
                      Model Answer
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem', color: '#1e293b' }}>
                      {q.modelAnswer}
                    </div>
                    {q.explanation && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #d1fae5', fontSize: '0.84rem', color: '#047857' }}>
                        <strong>Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
