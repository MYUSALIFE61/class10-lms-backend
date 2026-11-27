import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  History,
  LogOut,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { ErrorState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { lmsApi } from '../services/lmsApi.js';

export function SubscriptionPage({ isRenewal = false }) {
  const { user, subscription: ctxSub, logout, refreshProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const justRegistered = Boolean(location.state?.justRegistered);
  const [status, setStatus] = useState(ctxSub || null);
  const [plans, setPlans] = useState([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [subRes, planRes] = await Promise.all([
        lmsApi.getSubscriptionStatus(),
        lmsApi.getPlans(),
      ]);
      const loadedStatus = subRes.subscription;
      const loadedPlans = planRes.plans || [];
      setStatus(loadedStatus);
      setPlans(loadedPlans);

      const matchedExisting = loadedPlans.find((p) => p.code === loadedStatus?.selectedPlanCode);
      const recommended = loadedPlans.find((p) => p.isRecommended);
      setSelectedPlanCode((matchedExisting || recommended || loadedPlans[0])?.code || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.code === selectedPlanCode) || plans[0] || null,
    [plans, selectedPlanCode]
  );

  const handleSelectPlanForPendingPayment = async () => {
    if (!selectedPlan) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await lmsApi.selectPendingPlan(selectedPlan.code);
      setStatus(res.subscription);
      await refreshProfile();
      setNotice(
        `${res.plan.name} (₹${res.plan.priceRupees} for ${res.plan.durationDays} days) selected. Subscription remains PENDING until payment verification completes in Phase 3.`
      );
    } catch (err) {
      setError(err.message || 'Unable to save selected subscription plan.');
    } finally {
      setSubmitting(false);
    }
  };

  const isExpiredState = isRenewal || status?.status === 'expired';
  const isPendingState = !status?.isActive && status?.status === 'pending';

  return (
    <AppLayout
      title={isExpiredState ? 'Renew Subscription' : 'Choose Your Plan'}
      subtitle={user?.fullName ? `${user.fullName} • ${user.board || 'AP'} SSC` : 'Class 10 SSC Pass'}
      showBack={Boolean(status?.isActive)}
      hideBottomNav={!status?.isActive}
      rightAction={
        <button
          type="button"
          className="icon-btn ghost"
          aria-label="Sign Out"
          onClick={() => logout()}
          title="Sign Out"
        >
          <LogOut size={19} />
        </button>
      }
    >
      {loading && <LoadingSkeleton rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={loadData} />}

      {justRegistered && !notice && (
        <div
          className="card"
          style={{
            background: '#eff6ff',
            borderColor: '#93c5fd',
            color: '#1e3a8a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
            <Sparkles size={18} color="#1152d4" />
            <span>Registration Complete! Step 2 of 2: Select a Plan</span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '0.86rem' }}>
            Your student account is registered cleanly. Paid video lessons stay locked until your
            subscription payment is verified.
          </p>
        </div>
      )}

      {notice && (
        <div
          className="card"
          role="status"
          style={{ background: '#fffbeb', borderColor: '#fcd34d', color: '#92400e' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontWeight: 700 }}>
            <Clock size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{notice}</span>
          </div>
        </div>
      )}

      {!loading && status && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Subscription Status</h2>
            <span
              className={`badge ${
                status.isActive
                  ? 'badge-emerald'
                  : isExpiredState
                    ? 'badge-danger'
                    : 'badge-amber'
              }`}
            >
              {status.isActive
                ? 'ACTIVE'
                : isPendingState
                  ? 'PENDING VERIFICATION'
                  : String(status.status || 'UNPAID').toUpperCase()}
            </span>
          </div>

          {status.isActive ? (
            <div style={{ marginTop: 10 }}>
              <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Active until{' '}
                <strong>{new Date(status.expiresAt).toLocaleDateString('en-IN')}</strong> (
                {status.daysRemaining} days left).
              </p>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => navigate('/dashboard')}
              >
                <CheckCircle2 size={18} />
                <span>Go to Dashboard</span>
              </button>
            </div>
          ) : isExpiredState ? (
            <p style={{ margin: '10px 0 0', fontSize: '0.9rem', color: '#991b1b' }}>
              Your Class 10 SSC subscription has expired. Select a renewal plan below to restore full
              access to lessons, tests, notes, and offline downloads.
            </p>
          ) : isPendingState ? (
            <p style={{ margin: '10px 0 0', fontSize: '0.9rem', color: '#92400e' }}>
              {status.selectedPlanName
                ? `Selected: ${status.selectedPlanName}. `
                : ''}
              Payment verification is pending. Paid lessons remain locked until payment is verified.
            </p>
          ) : (
            <p style={{ margin: '10px 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Choose one of the 3 Class 10 SSC plans below. All pricing and validity durations are
              enforced by the backend server.
            </p>
          )}
        </div>
      )}

      {!loading && plans.length > 0 && (
        <div className="plan-grid" role="radiogroup" aria-label="Class 10 Subscription Plans">
          {plans.map((plan) => {
            const isSelected = selectedPlan?.code === plan.code;
            const features = Array.isArray(plan.features) && plan.features.length > 0
              ? plan.features
              : [
                  'Topic-wise Class 10 AP & TS SSC Video Lessons',
                  'MCQs with instant explanations & Chapter Notes',
                  `${plan.durationDays} days validity enforced on backend`,
                ];

            return (
              <button
                key={plan.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedPlanCode(plan.code)}
                className={`card plan-card-option ${isSelected ? 'selected' : ''}`}
              >
                <div className="plan-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
                    <Crown size={19} />
                    <span className="plan-card-title">{plan.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {plan.isRecommended && (
                      <span className="badge badge-blue">Best Value</span>
                    )}
                    {isSelected && <span className="badge badge-emerald">Selected</span>}
                  </div>
                </div>

                <div className="plan-price-row">
                  <span className="plan-price-amount">₹{plan.priceRupees}</span>
                  <span className="plan-price-duration">
                    / {plan.durationLabel || `${plan.durationDays} Days`} ({plan.durationDays} days)
                  </span>
                </div>

                <p className="plan-card-desc">{plan.description}</p>

                <ul className="plan-feature-list">
                  {features.map((feat) => (
                    <li key={feat}>{feat}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      )}

      {!loading && selectedPlan && !status?.isActive && (
        <div className="card plan-summary-card">
          <div className="plan-summary-row">
            <span>Selected Plan</span>
            <strong>{selectedPlan.name}</strong>
          </div>
          <div className="plan-summary-row">
            <span>Validity</span>
            <strong>
              {selectedPlan.durationLabel || `${selectedPlan.durationDays} Days`} (
              {selectedPlan.durationDays} days)
            </strong>
          </div>
          <div className="plan-summary-row">
            <span>Backend Payable Price</span>
            <strong style={{ fontSize: '1.15rem', color: 'var(--primary)' }}>
              ₹{selectedPlan.priceRupees}
            </strong>
          </div>

          <button
            type="button"
            className="btn btn-emerald btn-block"
            style={{ minHeight: 50, marginTop: 12 }}
            onClick={() =>
              navigate(`/checkout/${selectedPlan.code}`, { state: { plan: selectedPlan } })
            }
          >
            <CreditCard size={18} />
            <span>Pay ₹{selectedPlan.priceRupees} with Razorpay (Test Mode)</span>
          </button>

          <button
            type="button"
            className="btn btn-outline btn-block"
            style={{ minHeight: 42, marginTop: 8 }}
            disabled={submitting}
            onClick={handleSelectPlanForPendingPayment}
          >
            {submitting
              ? 'Saving Selection...'
              : `Continue with ${selectedPlan.name} (Save as Pending)`}
          </button>

          <button
            type="button"
            className="btn btn-outline btn-block"
            style={{ minHeight: 40, marginTop: 8 }}
            onClick={() => navigate('/payments/history')}
          >
            <History size={16} />
            <span>View Payment Transaction History</span>
          </button>

          <div className="plan-phase2-note">
            Razorpay runs in <strong>Test Mode</strong> (UPI &amp; Credit/Debit Cards with 3D-Secure).
            Saving as pending keeps your subscription locked until verified payment.
          </div>
        </div>
      )}

      <div className="card" style={{ background: '#f8fafc', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ShieldCheck size={17} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Subscription entitlement and pricing (₹200 / ₹500 / ₹799) are controlled strictly by
            the backend server. Subscriptions never activate without verified payment.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
          <AlertCircle size={17} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Each subscription is protected by a single registered-device policy.
          </span>
        </div>
      </div>
    </AppLayout>
  );
}
