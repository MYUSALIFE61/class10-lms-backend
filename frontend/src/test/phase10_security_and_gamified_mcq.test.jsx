import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NetworkProvider } from '../context/NetworkContext.jsx';
import { LMSVideoPlayer } from '../components/video/LMSVideoPlayer.jsx';
import { GamifiedVideoQuizPlayer } from '../components/learning/GamifiedVideoQuizPlayer.jsx';
import { resetYouTubeLoaderForTests } from '../components/video/youtubeApiLoader.js';
import * as nativeBridge from '../services/nativeBridge.js';
import { lmsApi } from '../services/lmsApi.js';

describe('Phase 10: Native Screen Protection Overlay, Bridge & Gamified Video MCQ', () => {
  let mockPlayerInstance;
  let capturedYtOptions;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetYouTubeLoaderForTests();
    capturedYtOptions = null;

    mockPlayerInstance = {
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      seekTo: vi.fn(),
      setPlaybackRate: vi.fn(),
      getCurrentTime: vi.fn(() => 25),
      getDuration: vi.fn(() => 300),
      destroy: vi.fn(),
    };

    window.YT = {
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 },
      Player: vi.fn((_el, options) => {
        capturedYtOptions = options;
        return mockPlayerInstance;
      }),
    };
  });

  afterEach(() => {
    delete window.YT;
    vi.restoreAllMocks();
  });

  it('pauses playback on native screenRecordingDetected, blocks resume while active, and requires manual Resume after stop', async () => {
    let bridgeCallbacks = {};
    vi.spyOn(nativeBridge, 'isNativeAndroid').mockReturnValue(true);
    vi.spyOn(nativeBridge, 'addScreenProtectionListeners').mockImplementation((cbs) => {
      bridgeCallbacks = cbs;
      return () => {};
    });

    render(
      <NetworkProvider>
        <LMSVideoPlayer
          lessonId="lesson-chem-01"
          provider="youtube_unlisted"
          videoId="M7lc1UVf-VE"
          lessonTitle="Chemical Reactions and Equations"
          watermark={{ studentCode: 'AP10-SEC1', identifier: '98******10' }}
          videoSecurity={{
            warningHeading: 'SCREEN RECORDING DETECTED!',
            warningMessage:
              'For the protection of educational content, video playback has been temporarily paused.\n\nPlease stop screen recording or screen sharing to continue watching your lesson.',
            studentWatermarkEnabled: true,
          }}
        />
      </NetworkProvider>
    );

    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));
    act(() => {
      capturedYtOptions.events.onReady({ target: mockPlayerInstance });
      capturedYtOptions.events.onStateChange({ target: mockPlayerInstance, data: 1 });
    });

    // 1. Native Android emits screenRecordingDetected -> must pause immediately & show warning without Resume button
    act(() => {
      bridgeCallbacks.onDetected?.({ threatType: 'SCREEN_RECORDING', isScreenRecording: true });
    });

    expect(mockPlayerInstance.pauseVideo).toHaveBeenCalled();
    expect(screen.getByTestId('screen-protection-overlay')).toBeInTheDocument();
    expect(screen.getByText('SCREEN RECORDING DETECTED!')).toBeInTheDocument();
    expect(screen.getByText(/Screen Capture Active/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resume Lesson/i })).not.toBeInTheDocument();

    // Attempting to click Play while capture warning is active must NOT resume playback
    mockPlayerInstance.playVideo.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Pause video|Play video/i }));
    expect(mockPlayerInstance.playVideo).not.toHaveBeenCalled();

    // 2. Native Android emits screenRecordingStopped -> active warning clears, stays PAUSED (no auto-resume), Resume button appears
    act(() => {
      bridgeCallbacks.onStopped?.({ isScreenRecording: false, canManualResume: true });
    });

    expect(mockPlayerInstance.playVideo).not.toHaveBeenCalled();
    expect(screen.getByText('Playback Paused')).toBeInTheDocument();
    const resumeBtn = screen.getByRole('button', { name: /Resume Lesson/i });
    expect(resumeBtn).toBeInTheDocument();

    // 3. Student manually taps Resume Lesson -> clears overlay and resumes playback
    fireEvent.click(resumeBtn);
    expect(screen.queryByTestId('screen-protection-overlay')).not.toBeInTheDocument();
    expect(mockPlayerInstance.playVideo).toHaveBeenCalledTimes(1);
  });

  it('forwards lessonId, stream URL, watermark, and videoSecurity policy into native Media3 launcher on Android', async () => {
    vi.spyOn(nativeBridge, 'isNativeAndroid').mockReturnValue(true);
    vi.spyOn(nativeBridge, 'addScreenProtectionListeners').mockReturnValue(() => {});
    const openSpy = vi.spyOn(nativeBridge, 'openNativeMedia3Player').mockResolvedValue({
      launched: true,
      lastPositionMs: 42000,
      durationMs: 180000,
      completed: false,
    });
    const onProgressSave = vi.fn();

    render(
      <NetworkProvider>
        <LMSVideoPlayer
          lessonId="lesson-math-01"
          provider="pikpak_local"
          streamUrl="https://api.class10lms.in/api/v1/playback/stream/signed-token-abc"
          lessonTitle="Real Numbers — Euclid's Lemma"
          watermark={{ studentCode: 'TS10-AB99', identifier: '99******22' }}
          videoSecurity={{
            warningHeading: 'SCREEN RECORDING DETECTED!',
            screenSharingProtection: true,
            studentWatermarkEnabled: true,
            securityEventLogging: true,
          }}
          onProgressSave={onProgressSave}
        />
      </NetworkProvider>
    );

    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    expect(openSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 'lesson-math-01',
        url: 'https://api.class10lms.in/api/v1/playback/stream/signed-token-abc',
        watermarkText: 'TS10-AB99 • 99******22',
        videoSecurity: expect.objectContaining({
          screenSharingProtection: true,
          securityEventLogging: true,
        }),
      })
    );
    expect(onProgressSave).toHaveBeenCalledWith({
      positionSeconds: 42,
      durationSeconds: 180,
      markCompleted: false,
    });
  });

  it('returns safe default protection status on non-Android web platform', async () => {
    const status = await nativeBridge.getScreenProtectionStatus();
    expect(status).toMatchObject({
      platform: 'web',
      flagSecureEnforced: false,
      isScreenRecording: false,
      detectionApiSupported: false,
    });
  });

  it('runs 4-round Gamified Video MCQ with backend answer validation, XP/streak rewards, and Victory summary', async () => {
    vi.spyOn(lmsApi, 'startGamifiedVideoQuiz').mockResolvedValue({
      attemptId: 'att-101',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      remainingSeconds: 300,
      quiz: {
        id: 'vq-1',
        title: 'Chemical Reactions — 4-Round Challenge',
        timerEnabled: true,
        allowSkip: true,
        allowReview: true,
      },
      questions: [
        {
          id: 'q1',
          roundType: 'quick_challenge',
          conceptTag: 'Balanced Equations',
          questionText: 'Which equation is balanced?',
          options: ['2H2 + O2 -> 2H2O', 'H2 + O2 -> H2O', 'Na + Cl2 -> NaCl', 'Fe + O2 -> Fe2O3'],
        },
        {
          id: 'q2',
          roundType: 'victory_round',
          conceptTag: 'Exothermic Reactions',
          questionText: 'Respiration is an example of which reaction?',
          options: ['Endothermic', 'Exothermic', 'Displacement', 'Neutralization'],
        },
      ],
    });

    vi.spyOn(lmsApi, 'answerGamifiedQuestion')
      .mockResolvedValueOnce({
        questionId: 'q1',
        selectedOptionIndex: 0,
        correctOptionIndex: 0,
        isCorrect: true,
        xpAwarded: 20,
        streakBonusXp: 0,
        currentStreak: 1,
        explanation: 'Both sides have 4 H atoms and 2 O atoms.',
        referenceNote: 'AP & TS SSC Physical Science Ch. 1',
      })
      .mockResolvedValueOnce({
        questionId: 'q2',
        selectedOptionIndex: 1,
        correctOptionIndex: 1,
        isCorrect: true,
        xpAwarded: 30,
        streakBonusXp: 10,
        currentStreak: 2,
        explanation: 'Glucose reacts with oxygen releasing energy.',
        referenceNote: 'SCERT Class 10 Textbook',
      });

    vi.spyOn(lmsApi, 'completeGamifiedQuiz').mockResolvedValue({
      passed: true,
      isNewPersonalBest: true,
      score: 2,
      totalMarks: 2,
      percentage: 100,
      maxStreak: 2,
      totalSessionXp: 60,
      profile: { level: 2, totalXp: 160, currentDailyStreak: 3 },
      bonusBreakdown: [{ label: 'Concept Accuracy Bonus', xp: 10 }],
      newlyUnlockedAchievements: [{ id: 'ach-1', badge_title: 'Reaction Master', xp_reward: 25 }],
      results: [
        {
          questionId: 'q1',
          questionText: 'Which equation is balanced?',
          options: ['2H2 + O2 -> 2H2O', 'H2 + O2 -> H2O', 'Na + Cl2 -> NaCl', 'Fe + O2 -> Fe2O3'],
          correctOptionIndex: 0,
          isCorrect: true,
          explanation: 'Both sides have 4 H atoms and 2 O atoms.',
        },
      ],
    });

    const onCompleted = vi.fn();
    render(<GamifiedVideoQuizPlayer quizId="vq-1" onExit={vi.fn()} onCompleted={onCompleted} />);

    // Round 1 loads with Quick Challenge badge
    expect(await screen.findByText('Which equation is balanced?')).toBeInTheDocument();
    expect(screen.getByText('Quick Challenge')).toBeInTheDocument();

    // Answer Q1 -> backend validation shows explanation & +20 XP (in HUD chip + animated float)
    fireEvent.click(screen.getByText('2H2 + O2 -> 2H2O'));
    expect(await screen.findByText(/Both sides have 4 H atoms/i)).toBeInTheDocument();
    expect(screen.getByText('+20 XP')).toBeInTheDocument();

    // Next -> Victory Round
    fireEvent.click(screen.getByRole('button', { name: /Next Question/i }));
    expect(await screen.findByText('Victory Round')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Exothermic'));
    expect(await screen.findByText(/Glucose reacts with oxygen/i)).toBeInTheDocument();

    // Finish -> Victory summary screen with personal best & badge
    fireEvent.click(screen.getByRole('button', { name: /Finish & Claim XP/i }));
    expect(await screen.findByText('Challenge Conquered!')).toBeInTheDocument();
    expect(screen.getByText(/New Personal Best/i)).toBeInTheDocument();
    expect(screen.getByText(/Reaction Master/i)).toBeInTheDocument();
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });
});
