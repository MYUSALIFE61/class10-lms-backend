import React from 'react';
import { Atom, BookOpen, Calculator, Globe, Languages, Leaf, ChevronRight } from 'lucide-react';

const ICON_MAP = {
  calculator: Calculator,
  atom: Atom,
  leaf: Leaf,
  globe: Globe,
  'book-open': BookOpen,
  languages: Languages,
};

export function SubjectCard({ subject, onSelect }) {
  const Icon = ICON_MAP[subject.iconKey] || BookOpen;
  const accent = subject.accentColor || '#1D4ED8';

  return (
    <button
      onClick={() => onSelect(subject)}
      className="card"
      style={{
        textAlign: 'left',
        cursor: 'pointer',
        marginBottom: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 10,
        borderTop: `4px solid ${accent}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: `${accent}18`,
            color: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={22} />
        </div>
        <ChevronRight size={18} color="#94a3b8" />
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text)' }}>
          {subject.title}
        </div>
        <div
          style={{
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            marginTop: 4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {subject.description}
        </div>
      </div>
    </button>
  );
}
