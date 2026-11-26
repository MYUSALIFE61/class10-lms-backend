import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Layers,
  BookOpen,
  Video,
  FileText,
  HelpCircle,
  ClipboardCheck,
  Award,
  TrendingUp,
  Bell,
  CreditCard,
  Sliders,
  ShieldCheck,
  ScrollText,
  LogOut,
  Search,
  GraduationCap,
  Menu,
  X,
} from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext.jsx';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard:view' },
      { to: '/students', label: 'Students', icon: Users, perm: 'students:read' },
    ],
  },
  {
    label: 'Academic Management',
    items: [
      { to: '/academic', label: 'Boards, Years & Syllabus', icon: Layers, perm: 'academic:read' },
    ],
  },
  {
    label: 'Content Management',
    items: [
      { to: '/lessons', label: 'Lessons & Publishing', icon: BookOpen, perm: 'content:read' },
      { to: '/videos', label: 'Video Library (PikPak)', icon: Video, perm: ['videos:manage', 'content:read'] },
      { to: '/resources', label: 'Study Materials & PDFs', icon: FileText, perm: ['resources:manage', 'content:read'] },
    ],
  },
  {
    label: 'Assessments',
    items: [
      { to: '/video-quizzes', label: 'Video Quiz Studio (AI)', icon: Award, perm: 'quizzes:manage' },
      { to: '/questions', label: 'Question Bank (MCQs)', icon: HelpCircle, perm: 'questions:read' },
      { to: '/quizzes', label: 'Practice & Quizzes', icon: ClipboardCheck, perm: 'quizzes:manage' },
      { to: '/exams', label: 'Examinations', icon: Award, perm: ['exams:manage', 'exams:grade'] },
    ],
  },
  {
    label: 'Analytics & Operations',
    items: [
      { to: '/progress', label: 'Progress & Reports', icon: TrendingUp, perm: 'progress:read' },
      { to: '/notifications', label: 'Notifications', icon: Bell, perm: 'notifications:manage' },
      { to: '/subscriptions', label: 'Subscriptions & Plans', icon: CreditCard, perm: 'subscriptions:manage' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/app-config', label: 'App Configuration', icon: Sliders, perm: ['config:manage', 'dashboard:view'] },
      { to: '/admins', label: 'Admin Users & Roles', icon: ShieldCheck, perm: 'admins:manage' },
      { to: '/audit-logs', label: 'Audit Logs', icon: ScrollText, perm: 'audit:read' },
    ],
  },
];

export function AdminLayout({ title, subtitle = '', actions = null, children }) {
  const { admin, logout, can } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickJump, setQuickJump] = useState('');

  const allItems = NAV_GROUPS.flatMap((g) => g.items).filter((i) => can(i.perm));
  const jumpMatches = quickJump.trim()
    ? allItems.filter((i) => i.label.toLowerCase().includes(quickJump.trim().toLowerCase()))
    : [];

  return (
    <div className="min-h-screen flex bg-[#F5F8FF] text-[#172554]">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Enterprise Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200/80 flex flex-col transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-[#155EEF] to-[#2563EB] text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">Class 10 LMS</div>
              <div className="text-[11px] text-blue-100">Admin Control Portal</div>
            </div>
          </div>
          <button
            type="button"
            className="lg:hidden p-1 rounded-lg hover:bg-white/15"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {NAV_GROUPS.map((group) => {
            const visible = group.items.filter((i) => can(i.perm));
            if (visible.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {visible.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition ${
                            isActive
                              ? 'bg-[#EFF6FF] text-[#155EEF] font-semibold'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-[#172554]'
                          }`
                        }
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-100 bg-slate-50/70">
          <div className="px-2 py-1.5 mb-2">
            <div className="text-xs font-bold text-[#172554] truncate">{admin?.fullName}</div>
            <div className="text-[11px] text-slate-500 truncate">{admin?.email}</div>
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-blue-100 text-[#155EEF] text-[10px] font-bold">
              {admin?.roleName}
            </span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200/80 px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-600"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-400">
                Admin Portal / {location.pathname === '/' ? 'Dashboard' : title}
              </div>
              <h1 className="text-base lg:text-lg font-bold text-[#172554] truncate">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden md:block w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={quickJump}
                onChange={(e) => setQuickJump(e.target.value)}
                placeholder="Jump to module..."
                className="w-full rounded-xl border border-slate-200 bg-[#F5F8FF] pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:border-[#155EEF] focus:outline-none"
              />
              {jumpMatches.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50">
                  {jumpMatches.slice(0, 6).map((m) => (
                    <button
                      key={m.to}
                      type="button"
                      onClick={() => {
                        setQuickJump('');
                        navigate(m.to);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-blue-50 text-[#172554]"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {actions}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto">
          {subtitle && <p className="text-sm text-slate-500 mb-5">{subtitle}</p>}
          {children}
        </main>
      </div>
    </div>
  );
}
