import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';

export function LegalPage({ type = 'terms' }) {
  const navigate = useNavigate();
  const isPrivacy = type === 'privacy';

  return (
    <div className="legal-page">
      <div className="legal-container">
        <header className="legal-header">
          <button
            type="button"
            className="icon-btn"
            style={{ background: '#eff6ff', color: '#1152d4' }}
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)' }}>
              {isPrivacy ? 'Privacy Policy' : 'Terms & Conditions'}
            </h1>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Class 10 SSC LMS &bull; Effective November 2026
            </div>
          </div>
        </header>

        <div className="legal-tabs" role="tablist" aria-label="Legal documents">
          <Link
            to="/terms"
            className={`legal-tab ${!isPrivacy ? 'active' : ''}`}
            role="tab"
            aria-selected={!isPrivacy}
          >
            <FileText size={15} />
            <span>Terms &amp; Conditions</span>
          </Link>
          <Link
            to="/privacy"
            className={`legal-tab ${isPrivacy ? 'active' : ''}`}
            role="tab"
            aria-selected={isPrivacy}
          >
            <ShieldCheck size={15} />
            <span>Privacy Policy</span>
          </Link>
        </div>

        <article className="card legal-article">
          {!isPrivacy ? (
            <>
              <section>
                <h2>1. Eligibility &amp; Student Account Registration</h2>
                <p>
                  Class 10 SSC LMS is designed for Class 10 students preparing for Andhra Pradesh
                  (AP SSC) and Telangana (TS SSC) board examinations. During registration, you must
                  provide accurate details including your full name, unique username, valid mobile
                  number, email address, state, district, school name, and academic board.
                </p>
              </section>

              <section>
                <h2>2. Subscription Plans &amp; Verification</h2>
                <p>
                  Access to premium video lessons, full chapter notes, board exam papers, and
                  offline lesson downloads requires an active paid subscription:
                </p>
                <ul>
                  <li>
                    <strong>Monthly Plan:</strong> ₹200 for 30 days validity.
                  </li>
                  <li>
                    <strong>Half-Yearly Plan:</strong> ₹500 for 180 days validity.
                  </li>
                  <li>
                    <strong>Annual Plan:</strong> ₹799 for 365 days validity.
                  </li>
                </ul>
                <p>
                  All plan prices and validity dates are enforced strictly by the backend server.
                  Registrations remain in a <strong>Pending / Unpaid</strong> state until payment is
                  verified by our backend payment system.
                </p>
              </section>

              <section>
                <h2>3. Device Protection &amp; Fair Usage</h2>
                <p>
                  Each student subscription is bound to your registered device to prevent
                  unauthorized account sharing. Attempting to bypass encryption, share credentials,
                  or redistribute lesson files violates these Terms and may lead to immediate
                  account suspension without refund.
                </p>
              </section>

              <section>
                <h2>4. Intellectual Property &amp; Offline Content</h2>
                <p>
                  Downloaded video lessons and notes are encrypted specifically for your student
                  account inside app-private storage and are strictly for personal Class 10 board
                  exam preparation inside the official application.
                </p>
              </section>

              <section>
                <h2>5. Contact &amp; Support</h2>
                <p>
                  For billing, technical help, or syllabus inquiries, contact{' '}
                  <strong>support@class10lms.in</strong>.
                </p>
              </section>
            </>
          ) : (
            <>
              <section>
                <h2>1. Information We Collect</h2>
                <p>
                  We collect only the student profile details necessary to personalize your Class 10
                  board curriculum and manage your subscription:
                </p>
                <ul>
                  <li>Full name, unique username, email address, and mobile number.</li>
                  <li>State, district, school name, class level, and selected board (AP / TS).</li>
                  <li>
                    Hashed device identifier and model metadata solely for authorized single-device
                    session enforcement.
                  </li>
                </ul>
              </section>

              <section>
                <h2>2. How We Use Your Data</h2>
                <p>
                  Your data is used strictly to authenticate your sessions, verify subscription
                  entitlements, display syllabus content for your board, save MCQ and lesson
                  progress, and prevent unauthorized access.
                </p>
              </section>

              <section>
                <h2>3. Payment &amp; Offline Storage Security</h2>
                <p>
                  Payments are processed through verified payment gateway infrastructure; we never
                  store raw card numbers, UPI PINs, or banking passwords. Offline downloaded video
                  lessons are encrypted per student using AES-256-GCM inside app-private storage.
                </p>
              </section>

              <section>
                <h2>4. Data Sharing &amp; Retention</h2>
                <p>
                  We never sell or rent student personal data to third-party advertisers. Academic
                  profile and progress records are retained while your student account remains
                  active. You may request account review or deletion anytime via{' '}
                  <strong>support@class10lms.in</strong>.
                </p>
              </section>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
