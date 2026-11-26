import React from 'react';
import { Lock, FileText, History, Sigma } from 'lucide-react';
import { EmptyState } from '../common/StateViews.jsx';

export function NotesPanel({ notes, onUpgrade }) {
  if (!notes?.length) {
    return (
      <EmptyState
        title="No Class Notes Yet"
        description="Teacher revision notes for this section will appear here."
      />
    );
  }
  return (
    <div>
      {notes.map((n) => (
        <div key={n.id} className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <FileText size={17} color="var(--primary-light)" />
              <span>{n.title}</span>
            </div>
            {n.locked && (
              <span className="badge badge-amber">
                <Lock size={12} /> Premium
              </span>
            )}
          </div>
          {n.locked ? (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: '0 0 10px', fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                Unlock complete Class 10 notes with the ₹499 SSC Pass.
              </p>
              <button className="btn btn-primary" onClick={onUpgrade}>
                Unlock with ₹499 Pass
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: '#1e293b' }}>
              {n.contentMarkdown}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function PYQPanel({ pyqs, onUpgrade }) {
  if (!pyqs?.length) {
    return (
      <EmptyState
        title="No Previous Exam Questions Yet"
        description="AP & Telangana SSC board exam papers for this subject will appear here."
      />
    );
  }
  return (
    <div>
      {pyqs.map((q) => (
        <div key={q.id} className="card">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="badge badge-blue">
              <History size={12} /> {q.board} SSC {q.examYear}
            </span>
            <span className="badge badge-emerald">{q.marks} Marks</span>
            {q.locked && (
              <span className="badge badge-amber">
                <Lock size={12} /> Premium Answer
              </span>
            )}
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.94rem', marginBottom: 8 }}>{q.questionText}</div>
          {q.locked ? (
            <button className="btn btn-outline" onClick={onUpgrade}>
              Unlock Model Answer (₹499 Pass)
            </button>
          ) : (
            <div
              style={{
                background: '#f8fafc',
                padding: 10,
                borderRadius: 8,
                fontSize: '0.88rem',
                whiteSpace: 'pre-wrap',
                color: '#334155',
              }}
            >
              <strong>Model Answer:</strong>
              {'\n'}
              {q.modelAnswer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function FormulaSheet({ formulas, onUpgrade }) {
  if (!formulas?.length) {
    return (
      <EmptyState
        title="No Formulas Added Yet"
        description="Important chapter formulas and quick revision equations will appear here."
      />
    );
  }
  return (
    <div>
      {formulas.map((f) => (
        <div key={f.id} className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <Sigma size={17} color="#7c3aed" />
              <span>{f.title}</span>
            </div>
            {f.locked && (
              <span className="badge badge-amber">
                <Lock size={12} /> Premium
              </span>
            )}
          </div>
          {f.locked ? (
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-outline" onClick={onUpgrade}>
                Unlock Formula Sheet (₹499 Pass)
              </button>
            </div>
          ) : (
            <>
              <div className="formula-box">{f.formulaExpression}</div>
              {f.explanation && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {f.explanation}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
