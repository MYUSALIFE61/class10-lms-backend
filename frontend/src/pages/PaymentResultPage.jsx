import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  History,
  LogIn,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { lmsApi } from '../services/lmsApi.js';

export function PaymentResultPage({ resultStatus = 'success' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, logout, refreshProfile } = useAuth();

  const state = location.state || {};
  const queryOrderId = searchParams.get('orderId') || state.orderId || '';

  const [checking, setChecking] = useState(false);
  const [pendingInfo, setPendingInfo] = useState(state);
  const [statusError, setStatusError] = useState(null);

  const checkPendingStatus = async () => {
    if (!queryOrderId) return;
    setChecking(true);
    setStatusError(null);
    try {
      const res = await lmsApi.getPaymentOrderStatus(queryOrderId);
      setPendingInfo((prev) => ({
        ...prev,
        transaction: res.transaction,
        subscription: res.subscription,
      }));
      if (res.status === 'captured') {
        await refreshProfile().catch(() => {});
        navigate('/payment/success', {
          replace: true,
          state: {
            orderId: queryOrderId,
            paymentId: res.transaction?.paymentId,
            amountRupees: res.transaction?.amountRupees,
            plan: {
              code: res.transaction?.planCode,
              name: res.transaction?.planName,
              durationDays: res.transaction?.durationDays,
            },
            transaction: res.transaction,
            subscription: res.subscription,
          },
        });
      } else if (res.status === 'failed') {
        navigate('/payment/failure', {
          replace: true,
          state: {
            planCode: res.transaction?.planCode,
            orderId: queryOrderId,
            paymentId: res.transaction?.paymentId,
            errorMessage: res.transaction?.failureReason || 'Payment failed at gateway.',
          },
        });
      }
    } catch (err) {
      setStatusError(err.message || 'Unable to check payment status.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (resultStatus !== 'pending' || !queryOrderId) return undefined;
    const timer = setTimeout(() => {
      checkPendingStatus();
    }, 3000);
    return () => clearTimeout(timer);
  }, [resultStatus, queryOrderId]);

  const handleGoToLogin = async () => {
    await logout({ allDevices: false, retentionPolicy: 'keep_encrypted_bound_to_student' });
    navigate('/login', {
      replace: true,
      state: {
        email: user?.email || '',
        fromPaymentSuccess: true,
      },
    });
  };

  if (resultStatus === 'success') {
    const planName =
      state.plan?.name || state.transaction?.planName || 'Class 10 SSC Subscription';
    const amountRupees = state.amountRupees ?? state.transaction?.amountRupees;
    const expiresAt = state.subscription?.expiresAt;

    return (
      <AppLayout title="Payment Successful" subtitle="Subscription Activated" hideBottomNav>
        <div className="card payment-result-hero is-success">
          <div className="payment-result-icon is-success" aria-hidden="true">
            <CheckCircle2 size={42} color="#059669" />
          </div>
          <h1>Thank You!</h1>
          <p className="payment-result-subtitle">
            Your Class 10 SSC LMS payment has been verified and your subscription is now active.
          </p>
        </div>

        <div className="card">
          <h2 style={{ margin: '0 0 10px', fontSize: '1rem' }}>Payment Receipt Summary</h2>
          <div className="plan-summary-row">
            <span>Plan</span>
            <strong>{planName}</strong>
          </div>
          {amountRupees != null && (
            <div className="plan-summary-row">
              <span>Amount Paid</span>
              <strong style={{ color: '#059669' }}>₹{amountRupees}</strong>
            </div>
          )}
          {(state.paymentId || state.transaction?.paymentId) && (
            <div className="plan-summary-row">
              <span>Payment ID</span>
              <code>{state.paymentId || state.transaction?.paymentId}</code>
            </div>
          )}
          {queryOrderId && (
            <div className="plan-summary-row">
              <span>Order ID</span>
              <code>{queryOrderId}</code>
            </div>
          )}
          {state.transaction?.method && (
            <div className="plan-summary-row">
              <span>Payment Method</span>
              <strong style={{ textTransform: 'uppercase' }}>{state.transaction.method}</strong>
            </div>
          )}
          {expiresAt && (
            <div className="plan-summary-row">
              <span>Valid Until</span>
              <strong>{new Date(expiresAt).toLocaleDateString('en-IN')}</strong>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ minHeight: 50, fontSize: '1rem' }}
            onClick={handleGoToLogin}
          >
            <LogIn size={18} />
            <span>Login to Start Learning</span>
          </button>

          <button
            type="button"
            className="btn btn-emerald btn-block"
            onClick={() => navigate('/dashboard', { replace: true })}
          >
            <span>Continue to Dashboard</span>
          </button>

          <button
            type="button"
            className="btn btn-outline btn-block"
            onClick={() => navigate('/payments/history')}
          >
            <History size={17} />
            <span>View Payment History</span>
          </button>
        </div>
      </AppLayout>
    );
  }

  if (resultStatus === 'failure') {
    const retryTarget = state.planCode ? `/checkout/${state.planCode}` : '/subscription';
    return (
      <AppLayout title="Payment Failed" subtitle="Transaction Unsuccessful" showBack hideBottomNav>
        <div className="card payment-result-hero is-failure">
          <div className="payment-result-icon is-failure" aria-hidden="true">
            <XCircle size={42} color="#dc2626" />
          </div>
          <h1>Payment Could Not Be Completed</h1>
          <p className="payment-result-subtitle">
            {state.errorMessage ||
              'Your card or UPI transaction did not complete. Your subscription has NOT been activated.'}
          </p>
        </div>

        {(queryOrderId || state.paymentId) && (
          <div className="card">
            {queryOrderId && (
              <div className="plan-summary-row">
                <span>Order Reference</span>
                <code>{queryOrderId}</code>
              </div>
            )}
            {state.paymentId && (
              <div className="plan-summary-row">
                <span>Attempt ID</span>
                <code>{state.paymentId}</code>
              </div>
            )}
            <div className="plan-summary-row">
              <span>Status</span>
              <span className="badge badge-danger">FAILED</span>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ minHeight: 50, fontSize: '1rem' }}
            onClick={() => navigate(retryTarget, { replace: true })}
          >
            <RotateCcw size={18} />
            <span>Retry Payment</span>
          </button>

          <button
            type="button"
            className="btn btn-outline btn-block"
            onClick={() => navigate('/subscription', { replace: true })}
          >
            <span>Choose Another Plan</span>
          </button>

          <button
            type="button"
            className="btn btn-outline btn-block"
            onClick={() => navigate('/payments/history')}
          >
            <History size={17} />
            <span>View Transaction History</span>
          </button>
        </div>
      </AppLayout>
    );
  }

  // Pending Verification screen
  return (
    <AppLayout title="Pending Verification" subtitle="Awaiting Bank / UPI Confirmation" hideBottomNav>
      <div className="card payment-result-hero is-pending">
        <div className="payment-result-icon is-pending" aria-hidden="true">
          <Clock size={42} color="#d97706" />
        </div>
        <h1>Payment Pending Verification</h1>
        <p className="payment-result-subtitle">
          We are waiting for final payment capture confirmation from Razorpay. Your subscription stays
          locked until verified payment completes.
        </p>
      </div>

      {statusError && (
        <div role="alert" className="auth-error-banner">
          {statusError}
        </div>
      )}

      <div className="card">
        <div className="plan-summary-row">
          <span>Status</span>
          <span className="badge badge-amber">PENDING VERIFICATION</span>
        </div>
        {queryOrderId && (
          <div className="plan-summary-row">
            <span>Order ID</span>
            <code>{queryOrderId}</code>
          </div>
        )}
        {(pendingInfo.paymentId || pendingInfo.transaction?.paymentId) && (
          <div className="plan-summary-row">
            <span>Payment Reference</span>
            <code>{pendingInfo.paymentId || pendingInfo.transaction?.paymentId}</code>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ minHeight: 48 }}
          disabled={checking || !queryOrderId}
          onClick={checkPendingStatus}
        >
          <RefreshCw size={17} />
          <span>{checking ? 'Checking Razorpay Status...' : 'Check Payment Status'}</span>
        </button>

        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={() => navigate('/subscription')}
        >
          <span>Back to Plans</span>
        </button>

        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={() => navigate('/payments/history')}
        >
          <History size={17} />
          <span>View Transaction History</span>
        </button>
      </div>
    </AppLayout>
  );
}
