import crypto from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

describe('Phase 4: Complete Student Learning Experience APIs, Data Isolation & Progress Integrity', () => {
  let app;
  let store;
  let authProvider;
  let subjectId;
  let chapter1Id;
  let chapter2Id;
  let lesson1Id;
  let lesson2Id;

  const deviceA = {
    deviceId: 'android-phase4-dev-a1',
    deviceName: 'Pixel 8',
    platform: 'android',
  };
  const deviceB = {
    deviceId: 'android-phase4-dev-b2',
    deviceName: 'Galaxy S23',
    platform: 'android',
  };

  async function seedCatalog() {
    subjectId = crypto.randomUUID();
    chapter1Id = crypto.randomUUID();
    chapter2Id = crypto.randomUUID();
    lesson1Id = crypto.randomUUID();
    lesson2Id = crypto.randomUUID();

    store.subjects.set(subjectId, {
      id: subjectId,
      board: 'BOTH',
      slug: 'mathematics',
      title: 'Mathematics',
      description: 'Class 10 AP & TS SSC Mathematics',
      icon_key: 'calculator',
      accent_color: '#1152d4',
      display_order: 1,
      is_active: true,
    });

    // Non-sequential chapter_number ordered strictly by display_order
    store.chapters.set(chapter2Id, {
      id: chapter2Id,
      subject_id: subjectId,
      chapter_number: 4,
      title: 'Pair of Linear Equations',
      summary: 'Graphical and algebraic solutions',
      display_order: 1,
      is_active: true,
    });
    store.chapters.set(chapter1Id, {
      id: chapter1Id,
      subject_id: subjectId,
      chapter_number: 1,
      title: 'Real Numbers',
      summary: 'Euclid division lemma and HCF',
      display_order: 2,
      is_active: true,
    });

    store.lessons.set(lesson1Id, {
      id: lesson1Id,
      subject_id: subjectId,
      chapter_id: chapter1Id,
      lesson_number: 1,
      title: 'Euclid Division Lemma',
      description: 'Learn a = bq + r with solved board problems.',
      teacher_name: 'Prof. Raghava Rao',
      learning_objectives: 'Apply Euclid algorithm to find HCF of two integers.',
      duration_seconds: 1000,
      display_order: 1,
      is_premium: true,
      is_active: true,
    });
    store.lessons.set(lesson2Id, {
      id: lesson2Id,
      subject_id: subjectId,
      chapter_id: chapter1Id,
      lesson_number: 2,
      title: 'Fundamental Theorem of Arithmetic',
      description: 'Prime factorization uniqueness.',
      teacher_name: 'Prof. Raghava Rao',
      learning_objectives: 'Express composite numbers as products of primes.',
      duration_seconds: 800,
      display_order: 2,
      is_premium: true,
      is_active: true,
    });

    store.videoSources.set(lesson1Id, {
      lesson_id: lesson1Id,
      provider: 'private_stream',
      youtube_video_id: null,
      stream_url: 'https://cdn.class10lms.in/math/real-1.m3u8',
    });

    store.notes.set(crypto.randomUUID(), {
      id: crypto.randomUUID(),
      subject_id: subjectId,
      chapter_id: chapter1Id,
      lesson_id: lesson1Id,
      title: 'Lesson 1 Handwritten Summary',
      content_markdown: 'a = bq + r where 0 <= r < b',
      is_premium: true,
      display_order: 1,
      is_active: true,
    });

    const concept1Id = crypto.randomUUID();
    store.lessonConcepts.set(concept1Id, {
      id: concept1Id,
      subject_id: subjectId,
      chapter_id: chapter1Id,
      lesson_id: lesson1Id,
      title: 'Euclid Division Algorithm',
      explanation_markdown: 'Repeatedly divide larger integer by smaller until remainder is 0.',
      formula_expression: 'a = bq + r,  0 <= r < b',
      examples_json: ['HCF(24, 18) = 6'],
      definitions_json: ['Dividend (a), Divisor (b), Quotient (q), Remainder (r)'],
      display_order: 1,
      is_premium: true,
      is_active: true,
    });

    const rev1Id = crypto.randomUUID();
    store.lessonRevisionPoints.set(rev1Id, {
      id: rev1Id,
      subject_id: subjectId,
      chapter_id: chapter1Id,
      lesson_id: lesson1Id,
      point_type: 'formula',
      title: 'Division Lemma Equation',
      content_markdown: 'Always verify 0 <= r < b at every step.',
      formula_expression: 'a = bq + r',
      display_order: 1,
      is_premium: true,
      is_active: true,
    });

    const pyq1Id = crypto.randomUUID();
    store.pyqs.set(pyq1Id, {
      id: pyq1Id,
      subject_id: subjectId,
      chapter_id: chapter1Id,
      lesson_id: lesson1Id,
      board: 'AP',
      exam_year: 2024,
      marks: 4,
      question_type: 'numerical',
      question_text: 'Use Euclid Division Algorithm to find HCF of 900 and 270.',
      model_answer: '900 = 270(3) + 90; 270 = 90(3) + 0 => HCF = 90',
      explanation: 'Stop when remainder becomes 0; last divisor 90 is the HCF.',
      is_premium: true,
      display_order: 1,
      is_active: true,
    });
  }

  async function createStudent({ email, username, device, subscriptionStatus = 'active' }) {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email,
      username,
      password: 'StrongPassword1',
      confirmPassword: 'StrongPassword1',
      fullName: `Student ${username}`,
      board: 'AP',
      device,
    });
    const token = reg.body.data.tokens.accessToken;
    const userId = reg.body.data.user.id;
    const plan = await store.getPlanByCode('CLASS10_ANNUAL_799');

    if (subscriptionStatus === 'active') {
      const tx = await store.createPaymentTransaction({
        user_id: userId,
        plan_id: plan.id,
        razorpay_order_id: `order_${userId.slice(0, 8)}`,
        razorpay_payment_id: `pay_${userId.slice(0, 8)}`,
        amount_paise: 79900,
        currency: 'INR',
        status: 'captured',
        verified_at: new Date().toISOString(),
      });
      await store.createSubscription({
        user_id: userId,
        plan_id: plan.id,
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 365 * 86400_000).toISOString(),
        latest_payment_id: tx.id,
      });
    } else if (subscriptionStatus === 'expired') {
      await store.createSubscription({
        user_id: userId,
        plan_id: plan.id,
        status: 'active',
        starts_at: new Date(Date.now() - 400 * 86400_000).toISOString(),
        expires_at: new Date(Date.now() - 10 * 86400_000).toISOString(),
      });
    }
    return { token, userId };
  }

  beforeEach(async () => {
    store = new InMemoryDataStore();
    authProvider = new InMemoryAuthProvider();
    await seedCatalog();
    ({ app } = createApp({
      config: makeTestConfig({ PRIVATE_STREAM_TOKEN_KEY: 'phase4-stream-key-1234' }),
      store,
      authProvider,
      disableRateLimit: true,
    }));
  });

  it('serves dashboard, display_order-sorted chapters, enriched lessons, and lesson-specific notes/concepts/revision/PYQs', async () => {
    const { token } = await createStudent({
      email: 'paid.p4@ap10.in',
      username: 'paid.p4',
      device: deviceA,
      subscriptionStatus: 'active',
    });

    // 1. Dashboard stats reflect real DB counts (zero fabricated data)
    const home = await request(app)
      .get('/api/v1/student/home')
      .set('Authorization', `Bearer ${token}`);
    expect(home.status).toBe(200);
    expect(home.body.data.stats.totalSubjects).toBe(1);
    expect(home.body.data.stats.totalChapters).toBe(2);
    expect(home.body.data.stats.totalLessons).toBe(2);
    expect(home.body.data.recentlyAccessedLessons).toEqual([]);

    // 2. Chapters follow DB display_order (Chapter 4 comes before Chapter 1)
    const chRes = await request(app)
      .get(`/api/v1/student/subjects/${subjectId}/chapters`)
      .set('Authorization', `Bearer ${token}`);
    expect(chRes.status).toBe(200);
    expect(chRes.body.data.chapters.map((c) => c.chapterNumber)).toEqual([4, 1]);

    // 3. Lessons include teacherName, hasVideo, hasNotes, progressStatus
    const lRes = await request(app)
      .get(`/api/v1/student/chapters/${chapter1Id}/lessons`)
      .set('Authorization', `Bearer ${token}`);
    expect(lRes.status).toBe(200);
    expect(lRes.body.data.items[0]).toMatchObject({
      lessonNumber: 1,
      teacherName: 'Prof. Raghava Rao',
      hasVideo: true,
      hasNotes: true,
      progressStatus: 'not_started',
    });

    // 4. Lesson-specific tabs return content strictly scoped to lesson1 (lesson2 stays empty!)
    const [notes1, concepts1, rev1, pyqs1, pyqs2] = await Promise.all([
      request(app).get(`/api/v1/student/lessons/${lesson1Id}/notes`).set('Authorization', `Bearer ${token}`),
      request(app).get(`/api/v1/student/lessons/${lesson1Id}/concepts`).set('Authorization', `Bearer ${token}`),
      request(app).get(`/api/v1/student/lessons/${lesson1Id}/revision`).set('Authorization', `Bearer ${token}`),
      request(app).get(`/api/v1/student/lessons/${lesson1Id}/pyqs`).set('Authorization', `Bearer ${token}`),
      request(app).get(`/api/v1/student/lessons/${lesson2Id}/pyqs`).set('Authorization', `Bearer ${token}`),
    ]);

    expect(notes1.body.data.items).toHaveLength(1);
    expect(notes1.body.data.items[0].locked).toBe(false);
    expect(concepts1.body.data.items[0].formulaExpression).toContain('a = bq + r');
    expect(rev1.body.data.items[0].pointType).toBe('formula');
    expect(pyqs1.body.data.items).toHaveLength(1);
    expect(pyqs1.body.data.items[0].questionType).toBe('numerical');
    expect(pyqs2.body.data.items).toHaveLength(0); // strictly lesson-specific!
  });

  it('enforces subscription lock on expired/unpaid students, rejects invalid lesson IDs, and isolates student progress', async () => {
    const expired = await createStudent({
      email: 'expired.p4@ap10.in',
      username: 'expired.p4',
      device: deviceA,
      subscriptionStatus: 'expired',
    });
    const studentB = await createStudent({
      email: 'paid.b@ap10.in',
      username: 'paid.b',
      device: deviceB,
      subscriptionStatus: 'active',
    });

    // Expired student sees locked notes/concepts/revision/PYQs with null private content
    const [notesExp, conceptsExp, pyqsExp] = await Promise.all([
      request(app).get(`/api/v1/student/lessons/${lesson1Id}/notes`).set('Authorization', `Bearer ${expired.token}`),
      request(app).get(`/api/v1/student/lessons/${lesson1Id}/concepts`).set('Authorization', `Bearer ${expired.token}`),
      request(app).get(`/api/v1/student/lessons/${lesson1Id}/pyqs`).set('Authorization', `Bearer ${expired.token}`),
    ]);
    expect(notesExp.body.data.items[0].locked).toBe(true);
    expect(notesExp.body.data.items[0].contentMarkdown).toBeNull();
    expect(conceptsExp.body.data.items[0].locked).toBe(true);
    expect(conceptsExp.body.data.items[0].explanationMarkdown).toBeNull();
    expect(pyqsExp.body.data.items[0].locked).toBe(true);
    expect(pyqsExp.body.data.items[0].modelAnswer).toBeNull();

    // Invalid lesson ID returns 404
    const missing = await request(app)
      .get(`/api/v1/student/lessons/${crypto.randomUUID()}/concepts`)
      .set('Authorization', `Bearer ${studentB.token}`);
    expect(missing.status).toBe(404);

    // Progress integrity: opening at 0s with markCompleted=true MUST NOT mark completed!
    const spoofComplete = await request(app)
      .post('/api/v1/playback/progress')
      .set('Authorization', `Bearer ${studentB.token}`)
      .send({ lessonId: lesson1Id, positionSeconds: 0, durationSeconds: 1000, markCompleted: true });
    expect(spoofComplete.status).toBe(200);
    expect(spoofComplete.body.data.progress.isCompleted).toBe(false);
    expect(spoofComplete.body.data.progress.completionPercent).toBe(0);

    // Watch 60%, then receive older 20% event -> completionPercent MUST NOT downgrade
    const p60 = await request(app)
      .post('/api/v1/playback/progress')
      .set('Authorization', `Bearer ${studentB.token}`)
      .send({ lessonId: lesson1Id, positionSeconds: 600, durationSeconds: 1000 });
    expect(p60.body.data.progress.completionPercent).toBe(60);

    const p20 = await request(app)
      .post('/api/v1/playback/progress')
      .set('Authorization', `Bearer ${studentB.token}`)
      .send({ lessonId: lesson1Id, positionSeconds: 200, durationSeconds: 1000 });
    expect(p20.body.data.progress.completionPercent).toBe(60);
    expect(p20.body.data.progress.lastPositionSeconds).toBe(200);

    // Watch 92% -> auto-completes and updates recently accessed lessons for studentB ONLY
    const p92 = await request(app)
      .post('/api/v1/playback/progress')
      .set('Authorization', `Bearer ${studentB.token}`)
      .send({ lessonId: lesson1Id, positionSeconds: 920, durationSeconds: 1000 });
    expect(p92.body.data.progress.isCompleted).toBe(true);
    expect(p92.body.data.progress.completionPercent).toBe(100);

    // Student data isolation: expired student has 0 recent lessons despite studentB's progress
    const recentB = await request(app)
      .get('/api/v1/student/recent-lessons')
      .set('Authorization', `Bearer ${studentB.token}`);
    const recentExp = await request(app)
      .get('/api/v1/student/recent-lessons')
      .set('Authorization', `Bearer ${expired.token}`);
    expect(recentB.body.data.items).toHaveLength(1);
    expect(recentExp.body.data.items).toHaveLength(0);
  });
});
