import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  Smartphone,
  Trash2,
  Save,
  Settings,
  BookOpen,
  Award,
  FileBarChart2,
  Bell,
  HelpCircle,
  Info,
  ChevronRight,
  Crown,
  Download,
} from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { ErrorState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { lmsApi } from '../services/lmsApi.js';

export function ProfileSettingsPage() {
  const { user, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [showEditor, setShowEditor] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [board, setBoard] = useState(user?.board || 'AP');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);
  const [infoToast, setInfoToast] = useState(null);

  const [devices, setDevices] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [error, setError] = useState(null);

  const loadDevices = async () => {
    setLoadingDevices(true);
    setError(null);
    try {
      const data = await lmsApi.listDevices();
      setDevices(data.devices || []);
      setCurrentDeviceId(data.currentDeviceId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    setError(null);
    try {
      await lmsApi.updateProfile({ fullName, phone: phone || undefined, board });
      await refreshProfile();
      setSavedMsg('Profile updated successfully.');
      setShowEditor(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeDevice = async (deviceId) => {
    try {
      await lmsApi.revokeDevice(deviceId);
      if (deviceId === currentDeviceId) {
        await logout();
        return;
      }
      await loadDevices();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <AppLayout
      title="Profile"
      showBack
      rightAction={
        <button
          type="button"
          className="icon-btn ghost"
          aria-label="Edit profile settings"
          onClick={() => setShowEditor((s) => !s)}
        >
          <Settings size={20} />
        </button>
      }
    >
      {error && <ErrorState message={error} onRetry={loadDevices} />}

      {/* Profile Hero Row (Exact Screen 8 Match) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '6px 4px 18px',
        }}
      >
        <div
          style={{
            width: 82,
            height: 82,
            borderRadius: '50%',
            border: '3px solid #ffffff',
            boxShadow: '0 6px 18px rgba(17, 82, 212, 0.16)',
            overflow: 'hidden',
            background: '#dbeafe',
            flexShrink: 0,
          }}
        >
          <img
            src="/illustrations/student-hero.jpg"
            alt={user?.fullName || 'Student'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
          />
        </div>

        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800, color: 'var(--text)' }}>
            {user?.fullName || 'Class 10 Student'}
          </h2>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: 2, marginBottom: 10 }}>
            Class 10 Student &bull; {user?.board || 'AP'} SSC ({user?.studentCode || ''})
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 34, padding: '5px 18px', fontSize: '0.8rem' }}
            onClick={() => setShowEditor((s) => !s)}
          >
            {showEditor ? 'Close Editor' : 'Edit Profile'}
          </button>
        </div>
      </div>

      {savedMsg && (
        <div
          style={{
            background: '#e6f9f1',
            color: '#047857',
            borderRadius: 12,
            padding: '8px 12px',
            fontWeight: 700,
            fontSize: '0.82rem',
            marginBottom: 12,
          }}
        >
          {savedMsg}
        </div>
      )}

      {infoToast && (
        <div
          style={{
            background: '#e8f1ff',
            color: '#1152d4',
            borderRadius: 12,
            padding: '9px 12px',
            fontWeight: 600,
            fontSize: '0.82rem',
            marginBottom: 12,
          }}
        >
          {infoToast}
        </div>
      )}

      {showEditor && (
        <form className="card" onSubmit={handleSaveProfile}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.96rem' }}>Edit Student Details</h3>
          <div className="input-group">
            <label className="input-label" htmlFor="p-name">Full Name</label>
            <input
              id="p-name"
              className="input-field"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="p-board">Class 10 Board</label>
            <select
              id="p-board"
              className="input-field"
              value={board}
              onChange={(e) => setBoard(e.target.value)}
            >
              <option value="AP">Andhra Pradesh SSC (AP)</option>
              <option value="TS">Telangana SSC (TS)</option>
            </select>
          </div>
          <div className="input-group">
            <label className="input-label" htmlFor="p-phone">Phone Number</label>
            <input
              id="p-phone"
              className="input-field"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit number"
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      )}

      {/* Clean White Menu Card (Exact Screen 8 Rows) */}
      <div className="card" style={{ padding: '4px 0' }}>
        <button type="button" className="profile-menu-row" onClick={() => navigate('/downloads')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Download size={19} color="#1e64f0" /> My Downloads (Offline Videos)
          </span>
          <ChevronRight size={17} color="#64748b" />
        </button>

        <button type="button" className="profile-menu-row" onClick={() => navigate('/courses')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <BookOpen size={19} color="#1e64f0" /> My Courses
          </span>
          <ChevronRight size={17} color="#64748b" />
        </button>

        <button
          type="button"
          className="profile-menu-row"
          onClick={() => navigate('/progress')}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Award size={19} color="#1e64f0" /> My Certificates
          </span>
          <ChevronRight size={17} color="#64748b" />
        </button>

        <button type="button" className="profile-menu-row" onClick={() => navigate('/progress')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <FileBarChart2 size={19} color="#1e64f0" /> My Results
          </span>
          <ChevronRight size={17} color="#64748b" />
        </button>

        <button
          type="button"
          className="profile-menu-row"
          onClick={async () => {
            try {
              const res = await lmsApi.getStudentNotifications();
              const latest = (res.items || [])[0];
              if (latest) {
                await lmsApi.markNotificationRead(latest.id).catch(() => {});
                setInfoToast(`${latest.title}: ${latest.message} (${res.items.length} total)`);
              } else {
                setInfoToast('No new notifications right now.');
              }
            } catch {
              setInfoToast('Unable to load notifications.');
            }
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Bell size={19} color="#1e64f0" /> Notifications
          </span>
          <ChevronRight size={17} color="#64748b" />
        </button>

        <button type="button" className="profile-menu-row" onClick={() => navigate('/subscription')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Crown size={19} color="#f59e0b" /> Class 10 Subscription Plan
          </span>
          <ChevronRight size={17} color="#64748b" />
        </button>

        <button
          type="button"
          className="profile-menu-row"
          onClick={() => setShowEditor((s) => !s)}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Settings size={19} color="#1e64f0" /> Settings
          </span>
          <ChevronRight size={17} color="#64748b" />
        </button>

        <button
          type="button"
          className="profile-menu-row"
          onClick={() => setInfoToast('Support Email: support@class10lms.in • AP & Telangana Class 10 SSC Help Desk')}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <HelpCircle size={19} color="#1e64f0" /> Help &amp; Support
          </span>
          <ChevronRight size={17} color="#64748b" />
        </button>

        <button
          type="button"
          className="profile-menu-row"
          onClick={() => setInfoToast('10th Class Learning Hub v1.0.0 • Protected Own Media3 LMS Player')}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Info size={19} color="#1e64f0" /> About App
          </span>
          <ChevronRight size={17} color="#64748b" />
        </button>
      </div>

      {/* Registered Devices Security Panel */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Smartphone size={18} color="#1e64f0" />
          <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800 }}>Registered Devices</h3>
        </div>
        {loadingDevices ? (
          <LoadingSkeleton rows={1} />
        ) : (
          devices.map((d) => (
            <div
              key={d.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 12px',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>
                  {d.deviceName}{' '}
                  {d.id === currentDeviceId && <span className="badge badge-blue">This Device</span>}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {d.platform.toUpperCase()} {d.osVersion || ''} &bull;{' '}
                  {d.isActive ? 'Active' : 'Revoked'}
                </div>
              </div>
              {d.isActive && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => handleRevokeDevice(d.id)}
                  style={{ minHeight: 34, padding: '4px 10px', fontSize: '0.76rem', color: 'var(--danger)' }}
                >
                  <Trash2 size={14} /> Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Exact Screen 8 Soft-Red Logout Pill Button */}
      <button
        type="button"
        className="btn btn-soft-danger btn-block"
        aria-label="Sign Out of This Device"
        onClick={() => logout({ allDevices: false })}
        style={{ minHeight: 48, fontSize: '0.96rem', marginBottom: 8 }}
      >
        <LogOut size={18} />
        <span>Logout</span>
      </button>
    </AppLayout>
  );
}
