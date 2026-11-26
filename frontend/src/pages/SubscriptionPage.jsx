import React, { useEffect, useState } from 'react';
import { CheckCircle2, Crown, ShieldCheck, AlertCircle } from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { ErrorState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { lmsApi } from '../services/lmsApi.js';
import { APP_CONFIG } from '../config/env.js';

function loadRazorpayCheckoutScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function SubscriptionPage() {
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
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
      setStatus(subRes.subscription);
      setPlans(planRes.plans || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCheckout = async (planCode) => {
    setPaying(true);
    setError(null);
    setNotice(null);
    try {
      const loaded = await loadRazorpayCheckoutScript();
      if (!loaded || !window.Razorpay) {
        throw new Error('Unable to load Razorpay Checkout. Check your internet connection.');
      }

      const order = await lmsApi.createPaymentOrder(planCode);

      const options = {
        key: order.razorpayKeyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: APP_CONFIG.appName,
        description: order.plan.name,
        order_id: order.orderId,
        prefill: order.prefill,
        theme: { color: '#1E3A8A' },
        handler: async (response) => {
          try {
            await lmsApi.verifyPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            setNotice('Payment verified! Your Class 10 SSC Pass is now active.');
            await Promise.all([loadData(), refreshProfile()]);
          } catch (verifyErr) {
            setError(verifyErr.message || 'Payment verification failed on server.');
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        setError(resp?.error?.description || 'Payment failed. Please try again.');
        setPaying(false);
      });
      rzp.open();
    } catch (err) {
      setError(err.message);
      setPaying(false);
    }
  };

  return (
    <AppLayout title="Subscription Plan" subtitle="Class 10 AP & Telangana SSC Pass">
      {loading && <LoadingSkeleton rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={loadData} />}

      {notice && (
        <div
          className="card"
          style={{ background: 'var(--emerald-soft)', borderColor: '#6ee7b7', color: '#065f46' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <CheckCircle2 size={18} />
            <span>{notice}</span>
          </div>
        </div>
      )}

      {!loading && status && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Current Status</h2>
            <span
              className={`badge ${
                status.isActive
                  ? 'badge-emerald'
                  : status.status === 'expired'
                    ? 'badge-danger'
                    : 'badge-amber'
              }`}
            >
              {status.isActive ? 'ACTIVE' : String(status.status || 'UNPAID').toUpperCase()}
            </span>
          </div>
          {status.isActive ? (
            <p style={{ margin: '10px 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Your subscription is active until{' '}
              <strong>{new Date(status.expiresAt).toLocaleDateString('en-IN')}</strong> (
              {status.daysRemaining} days left).
            </p>
          ) : (
            <p style={{ margin: '10px 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Activate an active Class 10 SSC Pass below to unlock all premium video lessons, MCQs,
              class notes, previous exam questions, and formula sheets.
            </p>
          )}
        </div>
      )}

      {!loading &&
        plans.map((plan) => (
          <div key={plan.id} className="card" style={{ border: '2px solid var(--primary-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
              <Crown size={20} />
              <h3 style={{ margin: 0, fontSize: '1.08rem' }}>{plan.name}</h3>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, margin: '10px 0 4px', color: 'var(--text)' }}>
              ₹{plan.priceRupees}
              <span style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                {' '}
                / {plan.durationDays} days
              </span>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              {plan.description}
            </p>
            <ul style={{ margin: '0 0 16px', paddingLeft: 18, fontSize: '0.88rem', color: '#334155' }}>
              <li>Topic-wise Class 10 AP &amp; TS SSC Video Lessons</li>
              <li>MCQs with instant explanations below every lesson</li>
              <li>Chapter Notes, Previous Board Exam Papers &amp; Formula Sheets</li>
              <li>Backend-verified Razorpay UPI / Card / NetBanking payment</li>
            </ul>
            <button
              className="btn btn-emerald btn-block"
              disabled={paying || status?.isActive}
              onClick={() => handleCheckout(plan.code)}
            >
              {status?.isActive
                ? 'Already Subscribed'
                : paying
                  ? 'Opening Razorpay Checkout...'
                  : `Pay ₹${plan.priceRupees} with Razorpay`}
            </button>
          </div>
        ))}

      <div className="card" style={{ background: '#f8fafc', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ShieldCheck size={17} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Subscription entitlement is verified strictly on the backend server via Razorpay HMAC
            signatures and webhooks.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
          <AlertCircle size={17} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Each subscription is protected by a registered-device policy to prevent unauthorized
            account sharing.
          </span>
        </div>
      </div>
    </AppLayout>
  );
}
