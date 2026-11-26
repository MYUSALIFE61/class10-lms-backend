import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import {
  Play,
  Pause,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  RefreshCw,
  AlertTriangle,
  WifiOff,
  Loader2,
  Volume2,
  VolumeX,
  ShieldAlert,
} from 'lucide-react';
import { APP_CONFIG } from '../../config/env.js';
import { useNetwork } from '../../context/NetworkContext.jsx';
import { loadStoredTokens } from '../../services/apiClient.js';
import {
  addScreenProtectionListeners,
  getDeviceMetadata,
  isNativeAndroid,
  openNativeMedia3Player,
  setNativeFullscreen,
} from '../../services/nativeBridge.js';
import { DynamicWatermark } from './DynamicWatermark.jsx';
import {
  isValidYouTubeId,
  loadYouTubeIframeAPI,
  mapYouTubeErrorCode,
} from './youtubeApiLoader.js';

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const rem = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(rem)}` : `${mins}:${pad(rem)}`;
}

function isAllowedOwnStreamUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  if (rawUrl.startsWith('https://')) return true;
  if (rawUrl.startsWith('/api/')) return true;
  if (typeof window !== 'undefined' && window.location?.origin && rawUrl.startsWith(`${window.location.origin}/api/`)) {
    return true;
  }
  // Allow loopback HTTP strictly in dev/test or explicit local-debug builds; production builds enforce HTTPS
  const allowLoopback =
    import.meta.env.DEV ||
    import.meta.env.MODE === 'test' ||
    /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2):/i.test(String(import.meta.env.VITE_API_BASE_URL || ''));
  if (!allowLoopback) return false;
  return (
    rawUrl.startsWith('http://localhost:') ||
    rawUrl.startsWith('http://127.0.0.1:') ||
    rawUrl.startsWith('http://10.0.2.2:')
  );
}

/**
 * LMSVideoPlayer
 * Supports:
 * 1) Own Branded Player (provider="pikpak_local" | "cloudflare_r2" | "private_stream"):
 *    - On Android APK: launches native Android Media3 ExoPlayer (FLAG_SECURE + watermark + controls)
 *    - On Web Browser: renders custom LMS HTML5 <video> player with ZERO YouTube logo or redirect
 * 2) Legacy fallback (provider="youtube_unlisted"): Official YouTube IFrame Player API
 */
export function LMSVideoPlayer({
  lessonId = '',
  provider = 'youtube_unlisted',
  videoId = null,
  streamUrl = null,
  lessonTitle = 'Lesson Video',
  lessonDescription = '',
  notesText = '',
  isCompleted = false,
  hideHeader = false,
  resumeSeconds = 0,
  watermark = null,
  videoSecurity = null,
  previousLesson = null,
  nextLesson = null,
  onSelectLesson = null,
  onProgressSave = null,
}) {
  const { isOnline } = useNetwork();
  const shellRef = useRef(null);
  const mountNodeRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const htmlVideoRef = useRef(null);
  const lastSavedSecRef = useRef(0);
  const resumeAppliedRef = useRef(false);
  const nativeLaunchAttemptedRef = useRef('');
  const fsOverlayTimerRef = useRef(null);

  const isPrivateStream =
    provider === 'private_stream' ||
    provider === 'pikpak_local' ||
    provider === 'cloudflare_r2';
  const nativeAndroid = isNativeAndroid();

  const [playerState, setPlayerState] = useState('loading'); // loading | ready | playing | paused | buffering | ended | error
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(resumeSeconds || 0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFsControls, setShowFsControls] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [nativeActive, setNativeActive] = useState(false);
  const [captureGuard, setCaptureGuard] = useState({
    active: false,
    awaitingManualResume: false,
    threatType: 'NONE',
  });

  const getMediaPositionAndDuration = useCallback(() => {
    if (isPrivateStream && htmlVideoRef.current) {
      return {
        pos: Number(htmlVideoRef.current.currentTime || 0),
        dur: Number(htmlVideoRef.current.duration || duration || 0),
      };
    }
    if (ytPlayerRef.current) {
      return {
        pos: Number(ytPlayerRef.current.getCurrentTime?.() || 0),
        dur: Number(ytPlayerRef.current.getDuration?.() || duration || 0),
      };
    }
    return { pos: 0, dur: 0 };
  }, [duration, isPrivateStream]);

  const flushProgress = useCallback(
    (forceComplete = false) => {
      if (!onProgressSave) return;
      try {
        const { pos, dur } = getMediaPositionAndDuration();
        if (dur <= 0 && !forceComplete) return;
        if (!forceComplete && Math.abs(pos - lastSavedSecRef.current) < 3) return;
        lastSavedSecRef.current = pos;
        onProgressSave({
          positionSeconds: pos,
          durationSeconds: dur,
          markCompleted: forceComplete,
        });
      } catch {
        // Ignore teardown race during route transition
      }
    },
    [getMediaPositionAndDuration, onProgressSave]
  );

  // ---- Engine A: Official YouTube IFrame Player API ----
  useEffect(() => {
    if (isPrivateStream) return undefined;

    let cancelled = false;
    setErrorInfo(null);
    setPlayerState('loading');

    if (!isValidYouTubeId(videoId)) {
      setPlayerState('error');
      setErrorInfo({
        title: 'Invalid Video ID',
        message: 'This lesson does not have a valid 11-character YouTube video ID.',
        retryable: false,
      });
      return undefined;
    }

    if (!isOnline) {
      setPlayerState('error');
      setErrorInfo({
        title: 'No Internet Connection',
        message: 'Connect to mobile data or Wi-Fi to stream this Class 10 lesson.',
        retryable: true,
      });
      return undefined;
    }

    loadYouTubeIframeAPI()
      .then((YT) => {
        if (cancelled || !mountNodeRef.current) return;

        mountNodeRef.current.innerHTML = '';
        const targetDiv = document.createElement('div');
        mountNodeRef.current.appendChild(targetDiv);

        const origin =
          typeof window !== 'undefined' && window.location?.origin?.startsWith('http')
            ? window.location.origin
            : undefined;

        ytPlayerRef.current = new YT.Player(targetDiv, {
          videoId: videoId.trim(),
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 1, // Retain mandatory YouTube controls & branding
            rel: 0,
            iv_load_policy: 3, // Official param: hide video annotations
            playsinline: 1,
            fs: 1, // Preserve native YouTube fullscreen (handled by MainActivity WebChromeClient)
            enablejsapi: 1,
            ...(origin ? { origin } : {}),
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              const dur = Number(event.target.getDuration?.() || 0);
              setDuration(dur);
              if (resumeSeconds > 5 && (dur === 0 || resumeSeconds < dur - 5)) {
                event.target.seekTo?.(resumeSeconds, true);
                setCurrentTime(resumeSeconds);
              }
              setPlayerState('ready');
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const stateCode = event.data;
              const PS = YT.PlayerState || {
                ENDED: 0,
                PLAYING: 1,
                PAUSED: 2,
                BUFFERING: 3,
              };

              if (stateCode === PS.PLAYING) {
                setPlayerState('playing');
                setDuration(Number(event.target.getDuration?.() || 0));
              } else if (stateCode === PS.PAUSED) {
                setPlayerState('paused');
                flushProgress(false);
              } else if (stateCode === PS.BUFFERING) {
                setPlayerState('buffering');
              } else if (stateCode === PS.ENDED) {
                setPlayerState('ended');
                flushProgress(true);
              }
            },
            onError: (event) => {
              if (cancelled) return;
              setPlayerState('error');
              setErrorInfo(mapYouTubeErrorCode(event.data));
            },
          },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setPlayerState('error');
        setErrorInfo({
          title: 'Player Failed to Load',
          message: err.message || 'Unable to load YouTube player right now.',
          retryable: true,
        });
      });

    return () => {
      cancelled = true;
      flushProgress(false);
      if (ytPlayerRef.current?.destroy) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore
        }
      }
      ytPlayerRef.current = null;
    };
  }, [isPrivateStream, videoId, isOnline, reloadNonce]);

  const launchNativePlayer = useCallback(async () => {
    if (!nativeAndroid || !isPrivateStream || !isAllowedOwnStreamUrl(streamUrl)) return;
    setNativeActive(true);
    setPlayerState('playing');
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
      // Non-fatal; playback protection remains active natively even without telemetry token
    }
    const result = await openNativeMedia3Player({
      url: streamUrl,
      title: lessonTitle,
      description: lessonDescription,
      notesText,
      watermarkText,
      startPositionMs: Math.round((currentTime || resumeSeconds || 0) * 1000),
      completed: isCompleted,
      lessonId,
      apiBaseUrl: APP_CONFIG.apiBaseUrl,
      accessToken,
      deviceId,
      videoSecurity,
    });
    setNativeActive(false);
    if (result.launched) {
      const posSec = Math.floor((result.lastPositionMs || 0) / 1000);
      const durSec = Math.floor((result.durationMs || 0) / 1000);
      setCurrentTime(posSec);
      if (durSec > 0) setDuration(durSec);
      setPlayerState(result.completed ? 'ended' : 'paused');
      if (onProgressSave && (posSec > 0 || result.completed)) {
        onProgressSave({
          positionSeconds: posSec,
          durationSeconds: Math.max(durSec, posSec, 1),
          markCompleted: Boolean(result.completed),
        });
      }
    } else {
      setPlayerState('ready');
    }
  }, [
    nativeAndroid,
    isPrivateStream,
    streamUrl,
    lessonTitle,
    lessonDescription,
    notesText,
    watermark,
    currentTime,
    resumeSeconds,
    isCompleted,
    lessonId,
    videoSecurity,
    onProgressSave,
  ]);

  const flushProgressRef = useRef(flushProgress);
  flushProgressRef.current = flushProgress;
  const launchNativePlayerRef = useRef(launchNativePlayer);
  launchNativePlayerRef.current = launchNativePlayer;

  // ---- Engine B: Own Branded Stream (Native Media3 ExoPlayer on Android / Custom HTML5 on Web) ----
  useEffect(() => {
    if (!isPrivateStream) return undefined;

    resumeAppliedRef.current = false;
    setErrorInfo(null);
    setPlayerState('loading');

    if (!isAllowedOwnStreamUrl(streamUrl)) {
      setPlayerState('error');
      setErrorInfo({
        title: 'Invalid Stream URL',
        message: 'This protected lesson stream URL is missing or not valid.',
        retryable: false,
      });
      return undefined;
    }

    if (!isOnline) {
      setPlayerState('error');
      setErrorInfo({
        title: 'No Internet Connection',
        message: 'Connect to mobile data or Wi-Fi to stream this Class 10 lesson.',
        retryable: true,
      });
      return undefined;
    }

    if (nativeAndroid && nativeLaunchAttemptedRef.current !== `${streamUrl}:${reloadNonce}`) {
      nativeLaunchAttemptedRef.current = `${streamUrl}:${reloadNonce}`;
      launchNativePlayerRef.current();
    }

    return () => {
      flushProgressRef.current(false);
    };
  }, [isPrivateStream, streamUrl, isOnline, reloadNonce, nativeAndroid]);

  // Poll playback progress while playing (YouTube mode) & flush every 15s
  useEffect(() => {
    if (playerState !== 'playing') return undefined;
    let tickCount = 0;

    const timer = setInterval(() => {
      try {
        const { pos, dur } = getMediaPositionAndDuration();
        setCurrentTime(pos);
        if (dur > 0) setDuration(dur);
        tickCount += 1;
        if (tickCount % 15 === 0) {
          flushProgress(false);
        }
      } catch {
        // ignore transient errors
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [playerState, getMediaPositionAndDuration, flushProgress]);

  // Pause video & flush progress cleanly when Android app goes to background
  useEffect(() => {
    const pauseMedia = () => {
      try {
        if (isPrivateStream) {
          htmlVideoRef.current?.pause();
        } else {
          ytPlayerRef.current?.pauseVideo?.();
        }
        flushProgress(false);
      } catch {
        // ignore
      }
    };

    const handleBackground = () => {
      if (document.hidden) pauseMedia();
    };

    document.addEventListener('visibilitychange', handleBackground);
    let capHandle = null;

    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) pauseMedia();
      }).then((h) => {
        capHandle = h;
      });
    }

    return () => {
      document.removeEventListener('visibilitychange', handleBackground);
      if (capHandle?.remove) capHandle.remove();
    };
  }, [isPrivateStream, flushProgress]);

  // Listen to native Android screen recording / screen sharing protection events
  useEffect(() => {
    if (!nativeAndroid) return undefined;
    const pauseForProtection = () => {
      try {
        if (isPrivateStream) htmlVideoRef.current?.pause();
        else ytPlayerRef.current?.pauseVideo?.();
      } catch {
        // ignore
      }
    };
    return addScreenProtectionListeners({
      onDetected: (evt) => {
        pauseForProtection();
        setCaptureGuard({
          active: true,
          awaitingManualResume: true,
          threatType: evt?.threatType || 'SCREEN_RECORDING',
        });
      },
      onStopped: () => {
        pauseForProtection();
        setCaptureGuard((prev) => ({
          active: false,
          awaitingManualResume: prev.awaitingManualResume,
          threatType: 'NONE',
        }));
      },
    });
  }, [nativeAndroid, isPrivateStream]);

  const clearFsTimer = useCallback(() => {
    if (fsOverlayTimerRef.current) {
      clearTimeout(fsOverlayTimerRef.current);
      fsOverlayTimerRef.current = null;
    }
  }, []);

  const scheduleFsAutoHide = useCallback(() => {
    clearFsTimer();
    fsOverlayTimerRef.current = setTimeout(() => {
      setShowFsControls(false);
    }, 3500);
  }, [clearFsTimer]);

  const exitFullscreenCleanly = useCallback(async () => {
    clearFsTimer();
    setShowFsControls(false);
    setIsFullscreen(false);
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch {
      // ignore browser fullscreen exit errors
    }
    try {
      window.screen?.orientation?.unlock?.();
    } catch {
      // ignore orientation unlock errors
    }
    await setNativeFullscreen(false);
  }, [clearFsTimer]);

  // Lock page scroll & sync native browser fullscreen exit (e.g., phone Back gesture / Escape)
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    const onBrowserFsChange = () => {
      const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      if (!active && isFullscreen) {
        clearFsTimer();
        setShowFsControls(false);
        setIsFullscreen(false);
        setNativeFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', onBrowserFsChange);
    document.addEventListener('webkitfullscreenchange', onBrowserFsChange);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('fullscreenchange', onBrowserFsChange);
      document.removeEventListener('webkitfullscreenchange', onBrowserFsChange);
    };
  }, [isFullscreen, clearFsTimer]);

  // Android hardware back button exits fullscreen before leaving the lesson screen
  useEffect(() => {
    const handleBack = (evt) => {
      if (isFullscreen) {
        evt.preventDefault();
        exitFullscreenCleanly();
      }
    };
    window.addEventListener('lms:android-back', handleBack);
    return () => {
      window.removeEventListener('lms:android-back', handleBack);
      clearFsTimer();
      setNativeFullscreen(false);
    };
  }, [isFullscreen, exitFullscreenCleanly, clearFsTimer]);

  const togglePlayPause = () => {
    if (captureGuard.active || captureGuard.awaitingManualResume) return;
    if (isPrivateStream && htmlVideoRef.current) {
      if (htmlVideoRef.current.paused) {
        htmlVideoRef.current.play().catch(() => {});
      } else {
        htmlVideoRef.current.pause();
      }
      if (isFullscreen) scheduleFsAutoHide();
      return;
    }
    if (!ytPlayerRef.current) return;
    if (playerState === 'playing') {
      ytPlayerRef.current.pauseVideo?.();
    } else {
      ytPlayerRef.current.playVideo?.();
    }
    if (isFullscreen) scheduleFsAutoHide();
  };

  const handleVideoSurfaceTap = () => {
    if (isFullscreen) {
      setShowFsControls((prev) => {
        const next = !prev;
        if (next) {
          scheduleFsAutoHide();
        } else {
          clearFsTimer();
        }
        return next;
      });
      return;
    }
    togglePlayPause();
  };

  const handleSpeedChange = (newRate) => {
    setPlaybackRate(newRate);
    if (isPrivateStream && htmlVideoRef.current) {
      htmlVideoRef.current.playbackRate = newRate;
    } else {
      ytPlayerRef.current?.setPlaybackRate?.(newRate);
    }
    if (isFullscreen) scheduleFsAutoHide();
  };

  const handleSeek = (targetSeconds) => {
    const clamped = Math.max(0, Math.min(duration || targetSeconds, targetSeconds));
    setCurrentTime(clamped);
    if (isPrivateStream && htmlVideoRef.current) {
      htmlVideoRef.current.currentTime = clamped;
    } else {
      ytPlayerRef.current?.seekTo?.(clamped, true);
    }
    if (isFullscreen) scheduleFsAutoHide();
  };

  const toggleFullscreen = async () => {
    if (isFullscreen) {
      await exitFullscreenCleanly();
      return;
    }
    clearFsTimer();
    setShowFsControls(false); // Pure full-display video until user taps video to reveal Exit
    setIsFullscreen(true);
    try {
      const el = shellRef.current;
      if (el?.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el?.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch {
      // CSS fixed full-display fallback stays active seamlessly
    }
    await setNativeFullscreen(true);
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (isPrivateStream && htmlVideoRef.current) {
      htmlVideoRef.current.muted = next;
    } else if (ytPlayerRef.current) {
      if (next) ytPlayerRef.current.mute?.();
      else ytPlayerRef.current.unMute?.();
    }
    if (isFullscreen) scheduleFsAutoHide();
  };

  const handleRetry = () => {
    setReloadNonce((n) => n + 1);
  };

  const isPlaying = playerState === 'playing';
  const stateLabel = !isOnline
    ? 'Offline'
    : playerState.charAt(0).toUpperCase() + playerState.slice(1);

  const controlsDisabled = playerState === 'loading' || playerState === 'error';

  const renderControlsContent = (inFullscreenOverlay = false) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Thin Royal-Blue Progress SeekBar (Exact Mockup Match) */}
      <input
        aria-label="Seek lesson timeline"
        type="range"
        className="seek-slider cinema-seek"
        min={0}
        max={Math.max(duration, 1)}
        value={Math.min(currentTime, Math.max(duration, 1))}
        disabled={controlsDisabled}
        onChange={(e) => handleSeek(Number(e.target.value))}
      />

      {/* Minimalist White Cinema Control Bar: ||  05:20 / 15:30   -10s +10s 1x 🔊 [ ] */}
      <div className="cinema-controls-bar" data-testid="lms-controls-grid">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="cinema-icon-btn"
            onClick={togglePlayPause}
            disabled={controlsDisabled}
            aria-label={isPlaying ? 'Pause video' : 'Play video'}
          >
            {isPlaying ? <Pause size={20} fill="#ffffff" /> : <Play size={20} fill="#ffffff" />}
          </button>

          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap' }}>
            <span data-testid="time-current">{formatTime(currentTime)}</span>
            {' / '}
            <span data-testid="time-duration">{formatTime(duration)}</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            className="cinema-text-btn"
            onClick={() => handleSeek(currentTime - 10)}
            disabled={controlsDisabled}
            aria-label="Rewind 10 seconds"
          >
            <RotateCcw size={13} />
            <span>10s</span>
          </button>

          <button
            type="button"
            className="cinema-text-btn"
            onClick={() => handleSeek(currentTime + 10)}
            disabled={controlsDisabled}
            aria-label="Forward 10 seconds"
          >
            <span>10s</span>
            <RotateCw size={13} />
          </button>

          <select
            id={inFullscreenOverlay ? 'playback-speed-fs' : 'playback-speed'}
            aria-label="Playback speed"
            className="cinema-speed-select"
            value={playbackRate}
            onChange={(e) => handleSpeedChange(Number(e.target.value))}
            disabled={controlsDisabled}
          >
            {SPEED_OPTIONS.map((rate) => (
              <option key={rate} value={rate} style={{ background: '#0f172a', color: '#fff' }}>
                {rate}x
              </option>
            ))}
          </select>

          <button
            type="button"
            className="cinema-icon-btn"
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {isMuted ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>

          <button
            type="button"
            className="cinema-icon-btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={shellRef}
      className={`lms-player-shell ${isFullscreen ? 'fullscreen' : ''}`}
      data-testid="lms-video-player"
    >
      {/* Lesson Title Bar (hidden in fullscreen and when parent LessonPlayerPage already renders dark top bar) */}
      {!isFullscreen && !hideHeader && (
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
          <div
            style={{
              fontWeight: 700,
              fontSize: '0.9rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {lessonTitle}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {isPrivateStream && (
              <span
                data-testid="private-stream-badge"
                style={{
                  fontSize: '0.68rem',
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: '#064e3b',
                  color: '#6ee7b7',
                  fontWeight: 700,
                }}
              >
                {provider === 'private_stream'
                  ? 'Protected Stream'
                  : nativeAndroid
                    ? 'Own Media3 Player'
                    : 'Own LMS Player'}
              </span>
            )}
            <span
              data-testid="player-state-badge"
              style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: 999,
                background: '#1e293b',
                color: isPlaying ? '#34d399' : '#93c5fd',
                fontWeight: 700,
              }}
            >
              {stateLabel}
            </span>
          </div>
        </div>
      )}

      {/* Video Stage + Dynamic Watermark + Fullscreen Tap-to-Show Exit Overlay */}
      <div className="lms-video-stage" onClick={isFullscreen && !isPrivateStream ? handleVideoSurfaceTap : undefined}>
        {isPrivateStream && nativeAndroid ? (
          <div
            data-testid="native-media3-launcher"
            style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              textAlign: 'center',
              gap: 10,
            }}
          >
            <Play size={36} color="#60a5fa" />
            <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.98rem' }}>
              {nativeActive ? 'Playing in Native Media3 Player...' : 'Ready in Native Media3 ExoPlayer'}
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1', maxWidth: 320 }}>
              Protected hardware-accelerated Android playback with zero third-party logos or external redirects.
            </p>
            <button
              type="button"
              className="player-btn"
              onClick={launchNativePlayer}
              style={{ background: '#2563eb', color: '#fff', padding: '0 16px' }}
            >
              <Play size={15} /> {currentTime > 0 ? `Resume (${formatTime(currentTime)})` : 'Launch Own Media3 Player'}
            </button>
          </div>
        ) : isPrivateStream ? (
          <video
            key={`${streamUrl}-${reloadNonce}`}
            ref={htmlVideoRef}
            src={!errorInfo ? streamUrl : undefined}
            data-testid="private-html5-video"
            playsInline
            preload="auto"
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
            onClick={handleVideoSurfaceTap}
            onLoadedMetadata={(e) => {
              const dur = Number(e.currentTarget.duration || 0);
              setDuration(dur);
              e.currentTarget.playbackRate = playbackRate;
              if (
                !resumeAppliedRef.current &&
                resumeSeconds > 5 &&
                (dur === 0 || resumeSeconds < dur - 5)
              ) {
                resumeAppliedRef.current = true;
                e.currentTarget.currentTime = resumeSeconds;
                setCurrentTime(resumeSeconds);
              }
              setPlayerState((prev) => (prev === 'playing' ? 'playing' : 'ready'));
            }}
            onLoadedData={() => setPlayerState((prev) => (prev === 'loading' ? 'ready' : prev))}
            onCanPlay={() =>
              setPlayerState((prev) => (prev === 'loading' || prev === 'buffering' ? 'ready' : prev))
            }
            onTimeUpdate={(e) => {
              const pos = Number(e.currentTarget.currentTime || 0);
              if (Number.isFinite(pos)) setCurrentTime(pos);
            }}
            onPlay={() => setPlayerState('playing')}
            onPause={() => {
              setPlayerState('paused');
              flushProgress(false);
            }}
            onWaiting={() => setPlayerState('buffering')}
            onPlaying={() => setPlayerState('playing')}
            onEnded={() => {
              setPlayerState('ended');
              flushProgress(true);
            }}
            onError={() => {
              setPlayerState('error');
              setErrorInfo({
                title: 'Stream Playback Failed',
                message:
                  'Unable to stream this protected video right now. Check your internet connection and tap Retry.',
                retryable: true,
              });
            }}
            style={{ width: '100%', height: '100%', background: '#000', objectFit: 'contain' }}
          />
        ) : (
          <div ref={mountNodeRef} style={{ width: '100%', height: '100%' }} />
        )}

        {videoSecurity?.studentWatermarkEnabled !== false && <DynamicWatermark watermark={watermark} />}

        {/* WebView fallback capture warning overlay synchronized with native Kotlin protection events */}
        {(captureGuard.active || captureGuard.awaitingManualResume) && (
          <div
            role="alert"
            data-testid="screen-protection-overlay"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(7, 15, 34, 0.97)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 18,
              textAlign: 'center',
              zIndex: 45,
              gap: 8,
            }}
          >
            <ShieldAlert size={34} color="#facc15" />
            <div style={{ fontWeight: 800, fontSize: '0.96rem', color: '#ffffff', letterSpacing: '0.03em' }}>
              {captureGuard.active
                ? videoSecurity?.warningHeading || 'SCREEN RECORDING DETECTED!'
                : 'Playback Paused'}
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#cbd5e1', maxWidth: 340, whiteSpace: 'pre-line' }}>
              {captureGuard.active
                ? videoSecurity?.warningMessage ||
                  'For the protection of educational content, video playback has been temporarily paused.\n\nPlease stop screen recording or screen sharing to continue watching your lesson.'
                : 'Screen recording or screen sharing has stopped. Tap Resume Lesson when you are ready to continue.'}
            </p>
            {captureGuard.active ? (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#fdba74',
                  background: 'rgba(249, 115, 22, 0.18)',
                  border: '1px solid #f97316',
                  borderRadius: 999,
                  padding: '4px 12px',
                }}
              >
                ● Screen Capture Active — Playback Locked
              </span>
            ) : (
              <button
                type="button"
                className="player-btn"
                style={{ background: '#2563eb', color: '#fff', padding: '0 18px', marginTop: 4 }}
                onClick={() => {
                  setCaptureGuard({ active: false, awaitingManualResume: false, threatType: 'NONE' });
                  if (isPrivateStream && htmlVideoRef.current) {
                    htmlVideoRef.current.play().catch(() => {});
                  } else {
                    ytPlayerRef.current?.playVideo?.();
                  }
                }}
              >
                <Play size={14} /> Resume Lesson
              </button>
            )}
          </div>
        )}

        {/* Tappable center Play button in portrait/normal mode (or in fullscreen when overlay is shown) */}
        {isPrivateStream &&
          !nativeAndroid &&
          !errorInfo &&
          (!isFullscreen || showFsControls) &&
          (playerState === 'ready' || playerState === 'paused' || playerState === 'ended') && (
            <button
              type="button"
              aria-label="Tap to play video"
              onClick={(e) => {
                e.stopPropagation();
                togglePlayPause();
              }}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 62,
                height: 62,
                borderRadius: '50%',
                background: 'rgba(37, 99, 235, 0.92)',
                border: 'none',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.5)',
                cursor: 'pointer',
                zIndex: 28,
              }}
            >
              <Play size={28} fill="#ffffff" />
            </button>
          )}

        {/* Fullscreen Tap-to-Show Overlay: hidden until user clicks video in fullscreen */}
        {isFullscreen && showFsControls && (
          <>
            <div
              className="lms-fs-top-overlay"
              data-testid="fs-top-overlay"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  color: '#fff',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {lessonTitle}
              </div>
              <button
                type="button"
                data-testid="fs-exit-button"
                className="player-btn"
                style={{
                  background: 'rgba(220, 38, 38, 0.92)',
                  borderColor: 'rgba(248, 113, 113, 0.6)',
                  padding: '0 12px',
                  flexShrink: 0,
                }}
                onClick={exitFullscreenCleanly}
                aria-label="Exit fullscreen overlay"
              >
                <Minimize size={15} />
                <span>Exit</span>
              </button>
            </div>

            <div
              className="lms-fs-bottom-overlay"
              data-testid="fs-bottom-overlay"
              onClick={(e) => e.stopPropagation()}
            >
              {renderControlsContent(true)}
            </div>
          </>
        )}

        {/* Bottom Cinema Scrim Overlay directly on bottom of video (normal Own Player view) */}
        {isPrivateStream && !nativeAndroid && !isFullscreen && !errorInfo && (
          <div
            className="lms-cinema-overlay"
            onClick={(e) => e.stopPropagation()}
          >
            {renderControlsContent(false)}
          </div>
        )}

        {(playerState === 'loading' || playerState === 'buffering') && !errorInfo && (
          <div
            data-testid="player-loading"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(2, 6, 23, 0.72)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
            <Loader2 size={28} color="#60a5fa" />
            <span style={{ fontSize: '0.84rem', color: '#e2e8f0' }}>
              {playerState === 'buffering'
                ? 'Buffering stream...'
                : isPrivateStream
                  ? 'Loading protected lesson stream...'
                  : 'Loading YouTube player...'}
            </span>
          </div>
        )}

        {errorInfo && (
          <div
            role="alert"
            data-testid="player-error"
            style={{
              position: 'absolute',
              inset: 0,
              background: '#0f172a',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              textAlign: 'center',
              zIndex: 25,
              gap: 8,
            }}
          >
            {!isOnline ? (
              <WifiOff size={32} color="#f87171" />
            ) : (
              <AlertTriangle size={32} color="#fbbf24" />
            )}
            <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>{errorInfo.title}</div>
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#cbd5e1', maxWidth: 360 }}>
              {errorInfo.message}
            </p>
            {errorInfo.retryable && (
              <button type="button" className="player-btn" onClick={handleRetry} style={{ marginTop: 6, padding: '0 14px' }}>
                <RefreshCw size={14} /> Retry Playback
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls Bar (shown below stage only for YouTube/native fallback or prev/next navigation) */}
      {!isFullscreen && ((!isPrivateStream || nativeAndroid) || previousLesson || nextLesson) && (
        <div className="lms-controls-bar">
          {(!isPrivateStream || nativeAndroid) && renderControlsContent(false)}

          {/* Previous / Next Lesson Controls */}
          {(previousLesson || nextLesson) && (
            <div
              className="lms-controls-row"
              style={{ paddingTop: 6, borderTop: '1px solid #1e293b' }}
            >
              <button
                type="button"
                className="player-btn"
                style={{ padding: '0 10px' }}
                disabled={!previousLesson}
                onClick={() => previousLesson && onSelectLesson?.(previousLesson.id)}
              >
                <SkipBack size={14} />
                <span>{previousLesson ? 'Previous Lesson' : 'Start of Chapter'}</span>
              </button>

              <button
                type="button"
                className="player-btn"
                style={{ padding: '0 10px' }}
                disabled={!nextLesson}
                onClick={() => nextLesson && onSelectLesson?.(nextLesson.id)}
              >
                <span>{nextLesson ? 'Next Lesson' : 'End of Chapter'}</span>
                <SkipForward size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
