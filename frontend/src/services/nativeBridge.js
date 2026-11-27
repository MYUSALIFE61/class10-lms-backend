import { Capacitor, registerPlugin } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { Preferences } from '@capacitor/preferences';

/**
 * Custom Kotlin plugin registered in MainActivity.kt (Phase 5):
 * - FLAG_SECURE screen capture protection
 * - Android Keystore / EncryptedSharedPreferences secure storage
 * - Google Play Integrity token request
 * - Fullscreen landscape orientation control
 */
const Class10Security = registerPlugin('Class10Security');
const Class10MediaPlayer = registerPlugin('Class10MediaPlayer');
const Class10OfflineDownload = registerPlugin('Class10OfflineDownload');

const FALLBACK_STORAGE_PREFIX = 'c10_lms_sec_';
const WEB_DEVICE_ID_KEY = 'c10_lms_device_id';

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function setFlagSecure(enabled) {
  if (!isNativeAndroid()) return { applied: false, platform: 'web' };
  try {
    return await Class10Security.setFlagSecure({ enabled: Boolean(enabled) });
  } catch {
    return { applied: false, platform: 'android' };
  }
}

export async function getScreenProtectionStatus() {
  if (!isNativeAndroid()) {
    return {
      platform: 'web',
      flagSecureEnforced: false,
      isScreenRecording: false,
      isUnsafeDisplayActive: false,
      isCaptureActive: false,
      detectionApiSupported: false,
      androidApiLevel: 0,
    };
  }
  try {
    return await Class10Security.getProtectionStatus();
  } catch {
    return {
      platform: 'android',
      flagSecureEnforced: true,
      isScreenRecording: false,
      isUnsafeDisplayActive: false,
      isCaptureActive: false,
      detectionApiSupported: false,
      androidApiLevel: 0,
    };
  }
}

/**
 * Subscribe to native Android screen protection events emitted by Class10SecurityPlugin.
 * Native Kotlin enforces FLAG_SECURE & Media3 lock independently; JS listeners sync UI status.
 */
export function addScreenProtectionListeners({
  onDetected,
  onStopped,
  onChanged,
} = {}) {
  if (!isNativeAndroid() || typeof Class10Security?.addListener !== 'function') {
    return () => {};
  }

  let disposed = false;
  const handles = [];

  const bind = (eventName, handler) => {
    if (!handler) return;
    Promise.resolve(Class10Security.addListener(eventName, handler))
      .then((handle) => {
        if (disposed) {
          handle?.remove?.();
        } else if (handle) {
          handles.push(handle);
        }
      })
      .catch(() => {});
  };

  bind('screenRecordingDetected', onDetected);
  bind('screenRecordingStopped', onStopped);
  bind('screenProtectionChanged', onChanged);

  return () => {
    disposed = true;
    for (const h of handles) {
      try {
        h?.remove?.();
      } catch {
        // ignore listener teardown errors
      }
    }
  };
}

export async function setSecureItem(key, value) {
  const stringVal = typeof value === 'string' ? value : JSON.stringify(value);
  if (isNativeAndroid()) {
    try {
      await Class10Security.setSecureItem({ key, value: stringVal });
      return;
    } catch {
      await Preferences.set({ key: `${FALLBACK_STORAGE_PREFIX}${key}`, value: stringVal });
      return;
    }
  }
  try {
    window.localStorage.setItem(`${FALLBACK_STORAGE_PREFIX}${key}`, stringVal);
  } catch {
    // Ignore storage quota errors in restricted webviews
  }
}

export async function getSecureItem(key) {
  if (isNativeAndroid()) {
    try {
      const res = await Class10Security.getSecureItem({ key });
      return res?.value ?? null;
    } catch {
      const res = await Preferences.get({ key: `${FALLBACK_STORAGE_PREFIX}${key}` });
      return res?.value ?? null;
    }
  }
  try {
    return window.localStorage.getItem(`${FALLBACK_STORAGE_PREFIX}${key}`);
  } catch {
    return null;
  }
}

export async function removeSecureItem(key) {
  if (isNativeAndroid()) {
    try {
      await Class10Security.removeSecureItem({ key });
      return;
    } catch {
      await Preferences.remove({ key: `${FALLBACK_STORAGE_PREFIX}${key}` });
      return;
    }
  }
  try {
    window.localStorage.removeItem(`${FALLBACK_STORAGE_PREFIX}${key}`);
  } catch {
    // ignore
  }
}

