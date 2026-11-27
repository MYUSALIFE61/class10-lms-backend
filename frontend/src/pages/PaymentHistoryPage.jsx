import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, CreditCard, RefreshCw, XCircle } from 'lucide-react';
import { AppLayout } from '../components/common/AppLayout.jsx';
import { ErrorState, LoadingSkeleton } from '../components/common/StateViews.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { lmsApi } from '../services/lmsApi.js';

export function PaymentHistoryPage() {
  const { subscription } = useAuth();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await lmsApi.getPaymentHistory();
      setTransactions(res.transactions || []);
    } catch (err) {
      setError(err.message || 'Unable to load payment transaction history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <AppLayout
      title="Payment History"
      subtitle="Verified Razorpay Transactions"
      showBack
      hideBottomNav={!subscription?.isActive}
      rightAction={
        <button
          type="button"
          className="icon-btn ghost"
          aria-label="Refresh payment history"
          onClick={loadHistory}
        >
          <RefreshCw size={18} />
        </button>
      }
    >
      {loading && <LoadingSkeleton rows={3} />}
      {!loading && error && <ErrorState message={error} onRetry={loadHistory} />}

      {!loading && !error && transactions.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
          <CreditCard size={34} color="#64748b" style={{ marginBottom: 8 }} />
          <h2 style={{ margin: '0 0 6px', fontSize: '1rem' }}>No Transactions Yet</h2>
          <p style={{ margin: '0 0 14px', fontSize: '0.86rem', color: 'var(--text-muted)' }}>
            Select a Class 10 SSC plan to start your first Razorpay Test Mode transaction.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/subscription')}
          >
            View Plans
          </button>
        </div>
      )}

      {!loading &&
        !error &&
        transactions.map((tx) => {
          const isCaptured = tx.status === 'captured';
          const isFailed = tx.status === 'failed' || tx.status === 'refunded';
          const badgeClass = isCaptured
            ? 'badge-emerald'
            : isFailed
              ? 'badge-danger'
              : 'badge-amber';

          return (
            <div key={tx.id || tx.orderId} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isCaptured ? (
                    <CheckCircle2 size={18} color="#059669" />
                  ) : isFailed ? (
                    <XCircle size={18} color="#dc2626" />
                  ) : (
                    <Clock size={18} color="#d97706" />
                  )}
                  <strong style={{ fontSize: '0.96rem', color: 'var(--text)' }}>
                    {tx.planName}
                  </strong>
                </div>
                <span className={`badge ${badgeClass}`}>{String(tx.status).toUpperCase()}</span>
              </div>

              <div style={{ marginTop: 10, display: 'grid', gap: 4, fontSize: '0.84rem' }}>
                <div className="plan-summary-row">
                  <span>Amount</span>
                  <strong>₹{tx.amountRupees}</strong>
                </div>
                <div className="plan-summary-row">
                  <span>Order ID</span>
                  <code>{tx.orderId}</code>
                </div>
                {tx.paymentId && (
                  <div className="plan-summary-row">
                    <span>Payment ID</span>
                    <code>{tx.paymentId}</code>
                  </div>
                )}
                {tx.method && (
                  <div className="plan-summary-row">
                    <span>Method</span>
                    <strong style={{ textTransform: 'uppercase' }}>{tx.method}</strong>
                  </div>
                )}
                <div className="plan-summary-row">
                  <span>Date</span>
                  <span>{new Date(tx.verifiedAt || tx.createdAt).toLocaleString('en-IN')}</span>
                </div>
                {tx.failureReason && (
                  <div style={{ color: '#991b1b', fontSize: '0.8rem', marginTop: 4 }}>
                    Reason: {tx.failureReason}
                  </div>
                )}
              </div>

              {(tx.status === 'created' || tx.status === 'authorized') && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-block"
                    onClick={() =>
                      navigate(`/payment/pending?orderId=${encodeURIComponent(tx.orderId)}`, {
                        state: { orderId: tx.orderId, paymentId: tx.paymentId },
                      })
                    }
                  >
                    Check Verification Status
                  </button>
                </div>
              )}

              {tx.status === 'failed' && tx.planCode && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={() => navigate(`/checkout/${tx.planCode}`)}
                  >
                    Retry Plan Payment
                  </button>
                </div>
              )}
            </div>
          );
        })}
    </AppLayout>
  );
}
