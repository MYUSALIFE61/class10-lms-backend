import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="welcome-page">
      <div className="welcome-card-shell">
        {/* Brand Header */}
        <div className="welcome-brand-row">
          <div className="welcome-logo-badge" aria-hidden="true">
            <GraduationCap size={26} color="#ffffff" />
          </div>
          <div>
            <div className="welcome-app-title">Class 10 SSC LMS</div>
            <div className="welcome-app-subtitle">AP &amp; Telangana State Board Edition</div>
          </div>
        </div>

        {/* Hero Illustration */}
        <div className="welcome-hero-banner">
          <img
            src="/illustrations/splash-students.jpg"
            alt="Class 10 students learning together"
            className="welcome-hero-img"
          />
          <div className="welcome-pill-tag">
            <Sparkles size={14} />
            <span>Built for 10th Board Toppers</span>
          </div>
        </div>

        {/* Intro Copy */}
        <div className="welcome-intro">
          <h1>Your Complete Class 10 Digital Classroom</h1>
          <p>
            Master Mathematics, Physical Science, Biology, Social Studies, English &amp; Telugu with
            chapter-wise video lessons, instant MCQs, handwritten notes, board exam papers, and
            secure offline access.
          </p>
        </div>

        {/* Highlights */}
        <div className="welcome-features-grid">
          <div className="welcome-feature-item">
            <BookOpenCheck size={18} color="#1152d4" />
            <span>SCERT AP &amp; TS Complete Syllabus</span>
          </div>
          <div className="welcome-feature-item">
            <LockKeyhole size={18} color="#059669" />
            <span>Encrypted Offline Video Downloads</span>
          </div>
          <div className="welcome-feature-item">
            <CheckCircle2 size={18} color="#7c3aed" />
            <span>Flexible Monthly, Half-Yearly &amp; Annual Plans</span>
          </div>
        </div>

        {/* Primary Auth CTAs */}
        <div className="welcome-cta-stack">
          <button
            type="button"
            className="btn btn-primary btn-block welcome-cta-btn"
            onClick={() => navigate('/signup')}
          >
            <span>Sign Up</span>
            <ArrowRight size={19} />
          </button>

          <button
            type="button"
            className="btn btn-outline btn-block welcome-cta-btn"
            onClick={() => navigate('/login')}
          >
            <span>Sign In</span>
          </button>
        </div>

        {/* Legal Links */}
        <div className="welcome-legal-footer">
          <div className="welcome-legal-note">
            <ShieldCheck size={15} color="#059669" />
            <span>Verified Student Accounts &bull; Single-Device Protection</span>
          </div>
          <div className="welcome-legal-links">
            <Link to="/terms">Terms &amp; Conditions</Link>
            <span aria-hidden="true">&bull;</span>
            <Link to="/privacy">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
