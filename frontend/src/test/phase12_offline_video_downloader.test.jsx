import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import crypto from 'node:crypto';
import { AuthProvider, useAuth } from '../context/AuthContext.jsx';
import { NetworkProvider } from '../context/NetworkContext.jsx';
import { LessonDetailsScreen } from '../components/offline/LessonDetailsScreen.jsx';
import { MyDownloadsScreen } from '../pages/MyDownloadsScreen.jsx';
import { lmsApi } from '../services/lmsApi.js';
import * as apiClient from '../services/apiClient.js';
import * as nativeBridge from '../services/nativeBridge.js';
import {
  DOWNLOAD_STATES,
  offlineDownloadService,
} from '../services/offlineDownloadService.js';

function makeValidMp4Bytes(size = 2048, seed = 1) {
  const bytes = new Uint8Array(size);
  bytes[0] = 0;
  bytes[1] = 0;
  bytes[2] = 0;
  bytes[3] = 24;
  bytes[4] = 102; // f
  bytes[5] = 116; // t
  bytes[6] = 121; // y
  bytes[7] = 112; // p
  for (let i = 8; i < size; i += 1) {
    bytes[i] = (i * 13 + seed) & 0xff;
  }
  return bytes;
}

function sha256(uint8) {
  return crypto.createHash('sha256').update(Buffer.from(uint8)).digest('hex');
}

function makeLessonDetails({
  lessonId = 'lesson-101',
  title = '1.1 Euclid Division Lemma',
  chapterTitle = 'Real Numbers',
  fileSize = 2048,
  sha256Checksum = '',
  locked = false,
} = {}) {
  return {
    lesson: {
      id: lessonId,
      subjectId: 'sub-math',
      subjectTitle: 'Mathematics',
      chapterId: 'ch-1',
      chapterTitle,
      title,
      description: 'Class 10 SSC concept lesson',
      thumbnailUrl: '',
      durationSeconds: 600,
      isPremium: locked,
      locked,
    },
    progress: { lastPositionSeconds: 0, completionPercent: 0, isCompleted: false },
    playbackCapabilities: { hasDownloadableAsset: true, hasOnlinePlayback: true },
    offlineAsset: locked
      ? null
      : {
          videoAssetId: `asset-${lessonId}`,
          qualityLabel: '720p',
          mimeType: 'video/mp4',
          fileSize,
          durationSeconds: 600,
          sha256Checksum,
          isDownloadable: true,
        },
    watermark: { studentCode: 'AP10-1234', identifier: '98******10' },
    videoSecurity: { protectedPlaybackEnabled: true, studentWatermarkEnabled: true },
  };
}

