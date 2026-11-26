import React from 'react';
import { AlertTriangle, Crown, HardDrive, RotateCcw, WifiOff } from 'lucide-react';

/**
 * DownloadErrorComponent
 * Renders actionable, student-friendly recovery messages for low storage, checksum failures,
 * network interruptions, missing local files, and subscription locks.
 */
export function DownloadErrorComponent({
  errorCode = '',
  message = '',
  onRetry,
  onUpgrade,
}) {
  if (!message && !errorCode) return null;

  const isStorage = errorCode === 'INSUFFICIENT_STORAGE';
  const isOffline = errorCode === 'NETWORK_OFFLINE' || errorCode === 'NETWORK_INTERRUPTED';
  const isSubscription = [
    'SUBSCRIPTION_REQUIRED',
    'SUBSCRIPTION_EXPIRED',
    'SUBSCRIPTION_UNPAID',
    'SUBSCRIPTION_REVOKED',
    'PAYMENT_UNVERIFIED',
  ].includes(errorCode);

  const title = isStorage
    ? 'Not Enough Device Storage'
    : errorCode === 'CHECKSUM_MISMATCH' || errorCode === 'CORRUPTED_FILE'
      ? 'File Verification Failed'
      : errorCode === 'FILE_MISSING'
        ? 'Offline Video File Removed'
        : isSubscription
          ? 'Subscription Required'
          : isOffline
            ? 'Download Interrupted'
            : 'Download Could Not Complete';

  const Icon = isStorage ? HardDrive : isOffline ? WifiOff : isSubscription ? Crown : AlertTriangle;

  return (
    <div
      data-testid="download-error-banner"
      className="card"
      style={{
        background: '#fef2f2',
        border: '1px solid #fecaca',
        padding: '13px 15px',
        marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Icon size={19} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#991b1b', marginBottom: 3 }}>
            {title}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#7f1d1d', lineHeight: 1.45 }}>
            {message || 'Please check your internet connection and storage space, then retry.'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {isSubscription && onUpgrade ? (
              <button
                type="button"
                className="btn btn-emerald"
                style={{ minHeight: 36, padding: '6px 14px', fontSize: '0.8rem' }}
                onClick={onUpgrade}
              >
                <Crown size={15} /> Upgrade Plan
              </button>
            ) : (
              onRetry && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ minHeight: 36, padding: '6px 14px', fontSize: '0.8rem' }}
                  onClick={onRetry}
                >
                  <RotateCcw size={14} /> Retry Download
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

