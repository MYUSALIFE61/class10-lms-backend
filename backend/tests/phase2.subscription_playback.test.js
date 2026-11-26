import crypto from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hmacSha256Hex } from '../src/utils/crypto.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

describe('Phase 2: Subscriptions, Razorpay Verification, Playback Gate, Curriculum & Play Integrity', () => {
  let app;
  let store;
  let authProvider;
  let config;
  let fakeIntegrityResponse;

  const subjectId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  const freeLessonId = crypto.randomUUID();
  const premiumLessonId = crypto.randomUUID();
  const invalidVideoLessonId = crypto.randomUUID();
  const missingVideoLessonId = crypto.randomUUID();
  const mcqId1 = crypto.randomUUID();

  const deviceA = {
    deviceId: 'android-student-device-9999',
    deviceName: 'Vivo Y21',
    manufacturer: 'Vivo',
    osVersion: '12',
    appVersion: '1.0.0',
    platform: 'android',
  };

  function seedCurriculum(dataStore) {
    dataStore.subjects.set(subjectId, {
      id: subjectId,
      board: 'BOTH',
      slug: 'mathematics',
      title: 'Mathematics',
      description: 'Class 10 AP & TS SSC Maths',
      icon_key: 'calculator',
      accent_color: '#1D4ED8',
      display_order: 1,
      is_active: true,
    });

    dataStore.chapters.set(chapterId, {
      id: chapterId,
      subject_id: subjectId,
      chapter_number: 1,
      title: 'Real Numbers',
      summary: 'Euclid division lemma & Fundamental Theorem of Arithmetic',
      display_order: 1,
      is_active: true,
    });

    dataStore.lessons.set(freeLessonId, {
      id: freeLessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: 'Introduction to Real Numbers (Free Preview)',
      description: 'Free demo lesson',
      thumbnail_url: null,
      duration_seconds: 600,
      display_order: 1,
      is_premium: false,
      is_active: true,
    });

    dataStore.lessons.set(premiumLessonId, {
      id: premiumLessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: 'Euclid Division Lemma Board Problems',
      description: 'Premium Class 10 board lecture',
      thumbnail_url: null,
      duration_seconds: 1200,
      display_order: 2,
      is_premium: true,
      is_active: true,
    });

    dataStore.lessons.set(invalidVideoLessonId, {
      id: invalidVideoLessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: 'Misconfigured Video Lesson',
      description: 'Invalid ID test',
      duration_seconds: 300,
      display_order: 3,
      is_premium: false,
      is_active: true,
    });

    dataStore.lessons.set(missingVideoLessonId, {
      id: missingVideoLessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: 'Pending Video Lesson',
      description: 'Missing video source test',
      duration_seconds: 300,
      display_order: 4,
      is_premium: false,
      is_active: true,
    });

    dataStore.videoSources.set(freeLessonId, {
      lesson_id: freeLessonId,
      provider: 'youtube_unlisted',
      youtube_video_id: 'dQw4w9WgXcQ',
    });

    dataStore.videoSources.set(premiumLessonId, {
      lesson_id: premiumLessonId,
      provider: 'youtube_unlisted',
      youtube_video_id: 'M7lc1UVf-VE',
    });

    dataStore.videoSources.set(invalidVideoLessonId, {
      lesson_id: invalidVideoLessonId,
      provider: 'youtube_unlisted',
      youtube_video_id: 'BAD_ID',
    });

    dataStore.mcqs.set(mcqId1, {
      id: mcqId1,
      lesson_id: premiumLessonId,
      question_text: 'For any two positive integers a and b, HCF(a,b) x LCM(a,b) equals:',
      options_json: ['a + b', 'a - b', 'a x b', 'a / b'],
      correct_option_index: 2,
      explanation: 'Product of HCF and LCM of two positive integers equals their product a x b.',
      difficulty: 'easy',
      display_order: 1,
      is_active: true,
    });

    const noteId = crypto.randomUUID();
    dataStore.notes.set(noteId, {
      id: noteId,
      subject_id: subjectId,
      chapter_id: chapterId,
      lesson_id: premiumLessonId,
      title: 'Real Numbers Summary Sheet',
      content_markdown: '# Real Numbers\nEvery composite number can be expressed as a product of primes.',
      is_premium: true,
      display_order: 1,
      is_active: true,
    });

    const pyqId = crypto.randomUUID();
    dataStore.pyqs.set(pyqId, {
      id: pyqId,
      subject_id: subjectId,
      chapter_id: chapterId,
      board: 'AP',
      exam_year: 2024,
      marks: 4,
      question_text: 'Prove that sqrt(2) is an irrational number.',
      model_answer: 'Assume sqrt(2) = p/q in lowest terms...',
      is_premium: true,
      display_order: 1,
      is_active: true,
    });

    const formulaId = crypto.randomUUID();
    dataStore.formulas.set(formulaId, {
      id: formulaId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: 'Euclid Division Algorithm',
      formula_expression: 'a = bq + r, 0 <= r < b',
      explanation: 'Used to compute HCF of two positive integers.',
      is_premium: true,
      display_order: 1,
      is_active: true,
    });
  }

  async function registerStudent(email = 'student@ap10.in') {
    const res = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'Password1234',
      fullName: 'Sai Teja',
      phone: '9848012345',
      board: 'AP',
      device: deviceA,
    });
    return {
      token: res.body.data.tokens.accessToken,
      userId: res.body.data.user.id,
      deviceDbId: res.body.data.device.id,
    };
  }

  beforeEach(() => {
    config = makeTestConfig();
    store = new InMemoryDataStore();
    seedCurriculum(store);
    authProvider = new InMemoryAuthProvider();
    fakeIntegrityResponse = {
      configured: true,
      nonce: null,
      appRecognitionVerdict: 'UNRECOGNIZED_VERSION',
      deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
    };

    const paymentGateway = {
      async createOrder({ amountPaise, currency }) {
        return {
          id: `order_${crypto.randomBytes(6).toString('hex')}`,
          amount: amountPaise,
          currency,
        };
      },
    };

    const integrityProvider = {
      async decodeToken() {
        return fakeIntegrityResponse;
      },
    };

    ({ app } = createApp({
      config,
      store,
      authProvider,
      paymentGateway,
      integrityProvider,
      disableRateLimit: true,
    }));
  });

  it('denies unpaid student access to premium lesson, allows free preview, and never leaks video IDs in catalog', async () => {
    const { token } = await registerStudent();

    // Catalog listing never leaks youtubeVideoId
    const lessonsRes = await request(app)
      .get(`/api/v1/curriculum/chapters/${chapterId}/lessons`)
      .set('Authorization', `Bearer ${token}`);
    expect(lessonsRes.status).toBe(200);
    expect(JSON.stringify(lessonsRes.body)).not.toContain('M7lc1UVf-VE');
    expect(JSON.stringify(lessonsRes.body)).not.toContain('dQw4w9WgXcQ');
    const premMeta = lessonsRes.body.data.items.find((l) => l.id === premiumLessonId);
    expect(premMeta.locked).toBe(true);

    // Free preview allowed without subscription
    const freePlay = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: freeLessonId, deviceId: deviceA.deviceId });
    expect(freePlay.status).toBe(200);
    expect(freePlay.body.data.playback.youtubeVideoId).toBe('dQw4w9WgXcQ');

    // Premium lesson denied with 403 SUBSCRIPTION_REQUIRED
    const premPlay = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: premiumLessonId, deviceId: deviceA.deviceId });
    expect(premPlay.status).toBe(403);
    expect(premPlay.body.error.code).toBe('SUBSCRIPTION_REQUIRED');

    // Premium notes/PYQs/formulas hide content for unpaid student
    const notesRes = await request(app)
      .get(`/api/v1/curriculum/notes?chapterId=${chapterId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(notesRes.body.data.items[0].locked).toBe(true);
    expect(notesRes.body.data.items[0].contentMarkdown).toBeNull();
  });

  it('completes Razorpay ₹499 checkout, rejects forged signature, activates subscription, and unlocks playback + MCQs + progress', async () => {
    const { token } = await registerStudent();

    // Create ₹499 Razorpay order
    const orderRes = await request(app)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.data.amountPaise).toBe(49900);
    expect(orderRes.body.data.amountRupees).toBe(499);
    const { orderId } = orderRes.body.data;

    // Pending unpaid order STILL blocks premium playback
    const pendingPlay = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: premiumLessonId, deviceId: deviceA.deviceId });
    expect(pendingPlay.status).toBe(403);
    expect(pendingPlay.body.error.code).toBe('SUBSCRIPTION_UNPAID');

    // Forged signature rejected
    const forged = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId: 'pay_fake123456',
        razorpaySignature: '0'.repeat(64),
      });
    expect(forged.status).toBe(400);

    // Valid HMAC-SHA256 Razorpay signature activates subscription
    const paymentId = 'pay_valid998877';
    const validSig = hmacSha256Hex(config.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
    const verified = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSig,
      });
    expect(verified.status).toBe(200);
    expect(verified.body.data.subscription.status).toBe('active');

    // Premium playback now authorized with watermark and prev/next navigation
    const play = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: premiumLessonId, deviceId: deviceA.deviceId });
    expect(play.status).toBe(200);
    expect(play.body.data.playback.youtubeVideoId).toBe('M7lc1UVf-VE');
    expect(play.body.data.watermark.identifier).toBe('98******45');
    expect(play.body.data.navigation.previousLesson.id).toBe(freeLessonId);

    // Save resume progress and verify resume position on subsequent authorize
    const progRes = await request(app)
      .post('/api/v1/playback/progress')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: premiumLessonId, positionSeconds: 420, durationSeconds: 1200 });
    expect(progRes.status).toBe(200);
    expect(progRes.body.data.progress.completionPercent).toBe(35);

    const playAgain = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: premiumLessonId, deviceId: deviceA.deviceId });
    expect(playAgain.body.data.playback.resumePositionSeconds).toBe(420);

    // MCQs omit answer key on GET and grade accurately on POST
    const mcqGet = await request(app)
      .get(`/api/v1/curriculum/lessons/${premiumLessonId}/mcqs`)
      .set('Authorization', `Bearer ${token}`);
    expect(mcqGet.status).toBe(200);
    expect(mcqGet.body.data.mcqs[0].correctOptionIndex).toBeUndefined();

    const mcqSubmit = await request(app)
      .post(`/api/v1/curriculum/lessons/${premiumLessonId}/mcqs/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ mcqId: mcqId1, selectedOptionIndex: 2 }] });
    expect(mcqSubmit.status).toBe(200);
    expect(mcqSubmit.body.data.score).toBe(1);
    expect(mcqSubmit.body.data.percentage).toBe(100);
  });

  it('blocks expired subscriptions and revokes access on Razorpay refund webhook', async () => {
    const { token, userId } = await registerStudent('expired@ap10.in');

    // Create & activate via Razorpay signed webhook
    const orderRes = await request(app)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const { orderId, subscriptionId } = orderRes.body.data;

    const captureBody = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_hook_001', order_id: orderId } } },
    });
    const captureSig = hmacSha256Hex(config.RAZORPAY_WEBHOOK_SECRET, captureBody);

    const hookRes = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', captureSig)
      .send(captureBody);
    expect(hookRes.status).toBe(200);
    expect(hookRes.body.data.action).toBe('activated');

    // Simulate expiry in DB
    await store.updateSubscription(subscriptionId, {
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const expiredPlay = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: premiumLessonId, deviceId: deviceA.deviceId });
    expect(expiredPlay.status).toBe(403);
    expect(expiredPlay.body.error.code).toBe('SUBSCRIPTION_EXPIRED');

    // Re-extend then fire refund webhook -> must revoke immediately
    await store.updateSubscription(subscriptionId, {
      status: 'active',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const refundBody = JSON.stringify({
      event: 'refund.created',
      payload: { payment: { entity: { id: 'pay_hook_001', order_id: orderId } } },
    });
    const refundSig = hmacSha256Hex(config.RAZORPAY_WEBHOOK_SECRET, refundBody);
    await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', refundSig)
      .send(refundBody);

    const afterRefund = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: premiumLessonId, deviceId: deviceA.deviceId });
    expect(afterRefund.status).toBe(403);
    expect(afterRefund.body.error.code).toBe('SUBSCRIPTION_REVOKED');
    expect(userId).toBeTruthy();
  });

  it('rejects invalid YouTube video IDs (422) and missing video sources (404)', async () => {
    const { token } = await registerStudent('videocheck@ts10.in');

    const badId = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: invalidVideoLessonId, deviceId: deviceA.deviceId });
    expect(badId.status).toBe(422);
    expect(badId.body.error.code).toBe('INVALID_VIDEO_ID');

    const missing = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: missingVideoLessonId, deviceId: deviceA.deviceId });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('VIDEO_UNAVAILABLE');
  });

  it('authorizes private_stream lessons with signed HTTPS token URL and zero YouTube video ID', async () => {
    const privateLessonId = crypto.randomUUID();
    store.lessons.set(privateLessonId, {
      id: privateLessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: 'Private Stream Lesson',
      description: 'No YouTube redirect',
      duration_seconds: 600,
      display_order: 5,
      is_premium: false,
      is_active: true,
    });
    store.videoSources.set(privateLessonId, {
      lesson_id: privateLessonId,
      provider: 'private_stream',
      youtube_video_id: null,
      stream_url: 'https://cdn.class10lms.in/math/real-numbers.m3u8',
    });

    config = makeTestConfig({ PRIVATE_STREAM_TOKEN_KEY: 'super-secret-bunny-token-key-1234' });
    ({ app } = createApp({ config, store, authProvider, disableRateLimit: true }));

    const { token } = await registerStudent('private@ap10.in');
    const res = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: privateLessonId, deviceId: deviceA.deviceId });

    expect(res.status).toBe(200);
    expect(res.body.data.provider).toBe('private_stream');
    expect(res.body.data.playback.youtubeVideoId).toBeNull();
    expect(res.body.data.playback.streamUrl).toContain('https://cdn.class10lms.in/math/real-numbers.m3u8?');
    expect(res.body.data.playback.streamUrl).toContain('token=');
    expect(res.body.data.playback.streamUrl).toContain('expires=');
  });

  it('verifies Play Integrity nonce + blocks compromised devices in enforce mode', async () => {
    config = makeTestConfig({
      INTEGRITY_DISTRIBUTION_MODE: 'sideload',
      INTEGRITY_ENFORCEMENT_MODE: 'enforce',
    });
    ({ app } = createApp({
      config,
      store,
      authProvider,
      integrityProvider: { async decodeToken() { return fakeIntegrityResponse; } },
      disableRateLimit: true,
    }));

    const { token } = await registerStudent('integrity@ap10.in');

    const nonceRes = await request(app)
      .post('/api/v1/integrity/nonce')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(nonceRes.status).toBe(200);
    const { nonce } = nonceRes.body.data;

    // Passing sideloaded device with MEETS_DEVICE_INTEGRITY succeeds
    fakeIntegrityResponse = {
      configured: true,
      nonce,
      appRecognitionVerdict: 'UNRECOGNIZED_VERSION',
      deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'],
    };
    const ok = await request(app)
      .post('/api/v1/integrity/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ integrityToken: 'mock-valid-play-integrity-token-123456' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.verdict).toBe('SIDELOAD_DEVICE_INTEGRITY');

    // Compromised device with empty device verdicts blocked in enforce mode
    const nonce2 = (
      await request(app)
        .post('/api/v1/integrity/nonce')
        .set('Authorization', `Bearer ${token}`)
        .send({})
    ).body.data.nonce;

    fakeIntegrityResponse = {
      configured: true,
      nonce: nonce2,
      appRecognitionVerdict: 'UNRECOGNIZED_VERSION',
      deviceRecognitionVerdict: [],
    };
    const blocked = await request(app)
      .post('/api/v1/integrity/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ integrityToken: 'mock-compromised-integrity-token-123456' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PLAY_INTEGRITY_FAILED');
  });
});