export async function getDeviceMetadata(appVersion = '1.0.0') {
  if (isNativeAndroid()) {
    try {
      const [idInfo, info] = await Promise.all([Device.getId(), Device.getInfo()]);
      return {
        deviceId: idInfo.identifier,
        deviceName: info.model || info.name || 'Android Phone',
        manufacturer: info.manufacturer || 'Android',
        osVersion: info.osVersion || 'unknown',
        appVersion,
        platform: 'android',
      };
    } catch {
      // Fallback below
    }
  }

  let webId = await getSecureItem(WEB_DEVICE_ID_KEY);
  if (!webId) {
    webId = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    await setSecureItem(WEB_DEVICE_ID_KEY, webId);
  }

  return {
    deviceId: webId,
    deviceName: navigator.userAgent.includes('Android') ? 'Android Browser' : 'Web Browser',
    manufacturer: 'Browser',
    osVersion: navigator.platform || 'web',
    appVersion,
    platform: 'web',
  };
}

export async function requestPlayIntegrityToken({ nonce, cloudProjectNumber }) {
  if (!isNativeAndroid() || !nonce) return null;
  try {
    const res = await Class10Security.requestIntegrityToken({
      nonce,
      cloudProjectNumber: cloudProjectNumber || '',
    });
    return res?.token || null;
  } catch {
    return null;
  }
}

export async function setNativeFullscreen(enabled) {
  if (!isNativeAndroid()) return;
  try {
    await Class10Security.setFullscreenMode({ enabled: Boolean(enabled) });
  } catch {
    // Non-fatal
  }
}

/**
 * Launches our native Android Media3 ExoPlayer Activity inside the Capacitor APK
 * (zero YouTube branding/redirects, FLAG_SECURE, dynamic student watermark, speed, seek, fullscreen).
 */
export async function openNativeMedia3Player({
  url,
  title = 'Class 10 Lesson',
  description = '',
  notesText = '',
  watermarkText = '',
  startPositionMs = 0,
  completed = false,
  lessonId = '',
  apiBaseUrl = '',
  accessToken = '',
  deviceId = '',
  videoSecurity = null,
}) {
  if (!isNativeAndroid() || !url) return { launched: false };
  try {
    const res = await Class10MediaPlayer.playVideo({
      url,
      title,
      description,
      notesText,
      watermarkText,
      startPositionMs: Math.max(0, Math.floor(Number(startPositionMs) || 0)),
      completed: Boolean(completed),
      lessonId: lessonId || '',
      apiBaseUrl: apiBaseUrl || '',
      accessToken: accessToken || '',
      deviceId: deviceId || '',
      warningHeading: videoSecurity?.warningHeading || 'SCREEN RECORDING DETECTED!',
      warningMessage:
        videoSecurity?.warningMessage ||
        'For the protection of educational content, video playback has been temporarily paused.\n\nPlease stop screen recording or screen sharing to continue watching your lesson.',
      watermarkEnabled: videoSecurity?.studentWatermarkEnabled !== false,
      screenSharingProtection: videoSecurity?.screenSharingProtection !== false,
      securityEventLogging: videoSecurity?.securityEventLogging !== false,
    });
    return {
      launched: true,
      lastPositionMs: Number(res?.lastPositionMs || 0),
      durationMs: Number(res?.durationMs || 0),
      completed: Boolean(res?.completed),
    };
  } catch {
    return { launched: false };
  }
}

/**
 * Launches native Android Media3 ExoPlayer in verified encrypted offline mode.
 * Reads strictly from app-private AES-256-CTR encrypted storage (zero external players/URLs).
 */
