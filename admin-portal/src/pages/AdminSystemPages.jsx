import React, { useEffect, useState } from 'react';
import { Save, Plus, ShieldCheck, ShieldAlert, Lock, RefreshCw } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout.jsx';
import { adminApi } from '../services/adminApi.js';

const DEFAULT_VIDEO_SECURITY = {
  protectedPlaybackEnabled: true,
  screenshotProtection: true,
  screenRecordingWarning: true,
  screenSharingProtection: true,
  studentWatermarkEnabled: true,
  securityEventLogging: true,
  warningHeading: 'SCREEN RECORDING DETECTED!',
  warningMessage:
    'For the protection of educational content, video playback has been temporarily paused.\n\nPlease stop screen recording or screen sharing to continue watching your lesson.',
  securityPolicy: 'strict',
};

export function AppConfigPage() {
  const [config, setConfig] = useState(null);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [msg, setMsg] = useState('');

  const loadSecurityEvents = () => {
    adminApi
      .listSecurityEvents({ limit: 40 })
      .then((res) => setSecurityEvents(res.items || []))
      .catch(() => setSecurityEvents([]));
  };

  useEffect(() => {
    adminApi.getSettings().then((cfg) =>
      setConfig({
        ...cfg,
        videoSecurity: { ...DEFAULT_VIDEO_SECURITY, ...(cfg.videoSecurity || {}) },
      })
    );
    loadSecurityEvents();
  }, []);

  const updateVideoSecurity = (patch) => {
    setConfig((prev) => ({
      ...prev,
      videoSecurity: {
        ...DEFAULT_VIDEO_SECURITY,
        ...(prev?.videoSecurity || {}),
        ...patch,
      },
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const updated = await adminApi.updateSettings(config);
    setConfig({
      ...updated,
      videoSecurity: { ...DEFAULT_VIDEO_SECURITY, ...(updated.videoSecurity || {}) },
    });
    setMsg(
      'App & Video Security configuration saved! Mandatory native Android FLAG_SECURE and screen recording protection remain enforced.'
    );
  };

  if (!config) return <AdminLayout title="App Configuration"><div className="text-sm text-slate-400">Loading...</div></AdminLayout>;

  const vs = config.videoSecurity || DEFAULT_VIDEO_SECURITY;
  const floorLocked = vs.protectedPlaybackEnabled !== false;

  return (
    <AdminLayout
      title="Dynamic Mobile App & Video Security Configuration"
      subtitle="Control the Student Android APK home settings, native Android screen capture protection policy, watermark, and security event telemetry."
    >
      {msg && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-semibold text-emerald-700">{msg}</div>}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* General Mobile App Config */}
          <div className="card-panel p-6 space-y-4">
            <h3 className="text-sm font-extrabold text-[#172554]">General Mobile App Settings</h3>
            <div>
              <label className="field-label">Home Banner Title</label>
              <input className="field-input" value={config.homeBannerTitle || ''} onChange={(e) => setConfig({ ...config, homeBannerTitle: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Welcome Subtitle</label>
              <input className="field-input" value={config.homeBannerSubtitle || ''} onChange={(e) => setConfig({ ...config, homeBannerSubtitle: e.target.value })} />
            </div>
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100 space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-[#155EEF]">
                <input type="checkbox" checked={Boolean(config.announcementEnabled)} onChange={(e) => setConfig({ ...config, announcementEnabled: e.target.checked })} />
                Show Live Announcement Banner on Student Home
              </label>
              <input className="field-input" placeholder="Announcement message..." value={config.announcementText || ''} onChange={(e) => setConfig({ ...config, announcementText: e.target.value })} />
            </div>
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-amber-800">
                <input type="checkbox" checked={Boolean(config.maintenanceMode)} onChange={(e) => setConfig({ ...config, maintenanceMode: e.target.checked })} />
                Enable Maintenance Notice Banner
              </label>
              <input className="field-input" value={config.maintenanceMessage || ''} onChange={(e) => setConfig({ ...config, maintenanceMessage: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Min Android App Version</label>
                <input className="field-input" value={config.minAndroidVersion || '1.0.0'} onChange={(e) => setConfig({ ...config, minAndroidVersion: e.target.value })} />
              </div>
              <div>
                <label className="field-label">Latest Android App Version</label>
                <input className="field-input" value={config.latestAndroidVersion || '1.1.0'} onChange={(e) => setConfig({ ...config, latestAndroidVersion: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Phase 10: Video Security Settings */}
          <div className="card-panel p-6 space-y-4 border-blue-200/80">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-[#172554] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#155EEF]" />
                Video Security Settings (Native Android Protection)
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                <Lock className="w-3 h-3" /> Mandatory Floor Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#F5F8FF] border border-blue-100 font-semibold">
                <span>Protected Playback</span>
                <input
                  type="checkbox"
                  checked={vs.protectedPlaybackEnabled !== false}
                  onChange={(e) => updateVideoSecurity({ protectedPlaybackEnabled: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 font-semibold">
                <span>
                  Screenshot Protection (FLAG_SECURE)
                  {floorLocked && <span className="block text-[10px] text-emerald-700">Locked ON by native floor</span>}
                </span>
                <input type="checkbox" checked={floorLocked ? true : Boolean(vs.screenshotProtection)} disabled={floorLocked} onChange={(e) => updateVideoSecurity({ screenshotProtection: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 font-semibold">
                <span>
                  Screen Recording Warning (API 35+)
                  {floorLocked && <span className="block text-[10px] text-emerald-700">Locked ON by native floor</span>}
                </span>
                <input type="checkbox" checked={floorLocked ? true : Boolean(vs.screenRecordingWarning)} disabled={floorLocked} onChange={(e) => updateVideoSecurity({ screenRecordingWarning: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#F5F8FF] border border-blue-100 font-semibold">
                <span>Screen Sharing / Cast Guard</span>
                <input
                  type="checkbox"
                  checked={vs.screenSharingProtection !== false}
                  onChange={(e) => updateVideoSecurity({ screenSharingProtection: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#F5F8FF] border border-blue-100 font-semibold">
                <span>Dynamic Student Watermark</span>
                <input
                  type="checkbox"
                  checked={vs.studentWatermarkEnabled !== false}
                  onChange={(e) => updateVideoSecurity({ studentWatermarkEnabled: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#F5F8FF] border border-blue-100 font-semibold">
                <span>Security Event Logging</span>
                <input
                  type="checkbox"
                  checked={vs.securityEventLogging !== false}
                  onChange={(e) => updateVideoSecurity({ securityEventLogging: e.target.checked })}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">Security Policy</label>
                <select
                  className="field-input"
                  value={vs.securityPolicy || 'strict'}
                  onChange={(e) => updateVideoSecurity({ securityPolicy: e.target.value })}
                >
                  <option value="strict">Strict (Pause + Overlay + Manual Resume)</option>
                  <option value="standard">Standard (FLAG_SECURE + Warning Overlay)</option>
                </select>
              </div>
              <div>
                <label className="field-label">Overlay Warning Heading</label>
                <input
                  className="field-input"
                  value={vs.warningHeading || ''}
                  onChange={(e) => updateVideoSecurity({ warningHeading: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="field-label">Overlay Warning Message</label>
              <textarea
                rows={3}
                className="field-input"
                value={vs.warningMessage || ''}
                onChange={(e) => updateVideoSecurity({ warningMessage: e.target.value })}
              />
            </div>

            {/* Live Native Android Overlay Preview */}
            <div className="rounded-xl bg-[#070F22] border border-[#243B6B] p-4 text-center space-y-2">
              <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-yellow-400/15 text-yellow-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="text-xs font-extrabold tracking-wide text-white uppercase">
                {vs.warningHeading || DEFAULT_VIDEO_SECURITY.warningHeading}
              </div>
              <p className="text-[11px] text-slate-300 whitespace-pre-line max-w-md mx-auto">
                {vs.warningMessage || DEFAULT_VIDEO_SECURITY.warningMessage}
              </p>
              <span className="inline-block rounded-full bg-orange-500/20 border border-orange-500 px-3 py-0.5 text-[10px] font-bold text-orange-300">
                ● Screen Recording Active — Playback Locked
              </span>
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary">
          <Save className="w-4 h-4" /> Save Dynamic Configuration &amp; Video Security Policy
        </button>
      </form>

      {/* Live Video Security Event Telemetry Table */}
      <div className="card-panel overflow-hidden mt-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-extrabold text-[#172554]">Recent Video Security Events</h3>
            <p className="text-xs text-slate-500">Rate-limited screen recording &amp; screen sharing protection telemetry reported by native Android players.</p>
          </div>
          <button type="button" onClick={loadSecurityEvents} className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F5F8FF] text-slate-500 uppercase text-[11px]">
              <tr>
                <th className="px-4 py-3 text-left">Timestamp</th>
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Event Type</th>
                <th className="px-4 py-3 text-left">Lesson</th>
                <th className="px-4 py-3 text-left">Android API</th>
                <th className="px-4 py-3 text-left">Protection Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {securityEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    No video security capture events logged yet.
                  </td>
                </tr>
              ) : (
                securityEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                      {new Date(ev.eventTimestamp || ev.createdAt).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-2.5 font-semibold">
                      {ev.studentName} <span className="text-slate-400 font-normal">({ev.studentEmail})</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          ev.severity === 'high'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {ev.eventType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{ev.lessonTitle || ev.lessonId || '—'}</td>
                    <td className="px-4 py-2.5 font-mono">{ev.androidApiLevel ? `API ${ev.androidApiLevel}` : '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{ev.protectionAction || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

export function AdminUsersPage() {
  const [admins, setAdmins] = useState([]);
  const [roles, setRoles] = useState([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', roleCode: 'content_manager' });

  const load = async () => {
    const res = await adminApi.listAdmins();
    setAdmins(res.items || []);
    setRoles(res.roles || []);
  };
  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await adminApi.createAdmin(form);
    setForm({ fullName: '', email: '', password: '', roleCode: 'content_manager' });
    setMsg('Admin user created with backend-enforced RBAC role.');
    load();
  };

  return (
    <AdminLayout
      title="Admin Users & Role-Based Access Control (8 Roles)"
      subtitle="Permissions are enforced strictly on backend API middleware, never solely on the frontend."
    >
      {msg && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-semibold text-emerald-700">{msg}</div>}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <form onSubmit={handleCreate} className="card-panel p-5 space-y-3 h-fit">
          <h3 className="text-sm font-bold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-[#155EEF]" /> Create Admin User</h3>
          <input className="field-input" required placeholder="Full Name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input type="email" className="field-input" required placeholder="admin.staff@class10lms.in" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input type="password" className="field-input" required placeholder="Strong Password (8+ chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select className="field-input" value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>
            {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
          <button type="submit" className="btn-primary w-full"><Plus className="w-4 h-4" /> Create Administrator</button>
        </form>

        <div className="xl:col-span-2 space-y-5">
          <div className="card-panel p-5 space-y-2.5">
            <h3 className="text-sm font-bold">Administrators ({admins.length})</h3>
            {admins.map((a) => (
              <div key={a.id} className="flex justify-between items-center p-3 rounded-xl border border-slate-200/80 text-xs">
                <div>
                  <div className="font-bold text-sm">{a.fullName} <span className="text-[#155EEF]">({a.roleName})</span></div>
                  <div className="text-slate-500">{a.email}</div>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full font-bold ${a.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {a.isActive ? 'Active' : 'Disabled'}
                </span>
              </div>
            ))}
          </div>

          <div className="card-panel p-5">
            <h3 className="text-sm font-bold mb-3">RBAC Role Permission Matrix</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {roles.map((r) => (
                <div key={r.code} className="p-3 rounded-xl bg-[#F5F8FF] border border-blue-100">
                  <div className="font-bold text-[#172554]">{r.name}</div>
                  <div className="text-slate-500 mt-0.5">{r.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    adminApi.listAuditLogs({ limit: 150 }).then((r) => setLogs(r.items || []));
  }, []);

  return (
    <AdminLayout title="Immutable Admin Audit Logs" subtitle="Every content publish, student change, exam edit, and role update is recorded with actor & timestamp.">
      <div className="card-panel overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[#F5F8FF] text-slate-500 uppercase text-[11px]">
            <tr>
              <th className="px-4 py-3 text-left">Timestamp</th>
              <th className="px-4 py-3 text-left">Admin</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{new Date(l.created_at).toLocaleString('en-IN')}</td>
                <td className="px-4 py-2.5 font-semibold">{l.admin_email} <span className="text-slate-400">({l.admin_role})</span></td>
                <td className="px-4 py-2.5 font-mono text-[#155EEF]">{l.action}</td>
                <td className="px-4 py-2.5">{l.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
