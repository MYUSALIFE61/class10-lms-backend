import React from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { formatBytes } from '../../services/offlineDownloadService.js';

/**
 * DownloadProgressComponent
 * Displays live percentage bar, downloaded MB / total MB, encrypted private storage indicator,
 * and download cancellation trigger.
 */
export function DownloadProgressComponent({
  percent = 0,
  bytesDownloaded = 0,
  totalBytes = 0,
  onCancel,
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));

  return (
    <div
      data-testid="download-progress-card"
      className="card"
      style={{
        background: 'linear-gradient(135deg, #eff6ff 0%, #f8fbff 100%)',
        border: '1px solid #bfdbfe',
        padding: '14px 16px',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.88rem', color: '#0f214d' }}>
          <ShieldCheck size={16} color="#1152d4" />
          <span>Saving Encrypted Lesson Offline</span>
        </div>
        <span
          data-testid="download-progress-percent"
          style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1152d4' }}
        >
          {clamped}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          width: '100%',
          height: 9,
          borderRadius: 999,
          background: '#dbeafe',
          overflow: 'hidden',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #1152d4 0%, #2563eb 100%)',
            borderRadius: 999,
            transition: 'width 0.18s ease-out',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          fontSize: '0.78rem',
          color: '#475569',
          fontWeight: 600,
        }}
      >
        <span data-testid="download-progress-size">
          {formatBytes(bytesDownloaded)} / {totalBytes > 0 ? formatBytes(totalBytes) : 'Calculating...'}
        </span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#dc2626',
              fontWeight: 700,
              fontSize: '0.78rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              cursor: 'pointer',
              padding: '2px 4px',
            }}
          >
            <X size={14} /> Cancel
          </button>
        )}
      </div>
    </div>
  );
}

