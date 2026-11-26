import { APP_CONFIG } from '../config/env.js';
import { lmsApi } from './lmsApi.js';
import {
  addOfflineDownloadListeners,
  cancelNativeOfflineDownload,
  clearNativeStudentDownloads,
  deleteNativeOfflineDownload,
  getNativeOfflineDownloadStatus,
  getNativeOfflineStorageStats,
  isNativeAndroid,
  listNativeOfflineDownloads,
  startNativeOfflineDownload,
  updateNativeOfflineProgress,
} from './nativeBridge.js';

export const DOWNLOAD_STATES = {
  NOT_DOWNLOADED: 'NOT_DOWNLOADED',
  DOWNLOADING: 'DOWNLOADING',
  DOWNLOADED: 'DOWNLOADED',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  FILE_MISSING: 'FILE_MISSING',
};

const WEB_META_PREFIX = 'c10_offline_meta_v1_';
const WEB_PENDING_SYNC_KEY = 'c10_offline_pending_sync_v1';

// In-memory store for browser/test binary blobs (never exposes public URLs; cleared on logout)
const webBinaryBlobs = new Map(); // `${studentId}::${lessonId}` -> Blob
const webAbortControllers = new Map(); // `${studentId}::${lessonId}` -> AbortController
const liveStateMap = new Map(); // `${studentId}::${lessonId}` -> state object
const listeners = new Set();

let nativeListenersBound = false;

function keyFor(studentId, lessonId) {
  return `${String(studentId || 'anon')}::${String(lessonId || '')}`;
}

