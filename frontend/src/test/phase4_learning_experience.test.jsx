import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext.jsx';
import { NetworkProvider } from '../context/NetworkContext.jsx';
import { AppRoutes } from '../App.jsx';
import { lmsApi } from '../services/lmsApi.js';
import { clearTokens, saveTokens } from '../services/apiClient.js';

function renderAt(entries) {
  return render(
    <NetworkProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={entries}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </NetworkProvider>
  );
}

describe('Phase 4: Complete Student Learning Experience (Dashboard -> Subjects -> Chapters -> Lessons -> 5-Tab Player)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    await clearTokens();
    await saveTokens({ accessToken: 'acc-p4', refreshToken: 'ref-p4' });

    vi.spyOn(lmsApi, 'getMe').mockResolvedValue({
      user: { id: 'u-p4', fullName: 'Ananya AP', email: 'ananya@ap10.in', board: 'AP', studentCode: 'AP10-7777' },
      device: { id: 'd-p4', deviceName: 'Redmi Note 13' },
      subscription: {
        status: 'active',
        isActive: true,
        daysRemaining: 320,
        expiresAt: '2027-10-15T00:00:00Z',
      },
    });
  });

  it('renders Dashboard with real stats, subscription expiry, recent lessons, and subject navigation', async () => {
    vi.spyOn(lmsApi, 'getStudentHome').mockResolvedValue({
      student: { fullName: 'Ananya AP', board: 'AP', studentCode: 'AP10-7777' },
      board: { code: 'AP', shortName: 'AP SSC' },
      subscription: { status: 'active', isActive: true, expiresAt: '2027-10-15T00:00:00Z' },
      stats: {
        totalSubjects: 6,
        totalChapters: 24,
        totalLessons: 48,
        completedLessons: 12,
        overallProgressPercent: 25,
      },
      subjects: [
        {
          id: 'sub-math',
          slug: 'mathematics',
          title: 'Mathematics',
          chapterCount: 14,
          lessonCount: 28,
          progressPercent: 40,
        },
      ],
      recentlyAccessedLessons: [
        {
          id: 'les-1',
          subjectTitle: 'Mathematics',
          chapterTitle: 'Real Numbers',
          title: 'Euclid Division Lemma',
          progress: { completionPercent: 60, isCompleted: false },
        },
      ],
      syncedVideos: [],
      featuredLessons: [],
      upcomingExams: [],
      appConfig: {},
    });

    renderAt(['/dashboard']);
    expect(await screen.findByText(/Hello, Ananya/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Class 10 SSC Pass/i)).toBeInTheDocument();
    expect(screen.getByText(/24 Ch/i)).toBeInTheDocument();
    expect(screen.getByText(/Recently Accessed/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Euclid Division Lemma/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/14 Ch • 28 Ls/i)).toBeInTheDocument();
  });

  it('renders Chapter Listing with progress bars and Lesson Listing with teacher name, statuses, and View Notes', async () => {
    vi.spyOn(lmsApi, 'getStudentChapters').mockResolvedValue({
      subject: { id: 'sub-math', slug: 'mathematics', title: 'Mathematics' },
      chapters: [
        {
          id: 'ch-1',
          chapterNumber: 1,
          title: 'Real Numbers',
          summary: 'Euclid Lemma and HCF',
          totalLessons: 4,
          completedLessons: 2,
          progressPercent: 50,
          locked: false,
        },
      ],
    });
    vi.spyOn(lmsApi, 'getStudentLessons').mockResolvedValue({
      items: [
        {
          id: 'les-1',
          lessonNumber: 1,
          title: 'Euclid Division Lemma',
          description: 'Understand a = bq + r cleanly.',
          teacherName: 'Prof. Venkata Rao',
          durationSeconds: 900,
          hasVideo: true,
          hasNotes: true,
          downloadStatus: 'completed',
          progressStatus: 'in_progress',
          locked: false,
          progress: { completionPercent: 45, isCompleted: false },
        },
      ],
    });

    renderAt(['/subjects/sub-math']);
    expect(await screen.findByText(/1\. Real Numbers/i)).toBeInTheDocument();
    expect(screen.getByText(/2\/4 Lessons Completed • 50%/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/1\. Real Numbers/i));
    expect(await screen.findByText(/Lesson 1: Euclid Division Lemma/i)).toBeInTheDocument();
    expect(screen.getByText(/Prof\. Venkata Rao/i)).toBeInTheDocument();
    expect(screen.getByText(/In Progress \(45%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Downloaded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View Notes/i })).toBeInTheDocument();
  });

  it('renders 5-tab Lesson Player (Video, Handwritten Notes, Concepts, Quick Revision, PYQs) with interactive controls', async () => {
    vi.spyOn(lmsApi, 'getLessonDetails').mockResolvedValue({
      lesson: {
        id: 'les-1',
        lessonNumber: 1,
        subjectTitle: 'Mathematics',
        chapterTitle: 'Real Numbers',
        title: 'Euclid Division Lemma',
        description: 'Step-by-step HCF algorithm.',
        teacherName: 'Prof. Venkata Rao',
        learningObjectives: 'Compute HCF using a = bq + r.',
        durationSeconds: 900,
        isPremium: false,
        locked: false,
      },
      progress: { lastPositionSeconds: 120, completionPercent: 15, isCompleted: false },
      playbackCapabilities: { hasDownloadableAsset: false, hasOnlinePlayback: true },
    });
    vi.spyOn(lmsApi, 'getStudentVideoQuizzes').mockResolvedValue({ items: [] });
    vi.spyOn(lmsApi, 'getLessonMcqs').mockResolvedValue({ mcqs: [] });
    vi.spyOn(lmsApi, 'getLessonNotesTab').mockResolvedValue({
      items: [
        {
          id: 'n-1',
          title: 'Handwritten Sheet 1',
          contentMarkdown: 'Theorem: a = bq + r where 0 <= r < b',
          hasFile: false,
          locked: false,
        },
      ],
    });
    vi.spyOn(lmsApi, 'getLessonConceptsTab').mockResolvedValue({
      items: [
        {
          id: 'c-1',
          title: 'Division Algorithm',
          explanationMarkdown: 'Divide iteratively until remainder becomes 0.',
          formulaExpression: 'a = bq + r',
          examples: ['HCF(24, 18) = 6'],
          definitions: ['Lemma: Proven helper statement'],
          locked: false,
        },
      ],
    });
    vi.spyOn(lmsApi, 'getLessonRevisionTab').mockResolvedValue({
      items: [
        {
          id: 'r-1',
          pointType: 'formula',
          title: 'Key Identity',
          formulaExpression: 'a = bq + r',
          contentMarkdown: 'Check 0 <= r < b.',
          locked: false,
        },
        {
          id: 'r-2',
          pointType: 'checklist',
          title: 'Solved 3 Euclid HCF problems',
          contentMarkdown: 'Verify remainder = 0 step.',
          locked: false,
        },
      ],
    });
    vi.spyOn(lmsApi, 'getLessonPyqsTab').mockResolvedValue({
      items: [
        {
          id: 'q-1',
          board: 'AP',
          examYear: 2024,
          marks: 4,
          questionType: 'numerical',
          questionText: 'Find HCF(900, 270) using Euclid algorithm.',
          modelAnswer: 'HCF = 90',
          explanation: '900 = 270(3) + 90; 270 = 90(3) + 0.',
          locked: false,
        },
      ],
    });

    renderAt(['/lessons/les-1']);
    expect(await screen.findByText(/Prof\. Venkata Rao/i)).toBeInTheDocument();
    expect(screen.getByText(/Compute HCF using a = bq \+ r/i)).toBeInTheDocument();

    // Tab 2: Handwritten Notes + Zoom control
    fireEvent.click(screen.getByRole('tab', { name: /Handwritten Notes/i }));
    expect(await screen.findByText(/Handwritten Sheet 1/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Zoom in/i }));
    expect(screen.getByText('120%')).toBeInTheDocument();

    // Tab 3: Important Concepts
    fireEvent.click(screen.getByRole('tab', { name: /Important Concepts/i }));
    expect(await screen.findByText(/Division Algorithm/i)).toBeInTheDocument();
    expect(screen.getByText(/HCF\(24, 18\) = 6/i)).toBeInTheDocument();

    // Tab 4: Quick Revision + Checklist toggle
    fireEvent.click(screen.getByRole('tab', { name: /Quick Revision/i }));
    expect(await screen.findByText(/0\/1 Checked/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Solved 3 Euclid HCF problems/i));
    expect(screen.getByText(/1\/1 Checked/i)).toBeInTheDocument();

    // Tab 5: Previous Questions + Reveal Answer
    fireEvent.click(screen.getByRole('tab', { name: /Previous Questions/i }));
    expect(await screen.findByText(/AP SSC 2024/i)).toBeInTheDocument();
    expect(screen.queryByText(/HCF = 90/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reveal Answer & Solution/i }));
    expect(screen.getByText(/HCF = 90/i)).toBeInTheDocument();
  });

  it('renders Learning Progress page with subject breakdown and recently accessed lessons', async () => {
    vi.spyOn(lmsApi, 'getStudentProgress').mockResolvedValue({
      overallProgressPct: 40,
      totalChapters: 12,
      totalLessons: 20,
      completedLessons: 8,
      inProgressLessons: 2,
      badgesCount: 3,
      learningMinutes: 145,
      subjectBreakdown: [
        {
          subjectId: 'sub-math',
          title: 'Mathematics',
          completedLessons: 4,
          totalLessons: 10,
          progressPct: 40,
          accentColor: '#1e64f0',
        },
      ],
      recentLessons: [
        {
          lessonId: 'les-1',
          title: 'Euclid Division Lemma',
          subjectTitle: 'Mathematics',
          chapterTitle: 'Real Numbers',
          completionPercent: 65,
          isCompleted: false,
        },
      ],
      recentQuizzes: [],
    });

    renderAt(['/progress']);
    expect(await screen.findByText('40%')).toBeInTheDocument();
    expect(screen.getByText(/12 Chapters/i)).toBeInTheDocument();
    expect(screen.getByText(/Recently Accessed Lessons/i)).toBeInTheDocument();
    expect(screen.getByText(/Euclid Division Lemma/i)).toBeInTheDocument();
    expect(screen.getByText(/4\/10 \(40%\)/i)).toBeInTheDocument();
  });
});
