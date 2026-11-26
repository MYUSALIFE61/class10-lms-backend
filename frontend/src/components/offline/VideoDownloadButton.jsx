import React from 'react';
import { Download, Play, RotateCcw, X, Loader2 } from 'lucide-react';
import { DOWNLOAD_STATES } from '../../services/offlineDownloadService.js';

/**
 * VideoDownloadButton
 *
 * Strictly enforces the 5-state offline download button contract:
 * - NOT_DOWNLOADED  -> "Download Video" (NEVER displays "Watch Now")
 * - DOWNLOADING     -> Progress percentage + "Cancel"
 * - DOWNLOADED      -> "Watch Now" (ONLY after verified file existence + SHA-256 integrity)
 * - DOWNLOAD_FAILED -> "Retry Download"
 * - FILE_MISSING    -> "Download Video"
 */
export function VideoDownloadButton({
  status = DOWNLOAD_STATES.NOT_DOWNLOADED,
  percent = 0,
  fileSizeLabel = '',
  disabled = false,
  onDownload,
  onCancel,
  onWatchNow,
  onRetry,
}) {
  if (status === DOWNLOAD_STATES.DOWNLOADED) {
    return (
      <button
        type="button"
        data-testid="btn-watch-now"
        className="btn btn-emerald btn-block"
        style={{ minHeight: 50, fontSize: '0.98rem', fontWeight: 800 }}
        disabled={disabled}
        onClick={onWatchNow}
      >
        <Play size={19} fill="#ffffff" />
        <span>Watch Now</span>
      </button>
    );
  }

  if (status === DOWNLOAD_STATES.DOWNLOADING) {
    return (
      <div
        data-testid="btn-downloading-group"
        style={{ display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minHeight: 48, fontSize: '0.92rem', opacity: 0.92 }}
          disabled
          aria-live="polite"
        >
          <Loader2 size={18} className="spin-icon" />
          <span>Downloading {Math.min(100, Math.max(0, Math.round(percent)))}%</span>
        </button>
        <button
          type="button"
          data-testid="btn-cancel-download"
          className="btn btn-soft-danger"
          style={{ minHeight: 48, padding: '0 16px', fontSize: '0.88rem' }}
          onClick={onCancel}
        >
          <X size={17} />
          <span>Cancel</span>
        </button>
      </div>
    );
  }

  if (status === DOWNLOAD_STATES.DOWNLOAD_FAILED) {
    return (
      <button
        type="button"
        data-testid="btn-retry-download"
        className="btn btn-primary btn-block"
        style={{ minHeight: 50, fontSize: '0.96rem', fontWeight: 800, background: '#d97706' }}
        disabled={disabled}
        onClick={onRetry || onDownload}
      >
        <RotateCcw size={18} />
        <span>Retry Download</span>
      </button>
    );
  }

  // NOT_DOWNLOADED or FILE_MISSING -> Strictly display ONLY "Download Video"
  return (
    <button
      type="button"
      data-testid="btn-download-video"
      className="btn btn-primary btn-block"
      style={{ minHeight: 50, fontSize: '0.98rem', fontWeight: 800 }}
      disabled={disabled}
      onClick={onDownload}
    >
      <Download size={19} />
      <span>Download Video{fileSizeLabel ? ` (${fileSizeLabel})` : ''}</span>
    </button>
  );
}

