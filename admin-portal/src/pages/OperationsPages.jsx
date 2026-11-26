import React, { useEffect, useState } from 'react';
import { Send, Plus, Crown } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout.jsx';
import { adminApi } from '../services/adminApi.js';

export function ProgressReportsPage() {
  const [report, setReport] = useState(null);
  const [board, setBoard] = useState('');

  useEffect(() => {
    adminApi.getReports({ board }).then(setReport);
  }, [board]);

  return (
    <AdminLayout
      title="Student Learning Progress & Analytics Reports"
      subtitle="Real-time completion rates, watch time, inactive student alerts, and low-performance diagnostics."
      actions={
        <select className="field-input w-44" value={board} onChange={(e) => setBoard(e.target.value)}>
          <option value="">All Boards</option>
          <option value="AP">AP SSC</option>
          <option value="TS">Telangana SSC</option>
        </select>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="card-panel p-4">
          <div className="text-xs font-semibold text-slate-500">Tracked Students</div>
          <div className="text-2xl font-extrabold text-[#155EEF] mt-1">{report?.studentReports?.length ?? 0}</div>
        </div>
        <div className="card-panel p-4">
          <div className="text-xs font-semibold text-slate-500">Inactive (&gt;7 Days)</div>
          <div className="text-2xl font-extrabold text-amber-600 mt-1">{report?.inactiveStudents?.length ?? 0}</div>
        </div>
        <div className="card-panel p-4">
          <div className="text-xs font-semibold text-slate-500">Low Performing (&lt;50% Quiz)</div>
          <div className="text-2xl font-extrabold text-red-600 mt-1">{report?.lowPerformingStudents?.length ?? 0}</div>
        </div>
      </div>

      <div className="card-panel overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[#F5F8FF] text-slate-500 uppercase text-[11px]">
            <tr>
              <th className="px-4 py-3 text-left">Student</th>
              <th className="px-4 py-3 text-left">Board</th>
              <th className="px-4 py-3 text-left">Completed</th>
              <th className="px-4 py-3 text-left">Watch Time</th>
              <th className="px-4 py-3 text-left">Quiz Avg</th>
              <th className="px-4 py-3 text-left">Status Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(report?.studentReports || []).map((s) => (
              <tr key={s.studentId}>
                <td className="px-4 py-3 font-bold">{s.fullName} <span className="text-slate-400 font-normal">({s.registrationNumber})</span></td>
                <td className="px-4 py-3">{s.board}</td>
                <td className="px-4 py-3 font-semibold">{s.completedLessons} ({s.progressPct}%)</td>
                <td className="px-4 py-3">{s.watchMinutes} min</td>
                <td className="px-4 py-3">{s.avgQuizPct !== null ? `${s.avgQuizPct}%` : '—'}</td>
                <td className="px-4 py-3 space-x-1">
                  {s.isInactive && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">Inactive</span>}
                  {s.isLowPerforming && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">Needs Help</span>}
                  {!s.isInactive && !s.isLowPerforming && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">On Track</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

export function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    title: '',
    message: '',
    notificationType: 'announcement',
    audienceType: 'all',
    deepLink: '/dashboard',
  });

  const load = async () => {
    const res = await adminApi.listNotifications();
    setItems(res.items || []);
  };
  useEffect(() => {
    load();
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    const sent = await adminApi.sendNotification(form);
    setForm({ ...form, title: '', message: '' });
    setMsg(`Notification broadcast to ${sent.recipientCount} student(s).`);
    load();
  };

  return (
    <AdminLayout
      title="Notification Broadcast Center"
      subtitle="Deliver instant in-app alerts to All Students, AP SSC, or Telangana SSC with live delivery and read tracking."
    >
      {msg && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-semibold text-emerald-700">{msg}</div>}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <form onSubmit={handleSend} className="card-panel p-5 space-y-3 h-fit">
          <h3 className="text-sm font-bold">Compose Notification</h3>
          <div>
            <label className="field-label">Title</label>
            <input className="field-input" required placeholder="e.g. New Trigonometry Video Published!" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Message</label>
            <textarea className="field-input" required rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label">Category</label>
              <select className="field-input" value={form.notificationType} onChange={(e) => setForm({ ...form, notificationType: e.target.value })}>
                <option value="new_video">New Video</option>
                <option value="new_notes">New Notes</option>
                <option value="new_chapter">New Chapter</option>
                <option value="new_quiz">New Quiz</option>
                <option value="upcoming_exam">Upcoming Exam</option>
                <option value="result_published">Result Published</option>
                <option value="announcement">Announcement</option>
                <option value="subscription_expiry">Subscription Expiry</option>
              </select>
            </div>
            <div>
              <label className="field-label">Target Audience</label>
              <select className="field-input" value={form.audienceType} onChange={(e) => setForm({ ...form, audienceType: e.target.value })}>
                <option value="all">All Students</option>
                <option value="board_ap">AP SSC Only</option>
                <option value="board_ts">Telangana SSC Only</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary w-full"><Send className="w-4 h-4" /> Send Notification</button>
        </form>

        <div className="xl:col-span-2 card-panel p-5 space-y-3">
          <h3 className="text-sm font-bold">Broadcast History ({items.length})</h3>
          {items.map((n) => (
            <div key={n.id} className="p-3.5 rounded-xl border border-slate-200/80 flex justify-between gap-3">
              <div>
                <div className="font-bold text-sm">{n.title}</div>
                <div className="text-xs text-slate-600 mt-0.5">{n.message}</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Audience: {n.audience_type} • {new Date(n.sent_at).toLocaleString('en-IN')}
                </div>
              </div>
              <div className="text-right text-xs shrink-0">
                <div className="font-bold text-emerald-700">{n.deliveredCount} Delivered</div>
                <div className="text-slate-500">{n.readCount} Read</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}

export function SubscriptionsPage() {
  const [data, setData] = useState({ plans: [], subscriptions: [], payments: [] });
  const [students, setStudents] = useState([]);
  const [msg, setMsg] = useState('');
  const [planForm, setPlanForm] = useState({ code: '', name: '', description: '', priceRupees: 499, durationDays: 365 });
  const [assignForm, setAssignForm] = useState({ studentId: '', planId: '', extendDays: 365 });

  const load = async () => {
    const [sData, stRes] = await Promise.all([adminApi.getSubscriptions(), adminApi.listStudents()]);
    setData(sData);
    setStudents(stRes.items || []);
    if (!assignForm.planId && sData.plans?.[0]) setAssignForm((f) => ({ ...f, planId: sData.plans[0].id }));
    if (!assignForm.studentId && stRes.items?.[0]) setAssignForm((f) => ({ ...f, studentId: stRes.items[0].id }));
  };
  useEffect(() => {
    load();
  }, []);

  const handleCreatePlan = async (e) => {
    e.preventDefault();
    await adminApi.createPlan(planForm);
    setPlanForm({ code: '', name: '', description: '', priceRupees: 499, durationDays: 365 });
    setMsg('Subscription plan saved dynamically — mobile app fetches live pricing.');
    load();
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    await adminApi.assignSubscription(assignForm);
    setMsg('Student subscription updated & audited.');
    load();
  };

  return (
    <AdminLayout
      title="Subscriptions & Dynamic Pricing"
      subtitle="Manage Class 10 plan pricing, validity, student entitlements and verified Razorpay transaction logs."
    >
      {msg && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-semibold text-emerald-700">{msg}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <form onSubmit={handleCreatePlan} className="card-panel p-5 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-1.5"><Crown className="w-4 h-4 text-amber-500" /> Create Subscription Plan</h3>
          <div className="grid grid-cols-2 gap-2">
            <input className="field-input" required placeholder="Code (e.g. CLASS10_HALF)" value={planForm.code} onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })} />
            <input className="field-input" required placeholder="Plan Name" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
            <input type="number" className="field-input" placeholder="Price (₹)" value={planForm.priceRupees} onChange={(e) => setPlanForm({ ...planForm, priceRupees: Number(e.target.value) })} />
            <input type="number" className="field-input" placeholder="Validity (Days)" value={planForm.durationDays} onChange={(e) => setPlanForm({ ...planForm, durationDays: Number(e.target.value) })} />
          </div>
          <button type="submit" className="btn-primary text-xs"><Plus className="w-4 h-4" /> Create Plan</button>
        </form>

        <form onSubmit={handleAssign} className="card-panel p-5 space-y-3">
          <h3 className="text-sm font-bold">Assign / Extend Student Subscription</h3>
          <div className="grid grid-cols-2 gap-2">
            <select className="field-input" value={assignForm.studentId} onChange={(e) => setAssignForm({ ...assignForm, studentId: e.target.value })}>
              {students.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.board})</option>)}
            </select>
            <select className="field-input" value={assignForm.planId} onChange={(e) => setAssignForm({ ...assignForm, planId: e.target.value })}>
              {data.plans.map((p) => <option key={p.id} value={p.id}>{p.name} (₹{p.priceRupees})</option>)}
            </select>
          </div>
          <input type="number" className="field-input" placeholder="Extend Days" value={assignForm.extendDays} onChange={(e) => setAssignForm({ ...assignForm, extendDays: Number(e.target.value) })} />
          <button type="submit" className="btn-primary text-xs">Activate / Extend Access</button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card-panel p-5 space-y-2.5">
          <h3 className="text-sm font-bold">Plans ({data.plans.length})</h3>
          {data.plans.map((p) => (
            <div key={p.id} className="flex justify-between items-center p-3 rounded-xl border border-slate-200/80 text-xs">
              <div>
                <div className="font-bold text-sm">{p.name} — ₹{p.priceRupees} / {p.duration_days}d</div>
                <div className="text-slate-500 font-mono">{p.code}</div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const nextPrice = window.prompt('Update price in ₹ (no APK rebuild needed!):', String(p.priceRupees));
                  if (nextPrice && Number(nextPrice) > 0) {
                    await adminApi.updatePlan(p.id, { priceRupees: Number(nextPrice) });
                    load();
                  }
                }}
                className="btn-secondary text-xs py-1 px-2.5"
              >
                Edit ₹
              </button>
            </div>
          ))}
        </div>

        <div className="card-panel p-5 space-y-2.5">
          <h3 className="text-sm font-bold">Payment Ledger ({data.payments.length})</h3>
          {data.payments.map((tx) => (
            <div key={tx.id} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 text-xs">
              <div>
                <div className="font-bold">{tx.studentName} — ₹{tx.amountRupees}</div>
                <div className="text-slate-500 font-mono">{tx.razorpay_order_id}</div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">{tx.status}</span>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
