import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  FlaskConical,
  BookOpen,
  Globe,
  Leaf,
  Languages,
  Star,
  FileText,
  X,
  FolderTree,
} from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { EmptyState, ErrorState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { lmsApi } from '../services/lmsApi.js';

const SUBJECT_TILE_THEMES = {
  mathematics: {
    cardBg: '#eef0ff',
    iconBg: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
    chaptersLabel: '16 Chapters',
    symbol: 'π',
  },
  'physical-science': {
    cardBg: '#e6f8fd',
    iconBg: 'linear-gradient(135deg, #0284c7 0%, #22d3ee 100%)',
    chaptersLabel: '14 Chapters',
    icon: FlaskConical,
  },
  'biological-science': {
    cardBg: '#e9faef',
    iconBg: 'linear-gradient(135deg, #16a34a 0%, #4ade80 100%)',
    chaptersLabel: '15 Chapters',
    icon: Leaf,
  },
  'social-studies': {
    cardBg: '#fff3e6',
    iconBg: 'linear-gradient(135deg, #ea580c 0%, #fb923c 100%)',
    chaptersLabel: '12 Chapters',
    icon: Globe,
  },
  english: {
    cardBg: '#fdebf3',
    iconBg: 'linear-gradient(135deg, #db2777 0%, #f472b6 100%)',
    chaptersLabel: '10 Chapters',
    icon: BookOpen,
  },
  telugu: {
    cardBg: '#fef2f2',
    iconBg: 'linear-gradient(135deg, #be123c 0%, #fb7185 100%)',
    chaptersLabel: '12 Chapters',
    icon: Languages,
  },
};

export function CoursesPage() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  const loadCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await lmsApi.getStudentHome().catch(() => lmsApi.getDashboard());
      setSubjects(data.subjects || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const filtered = subjects.filter(
    (s) =>
      !query.trim() ||
      s.title.toLowerCase().includes(query.trim().toLowerCase()) ||
      (s.description || '').toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <AppLayout
      title="Class 10"
      showBack
      fullBleed
      rightAction={
        <button
          type="button"
          className="icon-btn ghost"
          aria-label="Search subjects"
          onClick={() => setShowSearch((s) => !s)}
        >
          {showSearch ? <X size={20} /> : <Search size={20} />}
        </button>
      }
    >
      {/* Seamless Full-Width Hero Banner ("Class 10 — All Subjects in One Place") */}
      <div className="courses-hero-banner">
        <div className="courses-hero-stage">
          <img
            src="/illustrations/splash-students.jpg"
            alt="Class 10 Students"
            className="courses-hero-img"
          />
        </div>
        <div className="courses-hero-strip">
          <div className="courses-hero-title">Class 10</div>
          <div className="courses-hero-sub">All Subjects in One Place</div>
        </div>
      </div>

      <div className="courses-body">
        {showSearch && (
          <div className="pill-input-wrap" style={{ marginBottom: 14 }}>
            <Search size={18} color="#64748b" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Mathematics, Science, English..."
              aria-label="Search Class 10 subjects"
            />
          </div>
        )}

        {loading && <LoadingSkeleton rows={4} />}
        {!loading && error && <ErrorState message={error} onRetry={loadCourses} />}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState
            title="No Matching Subjects"
            description="Try clearing your search filter."
            actionLabel="Show All"
            onAction={() => setQuery('')}
          />
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="courses-grid">
            {filtered.map((subject) => {
              const theme = SUBJECT_TILE_THEMES[subject.slug] || {
                cardBg: '#eff6ff',
                iconBg: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                chaptersLabel: 'Class 10 SSC',
                icon: BookOpen,
              };
              const Icon = theme.icon;

              return (
                <button
                  key={subject.id}
                  type="button"
                  className="courses-subject-tile"
                  onClick={() => navigate(`/subjects/${subject.id}`, { state: { subject } })}
                  style={{ background: theme.cardBg }}
                >
                  <div
                    className="courses-tile-icon"
                    style={{ background: theme.iconBg }}
                  >
                    {theme.symbol || (Icon ? <Icon size={26} /> : null)}
                  </div>
                  <div className="courses-tile-title">{subject.title}</div>
                  <div className="courses-tile-meta">
                    {typeof subject.chapterCount === 'number'
                      ? `${subject.chapterCount} ${subject.chapterCount === 1 ? 'Chapter' : 'Chapters'}`
                      : 'Class 10 SSC'}
                  </div>
                </button>
              );
            })}

            {/* Revision & Practice Tile */}
            <button
              type="button"
              className="courses-subject-tile"
              onClick={() => navigate('/revision')}
              style={{
                background: '#fffbe6',
                borderColor: 'rgba(245, 158, 11, 0.22)',
              }}
            >
              <div
                className="courses-tile-icon"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                  boxShadow: '0 6px 14px rgba(245, 158, 11, 0.28)',
                }}
              >
                <Star size={26} fill="#ffffff" />
              </div>
              <div className="courses-tile-title">Revision &amp; Practice</div>
              <div className="courses-tile-meta">Quick Recap &amp; Formulas</div>
            </button>

            {/* Model & Previous Papers Tile (Balances 8-Tile Grid: 2x4 Mobile / 4x2 Desktop) */}
            <button
              type="button"
              className="courses-subject-tile"
              onClick={() => navigate('/revision?tab=previous_papers')}
              style={{
                background: '#eef6ff',
                borderColor: 'rgba(37, 99, 235, 0.16)',
              }}
            >
              <div
                className="courses-tile-icon"
                style={{
                  background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
                  boxShadow: '0 6px 14px rgba(37, 99, 235, 0.26)',
                }}
              >
                <FileText size={25} />
              </div>
              <div className="courses-tile-title">Board Papers</div>
              <div className="courses-tile-meta">Model &amp; Previous PYQs</div>
            </button>
          </div>
        )}

        {/* Collapsible Auto-Sync Folder & Naming Convention Reference */}
        <div className="card" style={{ padding: '12px 16px' }}>
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontWeight: 700,
              fontSize: '0.84rem',
              color: 'var(--primary)',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <FolderTree size={16} /> Video Folder &amp; Naming Auto-Sync Format
            </span>
            <span>{showGuide ? 'Hide' : 'View'}</span>
          </button>

          {showGuide && (
            <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
              <div>Upload into PikPak (or R2) using either structure, then tap <strong>Sync Videos</strong> on Home:</div>
              <pre
                style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  padding: '10px 12px',
                  borderRadius: 10,
                  overflowX: 'auto',
                  fontSize: '0.74rem',
                  margin: '8px 0 4px',
                }}
              >{`Class_10/01_Mathematics/Ch01_Real_Numbers/01_Introduction.mp4
Class_10/02_Physical_Science/Ch02_Chemical_Equations/02_Concepts.mp4
Class_10/08_Revision_Series/05_Revision.mp4

Or filename format:
Class10_Maths_Ch01_01_Introduction.mp4`}</pre>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
