import React from 'react';
import { AlertCircle, Inbox, RefreshCw, WifiOff } from 'lucide-react';

export function OfflineBanner({ isOnline }) {
  if (isOnline) return null;
  return (
    <div className="offline-banner" role="alert">
      <WifiOff size={16} />
      <span>You are offline. Reconnecting automatically when internet returns...</span>
    </div>
  );
}

export function LoadingSkeleton({ rows = 3 }) {
  return (
    <div aria-busy="true" aria-label="Loading content">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="skeleton"
          style={{ height: 76, marginBottom: 12 }}
        />
      ))}
    </div>
  );
}

export function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '28px 18px' }}>
      <Inbox size={36} color="#64748b" style={{ marginBottom: 10 }} />
      <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>{title}</h3>
      {description && (
        <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button className="btn btn-outline" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div
      className="card"
      role="alert"
      style={{
        borderColor: '#fecaca',
        background: '#fef2f2',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b91c1c', fontWeight: 700 }}>
        <AlertCircle size={18} />
        <span>Something went wrong</span>
      </div>
      <p style={{ margin: 0, color: '#7f1d1d', fontSize: '0.9rem' }}>{message}</p>
      {onRetry && (
        <div>
          <button className="btn btn-outline" onClick={onRetry}>
            <RefreshCw size={15} /> Try Again
          </button>
        </div>
      )}
    </div>
  );
}