export async function openNativeOfflineMedia3Player({
  studentId,
  lessonId,
  title = 'Class 10 Lesson',
  description = '',
  notesText = '',
  watermarkText = '',
  startPositionMs = 0,
  completed = false,
  apiBaseUrl = '',
  accessToken = '',
  deviceId = '',
  videoSecurity = null,
}) {
  if (!isNativeAndroid() || !studentId || !lessonId) return { launched: false };
  try {
    const res = await Class10MediaPlayer.playOfflineVideo({
      studentId,
      lessonId,
      title,
      description,
      notesText,
      watermarkText,
      startPositionMs: Math.max(0, Math.floor(Number(startPositionMs) || 0)),
      completed: Boolean(completed),
      apiBaseUrl: apiBaseUrl || '',
      accessToken: accessToken || '',
      deviceId: deviceId || '',
      warningHeading: videoSecurity?.warningHeading || 'SCREEN RECORDING DETECTED!',
      warningMessage:
        videoSecurity?.warningMessage ||
        'For the protection of educational content, video playback has been temporarily paused.\n\nPlease stop screen recording or screen sharing to continue watching your lesson.',
      watermarkEnabled: videoSecurity?.studentWatermarkEnabled !== false,
      screenSharingProtection: videoSecurity?.screenSharingProtection !== false,
      securityEventLogging: videoSecurity?.securityEventLogging !== false,
    });
    return {
      launched: true,
      lastPositionMs: Number(res?.lastPositionMs || 0),
      durationMs: Number(res?.durationMs || 0),
      completed: Boolean(res?.completed),
    };
  } catch (err) {
    return { launched: false, errorCode: err?.code || 'OFFLINE_PLAYBACK_FAILED', errorMessage: err?.message || '' };
  }
}

export async function startNativeOfflineDownload(params) {
  if (!isNativeAndroid()) return { unsupported: true };
  return Class10OfflineDownload.startDownload(params);
}

export async function pauseNativeOfflineDownload({ studentId, lessonId }) {
  if (!isNativeAndroid()) return { paused: false };
  return Class10OfflineDownload.pauseDownload({ studentId, lessonId });
}

export async function updateNativeOfflineLease({
  studentId,
  leaseToken,
  leaseExpiresAtEpochMs,
  subscriptionExpiresAtEpochMs = 0,
}) {
  if (!isNativeAndroid()) return { updated: false };
  return Class10OfflineDownload.updateOfflineLease({
    studentId,
    leaseToken,
    leaseExpiresAtEpochMs,
    subscriptionExpiresAtEpochMs,
  });
}

export async function cancelNativeOfflineDownload({ studentId, lessonId }) {
  if (!isNativeAndroid()) return { cancelled: false };
  return Class10OfflineDownload.cancelDownload({ studentId, lessonId });
}

export async function getNativeOfflineDownloadStatus({ studentId, lessonId, deepVerify = false }) {
  if (!isNativeAndroid()) return null;
  return Class10OfflineDownload.getLessonDownloadStatus({ studentId, lessonId, deepVerify });
}

export async function listNativeOfflineDownloads({ studentId }) {
  if (!isNativeAndroid()) return null;
  return Class10OfflineDownload.listDownloads({ studentId });
}

export async function deleteNativeOfflineDownload({ studentId, lessonId }) {
  if (!isNativeAndroid()) return { deleted: false };
  return Class10OfflineDownload.deleteDownload({ studentId, lessonId });
}

export async function updateNativeOfflineProgress({ studentId, lessonId, lastPositionMs, completed }) {
  if (!isNativeAndroid()) return { updated: false };
  return Class10OfflineDownload.updateOfflineProgress({
    studentId,
    lessonId,
    lastPositionMs: Math.max(0, Math.floor(Number(lastPositionMs) || 0)),
    completed: Boolean(completed),
  });
}

export async function clearNativeStudentDownloads({ studentId = '' } = {}) {
  if (!isNativeAndroid()) return { cleared: false, removedCount: 0 };
  return Class10OfflineDownload.clearStudentDownloads({ studentId });
}

export async function getNativeOfflineStorageStats({ studentId = '' } = {}) {
  if (!isNativeAndroid()) return null;
  return Class10OfflineDownload.getStorageStats({ studentId });
}

export function addOfflineDownloadListeners({ onProgress, onStateChanged } = {}) {
  if (!isNativeAndroid() || typeof Class10OfflineDownload?.addListener !== 'function') {
    return () => {};
  }
  let disposed = false;
  const handles = [];
  const bind = (eventName, fn) => {
    if (!fn) return;
    Promise.resolve(Class10OfflineDownload.addListener(eventName, fn))
      .then((h) => {
        if (disposed) h?.remove?.();
        else if (h) handles.push(h);
      })
      .catch(() => {});
  };
  bind('downloadProgress', onProgress);
  bind('downloadStateChanged', onStateChanged);
  return () => {
    disposed = true;
    for (const h of handles) {
      try {
        h?.remove?.();
      } catch {
        // ignore
      }
    }
  };
}