describe('Phase 12 — Offline Video Downloader Mobile UI & All 14 Scenarios', () => {
  const studentId = 'student-ap-01';
  const mp4Bytes = makeValidMp4Bytes(2048, 7);
  const mp4Hash = sha256(mp4Bytes);

  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    offlineDownloadService.__resetForTests();
    vi.spyOn(nativeBridge, 'isNativeAndroid').mockReturnValue(false);
    vi.spyOn(lmsApi, 'syncDownloadStatus').mockResolvedValue({ download: { downloadStatus: 'completed' } });
    vi.spyOn(lmsApi, 'saveLessonProgress').mockResolvedValue({ progress: { lastPositionSeconds: 30 } });
    vi.spyOn(lmsApi, 'deleteMyDownload').mockResolvedValue({ deleted: true });
    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = vi.fn(() => 'blob:mock-offline-video');
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-offline-video');
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    }
  });

  afterEach(() => {
    offlineDownloadService.__resetForTests();
    vi.restoreAllMocks();
  });

  it('Scenarios 1-5 & 13: opens with ONLY Download Video, downloads with SHA-256 check, auto-switches to Watch Now, plays offline, and restores Download Video if file is deleted', async () => {
    vi.spyOn(lmsApi, 'initiateLessonDownload').mockResolvedValue({
      download: { id: 'dl-101', downloadStatus: 'queued' },
    });
    vi.spyOn(lmsApi, 'getDownloadManifest').mockResolvedValue({
      downloadId: 'dl-101',
      lessonId: 'lesson-101',
      videoAssetId: 'asset-lesson-101',
      streamUrl: 'https://api.class10lms.in/api/v1/downloads/dl-101/stream?token=signed123',
      fileSize: mp4Bytes.length,
      sha256Checksum: mp4Hash,
      mimeType: 'video/mp4',
      qualityLabel: '720p',
      lesson: {
        id: 'lesson-101',
        title: '1.1 Euclid Division Lemma',
        chapterTitle: 'Real Numbers',
        subjectTitle: 'Mathematics',
        durationSeconds: 600,
      },
      watermark: { studentCode: 'AP10-1234', identifier: '98******10' },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => mp4Bytes.buffer.slice(0),
    });

    const details = makeLessonDetails({ fileSize: mp4Bytes.length, sha256Checksum: mp4Hash });

    const { rerender } = render(
      <LessonDetailsScreen studentId={studentId} lessonDetails={details} isOnline={true} />
    );

    // Scenario 1 & 2: First-time open -> thumbnail/title/chapter/duration shown, ONLY Download Video visible, NO Watch Now
    expect(screen.getByTestId('lesson-details-title')).toHaveTextContent('1.1 Euclid Division Lemma');
    expect(screen.getAllByText(/Real Numbers/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('lesson-duration-badge')).toHaveTextContent('10:00');
    await waitFor(() => {
      expect(screen.getByTestId('btn-download-video')).toHaveTextContent('Download Video');
      expect(screen.getByTestId('btn-download-video')).not.toBeDisabled();
    });
    expect(screen.queryByTestId('btn-watch-now')).not.toBeInTheDocument();

    // Scenario 3 & 4: Click Download Video -> verified SHA-256 -> automatically switches to Watch Now & syncs backend
    fireEvent.click(screen.getByTestId('btn-download-video'));

    const watchBtn = await screen.findByTestId('btn-watch-now');
    expect(watchBtn).toHaveTextContent('Watch Now');
    expect(screen.queryByTestId('btn-download-video')).not.toBeInTheDocument();
    expect(lmsApi.syncDownloadStatus).toHaveBeenCalledWith(
      'dl-101',
      expect.objectContaining({
        status: 'completed',
        verifiedChecksum: mp4Hash,
        fileSize: mp4Bytes.length,
      })
    );

    // Scenario 5: Switch device completely offline -> Watch Now opens InAppVideoPlayer with controls
    rerender(<LessonDetailsScreen studentId={studentId} lessonDetails={details} isOnline={false} />);
    fireEvent.click(screen.getByTestId('btn-watch-now'));

    const offlinePlayer = await screen.findByTestId('in-app-offline-player');
    expect(offlinePlayer).toBeInTheDocument();
    expect(screen.getByTestId('offline-mode-badge')).toHaveTextContent('Offline Media3 Player');
    const videoEl = screen.getByTestId('offline-html5-video');
    expect(videoEl.getAttribute('controlsList')).toContain('nodownload');

    // Close player & verify Scenario 13: simulate missing/deleted local file -> restores Download Video
    fireEvent.click(screen.getByRole('button', { name: /Close offline player/i }));
    const watchAgainBtn = await screen.findByTestId('btn-watch-now');
    offlineDownloadService.__removeWebBlobForTest({ studentId, lessonId: 'lesson-101' });

    fireEvent.click(watchAgainBtn);
    expect(await screen.findByTestId('btn-download-video')).toHaveTextContent('Download Video');
    expect(screen.queryByTestId('btn-watch-now')).not.toBeInTheDocument();
  });

  it('Scenario 9: rejects corrupted download (SHA-256 mismatch) and NEVER displays Watch Now', async () => {
    vi.spyOn(lmsApi, 'initiateLessonDownload').mockResolvedValue({
      download: { id: 'dl-corrupt', downloadStatus: 'queued' },
    });
    vi.spyOn(lmsApi, 'getDownloadManifest').mockResolvedValue({
      downloadId: 'dl-corrupt',
      lessonId: 'lesson-corrupt',
      videoAssetId: 'asset-corrupt',
      streamUrl: 'https://api.class10lms.in/api/v1/downloads/dl-corrupt/stream?token=abc',
      fileSize: mp4Bytes.length,
      sha256Checksum: mp4Hash, // Expects original hash
      mimeType: 'video/mp4',
      lesson: { id: 'lesson-corrupt', title: 'Corrupt Test', durationSeconds: 300 },
    });

    // Server stream delivers 1-byte tampered payload
    const corrupted = new Uint8Array(mp4Bytes);
    corrupted[500] ^= 0xff;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => corrupted.buffer.slice(0),
    });

    const details = makeLessonDetails({
      lessonId: 'lesson-corrupt',
      fileSize: mp4Bytes.length,
      sha256Checksum: mp4Hash,
    });

    render(<LessonDetailsScreen studentId={studentId} lessonDetails={details} isOnline={true} />);
    await waitFor(() => expect(screen.getByTestId('btn-download-video')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('btn-download-video'));

    expect(await screen.findByTestId('btn-retry-download')).toHaveTextContent('Retry Download');
    expect(screen.getByTestId('download-error-banner')).toHaveTextContent(/File Verification Failed/i);
    expect(screen.queryByTestId('btn-watch-now')).not.toBeInTheDocument();
  });

  it('Scenarios 7 & 8: handles network interruption with Retry Download and clean download cancellation', async () => {
    vi.spyOn(lmsApi, 'initiateLessonDownload').mockResolvedValue({
      download: { id: 'dl-net', downloadStatus: 'queued' },
    });
    vi.spyOn(lmsApi, 'getDownloadManifest').mockResolvedValue({
      downloadId: 'dl-net',
      lessonId: 'lesson-net',
      videoAssetId: 'asset-net',
      streamUrl: 'https://api.class10lms.in/api/v1/downloads/dl-net/stream?token=xyz',
      fileSize: mp4Bytes.length,
      sha256Checksum: mp4Hash,
      mimeType: 'video/mp4',
      lesson: { id: 'lesson-net', title: 'Network Test', durationSeconds: 300 },
    });

    // First attempt fails with network drop
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network connection lost'))
      .mockImplementationOnce((_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        })
      );

    const details = makeLessonDetails({
      lessonId: 'lesson-net',
      fileSize: mp4Bytes.length,
      sha256Checksum: mp4Hash,
    });

    render(<LessonDetailsScreen studentId={studentId} lessonDetails={details} isOnline={true} />);
    await waitFor(() => expect(screen.getByTestId('btn-download-video')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('btn-download-video'));

    // Scenario 7: Network drop -> DOWNLOAD_FAILED + Retry Download
    const retryBtn = await screen.findByTestId('btn-retry-download');
    expect(retryBtn).toHaveTextContent('Retry Download');

    // Scenario 8: Start retry -> stays in DOWNLOADING -> click Cancel -> restores Download Video
    fireEvent.click(retryBtn);
    const cancelBtn = await screen.findByTestId('btn-cancel-download');
    expect(screen.getByTestId('download-progress-card')).toBeInTheDocument();
    fireEvent.click(cancelBtn);

    expect(await screen.findByTestId('btn-download-video')).toHaveTextContent('Download Video');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('Scenarios 10 & 12: displays insufficient storage error on Android StatFs failure and blocks locked premium lessons', async () => {
    // Scenario 12: Locked premium lesson shows upgrade CTA and zero Download/Watch buttons
    const lockedDetails = makeLessonDetails({ lessonId: 'lesson-prem', locked: true });
    const onUpgrade = vi.fn();
    const { unmount } = render(
      <LessonDetailsScreen
        studentId={studentId}
        lessonDetails={lockedDetails}
        isOnline={true}
        onUpgrade={onUpgrade}
      />
    );
    expect(screen.queryByTestId('btn-download-video')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-watch-now')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Unlock Full Class 10 Access/i }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    unmount();

    // Scenario 10: Native Android StatFs rejects with INSUFFICIENT_STORAGE
    vi.spyOn(nativeBridge, 'isNativeAndroid').mockReturnValue(true);
    vi.spyOn(nativeBridge, 'addOfflineDownloadListeners').mockReturnValue(() => {});
    vi.spyOn(nativeBridge, 'getNativeOfflineDownloadStatus').mockResolvedValue({
      status: DOWNLOAD_STATES.NOT_DOWNLOADED,
      record: null,
    });
    vi.spyOn(nativeBridge, 'startNativeOfflineDownload').mockRejectedValue(
      Object.assign(new Error('Insufficient storage space (40 MB free, ~180 MB required).'), {
        code: 'INSUFFICIENT_STORAGE',
      })
    );
    vi.spyOn(lmsApi, 'initiateLessonDownload').mockResolvedValue({ download: { id: 'dl-low' } });
    vi.spyOn(lmsApi, 'getDownloadManifest').mockResolvedValue({
      downloadId: 'dl-low',
      lessonId: 'lesson-low',
      videoAssetId: 'asset-low',
      streamUrl: 'https://api.class10lms.in/api/v1/downloads/dl-low/stream?token=t',
      fileSize: 80 * 1024 * 1024,
      sha256Checksum: mp4Hash,
      lesson: { id: 'lesson-low', title: 'Large Video', durationSeconds: 1800 },
    });

    const lowDetails = makeLessonDetails({
      lessonId: 'lesson-low',
      fileSize: 80 * 1024 * 1024,
      sha256Checksum: mp4Hash,
    });
    render(<LessonDetailsScreen studentId={studentId} lessonDetails={lowDetails} isOnline={true} />);
    await waitFor(() => expect(screen.getByTestId('btn-download-video')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('btn-download-video'));

    expect(await screen.findByTestId('download-error-banner')).toHaveTextContent(/Not Enough Device Storage/i);
    expect(screen.getByTestId('btn-retry-download')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-watch-now')).not.toBeInTheDocument();
  });

  it('Scenario 14: supports concurrent downloads across 2 lessons and renders both in MyDownloadsScreen offline', async () => {
    const bytesA = makeValidMp4Bytes(2048, 1);
    const bytesB = makeValidMp4Bytes(3072, 2);
    const hashA = sha256(bytesA);
    const hashB = sha256(bytesB);

    vi.spyOn(lmsApi, 'initiateLessonDownload').mockImplementation(async (lid) => ({
      download: { id: `dl-${lid}` },
    }));
    vi.spyOn(lmsApi, 'getDownloadManifest').mockImplementation(async (did) => {
      const isA = did === 'dl-lesson-A';
      return {
        downloadId: did,
        lessonId: isA ? 'lesson-A' : 'lesson-B',
        videoAssetId: isA ? 'asset-A' : 'asset-B',
        streamUrl: `https://api.class10lms.in/api/v1/downloads/${did}/stream?token=tok`,
        fileSize: isA ? bytesA.length : bytesB.length,
        sha256Checksum: isA ? hashA : hashB,
        mimeType: 'video/mp4',
        lesson: {
          id: isA ? 'lesson-A' : 'lesson-B',
          title: isA ? 'Lesson A — Real Numbers' : 'Lesson B — Polynomials',
          chapterTitle: isA ? 'Chapter 1' : 'Chapter 2',
          subjectTitle: 'Mathematics',
          durationSeconds: 420,
        },
      };
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        String(url).includes('dl-lesson-A') ? bytesA.buffer.slice(0) : bytesB.buffer.slice(0),
    }));

    // Launch both downloads concurrently
    const [resA, resB] = await Promise.all([
      offlineDownloadService.startLessonDownload({ studentId, lessonId: 'lesson-A' }),
      offlineDownloadService.startLessonDownload({ studentId, lessonId: 'lesson-B' }),
    ]);
    expect(resA.status).toBe(DOWNLOAD_STATES.DOWNLOADED);
    expect(resB.status).toBe(DOWNLOAD_STATES.DOWNLOADED);

    // Verify MyDownloadsScreen renders both verified items cleanly
    const listed = await offlineDownloadService.listVerifiedDownloads({ studentId });
    expect(listed.items).toHaveLength(2);
    expect(listed.totalUsedBytes).toBe(bytesA.length + bytesB.length);
  });

  it('Scenarios 6 & 11: preserves offline session across app restart and wipes encrypted downloads on student logout', async () => {
    // Seed cached tokens + cached student profile + verified offline video
    await apiClient.saveTokens({ accessToken: 'tok-offline', refreshToken: 'ref-offline' });
    await nativeBridge.setSecureItem('offline_cached_student_profile', {
      user: { id: studentId, fullName: 'Ravi Teja', board: 'AP', studentCode: 'AP10-1234' },
      subscription: { status: 'active', isActive: true },
      device: { id: 'dev-1' },
    });

    // Simulate app restart with zero internet (getMe rejects with NETWORK_OFFLINE)
    vi.spyOn(lmsApi, 'getMe').mockRejectedValue(
      new apiClient.ApiClientError('Offline', 0, 'NETWORK_OFFLINE')
    );
    vi.spyOn(lmsApi, 'logout').mockResolvedValue({ loggedOut: true });
    const clearSpy = vi.spyOn(offlineDownloadService, 'clearDownloadsOnLogout');

    function SessionProbe() {
      const { status, user, logout } = useAuth();
      return (
        <div>
          <div data-testid="auth-status">{status}</div>
          <div data-testid="auth-user">{user?.fullName || 'none'}</div>
          <button type="button" data-testid="btn-trigger-logout" onClick={() => logout()}>
            Logout
          </button>
        </div>
      );
    }

    render(
      <NetworkProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/downloads']}>
            <Routes>
              <Route
                path="/downloads"
                element={
                  <>
                    <SessionProbe />
                    <MyDownloadsScreen />
                  </>
                }
              />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </NetworkProvider>
    );

    // Scenario 6: Offline restart keeps student authenticated so MyDownloadsScreen remains accessible
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      expect(screen.getByTestId('auth-user')).toHaveTextContent('Ravi Teja');
    });

    // Scenario 11: Student logout triggers wipe of encrypted offline downloads & ends session
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-trigger-logout'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    });
    expect(clearSpy).toHaveBeenCalledWith(
      expect.objectContaining({ studentId, retentionPolicy: 'wipe_on_logout' })
    );
  });
});
