import React, { useEffect, useState } from 'react';
import { Search, Eye, KeyRound, Ban, CheckCircle, Bell, X } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout.jsx';
import { adminApi } from '../services/adminApi.js';

export function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [filters, setFilters] = useState({ search: '', board: '', status: '' });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [notifText, setNotifText] = useState('');
  const [toast, setToast] = useState('');

  const load = async () => {
    const res = await adminApi.listStudents(filters);
    setStudents(res.items || []);
  };

  useEffect(() => {
    load();
  }, [filters.board, filters.status]);

  const openProfile = async (student) => {
    setSelected(student);
    const d = await adminApi.getStudent(student.id);
    setDetail(d);
    setEditForm({
      fullName: d.personal.fullName,
      phone: d.personal.phone,
      board: d.academic.board,
      medium: d.academic.medium,
      school: d.academic.school,
      district: d.academic.district,
    });
  };

  const handleStatusChange = async (studentId, accountStatus) => {
    await adminApi.updateStudent(studentId, { accountStatus });
    setToast(`Account status updated to ${accountStatus}.`);
    await load();
    if (selected?.id === studentId) openProfile(selected);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    await adminApi.updateStudent(selected.id, editForm);
    setToast('Student profile saved.');
    await load();
    await openProfile(selected);
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 8) return setToast('Password must be at least 8 characters.');
    await adminApi.resetStudentPassword(selected.id, newPassword);
    setNewPassword('');
    setToast('Password reset & active sessions revoked.');
  };

  const handleDirectNotify = async () => {
    if (!notifText.trim()) return;
    await adminApi.sendNotification({
      title: 'Message from Class 10 LMS Admin',
      message: notifText.trim(),
      notificationType: 'general',
      audienceType: 'selected_students',
      studentIds: [selected.id],
    });
    setNotifText('');
    setToast('Notification delivered to student app.');
  };

  return (
    <AdminLayout
      title="Student Management"
      subtitle="Search, inspect 360° learning progress, switch AP/TS boards, manage account status, and send targeted messages."
    >
      {toast && (
        <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 px-4 py-2.5 text-xs font-semibold text-[#155EEF] flex justify-between">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast('')}>✕</button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="card-panel p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="field-label">Search Student</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="field-input pl-9"
              placeholder="Name, email, registration no, mobile..."
              value={filters.search}
              onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
          </div>
        </div>
        <div className="w-40">
          <label className="field-label">Board</label>
          <select
            className="field-input"
            value={filters.board}
            onChange={(e) => setFilters((p) => ({ ...p, board: e.target.value }))}
          >
            <option value="">All Boards</option>
            <option value="AP">AP SSC</option>
            <option value="TS">Telangana SSC</option>
          </select>
        </div>
        <div className="w-40">
          <label className="field-label">Account Status</label>
          <select
            className="field-input"
            value={filters.status}
            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <button type="button" onClick={load} className="btn-primary">Search</button>
      </div>

      {/* Students Table */}
      <div className="card-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F5F8FF] text-slate-500 uppercase text-[11px]">
              <tr>
                <th className="px-4 py-3 text-left">Reg No / Student</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">Board / Medium</th>
                <th className="px-4 py-3 text-left">Account</th>
                <th className="px-4 py-3 text-left">Subscription</th>
                <th className="px-4 py-3 text-left">Completed</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((st) => (
                <tr key={st.id} className="hover:bg-blue-50/30">
                  <td className="px-4 py-3">
                    <div className="font-bold text-[#172554]">{st.fullName}</div>
                    <div className="text-[11px] text-slate-500">{st.registrationNumber} • {st.className}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{st.email}</div>
                    <div className="text-slate-500">{st.phone || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-[#155EEF] font-bold">
                      {st.board} SSC
                    </span>{' '}
                    <span className="text-slate-500">{st.medium}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold ${
                        st.accountStatus === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : st.accountStatus === 'suspended'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {st.accountStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold ${
                        st.subscriptionStatus === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {st.subscriptionStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold">{st.completedLessons} lessons</td>
                  <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openProfile(st)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EFF6FF] text-[#155EEF] font-semibold hover:bg-blue-100"
                    >
                      <Eye className="w-3.5 h-3.5" /> View 360°
                    </button>
                    {st.accountStatus === 'active' ? (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(st.id, 'suspended')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 font-semibold hover:bg-red-100"
                      >
                        <Ban className="w-3.5 h-3.5" /> Suspend
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(st.id, 'active')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Activate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No students match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed 13-Section Student Profile Modal */}
      {selected && detail && editForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-extrabold">{detail.personal.fullName}</h2>
                <div className="text-xs text-slate-500">
                  {detail.personal.registrationNumber} • {detail.personal.email} • {detail.academic.board} SSC
                </div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="p-2 rounded-xl hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Edit Personal & Academic Info */}
            <form onSubmit={handleSaveEdit} className="card-panel p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase text-slate-500">Personal &amp; Academic Profile</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Full Name</label>
                  <input className="field-input" value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Mobile</label>
                  <input className="field-input" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">SSC Board</label>
                  <select className="field-input" value={editForm.board} onChange={(e) => setEditForm({ ...editForm, board: e.target.value })}>
                    <option value="AP">AP SSC</option>
                    <option value="TS">Telangana SSC</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Textbook Medium</label>
                  <select className="field-input" value={editForm.medium} onChange={(e) => setEditForm({ ...editForm, medium: e.target.value })}>
                    <option value="EN">English Medium</option>
                    <option value="TE">Telugu Medium</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">School</label>
                  <input className="field-input" value={editForm.school} onChange={(e) => setEditForm({ ...editForm, school: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">District</label>
                  <input className="field-input" value={editForm.district} onChange={(e) => setEditForm({ ...editForm, district: e.target.value })} />
                </div>
              </div>
              <button type="submit" className="btn-primary text-xs">Save Profile Changes</button>
            </form>

            {/* Quick Security & Direct Notification Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card-panel p-4 space-y-2">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-[#155EEF]" /> Secure Password Reset
                </div>
                <input
                  type="password"
                  className="field-input"
                  placeholder="New password (8+ chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button type="button" onClick={handleResetPassword} className="btn-secondary w-full text-xs">
                  Reset &amp; Revoke Sessions
                </button>
              </div>
              <div className="card-panel p-4 space-y-2">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-[#155EEF]" /> Send Direct Notification
                </div>
                <input
                  className="field-input"
                  placeholder="Notification message..."
                  value={notifText}
                  onChange={(e) => setNotifText(e.target.value)}
                />
                <button type="button" onClick={handleDirectNotify} className="btn-primary w-full text-xs">
                  Send to Mobile App
                </button>
              </div>
            </div>

            {/* Enrolled Subjects Progress */}
            <div className="card-panel p-4">
              <h3 className="text-xs font-bold uppercase text-slate-500 mb-3">Enrolled Subjects &amp; Progress</h3>
              <div className="space-y-2">
                {detail.enrolledSubjects.map((s) => (
                  <div key={s.subjectId} className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{s.title}</span>
                    <span className="text-slate-500">
                      {s.completedLessons}/{s.totalLessons} lessons ({s.progressPct}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Lesson Completion & Video Watch History */}
            <div className="card-panel p-4">
              <h3 className="text-xs font-bold uppercase text-slate-500 mb-3">Lesson Progress &amp; Watch History</h3>
              {detail.lessonCompletion.length === 0 ? (
                <div className="text-xs text-slate-400">No video lessons watched yet.</div>
              ) : (
                <div className="space-y-2">
                  {detail.lessonCompletion.map((l) => (
                    <div key={l.lessonId} className="flex items-center justify-between text-xs border-b border-slate-50 pb-1.5">
                      <span className="font-medium truncate pr-2">{l.lessonTitle}</span>
                      <span className="font-bold text-[#155EEF]">
                        {l.completionPercent}% {l.isCompleted ? '✓' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quiz & Exam History */}
            <div className="card-panel p-4">
              <h3 className="text-xs font-bold uppercase text-slate-500 mb-3">Quiz &amp; Exam Attempts</h3>
              {detail.quizAttempts.length === 0 && detail.examResults.length === 0 ? (
                <div className="text-xs text-slate-400">No quiz or exam attempts recorded yet.</div>
              ) : (
                <div className="space-y-2 text-xs">
                  {detail.quizAttempts.map((q) => (
                    <div key={q.id} className="flex justify-between">
                      <span>{q.quizTitle}</span>
                      <span className="font-bold">{q.score}/{q.totalMarks} ({q.percentage}%)</span>
                    </div>
                  ))}
                  {detail.examResults.map((ex) => (
                    <div key={ex.id} className="flex justify-between text-indigo-700">
                      <span>[Exam] {ex.examName}</span>
                      <span className="font-bold">{ex.totalScore}/{ex.totalMarks} ({ex.status})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
