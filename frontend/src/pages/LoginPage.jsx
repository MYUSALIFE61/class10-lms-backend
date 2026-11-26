import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Phone,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export function LoginPage() {
  const { login, register, sessionAlert, clearSessionAlert } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('login'); // login | register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [board, setBoard] = useState('AP');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [infoNotice, setInfoNotice] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfoNotice(null);
    clearSessionAlert();
    setLoading(true);
    try {
      if (mode === 'login') {
        await login({ email: email.trim(), password });
      } else {
        await register({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          phone: phone.trim(),
          board,
        });
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(180deg, #ddeeff 0%, #f5f9ff 38%, #edf4ff 100%)',
        padding: '22px 18px 28px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Top Illustration (Books + Trophy + Target — Exact Screen 2 Match) */}
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <img
            src="/illustrations/login-books-trophy.jpg"
            alt="Books and trophy illustration"
            style={{
              width: 196,
              height: 132,
              objectFit: 'contain',
              mixBlendMode: 'multiply',
              marginBottom: 4,
            }}
          />
          <h1
            style={{
              margin: '0 0 4px',
              fontSize: '1.6rem',
              fontWeight: 800,
              color: '#0f214d',
              letterSpacing: '-0.02em',
            }}
          >
            {mode === 'login' ? 'Welcome Back!' : 'Create Account'}
          </h1>
          <div style={{ fontSize: '0.9rem', color: '#526586', fontWeight: 500 }}>
            {mode === 'login'
              ? 'Continue your learning journey'
              : 'Start your Class 10 AP & TS SSC preparation'}
          </div>
        </div>

        {sessionAlert && (
          <div
            role="alert"
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              padding: '10px 12px',
              borderRadius: 12,
              fontSize: '0.84rem',
              marginBottom: 12,
              display: 'flex',
              gap: 8,
            }}
          >
            <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{sessionAlert}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '10px 14px',
              borderRadius: 12,
              fontSize: '0.85rem',
              marginBottom: 12,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {infoNotice && (
          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1e40af',
              padding: '9px 12px',
              borderRadius: 12,
              fontSize: '0.8rem',
              marginBottom: 12,
              fontWeight: 600,
            }}
          >
            {infoNotice}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <div className="pill-input-wrap">
                <User size={18} color="#1e64f0" />
                <label className="sr-only" htmlFor="fullName">
                  Student Full Name
                </label>
                <input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter Full Name"
                  required
                  minLength={2}
                />
              </div>

              <div className="pill-input-wrap">
                <Phone size={18} color="#10b981" />
                <label className="sr-only" htmlFor="phone">
                  Mobile Number
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit Mobile Number (Optional)"
                />
              </div>

              <div className="input-group" style={{ marginBottom: 12 }}>
                <label className="sr-only" htmlFor="board">
                  State Board Syllabus
                </label>
                <select
                  id="board"
                  className="input-field"
                  value={board}
                  onChange={(e) => setBoard(e.target.value)}
                >
                  <option value="AP">Andhra Pradesh SSC (AP Class 10)</option>
                  <option value="TS">Telangana SSC (TS Class 10)</option>
                </select>
              </div>
            </>
          )}

          <div className="pill-input-wrap">
            <User size={18} color="#1e40af" />
            <label className="sr-only" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter Email / Registration ID"
              required
            />
          </div>

          <div className="pill-input-wrap">
            <Lock size={18} color="#1e40af" />
            <label className="sr-only" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Create Password (min 8 chars)' : 'Enter Password'}
              required
              minLength={mode === 'register' ? 8 : 1}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Hide secret' : 'Toggle visibility'}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                display: 'inline-flex',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {mode === 'login' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                margin: '4px 4px 16px',
                fontSize: '0.82rem',
              }}
            >
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  color: '#334155',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ accentColor: '#1152d4', width: 16, height: 16 }}
                />
                Remember Me
              </label>
              <button
                type="button"
                onClick={() =>
                  setInfoNotice('To reset your password, contact your school administrator or support@class10lms.in.')
                }
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#1152d4',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                }}
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={loading}
            aria-label={mode === 'login' ? 'Sign In Securely' : 'Create Student Account'}
            style={{ minHeight: 50, fontSize: '1rem' }}
          >
            {loading ? (
              'Please wait...'
            ) : mode === 'login' ? (
              <>
                <span>Login</span>
                <ArrowRight size={19} />
              </>
            ) : (
              <>
                <span>Register Now</span>
                <ArrowRight size={19} />
              </>
            )}
          </button>
        </form>

        {/* OR Divider + Quick Secondary Auth Buttons (Exact Screen 2 Match) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            margin: '16px 0 14px',
            color: '#64748b',
            fontSize: '0.78rem',
            fontWeight: 700,
          }}
        >
          <span style={{ flex: 1, height: 1, background: '#d5e2f8' }} />
          <span>OR</span>
          <span style={{ flex: 1, height: 1, background: '#d5e2f8' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
          <button
            type="button"
            className="btn btn-outline"
            style={{ minHeight: 44, padding: '8px 12px', fontSize: '0.84rem', color: '#0f214d' }}
            onClick={() =>
              setInfoNotice('Please sign in with your registered Class 10 LMS student email and password above.')
            }
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            </svg>
            <span>Google</span>
          </button>

          <button
            type="button"
            className="btn btn-outline"
            style={{ minHeight: 44, padding: '8px 10px', fontSize: '0.8rem', color: '#0f214d' }}
            onClick={() => {
              setMode('register');
              setInfoNotice('Enter your mobile number & email to register your student account.');
            }}
          >
            <Phone size={15} color="#10b981" />
            <span>Continue with Phone</span>
          </button>
        </div>

        <div style={{ textAlign: 'center', fontSize: '0.84rem', color: '#526586', fontWeight: 600 }}>
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#1152d4',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                }}
              >
                Register Now
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#1152d4',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                }}
              >
                Login Now
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
