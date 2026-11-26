import React, { useEffect, useState } from 'react';
import { RefreshCw, Users, BookOpen, Video, HelpCircle, CheckCircle2, Clock } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout.jsx';
import { adminApi } from '../services/adminApi.js';

function BarChartCard({ title, rows, labelKey, valueKey, color = '#155EEF', suffix = '' }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey] || 0)));
  return (
    <div className="card-panel p-5">
      <h3 className="text-sm font-bold text-[#172554] mb-4">{title}</h3>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-400 py-8 text-center">No database activity recorded yet.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row, idx) => {
            const val = Number(row[valueKey] || 0);
            const pct = Math.max(4, Math.round((val / max) * 100));
            return (
              <div key={`${row[labelKey]}-${idx}`}>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700 truncate pr-2">{row[labelKey]}</span>
                  <span className="text-[#172554] shrink-0">
                    {val}
                    {suffix}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [filters, setFilters] = useState({ board: '', subjectId: '', fromDate: '', toDate: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (f = filters) => {
    setLoading(true);
    setError('');
    try {
      const [dash, subRes] = await Promise.all([
        adminApi.getDashboard(f),
        subjects.length ? Promise.resolve({ items: subjects }) : adminApi.listSubjects(),
      ]);
      setData(dash);
      if (!subjects.length) setSubjects(subRes.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(filters);
  }, [filters.board, filters.subjectId, filters.fromDate, filters.toDate]);

  const k = data?.kpis || {};
  const c = data?.charts || {};

  const kpiCards = [
    { label: 'Total Students', value: k.totalStudents ?? 0, accent: 'text-[#155EEF]', icon: Users },
    { label: 'Active Students', value: k.activeStudents ?? 0, accent: 'text-emerald-600', icon: CheckCircle2 },
    { label: 'Inactive Students', value: k.inactiveStudents ?? 0, accent: 'text-amber-600', icon: Users },
    { label: 'AP SSC Students', value: k.apSscStudents ?? 0, accent: 'text-blue-600', icon: Users },
    { label: 'Telangana SSC Students', value: k.telanganaSscStudents ?? 0, accent: 'text-indigo-600', icon: Users },
    { label: 'Total Subjects', value: k.totalSubjects ?? 0, accent: 'text-[#155EEF]', icon: BookOpen },
    { label: 'Total Chapters', value: k.totalChapters ?? 0, accent: 'text-sky-600', icon: BookOpen },
    { label: 'Total Lessons', value: k.totalLessons ?? 0, accent: 'text-violet-600', icon: BookOpen },
    { label: 'Uploaded Videos', value: k.totalUploadedVideos ?? 0, accent: 'text-blue-700', icon: Video },
    { label: 'Study Materials', value: k.totalStudyMaterials ?? 0, accent: 'text-teal-600', icon: BookOpen },
    { label: 'MCQ Questions', value: k.totalMcqQuestions ?? 0, accent: 'text-indigo-700', icon: HelpCircle },
    { label: 'Published Tests', value: k.totalPublishedTests ?? 0, accent: 'text-emerald-700', icon: CheckCircle2 },
    { label: 'Total Exams', value: k.totalExams ?? 0, accent: 'text-rose-600', icon: CheckCircle2 },
    { label: 'Completed Lessons', value: k.completedLessons ?? 0, accent: 'text-emerald-600', icon: CheckCircle2 },
    { label: 'Pending Lessons', value: k.pendingLessons ?? 0, accent: 'text-amber-600', icon: Clock },
    { label: 'Video Watch Time', value: `${k.totalVideoWatchTimeMinutes ?? 0} min`, accent: 'text-[#155EEF]', icon: Clock },
  ];

  return (
    <AdminLayout
      title="Executive LMS Dashboard"
      subtitle="Live database-backed metrics across AP SSC & Telangana SSC students, content, quizzes, and video playback."
      actions={
        <button type="button" onClick={() => load(filters)} className="btn-secondary">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      }
    >
      {/* Global Live Filters */}
      <div className="card-panel p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="field-label">Board Filter</label>
          <select
            className="field-input"
            value={filters.board}
            onChange={(e) => setFilters((p) => ({ ...p, board: e.target.value }))}
          >
            <option value="">All Boards (AP &amp; TS)</option>
            <option value="AP">Andhra Pradesh SSC (AP)</option>
            <option value="TS">Telangana SSC (TS)</option>
          </select>
        </div>
        <div>
          <label className="field-label">Subject Filter</label>
          <select
            className="field-input"
            value={filters.subjectId}
            onChange={(e) => setFilters((p) => ({ ...p, subjectId: e.target.value }))}
          >
            <option value="">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">From Date</label>
          <input
            type="date"
            className="field-input"
            value={filters.fromDate}
            onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))}
          />
        </div>
        <div>
          <label className="field-label">To Date</label>
          <input
            type="date"
            className="field-input"
            value={filters.toDate}
            onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 font-semibold">
          {error}
        </div>
      )}

      {/* 16 Live KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-3.5 mb-6">
        {kpiCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="card-panel p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-500">{item.label}</div>
                <div className={`text-2xl font-extrabold mt-1 ${item.accent}`}>{item.value}</div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#F5F8FF] flex items-center justify-center text-slate-400">
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* 10 Real Database Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BarChartCard
          title="1. Daily Student Registrations"
          rows={c.dailyRegistrations || []}
          labelKey="date"
          valueKey="count"
          color="#155EEF"
        />
        <BarChartCard
          title="2. Weekly & Monthly Active Students"
          rows={c.activeTrend || []}
          labelKey="period"
          valueKey="count"
          color="#2563EB"
        />
        <BarChartCard
          title="3. Board-wise Student Distribution"
          rows={c.boardDistribution || []}
          labelKey="board"
          valueKey="count"
          color="#0284C7"
        />
        <BarChartCard
          title="4. Subject-wise Average Completion (%)"
          rows={c.subjectCompletion || []}
          labelKey="subject"
          valueKey="averageCompletionPct"
          color="#16A34A"
          suffix="%"
        />
        <BarChartCard
          title="5. Most-Watched Lessons (Views)"
          rows={c.mostWatchedLessons || []}
          labelKey="title"
          valueKey="views"
          color="#4F46E5"
        />
        <BarChartCard
          title="6. Most Popular Subjects (Engagement)"
          rows={c.popularSubjects || []}
          labelKey="subject"
          valueKey="engagementCount"
          color="#7C3AED"
        />
        <BarChartCard
          title="7. Quiz Performance (Avg Score %)"
          rows={c.quizPerformance || []}
          labelKey="title"
          valueKey="averagePct"
          color="#0D9488"
          suffix="%"
        />
        <BarChartCard
          title="8. Exam Performance (Avg Score)"
          rows={c.examPerformance || []}
          labelKey="name"
          valueKey="averageScore"
          color="#D97706"
        />

        {/* Chart 9: Student Engagement */}
        <div className="card-panel p-5">
          <h3 className="text-sm font-bold text-[#172554] mb-4">9. Student Engagement Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              ['Weekly Active', c.studentEngagement?.weeklyActive ?? 0],
              ['Monthly Active', c.studentEngagement?.monthlyActive ?? 0],
              ['Paid Subscribers', c.studentEngagement?.paidSubscribers ?? 0],
              ['Video Watchers', c.studentEngagement?.videoWatchers ?? 0],
              ['Quiz Takers', c.studentEngagement?.quizTakers ?? 0],
            ].map(([label, val]) => (
              <div key={label} className="rounded-xl bg-[#F5F8FF] p-3 border border-blue-100">
                <div className="text-[11px] font-semibold text-slate-500">{label}</div>
                <div className="text-xl font-extrabold text-[#155EEF] mt-0.5">{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 10: Content Publication Status */}
        <div className="card-panel p-5">
          <h3 className="text-sm font-bold text-[#172554] mb-4">10. Content Publication Statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="py-2">Status</th>
                  <th className="py-2">Lessons</th>
                  <th className="py-2">Materials</th>
                  <th className="py-2">Quizzes</th>
                </tr>
              </thead>
              <tbody>
                {(c.contentPublication || []).map((row) => (
                  <tr key={row.status} className="border-b border-slate-50">
                    <td className="py-2 font-semibold capitalize">{row.status.replace('_', ' ')}</td>
                    <td className="py-2">{row.lessons}</td>
                    <td className="py-2">{row.resources}</td>
                    <td className="py-2">{row.quizzes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
