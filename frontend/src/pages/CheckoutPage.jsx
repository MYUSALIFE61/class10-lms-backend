import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Lock,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';
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

export function CheckoutPage() {
  const { planCode: paramPlanCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshProfile, subscription } = useAuth();

  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState(location.state?.plan || null);
  const [preferredMethod, setPreferredMethod] = useState('all'); // all | upi | card
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [devOrder, setDevOrder] = useState(null);
  const [error, setError] = useState(null);

  const loadPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const planRes = await lmsApi.getPlans();
      const loadedPlans = planRes.plans || [];
      setPlans(loadedPlans);
      const codeToFind = paramPlanCode || subscription?.selectedPlanCode;
      const matched =
        loadedPlans.find((p) => p.code === codeToFind) ||
        loadedPlans.find((p) => p.isRecommended) ||
        loadedPlans[0] ||
        null;
      setPlan(matched);
    } catch (err) {
      setError(err.message || 'Unable to load checkout plan details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlan();
  }, [paramPlanCode]);

  const handleVerifyGatewayResponse = async (order, rzpResponse) => {
    try {
      const verified = await lmsApi.verifyPayment({
        razorpayOrderId: rzpResponse.razorpay_order_id,
        razorpayPaymentId: rzpResponse.razorpay_payment_id,
        razorpaySignature: rzpResponse.razorpay_signature,
      });

      if (verified?.pending || verified?.status === 'pending' || verified?.verified === false) {
        navigate(`/payment/pending?orderId=${encodeURIComponent(order.orderId)}`, {
          replace: true,
          state: {
            orderId: order.orderId,
            paymentId: rzpResponse.razorpay_payment_id,
            plan: order.plan,
            amountRupees: order.amountRupees,
          },
        });
        return;
      }

      await refreshProfile().catch(() => {});
      navigate('/payment/success', {
        replace: true,
        state: {
          orderId: order.orderId,
          paymentId: rzpResponse.razorpay_payment_id,
          plan: order.plan,
          amountRupees: order.amountRupees,
          transaction: verified.transaction || null,
          subscription: verified.subscription || null,
        },
      });
    } catch (verifyErr) {
      await lmsApi
        .recordPaymentFailure({
          razorpayOrderId: order.orderId,
          razorpayPaymentId: rzpResponse?.razorpay_payment_id || null,
          errorCode: 'VERIFICATION_FAILED',
          errorDescription: verifyErr.message || 'Payment signature verification failed.',
          reason: 'verification_error',
        })
        .catch(() => {});

      navigate('/payment/failure', {
        replace: true,
        state: {
          planCode: order.plan?.code || plan?.code,
          orderId: order.orderId,
          paymentId: rzpResponse?.razorpay_payment_id || null,
          errorMessage: verifyErr.message || 'Payment verification failed on server.',
        },
      });
    } finally {
      setProcessing(false);
    }
  };

  const handlePayNow = async () => {
    if (!plan) return;
    setProcessing(true);
    setError(null);

    try {
      const order = await lmsApi.createPaymentOrder(plan.code);

      // Strictly local development preview handler for mock `order_dev_*` orders (never in production)
      if (APP_CONFIG.isDevelopment && String(order.orderId).startsWith('order_dev_')) {
        setDevOrder(order);
        setProcessing(false);
        return;
      }

      const loaded = await loadRazorpayCheckoutScript();
      if (!loaded || !window.Razorpay) {
        throw new Error('Unable to load Razorpay Checkout. Check your internet connection.');
      }

      const methodConfig =
        preferredMethod === 'upi'
          ? {
              display: {
                blocks: {
                  upi: { name: 'Pay via UPI (GPay / PhonePe / Paytm)', instruments: [{ method: 'upi' }] },
                  cards: { name: 'Credit / Debit Cards (3DS)', instruments: [{ method: 'card' }] },
                },
                sequence: ['block.upi', 'block.cards'],
                preferences: { show_default_blocks: true },
              },
            }
          : preferredMethod === 'card'
            ? {
                display: {
                  blocks: {
                    cards: { name: 'Credit / Debit Cards (3D-Secure)', instruments: [{ method: 'card' }] },
                    upi: { name: 'UPI Apps & QR', instruments: [{ method: 'upi' }] },
                  },
                  sequence: ['block.cards', 'block.upi'],
                  preferences: { show_default_blocks: true },
                },
              }
            : undefined;

      const options = {
        key: order.razorpayKeyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: APP_CONFIG.appName,
        description: `${order.plan.name} (${order.plan.durationDays} Days)`,
        order_id: order.orderId,
        prefill: order.prefill,
        theme: { color: '#1152d4' },
        ...(methodConfig ? { config: methodConfig } : {}),
        modal: {
          confirm_close: true,
          ondismiss: async () => {
            try {
              const statusRes = await lmsApi.getPaymentOrderStatus(order.orderId);
              if (statusRes.status === 'captured') {
                await refreshProfile().catch(() => {});
                navigate('/payment/success', {
                  replace: true,
                  state: {
                    orderId: order.orderId,
                    paymentId: statusRes.transaction?.paymentId,
                    plan: order.plan,
                    amountRupees: order.amountRupees,
                    transaction: statusRes.transaction,
                    subscription: statusRes.subscription,
                  },
                });
                return;
              }
              if (statusRes.status === 'failed') {
                navigate('/payment/failure', {
                  replace: true,
                  state: {
                    planCode: order.plan.code,
                    orderId: order.orderId,
                    errorMessage: statusRes.transaction?.failureReason || 'Payment failed.',
                  },
                });
                return;
              }
            } catch {
              // Ignore dismiss lookup error; let student retry
            }
            setProcessing(false);
          },
        },
        handler: (response) => handleVerifyGatewayResponse(order, response),
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', async (resp) => {
        const errInfo = resp?.error || {};
        await lmsApi
          .recordPaymentFailure({
            razorpayOrderId: order.orderId,
            razorpayPaymentId: errInfo?.metadata?.payment_id || null,
            errorCode: errInfo?.code || 'PAYMENT_FAILED',
            errorDescription: errInfo?.description || 'Payment failed at Razorpay gateway.',
            reason: errInfo?.reason || 'payment_failed',
          })
          .catch(() => {});

        setProcessing(false);
        navigate('/payment/failure', {
          replace: true,
          state: {
            planCode: order.plan.code,
            orderId: order.orderId,
            paymentId: errInfo?.metadata?.payment_id || null,
            errorMessage: errInfo?.description || 'Payment was declined. Please retry.',
          },
        });
      });

      rzp.open();
    } catch (err) {
      setError(err.message || 'Unable to initiate Razorpay Test Mode order.');
      setProcessing(false);
    }
  };

  const handleDevSimulate = async ({ outcome, method }) => {
    if (!devOrder) return;
    setProcessing(true);
    setError(null);
    try {
      const sim = await lmsApi.simulateDevRazorpayOutcome({
        orderId: devOrder.orderId,
        outcome,
        method,
      });

      if (outcome === 'failed') {
        await lmsApi.recordPaymentFailure({
          razorpayOrderId: sim.razorpayOrderId,
          razorpayPaymentId: sim.razorpayPaymentId,
          errorCode: sim.errorCode,
          errorDescription: sim.errorDescription,
          reason: 'simulated_test_failure',
          method,
        });
        setProcessing(false);
        navigate('/payment/failure', {
          replace: true,
          state: {
            planCode: devOrder.plan.code,
            orderId: devOrder.orderId,
            paymentId: sim.razorpayPaymentId,
            errorMessage: sim.errorDescription,
          },
        });
        return;
      }

      await handleVerifyGatewayResponse(devOrder, {
        razorpay_order_id: sim.razorpayOrderId,
        razorpay_payment_id: sim.razorpayPaymentId,
        razorpay_signature: sim.razorpaySignature,
      });
    } catch (err) {
      setError(err.message);
      setProcessing(false);
    }
  };

  return (
    <AppLayout title="Secure Checkout" subtitle="Razorpay Test Mode" showBack hideBottomNav>
      {loading && <LoadingSkeleton rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={loadPlan} />}

      {!loading && plan && (
        <>
          <div
            className="card"
            style={{ background: '#eff6ff', borderColor: '#93c5fd', color: '#1e3a8a' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                <Sparkles size={17} color="#1152d4" />
                Razorpay Test Mode
              </span>
              <span className="badge badge-blue">NO REAL CHARGE</span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '0.84rem' }}>
              Payments run exclusively in Razorpay Sandbox/Test Mode. Supports UPI apps and
              Credit/Debit Cards with 3D-Secure verification.
            </p>
          </div>

          <div className="card">
            <h2 style={{ margin: '0 0 10px', fontSize: '1.02rem' }}>Order Summary</h2>
            <div className="plan-summary-row">
              <span>Selected Plan</span>
              <strong>{plan.name}</strong>
            </div>
            <div className="plan-summary-row">
              <span>Validity Duration</span>
              <strong>{plan.durationLabel || `${plan.durationDays} Days`} ({plan.durationDays} days)</strong>
            </div>
            <div className="plan-summary-row">
              <span>Total Payable (Backend Verified)</span>
              <strong style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>₹{plan.priceRupees}</strong>
            </div>
            {plans.length > 1 && (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ minHeight: 36, fontSize: '0.8rem' }}
                  onClick={() => navigate('/subscription')}
                >
                  Change Plan
                </button>
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 10px', fontSize: '0.96rem' }}>Select Payment Method</h3>
            <div className="checkout-method-list" role="radiogroup" aria-label="Payment method preference">
              <button
                type="button"
                role="radio"
                aria-checked={preferredMethod === 'upi'}
                className={`checkout-method-btn ${preferredMethod === 'upi' ? 'active' : ''}`}
                onClick={() => setPreferredMethod('upi')}
              >
                <Smartphone size={19} color="#059669" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>UPI Payment</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Google Pay, PhonePe, Paytm, BHIM &amp; UPI QR
                  </div>
                </div>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={preferredMethod === 'card'}
                className={`checkout-method-btn ${preferredMethod === 'card' ? 'active' : ''}`}
                onClick={() => setPreferredMethod('card')}
              >
                <CreditCard size={19} color="#1152d4" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Credit / Debit Card</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Visa, Mastercard, RuPay with Bank 3D-Secure OTP
                  </div>
                </div>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={preferredMethod === 'all'}
                className={`checkout-method-btn ${preferredMethod === 'all' ? 'active' : ''}`}
                onClick={() => setPreferredMethod('all')}
              >
                <CheckCircle2 size={19} color="#7c3aed" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>All Razorpay Methods</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    UPI, Credit/Debit Cards, NetBanking &amp; Wallets
                  </div>
                </div>
              </button>
            </div>

            {!devOrder ? (
              <button
                type="button"
                className="btn btn-emerald btn-block"
                style={{ minHeight: 50, marginTop: 14, fontSize: '1rem' }}
                disabled={processing}
                onClick={handlePayNow}
              >
                <Lock size={17} />
                <span>{processing ? 'Preparing Test Order...' : `Pay ₹${plan.priceRupees} (Razorpay Test Mode)`}</span>
              </button>
            ) : (
              <div
                className="card"
                style={{
                  marginTop: 14,
                  marginBottom: 0,
                  background: '#f8fafc',
                  border: '1px solid #93c5fd',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f214d', marginBottom: 6 }}>
                  Local Test Order Ready: {devOrder.orderId}
                </div>
                <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Choose a Razorpay Test Mode outcome to test full signature &amp; routing flow:
                </p>
                <div style={{ display: 'grid', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-emerald btn-block"
                    disabled={processing}
                    onClick={() => handleDevSimulate({ outcome: 'captured', method: 'upi' })}
                  >
                    Simulate UPI Payment Success
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    disabled={processing}
                    onClick={() => handleDevSimulate({ outcome: 'captured', method: 'card' })}
                  >
                    Simulate Card 3D-Secure Success
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-block"
                    disabled={processing}
                    onClick={() => handleDevSimulate({ outcome: 'pending', method: 'upi' })}
                  >
                    Simulate Pending Bank Verification
                  </button>
                  <button
                    type="button"
                    className="btn btn-soft-danger btn-block"
                    disabled={processing}
                    onClick={() => handleDevSimulate({ outcome: 'failed', method: 'card' })}
                  >
                    Simulate Payment Failure (Declined)
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ background: '#f8fafc', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <ShieldCheck size={17} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Subscriptions activate strictly after backend HMAC-SHA256 verification and gateway
                status confirmation.
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
              <AlertCircle size={17} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>No live Razorpay charges are executed in Test Mode.</span>
            </div>
          </div>
        </>
      )}
    </AppLayout>
  );
}
