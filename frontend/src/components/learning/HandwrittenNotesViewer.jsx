import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Lock,
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { APP_CONFIG } from '../../config/env.js';
import { loadStoredTokens } from '../../services/apiClient.js';
import { EmptyState, ErrorState, LoadingSkeleton } from '../common/StateViews.jsx';

export function HandwrittenNotesViewer({
  notes = [],
  loading = false,
  error = null,
  onRetry,
  onUpgrade,
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [fitWidth, setFitWidth] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState(null);

  const safeIndex = Math.min(activeIndex, Math.max(0, notes.length - 1));
  const current = notes[safeIndex] || null;

  useEffect(() => {
    setActiveIndex(0);
  }, [notes.length]);

  useEffect(() => {
    let active = true;
    let createdUrl = null;
    setBlobUrl(null);
    setFileError(null);

    if (!current || current.locked || !current.hasFile || !current.downloadUrl) {
      setFileLoading(false);
      return undefined;
    }

    const fetchProtectedFile = async () => {
      setFileLoading(true);
      try {
        const tokens = await loadStoredTokens();
        const apiOrigin = APP_CONFIG.apiBaseUrl.replace(/\/api\/v1\/?$/, '');
        const fullUrl = current.downloadUrl.startsWith('http')
          ? current.downloadUrl
          : `${apiOrigin}${current.downloadUrl}`;
        const res = await fetch(fullUrl, {
          headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {},
        });
        if (!res.ok) {
          throw new Error(`Unable to load notes document (HTTP ${res.status})`);
        }
        const blob = await res.blob();
        createdUrl = URL.createObjectURL(blob);
        if (active) setBlobUrl(createdUrl);
      } catch (err) {
        if (active) setFileError(err.message || 'Failed to load protected notes file.');
      } finally {
        if (active) setFileLoading(false);
      }
    };

    fetchProtectedFile();

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [current?.id, current?.locked, current?.hasFile, current?.downloadUrl]);

  const handleZoomIn = () => {
    setFitWidth(false);
    setZoom((z) => Math.min(200, z + 20));
  };

  const handleZoomOut = () => {
    setFitWidth(false);
    setZoom((z) => Math.max(60, z - 20));
  };

  const handleFitWidth = () => {
    setFitWidth(true);
    setZoom(100);
  };

  const handleDownloadOffline = () => {
    if (!blobUrl || !current) return;
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = current.fileName || `${current.title.replace(/[^a-z0-9]+/gi, '_')}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <LoadingSkeleton rows={3} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!notes.length) {
    return (
      <EmptyState
        title="No Handwritten Notes Yet"
        description="Lesson-specific handwritten notes and PDF sheets will appear here once published."
      />
    );
  }

  return (
    <div className={`notes-viewer-shell ${fullscreen ? 'is-fullscreen' : ''}`}>
      {/* Toolbar: Page Navigation, Zoom, Fit-to-Width, Fullscreen, Authorized Download */}
      <div className="notes-viewer-toolbar">
        <div className="notes-toolbar-group">
          <button
            type="button"
            className="notes-tool-btn"
            disabled={safeIndex <= 0}
            onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
            aria-label="Previous note page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="notes-page-indicator">
            Page {safeIndex + 1} / {notes.length}
          </span>
          <button
            type="button"
            className="notes-tool-btn"
            disabled={safeIndex >= notes.length - 1}
            onClick={() => setActiveIndex((i) => Math.min(notes.length - 1, i + 1))}
            aria-label="Next note page"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="notes-toolbar-group">
          <button
            type="button"
            className="notes-tool-btn"
            onClick={handleZoomOut}
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="notes-zoom-label">{zoom}%</span>
          <button
            type="button"
            className="notes-tool-btn"
            onClick={handleZoomIn}
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            className={`notes-tool-btn ${fitWidth ? 'active' : ''}`}
            onClick={handleFitWidth}
            title="Fit to width"
          >
            <RotateCcw size={14} />
            <span>Fit</span>
          </button>
          <button
            type="button"
            className="notes-tool-btn"
            onClick={() => setFullscreen((f) => !f)}
            aria-label={fullscreen ? 'Exit fullscreen reading' : 'Fullscreen reading'}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Note Title & Download Row */}
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <FileText size={18} color="var(--primary)" />
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--text)' }}>
              {current.title}
            </h3>
          </div>
          {current.isDownloadable && blobUrl && !current.locked && (
            <button
              type="button"
              className="btn btn-outline"
              style={{ minHeight: 34, padding: '4px 12px', fontSize: '0.78rem' }}
              onClick={handleDownloadOffline}
            >
              <Download size={14} />
              <span>Save Notes</span>
            </button>
          )}
        </div>

        {current.locked ? (
          <div style={{ marginTop: 14, textAlign: 'center', padding: '14px 8px' }}>
            <Lock size={28} color="#d97706" style={{ marginBottom: 6 }} />
            <p style={{ margin: '0 0 12px', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              Activate your Class 10 SSC subscription to read and download these handwritten notes.
            </p>
            <button type="button" className="btn btn-primary" onClick={onUpgrade}>
              View Subscription Plans
            </button>
          </div>
        ) : (
          <div className="notes-viewer-viewport">
            {fileLoading && <LoadingSkeleton rows={3} />}
            {!fileLoading && fileError && (
              <div className="auth-error-banner" style={{ marginTop: 10 }}>
                {fileError}
              </div>
            )}

            {!fileLoading && blobUrl && current.isPdf && (
              <iframe
                title={current.title}
                src={`${blobUrl}#toolbar=0&navpanes=0&zoom=${zoom}`}
                className="notes-pdf-frame"
                style={{ width: fitWidth ? '100%' : `${zoom}%` }}
              />
            )}

            {!fileLoading && blobUrl && current.isImage && (
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <img
                  src={blobUrl}
                  alt={current.title}
                  style={{
                    width: fitWidth ? '100%' : `${zoom}%`,
                    maxWidth: fitWidth ? '100%' : 'none',
                    borderRadius: 10,
                    display: 'block',
                  }}
                />
              </div>
            )}

            {current.contentMarkdown && (
              <div
                className="notes-markdown-sheet"
                style={{
                  fontSize: `${(0.92 * zoom) / 100}rem`,
                  width: fitWidth ? '100%' : `${zoom}%`,
                }}
              >
                {current.contentMarkdown}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
