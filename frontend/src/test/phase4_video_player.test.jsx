import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NetworkProvider } from '../context/NetworkContext.jsx';
import { LMSVideoPlayer } from '../components/video/LMSVideoPlayer.jsx';
import { resetYouTubeLoaderForTests } from '../components/video/youtubeApiLoader.js';

describe('Phase 4: LMSVideoPlayer (Official YouTube IFrame Player API)', () => {
  let mockPlayerInstance;
  let capturedOptions;

  beforeEach(() => {
    resetYouTubeLoaderForTests();
    capturedOptions = null;

    mockPlayerInstance = {
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      seekTo: vi.fn(),
      setPlaybackRate: vi.fn(),
      getCurrentTime: vi.fn(() => 45),
      getDuration: vi.fn(() => 600),
      destroy: vi.fn(),
    };

    window.YT = {
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 },
      Player: vi.fn((el, options) => {
        capturedOptions = options;
        return mockPlayerInstance;
      }),
    };
  });

  afterEach(() => {
    delete window.YT;
    vi.restoreAllMocks();
  });

  it('initializes official YT.Player with controls=1, renders dynamic watermark, supports speed, seek, fullscreen, prev/next, and resume', async () => {
    const onSelectLesson = vi.fn();
    const onProgressSave = vi.fn();

    render(
      <NetworkProvider>
        <LMSVideoPlayer
          videoId="M7lc1UVf-VE"
          lessonTitle="Chapter 1: Euclid Division Lemma"
          resumeSeconds={120}
          watermark={{ studentCode: 'AP10-AB12', identifier: '98******45' }}
          previousLesson={{ id: 'prev-1', title: 'Intro' }}
          nextLesson={{ id: 'next-2', title: 'LCM & HCF' }}
          onSelectLesson={onSelectLesson}
          onProgressSave={onProgressSave}
        />
      </NetworkProvider>
    );

    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));
    expect(capturedOptions.videoId).toBe('M7lc1UVf-VE');
    expect(capturedOptions.playerVars.controls).toBe(1);
    expect(capturedOptions.playerVars.playsinline).toBe(1);

    // Dynamic student watermark present
    expect(screen.getByTestId('student-watermark').textContent).toContain('AP10-AB12');
    expect(screen.getByTestId('student-watermark').textContent).toContain('98******45');

    // Trigger onReady -> should seek to resumeSeconds
    act(() => {
      capturedOptions.events.onReady({ target: mockPlayerInstance });
    });
    expect(mockPlayerInstance.seekTo).toHaveBeenCalledWith(120, true);

    // Play & speed control
    fireEvent.click(screen.getByRole('button', { name: /Play video/i }));
    expect(mockPlayerInstance.playVideo).toHaveBeenCalled();

    act(() => {
      capturedOptions.events.onStateChange({ target: mockPlayerInstance, data: 1 });
    });
    expect(screen.getByTestId('player-state-badge').textContent).toBe('Playing');

    fireEvent.change(screen.getByLabelText('Playback speed'), { target: { value: '1.5' } });
    expect(mockPlayerInstance.setPlaybackRate).toHaveBeenCalledWith(1.5);

    // Fullscreen toggle + Android back button exits fullscreen
    fireEvent.click(screen.getByRole('button', { name: /Enter fullscreen/i }));
    expect(screen.getByTestId('lms-video-player').className).toContain('fullscreen');

    act(() => {
      const backEvt = new CustomEvent('lms:android-back', { cancelable: true });
      window.dispatchEvent(backEvt);
      expect(backEvt.defaultPrevented).toBe(true);
    });
    expect(screen.getByTestId('lms-video-player').className).not.toContain('fullscreen');

    // Previous / Next lesson navigation
    fireEvent.click(screen.getByRole('button', { name: /Next Lesson/i }));
    expect(onSelectLesson).toHaveBeenCalledWith('next-2');

    // Pause saves progress
    act(() => {
      capturedOptions.events.onStateChange({ target: mockPlayerInstance, data: 2 });
    });
    expect(onProgressSave).toHaveBeenCalledWith({
      positionSeconds: 45,
      durationSeconds: 600,
      markCompleted: false,
    });
  });

  it('rejects invalid YouTube video IDs cleanly without initializing iframe', () => {
    render(
      <NetworkProvider>
        <LMSVideoPlayer videoId="invalid-id" lessonTitle="Broken Video" />
      </NetworkProvider>
    );

    expect(window.YT.Player).not.toHaveBeenCalled();
    expect(screen.getByTestId('player-error')).toBeInTheDocument();
    expect(screen.getByText(/Invalid Video ID/i)).toBeInTheDocument();
  });

  it('handles YouTube error codes 100 (unavailable/private) and 150 (embedding disabled)', async () => {
    render(
      <NetworkProvider>
        <LMSVideoPlayer videoId="M7lc1UVf-VE" lessonTitle="Unavailable Test" />
      </NetworkProvider>
    );

    await waitFor(() => expect(window.YT.Player).toHaveBeenCalled());

    act(() => {
      capturedOptions.events.onError({ data: 100 });
    });
    expect(screen.getByText(/Video Unavailable or Private/i)).toBeInTheDocument();

    act(() => {
      capturedOptions.events.onError({ data: 150 });
    });
    expect(screen.getByText(/Embedding Disabled or Age-Restricted/i)).toBeInTheDocument();
  });

  it('pauses playback when app goes to background (visibilitychange) and handles offline state', async () => {
    render(
      <NetworkProvider>
        <LMSVideoPlayer videoId="M7lc1UVf-VE" lessonTitle="Lifecycle Test" />
      </NetworkProvider>
    );

    await waitFor(() => expect(window.YT.Player).toHaveBeenCalled());
    act(() => {
      capturedOptions.events.onReady({ target: mockPlayerInstance });
      capturedOptions.events.onStateChange({ target: mockPlayerInstance, data: 1 });
    });

    // Simulate backgrounding
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mockPlayerInstance.pauseVideo).toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });

    // Simulate network disconnect
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => {
      expect(screen.getByText(/No Internet Connection/i)).toBeInTheDocument();
    });
  });

  it('renders private_stream mode with native HTML5 video, zero YouTube iframe, watermark, and LMS controls', () => {
    render(
      <NetworkProvider>
        <LMSVideoPlayer
          provider="private_stream"
          streamUrl="https://cdn.class10lms.in/lessons/ch1-l2.mp4?token=abc&expires=9999999999"
          lessonTitle="Protected Private Stream Lesson"
          watermark={{ studentCode: 'TS10-XY99', identifier: '99******11' }}
        />
      </NetworkProvider>
    );

    expect(window.YT.Player).not.toHaveBeenCalled();
    const videoEl = screen.getByTestId('private-html5-video');
    expect(videoEl).toBeInTheDocument();
    expect(videoEl.getAttribute('controlsList')).toContain('nodownload');
    expect(screen.getByTestId('private-stream-badge')).toHaveTextContent('Protected Stream');
    expect(screen.getByTestId('student-watermark')).toHaveTextContent('TS10-XY99');
  });

  it('renders pikpak_local and cloudflare_r2 providers inside Own LMS Player with zero YouTube iframe', () => {
    render(
      <NetworkProvider>
        <LMSVideoPlayer
          provider="pikpak_local"
          streamUrl="http://127.0.0.1:4000/api/v1/playback/stream/signed-token-123"
          lessonTitle="VID-20261108-WA0000"
          watermark={{ studentCode: 'AP10-PP01', identifier: '98******23' }}
        />
      </NetworkProvider>
    );

    expect(window.YT.Player).not.toHaveBeenCalled();
    const videoEl = screen.getByTestId('private-html5-video');
    expect(videoEl).toBeInTheDocument();
    expect(screen.getByTestId('private-stream-badge')).toHaveTextContent('Own LMS Player');
    expect(screen.getByTestId('student-watermark')).toHaveTextContent('AP10-PP01');

    // Regression check: firing loadedmetadata with duration must transition to Ready (never reset to Loading)
    Object.defineProperty(videoEl, 'duration', { configurable: true, value: 15 });
    fireEvent.loadedMetadata(videoEl);
    expect(screen.getByTestId('player-state-badge')).toHaveTextContent('Ready');
    expect(screen.getByRole('button', { name: /^Play video$/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /^Tap to play video$/i })).toBeInTheDocument();
    expect(screen.queryByTestId('player-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('lms-controls-grid')).toBeInTheDocument();

    // Entering fullscreen occupies entire display and hides Exit/controls until video is tapped
    fireEvent.click(screen.getByRole('button', { name: /Enter fullscreen/i }));
    expect(screen.getByTestId('lms-video-player').className).toContain('fullscreen');
    expect(screen.queryByTestId('fs-exit-button')).not.toBeInTheDocument();

    // Clicking on the video in fullscreen reveals Exit button + controls, and Exit restores normal view
    fireEvent.click(videoEl);
    expect(screen.getByTestId('fs-exit-button')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('fs-exit-button'));
    expect(screen.getByTestId('lms-video-player').className).not.toContain('fullscreen');
  });
});
