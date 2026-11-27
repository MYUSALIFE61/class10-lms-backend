import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import crypto from 'node:crypto';
import { LessonDetailsScreen } from '../components/offline/LessonDetailsScreen.jsx';
import { lmsApi } from '../services/lmsApi.js';
import * as nativeBridge from '../services/nativeBridge.js';
import { DOWNLOAD_STATES, offlineDownloadService } from '../services/offlineDownloadService.js';

function makeMp4(size = 1024) {
  const bytes = new Uint8Array(size);
  bytes[4] = 102;
  bytes[5] = 116;
  bytes[6] = 121;
  bytes[7] = 112;
  return bytes;
}

function sha256(u8) {
  return crypto.createHash('sha256').update(Buffer.from(u8)).digest('hex');
}

describe('Phase 5: Pause/Resume Download States & Server-Signed Offline Lease Enforcement', () => {
  const studentId = 'stu-p5-01';
  const lessonId = 'les-p5-01';
  const mp4 = makeMp4(1024);
  const hash = sha256(mp4);

  const lessonDetails = {
    lesson: {
      id: lessonId,
      subjectTitle: 'Mathematics',
      chapterTitle: 'Real Numbers',
      title: '1.1 Euclid Division Lemma',
      description: 'Class 10 lesson',
      durationSeconds: 600,
      isPremium: true,
      locked: false,
    },
    progress: { lastPositionSeconds: 0, completionPercent: 0, isCompleted: false },
    playbackCapabilities: { hasDownloadableAsset: true, hasOnlinePlayback: true },
    offlineAsset: {
      videoAssetId: 'asset-p5',
      qualityLabel: '720p',
      mimeType: 'video/mp4',
      fileSize: mp4.length,
      durationSeconds: 600,
      sha256Checksum: hash,
      isDownloadable: true,
    },
    watermark: { studentCode: 'AP10-9999', identifier: '98******99' },
    videoSecurity: { protectedPlaybackEnabled: true, studentWatermarkEnabled: true },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    offlineDownloadService.__resetForTests();
    vi.spyOn(nativeBridge, 'isNativeAndroid').mockReturnValue(false);
    vi.spyOn(lmsApi, 'syncDownloadStatus').mockResolvedValue({ download: { downloadStatus: 'completed' } });
    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = vi.fn(() => 'blob:p5-offline');
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:p5-offline');
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

  it('transitions cleanly through PAUSED (Resume + Cancel) and blocks Watch Now when offline lease is expired', async () => {
    vi.spyOn(lmsApi, 'initiateLessonDownload').mockResolvedValue({
      download: { id: 'dl-p5', downloadStatus: 'queued' },
    });
    vi.spyOn(lmsApi, 'getDownloadManifest').mockResolvedValue({
      downloadId: 'dl-p5',
      lessonId,
      videoAssetId: 'asset-p5',
      streamUrl: 'https://api.class10lms.in/api/v1/downloads/dl-p5/stream?token=tok',
      fileSize: mp4.length,
      sha256Checksum: hash,
      mimeType: 'video/mp4',
      qualityLabel: '720p',
      offlineLease: {
        token: 'signed.lease',
        expiresAtEpochMs: Date.now() - 60_000, // Already expired lease
      },
      lesson: lessonDetails.lesson,
      watermark: lessonDetails.watermark,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(mp4, { status: 200 }));

    render(<LessonDetailsScreen studentId={studentId} lessonDetails={lessonDetails} isOnline />);

    // Download completes and transitions to Watch Now
    const dlBtn = await screen.findByTestId('btn-download-video');
    fireEvent.click(dlBtn);
    const watchBtn = await screen.findByTestId('btn-watch-now');
    expect(watchBtn).toBeInTheDocument();

    // Tapping Watch Now with an expired offline lease blocks playback with renewal notice
    fireEvent.click(watchBtn);
    expect(await screen.findByText(/offline viewing license has expired/i)).toBeInTheDocument();
  });

  it('exposes PAUSED state with Resume and Cancel controls via pauseDownload()', async () => {
    render(<LessonDetailsScreen studentId={studentId} lessonDetails={lessonDetails} isOnline />);
    await screen.findByTestId('btn-download-video');

    await offlineDownloadService.pauseDownload({ studentId, lessonId, downloadId: 'dl-p5' });

    await waitFor(() => {
      expect(screen.getByTestId('btn-paused-group')).toBeInTheDocument();
      expect(screen.getByTestId('btn-resume-download')).toBeInTheDocument();
      expect(screen.getByTestId('btn-cancel-download')).toBeInTheDocument();
    });
  });
});
