import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

describe('Phase 9: Gamified Video-Based MCQ System (Transcript AI, Approval, 4 Rounds, Server Validation, XP, Badges & Analytics)', () => {
  let app;
  let store;
  let authProvider;
  let adminToken;
  let studentToken;
  let lessonId;

  beforeEach(async () => {
    store = new InMemoryDataStore();
    authProvider = new InMemoryAuthProvider();
    app = createApp({
      config: makeTestConfig(),
      store,
      authProvider,
      disableRateLimit: true,
    }).app;

    const aLogin = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@class10lms.in', password: 'Admin@1234' });
    adminToken = aLogin.body.data.tokens.accessToken;

    const sReg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'gamer@ap10.in',
        password: 'Password1234',
        fullName: 'Valmiki Kumar',
        board: 'AP',
        device: { deviceId: 'gamified-test-device-01', deviceName: 'Pixel', platform: 'android' },
      });
    studentToken = sReg.body.data.tokens.accessToken;

    // Create Subject -> Chapter -> Video Lesson dynamically via Admin Portal API
    const sub = await request(app)
      .post('/api/v1/admin/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Mathematics', slug: 'mathematics', boardCodes: ['AP', 'TS'], status: 'published' });
    const ch = await request(app)
      .post('/api/v1/admin/chapters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ subjectId: sub.body.data.id, chapterNumber: 14, title: 'Statistics', boardCodes: ['AP', 'TS'], status: 'published' });
    const ls = await request(app)
      .post('/api/v1/admin/lessons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId: sub.body.data.id,
        chapterId: ch.body.data.id,
        title: 'Statistics — Assumed Mean Method',
        videoLanguage: 'TE_EN_MIX',
        boardCodes: ['AP', 'TS'],
        status: 'published',
      });
    lessonId = ls.body.data.id;
  });

  it('generates AI MCQs from video transcript, enforces admin approval, never leaks answers, awards XP/streaks/badges, and computes concept accuracy analytics', async () => {
    // 1. Admin generates 4 AI draft MCQs from actual video transcript
    const transcript =
      'In Statistics Assumed Mean Method, Mean is calculated using x̄ = a + (Σfi di / Σfi). ' +
      'Deviation di is defined as xi - a where a is the assumed mean chosen from class marks. ' +
      'Class mark xi equals (Upper Class Limit + Lower Class Limit) / 2. ' +
      'The Assumed Mean Method reduces large numerical calculations when class marks xi are big numbers.';

    const genRes = await request(app)
      .post('/api/v1/admin/video-quizzes/generate-ai')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ lessonId, transcriptText: transcript, count: 4 });

    expect(genRes.status).toBe(201);
    expect(genRes.body.data.generatedCount).toBe(4);
    const aiQuestions = genRes.body.data.items;
    expect(aiQuestions[0].ai_approval_status).toBe('pending_review');
    expect(aiQuestions[0].status).toBe('draft');

    // 2. Attempting to publish quiz with UNAPPROVED AI questions MUST be rejected (400)
    const blockedQuiz = await request(app)
      .post('/api/v1/admin/video-quizzes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lessonId,
        title: 'Unapproved Attempt',
        questionIds: aiQuestions.map((q) => q.id),
        status: 'published',
      });
    expect(blockedQuiz.status).toBe(400);

    // 3. Admin approves all 4 AI questions across the 4 gamified rounds
    for (const q of aiQuestions) {
      const appRes = await request(app)
        .post(`/api/v1/admin/video-quizzes/questions/${q.id}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'approved' });
      expect(appRes.status).toBe(200);
      expect(appRes.body.data.ai_approval_status).toBe('approved');
      expect(appRes.body.data.status).toBe('published');
    }

    // 4. Admin creates & publishes gamified quiz for this video lesson
    const createQuiz = await request(app)
      .post('/api/v1/admin/video-quizzes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lessonId,
        title: 'Assumed Mean Method — 4-Round Challenge',
        questionIds: aiQuestions.map((q) => q.id),
        timerEnabled: true,
        durationMinutes: 10,
        allowSkip: true,
        allowReview: true,
        leaderboardEnabled: true,
        xpPerCorrect: 25,
        streakBonusXp: 10,
        understandingBonusXp: 30,
        victoryBonusXp: 50,
        status: 'published',
      });
    expect(createQuiz.status).toBe(201);
    const quizId = createQuiz.body.data.id;

    // 5. Student starts quiz -> verify NO correct answers or explanations leaked upfront!
    const startRes = await request(app)
      .post(`/api/v1/student/video-quizzes/${quizId}/start`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    expect(startRes.status).toBe(201);
    const { attemptId, questions } = startRes.body.data;
    expect(questions).toHaveLength(4);
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(q.correctOptionIndex).toBeUndefined();
      expect(q.explanation).toBeUndefined();
    }

    // 6. Student answers each question via backend instant check (3 correct in a row + 1 wrong to test analytics)
    const aiMap = new Map(aiQuestions.map((q) => [q.id, q]));
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      const realQ = aiMap.get(q.id);
      const chosen = i === 0 ? (realQ.correct_option_index + 1) % 4 : realQ.correct_option_index;
      const ansRes = await request(app)
        .post(`/api/v1/student/video-quizzes/attempts/${attemptId}/answer`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ questionId: q.id, selectedOptionIndex: chosen });
      expect(ansRes.status).toBe(200);
      expect(ansRes.body.data.isCorrect).toBe(i !== 0);
      expect(ansRes.body.data.explanation).toContain('From video transcript:');
      if (i >= 2) {
        expect(ansRes.body.data.streakBonusXp).toBe(10);
      }
    }

    // 7. Complete quiz -> verify XP, level, daily streak, personal best & achievements stored in DB!
    const compRes = await request(app)
      .post(`/api/v1/student/video-quizzes/attempts/${attemptId}/complete`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({});
    expect(compRes.status).toBe(200);
    expect(compRes.body.data.maxStreak).toBe(3);
    expect(compRes.body.data.totalSessionXp).toBeGreaterThan(100);
    expect(compRes.body.data.profile.currentDailyStreak).toBe(1);
    expect(compRes.body.data.newlyUnlockedAchievements.length).toBeGreaterThanOrEqual(2);

    // 8. Verify Student Gamification Profile & Optional Leaderboard
    const profRes = await request(app)
      .get('/api/v1/student/gamification/profile')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(profRes.status).toBe(200);
    expect(profRes.body.data.totalXp).toBe(compRes.body.data.profile.totalXp);

    const lbRes = await request(app)
      .get('/api/v1/student/gamification/leaderboard')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(lbRes.status).toBe(200);
    expect(lbRes.body.data.enabled).toBe(true);
    expect(lbRes.body.data.entries.length).toBe(1);

    // 9. Verify Admin Question-Wise Accuracy & Difficult Concepts Analytics
    const anaRes = await request(app)
      .get(`/api/v1/admin/video-quizzes/analytics?lessonId=${lessonId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(anaRes.status).toBe(200);
    expect(anaRes.body.data.summary.totalAttempts).toBe(1);
    expect(anaRes.body.data.questionAccuracy).toHaveLength(4);
    // Question 0 was missed -> 0% accuracy sorted FIRST as hardest concept!
    expect(anaRes.body.data.questionAccuracy[0].accuracyPct).toBe(0);
    expect(anaRes.body.data.difficultConcepts[0].accuracyPct).toBe(0);
  });
});
