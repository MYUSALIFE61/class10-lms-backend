import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Home,
  GraduationCap,
  FileText,
  TrendingUp,
  User,
  Menu,
  X,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ClipboardCheck,
  FolderOpen,
  Target,
  FlaskConical,
  Leaf,
  Globe,
  Download,
} from 'lucide-react';
import { useNetwork } from '../../context/NetworkContext.jsx';
import { lmsApi } from '../../services/lmsApi.js';
import { OfflineBanner } from './StateViews.jsx';

const DRAWER_SUBJECT_STYLES = {
  mathematics: { bg: '#6366f1', label: 'π' },
  'physical-science': { bg: '#06b6d4', icon: FlaskConical },
  'biological-science': { bg: '#22c55e', icon: Leaf },
  'social-studies': { bg: '#f59e0b', icon: Globe },
  english: { bg: '#ec4899', icon: BookOpen },
  telugu: { bg: '#e11d48', label: 'తె' },
};

export function AppLayout({
  title,
  titleIcon = null,
  subtitle = null,
  showBack = false,
  showMenu = false,
  onMenuClick = null,
  rightAction = null,
  variant = 'blue', // 'blue' | 'dark'
  fullBleed = false,
  hideBottomNav = false,
  children,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOnline } = useNetwork();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [class10Expanded, setClass10Expanded] = useState(true);
  const [drawerSubjects, setDrawerSubjects] = useState([]);

  useEffect(() => {
    if (!drawerOpen || drawerSubjects.length > 0) return;
    lmsApi
      .getSubjects()
      .then((res) => setDrawerSubjects(res.subjects || []))
      .catch(() => {});
  }, [drawerOpen, drawerSubjects.length]);

  const navItems = [
    { path: '/dashboard', label: 'Home', icon: Home, match: ['/dashboard'] },
    { path: '/courses', label: 'Courses', icon: GraduationCap, match: ['/courses', '/subjects', '/revision'] },
    { path: '/exams', label: 'Tests', icon: FileText, match: ['/exams'] },
    { path: '/progress', label: 'Progress', icon: TrendingUp, match: ['/progress'] },
    { path: '/profile', label: 'Profile', icon: User, match: ['/profile', '/subscription'] },
  ];

  const goFromDrawer = (target, state = undefined) => {
    setDrawerOpen(false);
    navigate(target, state ? { state } : undefined);
  };

  return (
    <div className={`app-shell ${hideBottomNav ? 'no-bottom-nav' : ''}`}>
      <header className={`top-bar ${variant === 'dark' ? 'dark' : ''}`}>
        <div className="top-bar-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {showBack && (
              <button
                type="button"
                className="icon-btn ghost"
                onClick={() => navigate(-1)}
                aria-label="Go back"
              >
                <ArrowLeft size={21} />
              </button>
            )}
            {!showBack && showMenu && (
              <button
                type="button"
                className="icon-btn ghost"
                onClick={() => (onMenuClick ? onMenuClick() : setDrawerOpen(true))}
                aria-label="Open menu"
              >
                <Menu size={22} />
              </button>
            )}
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              {titleIcon && (
                <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                  {titleIcon}
                </span>
              )}
              <div style={{ minWidth: 0 }}>
                <h1
                  className="top-bar-title"
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {title}
                </h1>
                {subtitle && <div className="top-bar-sub">{subtitle}</div>}
              </div>
            </div>
          </div>
          {rightAction}
        </div>
      </header>

      <OfflineBanner isOnline={isOnline} />

      <main className={`page-container ${fullBleed ? 'full-bleed' : ''}`}>{children}</main>

      {/* Slide-out "10th Success" Navigation Drawer (Exact Video Organisation Plan Section 2) */}
      {drawerOpen && (
        <div
          role="dialog"
          aria-label="10th Success navigation drawer"
          onClick={() => setDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            background: 'rgba(15, 33, 77, 0.45)',
            display: 'flex',
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '80%',
              maxWidth: 300,
              height: '100%',
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '6px 0 28px rgba(15, 33, 77, 0.24)',
              overflowY: 'auto',
            }}
          >
            {/* Royal Blue Drawer Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1049c7 0%, #2563eb 100%)',
                color: '#fff',
                padding: '20px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <GraduationCap size={26} />
                <span style={{ fontWeight: 800, fontSize: '1.12rem' }}>10th Success</span>
              </div>
              <button
                type="button"
                className="icon-btn ghost"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close drawer"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '10px 10px 24px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                type="button"
                className="profile-menu-row"
                style={{ borderBottom: 'none', borderRadius: 12, background: location.pathname === '/dashboard' ? '#e8f1ff' : 'transparent' }}
                onClick={() => goFromDrawer('/dashboard')}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <Home size={18} color="#1152d4" /> Home
                </span>
              </button>

              <button
                type="button"
                className="profile-menu-row"
                style={{ borderBottom: 'none', borderRadius: 12 }}
                onClick={() => goFromDrawer('/courses')}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <BookOpen size={18} color="#1152d4" /> My Courses
                </span>
              </button>

              {/* Expandable Class 10 Subjects Group */}
              <div style={{ borderTop: '1px solid #eef4ff', borderBottom: '1px solid #eef4ff', padding: '6px 0', margin: '4px 0' }}>
                <button
                  type="button"
                  className="profile-menu-row"
                  style={{ borderBottom: 'none', borderRadius: 12 }}
                  onClick={() => setClass10Expanded((v) => !v)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontWeight: 800 }}>
                    <GraduationCap size={18} color="#1152d4" /> Class 10
                  </span>
                  {class10Expanded ? <ChevronUp size={17} color="#64748b" /> : <ChevronDown size={17} color="#64748b" />}
                </button>

                {class10Expanded && (
                  <div style={{ paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {drawerSubjects.map((sub) => {
                      const st = DRAWER_SUBJECT_STYLES[sub.slug] || { bg: '#2563eb', icon: BookOpen };
                      const Icon = st.icon;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          className="profile-menu-row"
                          style={{ borderBottom: 'none', padding: '9px 10px', borderRadius: 10 }}
                          onClick={() => goFromDrawer(`/subjects/${sub.id}`, { subject: sub })}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                            <span
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 8,
                                background: st.bg,
                                color: '#fff',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '0.8rem',
                              }}
                            >
                              {st.label || (Icon ? <Icon size={14} /> : '•')}
                            </span>
                            <span style={{ fontSize: '0.86rem' }}>{sub.title}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button type="button" className="profile-menu-row" style={{ borderBottom: 'none' }} onClick={() => goFromDrawer('/exams')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <ClipboardCheck size={18} color="#1e64f0" /> Tests &amp; Exams
                </span>
                <ChevronRight size={16} color="#94a3b8" />
              </button>

              <button type="button" className="profile-menu-row" style={{ borderBottom: 'none' }} onClick={() => goFromDrawer('/courses')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <FolderOpen size={18} color="#1e64f0" /> Study Materials
                </span>
                <ChevronRight size={16} color="#94a3b8" />
              </button>

              <button type="button" className="profile-menu-row" style={{ borderBottom: 'none' }} onClick={() => goFromDrawer('/revision')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <Target size={18} color="#1e64f0" /> Revision Zone
                </span>
                <ChevronRight size={16} color="#94a3b8" />
              </button>

              <button type="button" className="profile-menu-row" style={{ borderBottom: 'none' }} onClick={() => goFromDrawer('/revision?tab=previous_papers')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <FileText size={18} color="#1e64f0" /> Previous Papers
                </span>
                <ChevronRight size={16} color="#94a3b8" />
              </button>

              <button type="button" className="profile-menu-row" style={{ borderBottom: 'none' }} onClick={() => goFromDrawer('/downloads')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <Download size={18} color="#1e64f0" /> My Downloads
                </span>
                <ChevronRight size={16} color="#94a3b8" />
              </button>

              <button type="button" className="profile-menu-row" style={{ borderBottom: 'none' }} onClick={() => goFromDrawer('/progress')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  <TrendingUp size={18} color="#1e64f0" /> My Progress
                </span>
                <ChevronRight size={16} color="#94a3b8" />
              </button>
            </div>
          </aside>
        </div>
      )}

      {!hideBottomNav && (
        <nav className="bottom-nav" aria-label="Main navigation">
          <div className="bottom-nav-inner">
            {navItems.map(({ path, label, icon: Icon, match }) => {
              const active = match.some((prefix) => location.pathname.startsWith(prefix));
              return (
                <button
                  key={path}
                  type="button"
                  className={`nav-item ${active ? 'active' : ''}`}
                  onClick={() => navigate(path)}
                >
                  <Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
