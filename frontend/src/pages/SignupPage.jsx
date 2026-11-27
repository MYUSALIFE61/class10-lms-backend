import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Mail,
  MapPin,
  Phone,
  School,
  User,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { lmsApi } from '../services/lmsApi.js';

const INDIAN_STATES = [
  'Andhra Pradesh',
  'Telangana',
  'Karnataka',
  'Tamil Nadu',
  'Odisha',
  'Maharashtra',
  'Other',
];

const AP_TS_DISTRICTS = [
  'Visakhapatnam',
  'Vijayawada (NTR)',
  'Guntur',
  'Tirupati',
  'Kurnool',
  'Anantapur',
  'Nellore',
  'Kakinada',
  'Rajahmundry (East Godavari)',
  'Hyderabad',
  'Rangareddy',
  'Medchal-Malkajgiri',
  'Warangal',
  'Karimnagar',
  'Nizamabad',
  'Khammam',
  'Nalgonda',
  'Mahabubnagar',
];

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{4,32}$/;

function evaluatePasswordRules(password) {
  return {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasDigit: /\d/.test(password),
  };
}

export function SignupPage() {
  const { register, clearSessionAlert } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [board, setBoard] = useState('AP');
  const [stateName, setStateName] = useState('Andhra Pradesh');
  const [stateTouched, setStateTouched] = useState(false);
  const [district, setDistrict] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [className, setClassName] = useState('Class 10');
  const [agreedTerms, setAgreedTerms] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [usernameStatus, setUsernameStatus] = useState({
    state: 'idle', // idle | checking | available | taken | invalid
    message: '',
  });

  useEffect(() => {
    if (!stateTouched) {
      setStateName(board === 'TS' ? 'Telangana' : 'Andhra Pradesh');
    }
  }, [board, stateTouched]);

  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameStatus({ state: 'idle', message: '' });
      return undefined;
    }

    if (!USERNAME_PATTERN.test(trimmed)) {
      setUsernameStatus({
        state: 'invalid',
        message: 'Use 4-32 characters (letters, numbers, dot, underscore, hyphen).',
      });
      return undefined;
    }

    let cancelled = false;
    setUsernameStatus({ state: 'checking', message: 'Checking availability...' });

    const timer = setTimeout(async () => {
      try {
        const res = await lmsApi.checkUsername(trimmed);
        if (cancelled) return;
        if (res.available) {
          setUsernameStatus({ state: 'available', message: 'Username is available' });
        } else {
          setUsernameStatus({
            state: res.valid === false ? 'invalid' : 'taken',
            message: res.message || 'Username is already taken',
          });
        }
      } catch {
        if (!cancelled) {
          setUsernameStatus({ state: 'idle', message: '' });
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username]);

  const rules = evaluatePasswordRules(password);
  const isPasswordStrong =
    rules.minLength && rules.hasUpper && rules.hasLower && rules.hasDigit;
  const passwordsMatch = Boolean(confirmPassword) && password === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    clearSessionAlert();

    const trimmedName = fullName.trim();
    const trimmedPhone = phone.replace(/[\s\-]/g, '').trim();
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedDistrict = district.trim();
    const trimmedSchool = schoolName.trim();

    if (trimmedName.length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!/^[0-9+]{10,15}$/.test(trimmedPhone)) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      setError('Username must be 4-32 characters (letters, numbers, ., _, or -).');
      return;
    }
    if (usernameStatus.state === 'taken') {
      setError('That username is already taken. Please choose another username.');
      return;
    }
    if (!isPasswordStrong) {
      setError(
        'Password must be at least 8 characters and include uppercase, lowercase, and a number.'
      );
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }
    if (!trimmedDistrict || !trimmedSchool) {
      setError('Please enter your district and school name.');
      return;
    }
    if (!agreedTerms) {
      setError('Please accept the Terms & Conditions and Privacy Policy to continue.');
      return;
    }

    setSubmitting(true);
    try {
      await register({
        fullName: trimmedName,
        phone: trimmedPhone,
        email: trimmedEmail,
        username: trimmedUsername,
        password,
        confirmPassword,
        state: stateName,
        district: trimmedDistrict,
        schoolName: trimmedSchool,
        className: className.trim() || 'Class 10',
        board,
      });
      navigate('/subscription', {
        replace: true,
        state: { justRegistered: true },
      });
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your details.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="signup-page">
      <div className="signup-container">
        <div className="signup-top-row">
          <button
            type="button"
            className="icon-btn"
            style={{ background: '#ffffff', color: '#0f214d', boxShadow: 'var(--shadow-sm)' }}
            onClick={() => navigate('/welcome')}
            aria-label="Back to Welcome"
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--primary)' }}>
              STEP 1 OF 2
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              Student Registration
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: '1.55rem', fontWeight: 800, color: '#0f214d' }}>
            Create Student Account
          </h1>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#526586' }}>
            Complete your Class 10 student profile to choose your SSC learning plan.
          </p>
        </div>

        {error && (
          <div role="alert" className="auth-error-banner">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="signup-form-card" noValidate>
          <div className="signup-section-label">Personal &amp; Account Details</div>

          <div className="input-group">
            <label className="input-label" htmlFor="signup-fullName">
              Full Name
            </label>
            <div className="pill-input-wrap">
              <User size={18} color="#1e64f0" />
              <input
                id="signup-fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter student full name"
                autoComplete="name"
                required
              />
            </div>
          </div>

          <div className="signup-two-col">
            <div className="input-group">
              <label className="input-label" htmlFor="signup-phone">
                Mobile Number
              </label>
              <div className="pill-input-wrap">
                <Phone size={18} color="#10b981" />
                <input
                  id="signup-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  autoComplete="tel"
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="signup-email">
                Email Address
              </label>
              <div className="pill-input-wrap">
                <Mail size={18} color="#1e40af" />
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="signup-username">
              Username
            </label>
            <div className="pill-input-wrap" style={{ marginBottom: 4 }}>
              <AtSign size={18} color="#7c3aed" />
              <input
                id="signup-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose unique username (e.g. ravi.ssc10)"
                autoComplete="username"
                required
              />
              {usernameStatus.state === 'available' && <CheckCircle2 size={18} color="#10b981" />}
              {(usernameStatus.state === 'taken' || usernameStatus.state === 'invalid') && (
                <XCircle size={18} color="#dc2626" />
              )}
            </div>
            {usernameStatus.message && (
              <div
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  paddingLeft: 4,
                  color:
                    usernameStatus.state === 'available'
                      ? '#047857'
                      : usernameStatus.state === 'checking'
                        ? '#1e40af'
                        : '#b91c1c',
                }}
              >
                {usernameStatus.message}
              </div>
            )}
          </div>

          <div className="signup-section-label" style={{ marginTop: 18 }}>
            School &amp; State Board Information
          </div>

          <div className="signup-two-col">
            <div className="input-group">
              <label className="input-label" htmlFor="signup-board">
                Board
              </label>
              <select
                id="signup-board"
                className="input-field"
                value={board}
                onChange={(e) => setBoard(e.target.value)}
              >
                <option value="AP">Andhra Pradesh SSC (AP)</option>
                <option value="TS">Telangana SSC (TS)</option>
              </select>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="signup-className">
                Class
              </label>
              <div className="pill-input-wrap">
                <GraduationCap size={18} color="#1152d4" />
                <input
                  id="signup-className"
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="Class 10"
                  required
                />
              </div>
            </div>
          </div>

          <div className="signup-two-col">
            <div className="input-group">
              <label className="input-label" htmlFor="signup-state">
                State
              </label>
              <div className="pill-input-wrap">
                <MapPin size={18} color="#0ea5e9" />
                <select
                  id="signup-state"
                  value={stateName}
                  onChange={(e) => {
                    setStateTouched(true);
                    setStateName(e.target.value);
                  }}
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="signup-district">
                District
              </label>
              <div className="pill-input-wrap">
                <Building2 size={18} color="#0284c7" />
                <input
                  id="signup-district"
                  type="text"
                  list="ap-ts-districts-list"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Enter your district"
                  required
                />
                <datalist id="ap-ts-districts-list">
                  {AP_TS_DISTRICTS.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="signup-schoolName">
              School Name
            </label>
            <div className="pill-input-wrap">
              <School size={18} color="#1152d4" />
              <input
                id="signup-schoolName"
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="Enter your school name"
                required
              />
            </div>
          </div>

          <div className="signup-section-label" style={{ marginTop: 18 }}>
            Password Security
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="signup-password">
              Password
            </label>
            <div className="pill-input-wrap" style={{ marginBottom: 6 }}>
              <Lock size={18} color="#1e40af" />
              <input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 chars (A-Z, a-z, 0-9)"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide secret' : 'Show secret'}
                className="password-eye-btn"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className="password-rules-grid" aria-live="polite">
              <span className={rules.minLength ? 'rule-ok' : ''}>8+ characters</span>
              <span className={rules.hasUpper ? 'rule-ok' : ''}>1 uppercase</span>
              <span className={rules.hasLower ? 'rule-ok' : ''}>1 lowercase</span>
              <span className={rules.hasDigit ? 'rule-ok' : ''}>1 number</span>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="signup-confirmPassword">
              Confirm Password
            </label>
            <div className="pill-input-wrap" style={{ marginBottom: 4 }}>
              <Lock size={18} color="#1e40af" />
              <input
                id="signup-confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((s) => !s)}
                aria-label={showConfirmPassword ? 'Hide confirmation' : 'Show confirmation'}
                className="password-eye-btn"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {confirmPassword && (
              <div
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  paddingLeft: 4,
                  color: passwordsMatch ? '#047857' : '#b91c1c',
                }}
              >
                {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
              </div>
            )}
          </div>

          <label className="terms-consent-row">
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
            />
            <span>
              I agree to the <Link to="/terms">Terms &amp; Conditions</Link> and{' '}
              <Link to="/privacy">Privacy Policy</Link>.
            </span>
          </label>

          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={submitting}
            style={{ minHeight: 50, fontSize: '1rem', marginTop: 14 }}
          >
            <span>{submitting ? 'Creating Account...' : 'Create Account & Choose Plan'}</span>
            <ArrowRight size={19} />
          </button>
        </form>

        <div className="signup-login-footer">
          Already have an account? <Link to="/login">Sign In</Link>
        </div>
      </div>
    </div>
  );
}
