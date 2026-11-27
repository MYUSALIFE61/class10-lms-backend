import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ShieldCheck,
  WifiOff,
  X,
  AlertTriangle,
} from 'lucide-react';
import { APP_CONFIG } from '../../config/env.js';
import { loadStoredTokens } from '../../services/apiClient.js';
import {
  getDeviceMetadata,
  isNativeAndroid,
  openNativeOfflineMedia3Player,
  setNativeFullscreen,
} from '../../services/nativeBridge.js';
import {
  formatDurationCompact,
  offlineDownloadService,
} from '../../services/offlineDownloadService.js';
import { DynamicWatermark } from '../video/DynamicWatermark.jsx';

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

/**
 * InAppVideoPlayer
 *
 * Plays ONLY verified downloaded videos inside our own LMS player:
 * - On Android APK: launches native Android Media3 ExoPlayer (LmsMedia3PlayerActivity)
 *   reading directly from AES-256-CTR app-private storage via EncryptedOfflineDataSource.
 *   Never launches VLC, MX Player, or external apps. Works 100% offline.
 * - On Web / Test: renders in-app protected HTML5 <video controlsList="nodownload"> from
 *   the verified local Blob with play, pause, seek, volume, speed, fullscreen, watermark,
 *   and last-position resume.
 */
