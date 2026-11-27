import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export function LoginPage() {
  const { login, sessionAlert, clearSessionAlert } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state || {};

  const [email, setEmail] = useState(navState.email || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [infoNotice, setInfoNotice] = useState(
    navState.fromPaymentSuccess
      ? 'Payment verified! Sign in with your student credentials to access your Class 10 dashboard.'
      : null
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfoNotice(null);
    clearSessionAlert();
    setLoading(true);
    try {
      const res = await login({ email: email.trim(), password });
      const sub = res?.subscription;
      if (sub?.isActive) {
        navigate('/dashboard', { replace: true });
      } else if (sub?.status === 'expired') {
        navigate('/renewal', { replace: true });
      } else {
        navigate('/subscription', { replace: true });
      }
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
        <div style={{ marginBottom: 8 }}>
          <Link
            to="/welcome"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: '#1152d4',
              fontWeight: 700,
              fontSize: '0.84rem',
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={16} />
            <span>Welcome Screen</span>
          </Link>
        </div>

        {/* Top Illustration */}
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
            Welcome Back!
          </h1>
          <div style={{ fontSize: '0.9rem', color: '#526586', fontWeight: 500 }}>
            Continue your Class 10 AP &amp; TS SSC learning journey
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
          <div className="pill-input-wrap">
            <User size={18} color="#1e40af" />
            <label className="sr-only" htmlFor="email">
              Email Address or Username
            </label>
            <input
              id="email"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter Email or Username"
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Password"
              required
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
                setInfoNotice(
                  'To reset your password, contact your school administrator or support@class10lms.in.'
                )
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

          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={loading}
            aria-label="Sign In Securely"
            style={{ minHeight: 50, fontSize: '1rem' }}
          >
            {loading ? (
              'Please wait...'
            ) : (
              <>
                <span>Login</span>
                <ArrowRight size={19} />
              </>
            )}
          </button>
        </form>

        <div
          style={{
            textAlign: 'center',
            fontSize: '0.86rem',
            color: '#526586',
            fontWeight: 600,
            marginTop: 18,
          }}
        >
          New student?{' '}
          <Link to="/signup" style={{ color: '#1152d4', fontWeight: 800, textDecoration: 'none' }}>
            Create Account
          </Link>
        </div>

        <div className="welcome-legal-links" style={{ marginTop: 14, justifyContent: 'center' }}>
          <Link to="/terms">Terms &amp; Conditions</Link>
          <span aria-hidden="true">&bull;</span>
          <Link to="/privacy">Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}
