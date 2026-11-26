import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlayCircle, ChevronRight, FileText, Star, Target, ClipboardCheck } from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { EmptyState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { FormulaSheet, PYQPanel } from '../components/learning/ResourcePanels.jsx';
import { lmsApi } from '../services/lmsApi.js';

const ZONE_TABS = [
  { key: 'revision_series', label: 'Revision Series', icon: Star },
  { key: 'model_papers', label: 'Model Papers', icon: ClipboardCheck },
  { key: 'previous_papers', label: 'Previous Papers', icon: FileText },
  { key: 'important_questions', label: 'Important Qs', icon: Target },
];

export function RevisionZonePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'revision_series';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [syncedVideos, setSyncedVideos] = useState([]);
  const [pyqs, setPyqs] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ZONE_TABS.some((t) => t.key === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      lmsApi.getDashboard().catch(() => ({ syncedVideos: [] })),
      lmsApi.getPyqs({}).catch(() => ({ items: [] })),
      lmsApi.getFormulas({}).catch(() => ({ items: [] })),
    ])
      .then(([dash, pyqRes, formRes]) => {
        setSyncedVideos(dash.syncedVideos || []);
        setPyqs(pyqRes.items || []);
        setFormulas(formRes.items || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const zoneVideos = syncedVideos.filter(
    (v) => v.specialZone === activeTab || (activeTab === 'revision_series' && v.videoType === 'revision')
  );

  return (
    <AppLayout title="Revision Zone" subtitle="Model Papers, PYQs & Quick Recap" showBack>
      <div className="tabs-bar" role="tablist">
        {ZONE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            className={`tab-pill ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <LoadingSkeleton rows={3} />}

      {!loading && (
        <>
          {zoneVideos.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '0.96rem', fontWeight: 800 }}>
                Synced Revision Videos
              </h3>
              {zoneVideos.map((vid) => (
                <button
                  key={vid.id}
                  type="button"
                  className="course-card"
                  onClick={() => navigate(`/lessons/${vid.id}`)}
                >
                  <PlayCircle size={26} color="#1152d4" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{vid.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {vid.folderPath} {vid.sizeLabel ? `• ${vid.sizeLabel}` : ''}
                    </div>
                  </div>
                  <ChevronRight size={18} color="#64748b" />
                </button>
              ))}
            </div>
          )}

          {activeTab === 'previous_papers' && (
            <PYQPanel pyqs={pyqs} onUpgrade={() => navigate('/subscription')} />
          )}

          {activeTab === 'revision_series' && (
            <>
              <div className="card" style={{ background: '#eff6ff', borderColor: '#cfe2ff' }}>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 4 }}>
                  Quick Formula &amp; Concept Recap
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Upload 5–8 min revision MP4s into <code>Class_10/08_Revision_Series/</code> and tap Sync Videos to display them right here.
                </p>
              </div>
              <FormulaSheet formulas={formulas} onUpgrade={() => navigate('/subscription')} />
            </>
          )}

          {activeTab === 'model_papers' && (
            <div className="card" style={{ textAlign: 'center', padding: '22px 16px' }}>
              <ClipboardCheck size={34} color="#1152d4" style={{ marginBottom: 8 }} />
              <h3 style={{ margin: '0 0 6px', fontSize: '1.02rem' }}>AP &amp; TS SSC Model Papers</h3>
              <p style={{ margin: '0 0 14px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                Upload solved model paper videos to <code>Class_10/06_Model_Papers/</code> or take our timed SSC quiz now.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => navigate('/exams')}>
                Take 15-Question SSC Mock Quiz
              </button>
            </div>
          )}

          {activeTab === 'important_questions' && (
            <>
              {pyqs.length > 0 ? (
                <PYQPanel pyqs={pyqs} onUpgrade={() => navigate('/subscription')} />
              ) : (
                <EmptyState
                  title="Upload Important Question Videos"
                  description="Place exam-focused videos in Class_10/09_Important_Questions/ and tap Sync Videos."
                />
              )}
            </>
          )}
        </>
      )}
    </AppLayout>
  );
}
