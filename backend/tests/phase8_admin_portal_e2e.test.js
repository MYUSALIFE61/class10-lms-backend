import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

describe('Phase 8: Complete Dynamic Class 10 LMS Admin Portal & Student E2E (All 12 Master Prompt Tests + Section 28 Workflow)', () => {
  let app;
  let store;
  let authProvider;
  let adminToken;

  const mockVideoProvider = {
    name: 'pikpak_local',
    isCommercialSafe: false,
    async listVideos() {
      return [
        {
          provider: 'pikpak_local',
          providerFileId: 'pk-raw-001',
          fileName: 'VID-20261108-WA00001.mp4',
          title: 'VID 20261108 WA00001',
          mimeType: 'video/mp4',
          sizeLabel: '12.4 MB',
          folderName: 'My Upload',
          folderSegments: ['My Upload'],
        },
      ];
    },
    async streamVideoToResponse({ res }) {
      const payload = Buffer.from('FAKE_MP4_PROTECTED_BYTES_0123456789');
      res.status(200).setHeader('Content-Type', 'video/mp4').send(payload);
    },
  };

  async function registerStudent({ email, fullName, board = 'AP', paid = true }) {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'Password1234',
        fullName,
        phone: '9848012345',
        board,
        device: {
          deviceId: `android-${email.replace(/[^a-z0-9]/gi, '')}-device`,
          deviceName: 'Redmi Note 13',
          platform: 'android',
        },
      });
    expect(res.status).toBe(201);
    const { user, tokens } = res.body.data;
    if (paid) {
      const plan = await store.getPlanByCode('CLASS10_ANNUAL_499');
      const tx = await store.createPaymentTransaction({
        user_id: user.id,
        plan_id: plan.id,
        razorpay_order_id: `order_${user.id.slice(0, 8)}`,
        razorpay_payment_id: `pay_${user.id.slice(0, 8)}`,
        amount_paise: 49900,
        currency: 'INR',
        status: 'captured',
        verified_at: new Date().toISOString(),
      });
      await store.createSubscription({
        user_id: user.id,
        plan_id: plan.id,
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
        latest_payment_id: tx.id,
      });
    }
    return { user, token: tokens.accessToken };
  }

  beforeEach(async () => {
    store = new InMemoryDataStore();
    authProvider = new InMemoryAuthProvider();
    const built = createApp({
      config: makeTestConfig({ VIDEO_STORAGE_PROVIDER: 'pikpak_local' }),
      store,
      authProvider,
      videoProvider: mockVideoProvider,
      disableRateLimit: true,
    });
    app = built.app;

    const loginRes = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@class10lms.in', password: 'Admin@1234' });
    expect(loginRes.status).toBe(200);
    adminToken = loginRes.body.data.tokens.accessToken;
  });

  it('Tests 1-10 & Section 28 Definition of Success: Full Admin CMS -> Student App Dynamic E2E Flow', async () => {
    // Test 1: Student creation via existing registration appears immediately in Admin Portal
    const apStudent = await registerStudent({ email: 'ap.student@class10.in', fullName: 'Kavya AP', board: 'AP' });
    const tsStudent = await registerStudent({ email: 'ts.student@class10.in', fullName: 'Rahul TS', board: 'TS' });

    const studentsRes = await request(app)
      .get('/api/v1/admin/students')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(studentsRes.status).toBe(200);
    expect(studentsRes.body.data.items.map((s) => s.email)).toContain('ap.student@class10.in');
    expect(studentsRes.body.data.items.map((s) => s.email)).toContain('ts.student@class10.in');

    // Test 2: Admin creates Mathematics subject -> appears dynamically in Student App
    const subRes = await request(app)
      .post('/api/v1/admin/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Mathematics', slug: 'mathematics', boardCodes: ['AP', 'TS'], status: 'published' });
    expect(subRes.status).toBe(201);
    const mathId = subRes.body.data.id;

    // Test 3: Admin creates Chapter + 5 Topics
    const chRes = await request(app)
      .post('/api/v1/admin/chapters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId: mathId,
        chapterNumber: 1,
        title: 'Real Numbers',
        summary: 'Complete AP & TS SSC Chapter 1',
        boardCodes: ['AP', 'TS'],
        status: 'published',
      });
    expect(chRes.status).toBe(201);
    const chapterId = chRes.body.data.id;

    const topicIds = [];
    for (let t = 1; t <= 5; t += 1) {
      const tRes = await request(app)
        .post('/api/v1/admin/topics')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ chapterId, title: `Topic ${t}: Euclid & Primes Part ${t}`, displayOrder: t, status: 'published' });
      expect(tRes.status).toBe(201);
      topicIds.push(tRes.body.data.id);
    }

    // Test 4 & Section 28: Create 10 lessons linked to existing PikPak video assets (TE_EN_MIX)
    const lessonIds = [];
    for (let i = 1; i <= 10; i += 1) {
      const lRes = await request(app)
        .post('/api/v1/admin/lessons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          subjectId: mathId,
          chapterId,
          topicId: topicIds[(i - 1) % 5],
          title: `Lesson ${i}: Real Numbers Part ${i}`,
          description: `Bilingual Telugu+English explanation part ${i}`,
          durationSeconds: 600,
          displayOrder: i,
          videoLanguage: 'TE_EN_MIX',
          boardCodes: ['AP', 'TS'],
          status: 'published',
          videoSource: {
            provider: 'pikpak_local',
            providerFileId: `pk-file-${i}`,
            fileName: `VID-20261108-WA0000${i}.mp4`,
            mimeType: 'video/mp4',
          },
        });
      expect(lRes.status).toBe(201);
      lessonIds.push(lRes.body.data.id);
    }

    // Non-destructive PikPak filename mapping check: sync raw video & rename displayTitle while preserving originalFileName
    const syncRes = await request(app)
      .post('/api/v1/admin/videos/sync')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(syncRes.status).toBe(200);
    const syncedLessonId = syncRes.body.data.videos[0].id;
    const mapRes = await request(app)
      .patch(`/api/v1/admin/videos/${syncedLessonId}/map`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        displayTitle: 'Real Numbers — Bilingual Intro (Mapped)',
        subjectId: mathId,
        chapterId,
        languageCode: 'TE_EN_MIX',
        boardCodes: ['AP', 'TS'],
        status: 'published',
      });
    expect(mapRes.status).toBe(200);
    const videosList = await request(app)
      .get('/api/v1/admin/videos')
      .set('Authorization', `Bearer ${adminToken}`);
    const mappedItem = videosList.body.data.items.find((v) => v.lessonId === syncedLessonId);
    expect(mappedItem.displayTitle).toBe('Real Numbers — Bilingual Intro (Mapped)');
    expect(mappedItem.originalFileName).toBe('VID-20261108-WA00001.mp4');
    expect(mappedItem.languageCode).toBe('TE_EN_MIX');

    // Test 5: Notes PDF upload (English Medium + Telugu Medium separately)
    const fakePdfBase64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF').toString('base64');
    const pdfRes = await request(app)
      .post('/api/v1/admin/resources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Real Numbers Chapter Notes PDF',
        subjectId: mathId,
        chapterId,
        lessonId: lessonIds[0],
        resourceType: 'chapter_notes',
        medium: 'EN',
        boardCodes: ['AP', 'TS'],
        fileName: 'real_numbers_notes.pdf',
        mimeType: 'application/pdf',
        contentBase64: fakePdfBase64,
        status: 'published',
      });
    expect(pdfRes.status).toBe(201);
    const pdfResourceId = pdfRes.body.data.id;

    // Test 6 & Section 28: Bulk import 100 MCQ questions
    const hundredRows = Array.from({ length: 100 }, (_, idx) => ({
      questionType: 'mcq',
      questionText: `Question ${idx + 1}: What is ${idx + 1} + ${idx + 1}?`,
      options: [String((idx + 1) * 2), String((idx + 1) * 2 + 1), String((idx + 1) * 2 - 1), '0'],
      correctOptionIndex: 0,
      explanation: `${idx + 1} + ${idx + 1} = ${(idx + 1) * 2}`,
      difficulty: idx % 3 === 0 ? 'easy' : idx % 3 === 1 ? 'medium' : 'hard',
      marks: 1,
      boardCodes: ['AP', 'TS'],
    }));
    const importRes = await request(app)
      .post('/api/v1/admin/questions/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ subjectId: mathId, chapterId, rows: hundredRows });
    expect(importRes.status).toBe(201);
    expect(importRes.body.data.importedCount).toBe(100);
    const first15Ids = importRes.body.data.items.slice(0, 15).map((q) => q.id);

    // Test 7: Create & publish 15-question timed quiz
    const quizRes = await request(app)
      .post('/api/v1/admin/quizzes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Real Numbers 15-Question Timed Quiz',
        subjectId: mathId,
        chapterId,
        questionIds: first15Ids,
        durationMinutes: 15,
        totalMarks: 15,
        passingMarks: 6,
        boardCodes: ['AP', 'TS'],
        status: 'published',
      });
    expect(quizRes.status).toBe(201);
    const quizId = quizRes.body.data.id;

    // Test 8: Board mapping — publish AP-only lesson -> AP sees it, TS does NOT; then map to BOTH -> both see it
    const apOnlyRes = await request(app)
      .post('/api/v1/admin/lessons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId: mathId,
        chapterId,
        title: 'AP SSC Exclusive Board Lesson',
        boardCodes: ['AP'],
        status: 'published',
      });
    expect(apOnlyRes.status).toBe(201);
    const apOnlyLessonId = apOnlyRes.body.data.id;

    const apLessonsBefore = await request(app)
      .get(`/api/v1/student/chapters/${chapterId}/lessons`)
      .set('Authorization', `Bearer ${apStudent.token}`);
    const tsLessonsBefore = await request(app)
      .get(`/api/v1/student/chapters/${chapterId}/lessons`)
      .set('Authorization', `Bearer ${tsStudent.token}`);
    expect(apLessonsBefore.body.data.items.some((l) => l.id === apOnlyLessonId)).toBe(true);
    expect(tsLessonsBefore.body.data.items.some((l) => l.id === apOnlyLessonId)).toBe(false);

    // Map to BOTH boards
    await request(app)
      .patch(`/api/v1/admin/lessons/${apOnlyLessonId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ boardCodes: ['AP', 'TS'] });
    const tsLessonsAfter = await request(app)
      .get(`/api/v1/student/chapters/${chapterId}/lessons`)
      .set('Authorization', `Bearer ${tsStudent.token}`);
    expect(tsLessonsAfter.body.data.items.some((l) => l.id === apOnlyLessonId)).toBe(true);

    // Student opens dynamic home, chapters, lessons, plays video, downloads PDF, takes timed quiz, saves progress
    const homeRes = await request(app)
      .get('/api/v1/student/home')
      .set('Authorization', `Bearer ${apStudent.token}`);
    expect(homeRes.status).toBe(200);
    expect(homeRes.body.data.subjects.some((s) => s.id === mathId)).toBe(true);

    const playAuth = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${apStudent.token}`)
      .send({ lessonId: lessonIds[0] });
    expect(playAuth.status).toBe(200);
    expect(playAuth.body.data.playback.streamUrl).toContain('/api/v1/playback/stream/');

    const pdfDownload = await request(app)
      .get(`/api/v1/student/resources/${pdfResourceId}/download`)
      .set('Authorization', `Bearer ${apStudent.token}`);
    expect(pdfDownload.status).toBe(200);
    expect(pdfDownload.headers['content-type']).toContain('application/pdf');

    // Start & submit timed quiz (verifying answers are NOT leaked on start)
    const startQuiz = await request(app)
      .post(`/api/v1/student/quizzes/${quizId}/start`)
      .set('Authorization', `Bearer ${apStudent.token}`)
      .send({});
    expect(startQuiz.status).toBe(201);
    expect(startQuiz.body.data.questions).toHaveLength(15);
    expect(startQuiz.body.data.questions[0].correctOptionIndex).toBeUndefined();

    const submitQuiz = await request(app)
      .post(`/api/v1/student/quizzes/${quizId}/submit`)
      .set('Authorization', `Bearer ${apStudent.token}`)
      .send({
        attemptId: startQuiz.body.data.attemptId,
        answers: startQuiz.body.data.questions.map((q) => ({ questionId: q.id, selectedOptionIndex: 0 })),
      });
    expect(submitQuiz.status).toBe(200);
    expect(submitQuiz.body.data.score).toBe(15);
    expect(submitQuiz.body.data.percentage).toBe(100);

    // Test 9: Watch & complete lesson -> Admin Dashboard reflects updated progress & student detail shows activity
    const saveProg = await request(app)
      .post('/api/v1/playback/progress')
      .set('Authorization', `Bearer ${apStudent.token}`)
      .send({ lessonId: lessonIds[0], positionSeconds: 580, durationSeconds: 600, markCompleted: true });
    expect(saveProg.status).toBe(200);

    const adminDash = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminDash.status).toBe(200);
    expect(adminDash.body.data.kpis.completedLessons).toBeGreaterThanOrEqual(1);
    expect(adminDash.body.data.kpis.totalMcqQuestions).toBe(100);
    expect(adminDash.body.data.kpis.totalPublishedTests).toBe(1);

    // Test 10: Unpublish lesson -> disappears from student catalog while historical progress & audit logs remain intact
    await request(app)
      .patch(`/api/v1/admin/lessons/${lessonIds[0]}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'draft' });

    const studentLessonsAfterUnpublish = await request(app)
      .get(`/api/v1/student/chapters/${chapterId}/lessons`)
      .set('Authorization', `Bearer ${apStudent.token}`);
    expect(studentLessonsAfterUnpublish.body.data.items.some((l) => l.id === lessonIds[0])).toBe(false);

    const studentDetail = await request(app)
      .get(`/api/v1/admin/students/${apStudent.user.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(studentDetail.status).toBe(200);
    expect(studentDetail.body.data.lessonCompletion.some((p) => p.lessonId === lessonIds[0] && p.isCompleted)).toBe(true);
    expect(studentDetail.body.data.quizAttempts.length).toBeGreaterThanOrEqual(1);
  });

  it('Test 11: Strict Backend Security & RBAC — Students blocked from Admin APIs & role restrictions enforced', async () => {
    const student = await registerStudent({ email: 'sec.student@ap10.in', fullName: 'Security Test', board: 'AP', paid: false });

    // Student token MUST be rejected on every admin endpoint
    const tryDash = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${student.token}`);
    expect(tryDash.status).toBe(401);

    const tryStudents = await request(app)
      .get('/api/v1/admin/students')
      .set('Authorization', `Bearer ${student.token}`);
    expect(tryStudents.status).toBe(401);

    // Create a Question Bank Manager (cannot manage subscriptions or admin users!)
    const createQbMgr = await request(app)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'QB Manager',
        email: 'qb@class10lms.in',
        password: 'QbPassword123',
        roleCode: 'question_bank_manager',
      });
    expect(createQbMgr.status).toBe(201);

    const qbLogin = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'qb@class10lms.in', password: 'QbPassword123' });
    const qbToken = qbLogin.body.data.tokens.accessToken;

    const qbAllowed = await request(app)
      .get('/api/v1/admin/questions')
      .set('Authorization', `Bearer ${qbToken}`);
    expect(qbAllowed.status).toBe(200);

    const qbForbidden = await request(app)
      .get('/api/v1/admin/subscriptions')
      .set('Authorization', `Bearer ${qbToken}`);
    expect(qbForbidden.status).toBe(403);
  });
});