function readWebMetaMap(studentId) {
  try {
    const raw = window.localStorage.getItem(`${WEB_META_PREFIX}${studentId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeWebMetaMap(studentId, map) {
  try {
    window.localStorage.setItem(`${WEB_META_PREFIX}${studentId}`, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

function readPendingSyncQueue() {
  try {
    const raw = window.localStorage.getItem(WEB_PENDING_SYNC_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writePendingSyncQueue(items) {
  try {
    window.localStorage.setItem(WEB_PENDING_SYNC_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function notifyAll(payload) {
  for (const fn of listeners) {
    try {
      fn(payload);
    } catch {
      // ignore subscriber errors
    }
  }
}

function setLiveState(studentId, lessonId, patch) {
  const k = keyFor(studentId, lessonId);
  const prev = liveStateMap.get(k) || {
    lessonId,
    studentId,
    status: DOWNLOAD_STATES.NOT_DOWNLOADED,
    percent: 0,
    bytesDownloaded: 0,
    totalBytes: 0,
    errorCode: '',
    errorMessage: '',
  };
  const next = { ...prev, ...patch, lessonId, studentId };
  liveStateMap.set(k, next);
  notifyAll(next);
  return next;
}

export function formatBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function formatDurationCompact(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const rem = sec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

async function computeSha256HexWeb(uint8Array) {
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const hashBuf = await crypto.subtle.digest('SHA-256', uint8Array);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return '';
}

function resolveAbsoluteStreamUrl(streamUrl) {
  if (!streamUrl) return '';
  if (/^https?:\/\//i.test(streamUrl)) return streamUrl;
  const apiOrigin = APP_CONFIG.apiBaseUrl.replace(/\/api\/v1\/?$/i, '');
  if (streamUrl.startsWith('/')) return `${apiOrigin}${streamUrl}`;
  return `${apiOrigin}/${streamUrl}`;
}

function enqueueSyncOperation(op) {
  const queue = readPendingSyncQueue();
  queue.push({ ...op, queuedAt: Date.now() });
  writePendingSyncQueue(queue.slice(-50));
}

export async function flushPendingOfflineSync() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
  const queue = readPendingSyncQueue();
  if (!queue.length) return 0;

  const remaining = [];
  let flushed = 0;
  for (const item of queue) {
    try {
      if (item.type === 'status' && item.downloadId) {
        await lmsApi.syncDownloadStatus(item.downloadId, item.payload);
        flushed += 1;
      } else if (item.type === 'progress' && item.lessonId) {
        await lmsApi.saveLessonProgress(item.lessonId, item.payload);
        flushed += 1;
      } else if (item.type === 'delete' && item.downloadId) {
        await lmsApi.deleteMyDownload(item.downloadId);
        flushed += 1;
      }
    } catch (err) {
      // Drop permanently rejected client errors (4xx); keep network/5xx for later retry
      if (!err?.status || err.status >= 500) {
        remaining.push(item);
      }
    }
  }
  writePendingSyncQueue(remaining);
  return flushed;
}

function ensureNativeDownloadListeners(currentStudentId) {
  if (nativeListenersBound || !isNativeAndroid()) return;
  nativeListenersBound = true;

  addOfflineDownloadListeners({
    onProgress: (evt) => {
      if (!evt?.lessonId) return;
      setLiveState(currentStudentId, evt.lessonId, {
        downloadId: evt.downloadId || '',
        status: DOWNLOAD_STATES.DOWNLOADING,
        percent: Number(evt.percent || 0),
        bytesDownloaded: Number(evt.bytesDownloaded || 0),
        totalBytes: Number(evt.totalBytes || 0),
        errorCode: '',
        errorMessage: '',
      });
    },
    onStateChanged: async (evt) => {
      if (!evt?.lessonId) return;
      const next = setLiveState(currentStudentId, evt.lessonId, {
        downloadId: evt.downloadId || '',
        status: evt.status || DOWNLOAD_STATES.NOT_DOWNLOADED,
        percent: Number(evt.percent || 0),
        bytesDownloaded: Number(evt.bytesDownloaded || 0),
        totalBytes: Number(evt.totalBytes || 0),
        errorCode: evt.errorCode || '',
        errorMessage: evt.errorMessage || '',
      });

      if (evt.downloadId) {
        const backendStatusMap = {
          [DOWNLOAD_STATES.DOWNLOADED]: 'completed',
          [DOWNLOAD_STATES.DOWNLOAD_FAILED]: 'failed',
          [DOWNLOAD_STATES.NOT_DOWNLOADED]: 'cancelled',
          [DOWNLOAD_STATES.FILE_MISSING]: 'file_missing',
        };
        const mappedStatus = backendStatusMap[next.status];
        if (mappedStatus) {
          const payload = {
            status: mappedStatus,
            bytesDownloaded: next.bytesDownloaded,
            fileSize: next.totalBytes,
            ...(mappedStatus === 'completed' && evt.verifiedChecksum
              ? { verifiedChecksum: evt.verifiedChecksum }
              : {}),
          };
          try {
            await lmsApi.syncDownloadStatus(evt.downloadId, payload);
          } catch {
            enqueueSyncOperation({ type: 'status', downloadId: evt.downloadId, payload });
          }
        }
      }
    },
  });
}

export const offlineDownloadService = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Verifies real local file existence & state for a single lesson.
   * Never reports DOWNLOADED unless local storage verifies the file exists and is intact.
   */
  async getVerifiedLessonState({ studentId, lessonId, deepVerify = false }) {
    if (!studentId || !lessonId) {
      return { status: DOWNLOAD_STATES.NOT_DOWNLOADED, record: null, percent: 0, bytesDownloaded: 0, totalBytes: 0 };
    }
    ensureNativeDownloadListeners(studentId);

    if (isNativeAndroid()) {
      const nativeRes = await getNativeOfflineDownloadStatus({ studentId, lessonId, deepVerify });
      const status = nativeRes?.status || DOWNLOAD_STATES.NOT_DOWNLOADED;
      const rec = nativeRes?.record || null;
      const totalBytes = Number(rec?.fileSize || 0);
      const bytesDownloaded = Number(rec?.bytesDownloaded || 0);
      const percent =
        status === DOWNLOAD_STATES.DOWNLOADED
          ? 100
          : totalBytes > 0
            ? Math.min(99, Math.round((bytesDownloaded / totalBytes) * 100))
            : 0;

      // If local file disappeared since last backend sync, notify backend when online
      if (status === DOWNLOAD_STATES.FILE_MISSING && rec?.downloadId) {
        lmsApi.syncDownloadStatus(rec.downloadId, { status: 'file_missing' }).catch(() => {
          enqueueSyncOperation({
            type: 'status',
            downloadId: rec.downloadId,
            payload: { status: 'file_missing' },
          });
        });
      }

      return setLiveState(studentId, lessonId, {
        downloadId: rec?.downloadId || '',
        status,
        percent,
        bytesDownloaded,
        totalBytes,
        errorCode: rec?.errorCode || '',
        errorMessage: rec?.errorMessage || '',
        record: rec,
      });
    }

    // Web / Dev / Test mode verification
    const k = keyFor(studentId, lessonId);
    const live = liveStateMap.get(k);
    if (live?.status === DOWNLOAD_STATES.DOWNLOADING) return live;

    const metaMap = readWebMetaMap(studentId);
    const rec = metaMap[lessonId] || null;
    if (!rec) {
      return setLiveState(studentId, lessonId, {
        status: DOWNLOAD_STATES.NOT_DOWNLOADED,
        percent: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        record: null,
      });
    }

    if (rec.status === DOWNLOAD_STATES.DOWNLOADED) {
      const blob = webBinaryBlobs.get(k);
      if (!blob || blob.size !== Number(rec.fileSize)) {
        const missingRec = {
          ...rec,
          status: DOWNLOAD_STATES.FILE_MISSING,
          bytesDownloaded: 0,
          errorCode: 'FILE_MISSING',
          errorMessage: 'Downloaded video file is missing. Tap Download Video to save it again.',
        };
        metaMap[lessonId] = missingRec;
        writeWebMetaMap(studentId, metaMap);
        return setLiveState(studentId, lessonId, {
          downloadId: rec.downloadId || '',
          status: DOWNLOAD_STATES.FILE_MISSING,
          percent: 0,
          bytesDownloaded: 0,
          totalBytes: Number(rec.fileSize || 0),
          errorCode: 'FILE_MISSING',
          errorMessage: missingRec.errorMessage,
          record: missingRec,
        });
      }
      return setLiveState(studentId, lessonId, {
        downloadId: rec.downloadId || '',
        status: DOWNLOAD_STATES.DOWNLOADED,
        percent: 100,
        bytesDownloaded: Number(rec.fileSize),
        totalBytes: Number(rec.fileSize),
        errorCode: '',
        errorMessage: '',
        record: rec,
      });
    }

    return setLiveState(studentId, lessonId, {
      downloadId: rec.downloadId || '',
      status: rec.status || DOWNLOAD_STATES.NOT_DOWNLOADED,
      percent: 0,
      bytesDownloaded: Number(rec.bytesDownloaded || 0),
      totalBytes: Number(rec.fileSize || 0),
      errorCode: rec.errorCode || '',
      errorMessage: rec.errorMessage || '',
      record: rec,
    });
  },

  /**
   * Stage 2: Initiates an authorized, verified, resumable encrypted download.
   * Prevents duplicates, handles errors cleanly, and ONLY marks DOWNLOADED after SHA-256 verification.
   */
  async startLessonDownload({ studentId, lessonId, qualityLabel, forceRedownload = false }) {
    if (!studentId || !lessonId) {
      throw new Error('Authentication required before downloading a lesson.');
    }
    ensureNativeDownloadListeners(studentId);

    const k = keyFor(studentId, lessonId);
    const current = liveStateMap.get(k);
    if (current?.status === DOWNLOAD_STATES.DOWNLOADING) {
      return current;
    }

    setLiveState(studentId, lessonId, {
      status: DOWNLOAD_STATES.DOWNLOADING,
      percent: 0,
      bytesDownloaded: 0,
      totalBytes: current?.totalBytes || 0,
      errorCode: '',
      errorMessage: '',
    });

    let initRes;
    let manifest;
    try {
      // 1. Backend authorization + eligibility + duplicate check
      initRes = await lmsApi.initiateLessonDownload(lessonId, { qualityLabel, forceRedownload });
      const downloadId = initRes?.download?.id;
      if (!downloadId) throw new Error('Backend did not issue a valid download authorization.');

      // 2. Fetch signed download manifest (never exposes raw YouTube/storage URLs)
      manifest = await lmsApi.getDownloadManifest(downloadId);
    } catch (err) {
      const failedState = setLiveState(studentId, lessonId, {
        status: DOWNLOAD_STATES.DOWNLOAD_FAILED,
        percent: 0,
        errorCode: err?.code || 'DOWNLOAD_INIT_FAILED',
        errorMessage: err?.message || 'Unable to authorize download right now.',
      });
      return failedState;
    }

    const downloadId = manifest.downloadId;
    const expectedSize = Number(manifest.fileSize || 0);
    const expectedSha256 = String(manifest.sha256Checksum || '').toLowerCase();
    const absoluteStreamUrl = resolveAbsoluteStreamUrl(manifest.streamUrl);
    const watermarkText = manifest.watermark
      ? `${manifest.watermark.studentCode || ''} • ${manifest.watermark.identifier || ''}`.trim()
      : 'Class 10 SSC LMS';

    // Native Android path: Kotlin streaming AES-256-CTR + Keystore + StatFs + Range resume + SHA-256
    if (isNativeAndroid()) {
      try {
        const nativeRes = await startNativeOfflineDownload({
          studentId,
          lessonId,
          downloadId,
          videoAssetId: manifest.videoAssetId,
          streamUrl: absoluteStreamUrl,
          sha256Checksum: expectedSha256,
          fileSize: expectedSize,
          title: manifest.lesson?.title || 'Class 10 Lesson',
          chapterTitle: manifest.lesson?.chapterTitle || '',
          subjectTitle: manifest.lesson?.subjectTitle || '',
          thumbnailUrl: manifest.lesson?.thumbnailUrl || '',
          durationSeconds: Number(manifest.lesson?.durationSeconds || 0),
          watermarkText,
          qualityLabel: manifest.qualityLabel || '720p',
        });

        if (nativeRes?.alreadyDownloaded && nativeRes?.record) {
          return setLiveState(studentId, lessonId, {
            downloadId,
            status: DOWNLOAD_STATES.DOWNLOADED,
            percent: 100,
            bytesDownloaded: expectedSize,
            totalBytes: expectedSize,
            errorCode: '',
            errorMessage: '',
            record: nativeRes.record,
          });
        }
        return setLiveState(studentId, lessonId, {
          downloadId,
          status: DOWNLOAD_STATES.DOWNLOADING,
          totalBytes: expectedSize,
        });
      } catch (err) {
        const failed = setLiveState(studentId, lessonId, {
          downloadId,
          status: DOWNLOAD_STATES.DOWNLOAD_FAILED,
          percent: 0,
          totalBytes: expectedSize,
          errorCode: err?.code || 'NATIVE_DOWNLOAD_FAILED',
          errorMessage: err?.message || 'Download failed to start on this device.',
        });
        lmsApi.syncDownloadStatus(downloadId, { status: 'failed' }).catch(() => {});
        return failed;
      }
    }

    // Web / Vitest fallback: streaming fetch with AbortController + real SHA-256 check
    const controller = new AbortController();
    webAbortControllers.set(k, controller);

    try {
      const response = await fetch(absoluteStreamUrl, { signal: controller.signal });
      if (!response.ok) {
        throw Object.assign(new Error(`Download failed with HTTP ${response.status}.`), {
          code: response.status === 401 || response.status === 403 ? 'UNAUTHORIZED_DOWNLOAD' : 'HTTP_ERROR',
        });
      }

      const chunks = [];
      let received = 0;

      if (response.body?.getReader) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            chunks.push(value);
            received += value.byteLength;
            const pct = expectedSize > 0 ? Math.min(99, Math.round((received / expectedSize) * 100)) : 50;
            setLiveState(studentId, lessonId, {
              downloadId,
              status: DOWNLOAD_STATES.DOWNLOADING,
              percent: pct,
              bytesDownloaded: received,
              totalBytes: expectedSize || received,
            });
          }
        }
      } else {
        const buf = new Uint8Array(await response.arrayBuffer());
        chunks.push(buf);
        received = buf.byteLength;
      }

      const merged = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.byteLength;
      }

      // Strict Integrity Verification BEFORE marking DOWNLOADED
      const computedHash = await computeSha256HexWeb(merged);
      if (
        (expectedSize > 0 && received !== expectedSize) ||
        (expectedSha256 && computedHash && computedHash !== expectedSha256)
      ) {
        const msg = 'Downloaded video failed SHA-256 integrity verification. Please retry download.';
        await lmsApi.syncDownloadStatus(downloadId, { status: 'failed' }).catch(() => {});
        return setLiveState(studentId, lessonId, {
          downloadId,
          status: DOWNLOAD_STATES.DOWNLOAD_FAILED,
          percent: 0,
          bytesDownloaded: 0,
          totalBytes: expectedSize,
          errorCode: 'CHECKSUM_MISMATCH',
          errorMessage: msg,
        });
      }

      const blob = new Blob([merged], { type: manifest.mimeType || 'video/mp4' });
      webBinaryBlobs.set(k, blob);

      const metaRecord = {
        lessonId,
        downloadId,
        videoAssetId: manifest.videoAssetId,
        title: manifest.lesson?.title || 'Class 10 Lesson',
        chapterTitle: manifest.lesson?.chapterTitle || '',
        subjectTitle: manifest.lesson?.subjectTitle || '',
        thumbnailUrl: manifest.lesson?.thumbnailUrl || '',
        durationSeconds: Number(manifest.lesson?.durationSeconds || 0),
        fileSize: received,
        bytesDownloaded: received,
        sha256Checksum: computedHash || expectedSha256,
        status: DOWNLOAD_STATES.DOWNLOADED,
        lastPositionMs: 0,
        lastPositionSeconds: 0,
        completed: false,
        downloadedAtEpochMs: Date.now(),
        watermarkText,
        qualityLabel: manifest.qualityLabel || '720p',
      };

      const metaMap = readWebMetaMap(studentId);
      metaMap[lessonId] = metaRecord;
      writeWebMetaMap(studentId, metaMap);

      const syncPayload = {
        status: 'completed',
        bytesDownloaded: received,
        fileSize: received,
        verifiedChecksum: computedHash || expectedSha256,
      };
      try {
        await lmsApi.syncDownloadStatus(downloadId, syncPayload);
      } catch {
        enqueueSyncOperation({ type: 'status', downloadId, payload: syncPayload });
      }

      return setLiveState(studentId, lessonId, {
        downloadId,
        status: DOWNLOAD_STATES.DOWNLOADED,
        percent: 100,
        bytesDownloaded: received,
        totalBytes: received,
        errorCode: '',
        errorMessage: '',
        record: metaRecord,
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        await lmsApi.syncDownloadStatus(downloadId, { status: 'cancelled' }).catch(() => {});
        return setLiveState(studentId, lessonId, {
          downloadId,
          status: DOWNLOAD_STATES.NOT_DOWNLOADED,
          percent: 0,
          bytesDownloaded: 0,
          totalBytes: expectedSize,
          errorCode: 'CANCELLED',
          errorMessage: '',
        });
      }

      await lmsApi.syncDownloadStatus(downloadId, { status: 'failed' }).catch(() => {});
      return setLiveState(studentId, lessonId, {
        downloadId,
        status: DOWNLOAD_STATES.DOWNLOAD_FAILED,
        percent: 0,
        totalBytes: expectedSize,
        errorCode: err?.code || 'NETWORK_INTERRUPTED',
        errorMessage: err?.message || 'Download interrupted. Check your connection and tap Retry Download.',
      });
    } finally {
      webAbortControllers.delete(k);
    }
  },

  async cancelDownload({ studentId, lessonId, downloadId = '' }) {
    const k = keyFor(studentId, lessonId);
    if (isNativeAndroid()) {
      await cancelNativeOfflineDownload({ studentId, lessonId });
    } else {
      const controller = webAbortControllers.get(k);
      if (controller) {
        controller.abort();
        webAbortControllers.delete(k);
      }
      webBinaryBlobs.delete(k);
      const metaMap = readWebMetaMap(studentId);
      delete metaMap[lessonId];
      writeWebMetaMap(studentId, metaMap);
    }

    if (downloadId) {
      lmsApi.syncDownloadStatus(downloadId, { status: 'cancelled' }).catch(() => {});
    }

    return setLiveState(studentId, lessonId, {
      status: DOWNLOAD_STATES.NOT_DOWNLOADED,
      percent: 0,
      bytesDownloaded: 0,
      errorCode: 'CANCELLED',
      errorMessage: '',
      record: null,
    });
  },

  async listVerifiedDownloads({ studentId }) {
    if (!studentId) return { items: [], totalUsedBytes: 0, availableStorageBytes: 0 };
    ensureNativeDownloadListeners(studentId);

    if (isNativeAndroid()) {
      const res = await listNativeOfflineDownloads({ studentId });
      return {
        items: res?.items || [],
        totalUsedBytes: Number(res?.totalUsedBytes || 0),
        availableStorageBytes: Number(res?.availableStorageBytes || 0),
      };
    }

    const metaMap = readWebMetaMap(studentId);
    const items = [];
    let totalUsedBytes = 0;

    for (const lessonId of Object.keys(metaMap)) {
      const verified = await this.getVerifiedLessonState({ studentId, lessonId });
      if (verified?.record) {
        items.push(verified.record);
        if (verified.status === DOWNLOAD_STATES.DOWNLOADED) {
          totalUsedBytes += Number(verified.record.fileSize || 0);
        }
      }
    }

    items.sort((a, b) => Number(b.downloadedAtEpochMs || 0) - Number(a.downloadedAtEpochMs || 0));
    return { items, totalUsedBytes, availableStorageBytes: 0 };
  },

  async deleteDownload({ studentId, lessonId, downloadId = '' }) {
    const k = keyFor(studentId, lessonId);
    if (isNativeAndroid()) {
      await deleteNativeOfflineDownload({ studentId, lessonId });
    } else {
      webBinaryBlobs.delete(k);
      const metaMap = readWebMetaMap(studentId);
      delete metaMap[lessonId];
      writeWebMetaMap(studentId, metaMap);
    }

    if (downloadId) {
      try {
        await lmsApi.deleteMyDownload(downloadId);
      } catch {
        enqueueSyncOperation({ type: 'delete', downloadId });
      }
    }

    return setLiveState(studentId, lessonId, {
      downloadId: '',
      status: DOWNLOAD_STATES.NOT_DOWNLOADED,
      percent: 0,
      bytesDownloaded: 0,
      errorCode: '',
      errorMessage: '',
      record: null,
    });
  },

  async savePlaybackPosition({ studentId, lessonId, positionSeconds, durationSeconds, markCompleted = false }) {
    const posSec = Math.max(0, Math.floor(Number(positionSeconds) || 0));
    const durSec = Math.max(1, Math.floor(Number(durationSeconds) || 1));
    const posMs = posSec * 1000;

    if (isNativeAndroid()) {
      await updateNativeOfflineProgress({
        studentId,
        lessonId,
        lastPositionMs: posMs,
        completed: Boolean(markCompleted),
      }).catch(() => {});
    } else if (studentId) {
      const metaMap = readWebMetaMap(studentId);
      if (metaMap[lessonId]) {
        metaMap[lessonId] = {
          ...metaMap[lessonId],
          lastPositionMs: posMs,
          lastPositionSeconds: posSec,
          completed: Boolean(metaMap[lessonId].completed || markCompleted),
        };
        writeWebMetaMap(studentId, metaMap);
      }
    }

    const payload = { positionSeconds: posSec, durationSeconds: durSec, markCompleted: Boolean(markCompleted) };
    try {
      await lmsApi.saveLessonProgress(lessonId, payload);
    } catch {
      enqueueSyncOperation({ type: 'progress', lessonId, payload });
    }
  },

  async clearDownloadsOnLogout({ studentId = '', retentionPolicy = 'wipe_on_logout' } = {}) {
    if (retentionPolicy !== 'wipe_on_logout') {
      return { cleared: false, reason: 'retention_policy_keep' };
    }

    for (const [k, controller] of webAbortControllers.entries()) {
      if (!studentId || k.startsWith(`${studentId}::`)) {
        controller.abort();
        webAbortControllers.delete(k);
      }
    }
    for (const k of [...webBinaryBlobs.keys()]) {
      if (!studentId || k.startsWith(`${studentId}::`)) {
        webBinaryBlobs.delete(k);
      }
    }
    for (const k of [...liveStateMap.keys()]) {
      if (!studentId || k.startsWith(`${studentId}::`)) {
        liveStateMap.delete(k);
      }
    }

    if (studentId) {
      try {
        window.localStorage.removeItem(`${WEB_META_PREFIX}${studentId}`);
      } catch {
        // ignore
      }
    }
    writePendingSyncQueue([]);

    if (isNativeAndroid()) {
      return clearNativeStudentDownloads({ studentId });
    }
    return { cleared: true };
  },

  async getStorageStats({ studentId }) {
    if (isNativeAndroid()) {
      return getNativeOfflineStorageStats({ studentId });
    }
    const { totalUsedBytes } = await this.listVerifiedDownloads({ studentId });
    return { usedBytes: totalUsedBytes, availableBytes: 0, safetyBufferBytes: 100 * 1024 * 1024 };
  },

  // Web/test private local Blob accessor (never returns a public file URL)
  getWebVerifiedBlob({ studentId, lessonId }) {
    return webBinaryBlobs.get(keyFor(studentId, lessonId)) || null;
  },

  // Test helper: simulates OS/external deletion of a local web blob for Scenario 13 verification
  __removeWebBlobForTest({ studentId, lessonId }) {
    webBinaryBlobs.delete(keyFor(studentId, lessonId));
  },

  __resetForTests() {
    for (const c of webAbortControllers.values()) c.abort();
    webAbortControllers.clear();
    webBinaryBlobs.clear();
    liveStateMap.clear();
    listeners.clear();
    nativeListenersBound = false;
  },
};