export function InAppVideoPlayer({
  studentId,
  lessonId,
  title = 'Class 10 Lesson',
  description = '',
  notesText = '',
  resumeSeconds = 0,
  durationSeconds = 0,
  completed = false,
  watermark = null,
  videoSecurity = null,
  onProgressSaved = null,
  onMissingFile = null,
  onClose = null,
}) {
  const nativeAndroid = isNativeAndroid();
  const shellRef = useRef(null);
  const videoRef = useRef(null);
  const launchedNativeRef = useRef(false);
  const resumeAppliedRef = useRef(false);

  const [blobUrl, setBlobUrl] = useState('');
  const [nativeActive, setNativeActive] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(Math.max(0, Number(resumeSeconds) || 0));
  const [duration, setDuration] = useState(Math.max(0, Number(durationSeconds) || 0));
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playerError, setPlayerError] = useState('');

  const persistProgress = useCallback(
    async (posSec, durSec, markCompleted = false) => {
      const safePos = Math.max(0, Math.floor(Number(posSec) || 0));
      const safeDur = Math.max(1, Math.floor(Number(durSec || duration || durationSeconds || 1)));
      await offlineDownloadService.savePlaybackPosition({
        studentId,
        lessonId,
        positionSeconds: safePos,
        durationSeconds: safeDur,
        markCompleted: Boolean(markCompleted),
      });
      onProgressSaved?.({
        positionSeconds: safePos,
        durationSeconds: safeDur,
        markCompleted: Boolean(markCompleted),
      });
    },
    [studentId, lessonId, duration, durationSeconds, onProgressSaved]
  );

  // Native Android Media3 Offline Launch
  const launchNativeOfflinePlayer = useCallback(async () => {
    if (!nativeAndroid || !studentId || !lessonId) return;
    setNativeActive(true);
    setPlayerError('');
    const watermarkText = watermark
      ? `${watermark.studentCode || ''} • ${watermark.identifier || ''}`.trim()
      : 'Class 10 SSC LMS';

    let accessToken = '';
    let deviceId = '';
    try {
      const [tokens, device] = await Promise.all([
        loadStoredTokens(),
        getDeviceMetadata(APP_CONFIG.appVersion),
      ]);
      accessToken = tokens?.accessToken || '';
      deviceId = device?.deviceId || '';
    } catch {
      // Offline playback works even without token/network
    }

    const res = await openNativeOfflineMedia3Player({
      studentId,
      lessonId,
      title,
      description,
      notesText,
      watermarkText,
      startPositionMs: Math.round((currentTime || resumeSeconds || 0) * 1000),
      completed,
      apiBaseUrl: APP_CONFIG.apiBaseUrl,
      accessToken,
      deviceId,
      videoSecurity,
    });

    setNativeActive(false);
    if (!res.launched) {
      if (res.errorCode === 'FILE_MISSING') {
        onMissingFile?.();
      }
      setPlayerError(res.errorMessage || 'Offline lesson file could not be opened. Please re-download.');
      return;
    }

    const posSec = Math.floor((res.lastPositionMs || 0) / 1000);
    const durSec = Math.floor((res.durationMs || 0) / 1000);
    setCurrentTime(posSec);
    if (durSec > 0) setDuration(durSec);
    await persistProgress(posSec, durSec || durationSeconds || 1, Boolean(res.completed));
    onClose?.();
  }, [
    nativeAndroid,
    studentId,
    lessonId,
    title,
    description,
    notesText,
    watermark,
    currentTime,
    resumeSeconds,
    completed,
    videoSecurity,
    durationSeconds,
    persistProgress,
    onMissingFile,
    onClose,
  ]);

  useEffect(() => {
    if (nativeAndroid) {
      if (!launchedNativeRef.current) {
        launchedNativeRef.current = true;
        launchNativeOfflinePlayer();
      }
      return undefined;
    }

    // Web / Vitest verified local blob playback (never exposes a public server file URL)
    const blob = offlineDownloadService.getWebVerifiedBlob({ studentId, lessonId });
    if (!blob) {
      setPlayerError('Downloaded offline video file is missing. Please download it again.');
      onMissingFile?.();
      return undefined;
    }

    const objectUrl = typeof URL?.createObjectURL === 'function' ? URL.createObjectURL(blob) : 'blob:offline-verified';
    setBlobUrl(objectUrl);

    return () => {
      if (objectUrl && objectUrl.startsWith('blob:') && typeof URL?.revokeObjectURL === 'function') {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [nativeAndroid, studentId, lessonId, launchNativeOfflinePlayer, onMissingFile]);

  const togglePlayPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play?.().catch?.(() => { });
      setIsPlaying(true);
    } else {
      v.pause?.();
      setIsPlaying(false);
      persistProgress(v.currentTime, v.duration, false);
    }
  };

  const handleSeek = (targetSec) => {
    const clamped = Math.max(0, Math.min(duration || targetSec, targetSec));
    setCurrentTime(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  const handleSpeedChange = (nextRate) => {
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
  };

  const handleVolumeChange = (nextVol) => {
    const v = Math.min(1, Math.max(0, Number(nextVol)));
    setVolume(v);
    setIsMuted(v === 0);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (videoRef.current) {
      videoRef.current.muted = next;
    }
  };

  const toggleFullscreen = async () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    try {
      if (next) {
        await shellRef.current?.requestFullscreen?.();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen?.();
      }
    } catch {
      // CSS fullscreen fallback remains active
    }
    await setNativeFullscreen(next);
  };

  const handleClose = () => {
    const v = videoRef.current;
    if (v) {
      v.pause?.();
      persistProgress(v.currentTime || currentTime, v.duration || duration, false);
    }
    onClose?.();
  };

  return (
    <div
      ref={shellRef}
      data-testid="in-app-offline-player"
      className={`lms-player-shell ${isFullscreen ? 'fullscreen' : ''}`}
      style={{ borderRadius: isFullscreen ? 0 : 16, overflow: 'hidden', background: '#020617' }}
    >
      {/* Top Protected Offline Player Header */}
      <div
        style={{
          padding: '10px 14px',
          background: '#0f172a',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            data-testid="offline-mode-badge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.68rem',
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 999,
              background: '#064e3b',
              color: '#6ee7b7',
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={12} /> Offline Media3 Player
          </span>
          <span
            style={{
              color: '#f8fafc',
              fontWeight: 700,
              fontSize: '0.86rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            className="cinema-icon-btn"
            aria-label="Close offline player"
            onClick={handleClose}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Video Stage */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000' }}>
        {playerError ? (
          <div
            data-testid="offline-player-error"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              textAlign: 'center',
              color: '#fecaca',
              gap: 8,
            }}
          >
            <AlertTriangle size={30} color="#f87171" />
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{playerError}</div>
          </div>
        ) : nativeAndroid ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              color: '#e2e8f0',
              padding: 18,
              textAlign: 'center',
            }}
          >
            <WifiOff size={26} color="#34d399" />
            <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
              {nativeActive ? 'Playing in Native Android Media3 Player...' : 'Encrypted Offline Lesson Ready'}
            </div>
            {!nativeActive && (
              <button
                type="button"
                className="btn btn-emerald"
                onClick={launchNativeOfflinePlayer}
              >
                <Play size={16} fill="#ffffff" /> Open Media3 Player
              </button>
            )}
          </div>
        ) : (
          <video
            ref={videoRef}
            data-testid="offline-html5-video"
            src={blobUrl || undefined}
            playsInline
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
            onLoadedMetadata={(e) => {
              const dur = Number(e.currentTarget.duration || durationSeconds || 0);
              if (dur > 0) setDuration(dur);
              if (!resumeAppliedRef.current && resumeSeconds > 0 && (dur === 0 || resumeSeconds < dur - 2)) {
                resumeAppliedRef.current = true;
                e.currentTarget.currentTime = resumeSeconds;
                setCurrentTime(resumeSeconds);
              }
            }}
            onTimeUpdate={(e) => {
              setCurrentTime(Number(e.currentTarget.currentTime || 0));
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={(e) => {
              setIsPlaying(false);
              persistProgress(e.currentTarget.currentTime, e.currentTarget.duration, false);
            }}
            onEnded={(e) => {
              setIsPlaying(false);
              persistProgress(e.currentTarget.duration || duration, e.currentTarget.duration || duration, true);
            }}
          />
        )}

        {watermark && videoSecurity?.studentWatermarkEnabled !== false && (
          <DynamicWatermark watermark={watermark} />
        )}
      </div>

      {/* Controls Bar (Web / Test Mode) */}
      {!nativeAndroid && !playerError && (
        <div style={{ padding: '10px 14px', background: '#0f172a', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            aria-label="Seek offline video"
            type="range"
            className="seek-slider cinema-seek"
            min={0}
            max={Math.max(duration, 1)}
            value={Math.min(currentTime, Math.max(duration, 1))}
            onChange={(e) => handleSeek(Number(e.target.value))}
          />

          <div className="cinema-controls-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="cinema-icon-btn"
                aria-label={isPlaying ? 'Pause offline video' : 'Play offline video'}
                onClick={togglePlayPause}
              >
                {isPlaying ? <Pause size={19} fill="#ffffff" /> : <Play size={19} fill="#ffffff" />}
              </button>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff' }}>
                {formatDurationCompact(currentTime)} / {formatDurationCompact(duration)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="cinema-text-btn"
                aria-label="Rewind 10 seconds"
                onClick={() => handleSeek(currentTime - 10)}
              >
                <RotateCcw size={13} /> 10s
              </button>
              <button
                type="button"
                className="cinema-text-btn"
                aria-label="Forward 10 seconds"
                onClick={() => handleSeek(currentTime + 10)}
              >
                10s <RotateCw size={13} />
              </button>
              <select
                aria-label="Offline playback speed"
                className="cinema-speed-select"
                value={playbackRate}
                onChange={(e) => handleSpeedChange(Number(e.target.value))}
              >
                {SPEED_OPTIONS.map((r) => (
                  <option key={r} value={r} style={{ background: '#0f172a', color: '#fff' }}>
                    {r}x
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="cinema-icon-btn"
                aria-label={isMuted ? 'Unmute offline video' : 'Mute offline video'}
                onClick={toggleMute}
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                aria-label="Volume"
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(e.target.value)}
                style={{ width: 52 }}
              />
              <button
                type="button"
                className="cinema-icon-btn"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                onClick={toggleFullscreen}
              >
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

