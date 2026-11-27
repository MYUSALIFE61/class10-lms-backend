import crypto from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hmacSha256Hex } from '../src/utils/crypto.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

describe('Phase 2: Complete Registration, Username Uniqueness & 3 Subscription Plans', () => {
  let config;
  let store;
  let authProvider;
  let app;

  const subjectId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  const paidLessonId = crypto.randomUUID();

  const deviceA = {
    deviceId: 'android-device-phase2-a111',
    deviceName: 'Redmi Note 13',
    manufacturer: 'Xiaomi',
    osVersion: '14',
    appVersion: '1.0.0',
    platform: 'android',
  };

  function seedPaidLesson() {
    store.subjects.set(subjectId, {
      id: subjectId,
      board: 'BOTH',
      slug: 'mathematics',
      title: 'Mathematics',
      description: 'Class 10 SSC Math',
      icon_key: 'calculator',
      accent_color: '#1D4ED8',
      display_order: 1,
      is_active: true,
    });
    store.chapters.set(chapterId, {
      id: chapterId,
      subject_id: subjectId,
      chapter_number: 4,
      title: 'Pair of Linear Equations',
      summary: 'Class 10 Chapter 4',
      display_order: 4,
      is_active: true,
    });
    store.lessons.set(paidLessonId, {
      id: paidLessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: '4.1 Pair of Linear Equations Intro',
      description: 'Paid Class 10 SSC lesson',
      duration_seconds: 1200,
      is_premium: true,
      display_order: 1,
      is_active: true,
    });
    store.videoSources.set(paidLessonId, {
      lesson_id: paidLessonId,
      provider: 'private_stream',
      youtube_video_id: null,
      stream_url: 'https://cdn.class10lms.in/math/ch4-l1.m3u8',
    });
  }

  beforeEach(() => {
    config = makeTestConfig({
      SUBSCRIPTION_PLAN_CODE: 'CLASS10_ANNUAL_799',
      PRIVATE_STREAM_TOKEN_KEY: 'test-stream-token-key-123456',
    });
    store = new InMemoryDataStore();
    seedPaidLesson();
    authProvider = new InMemoryAuthProvider();
    const paymentGateway = {
      async createOrder({ amountPaise, currency }) {
        return {
          id: `order_${crypto.randomBytes(6).toString('hex')}`,
          amount: amountPaise,
          currency,
        };
      },
    };

    ({ app } = createApp({
      config,
      store,
      authProvider,
      paymentGateway,
      disableRateLimit: true,
    }));
  });

  it('validates username uniqueness, confirmPassword, strength rules, and persists state/district/school fields', async () => {
    // 1. Invalid username format
    const badCheck = await request(app).get('/api/v1/auth/check-username?username=ab');
    expect(badCheck.status).toBe(200);
    expect(badCheck.body.data.available).toBe(false);
    expect(badCheck.body.data.valid).toBe(false);

    // 2. Fresh username is available
    const availCheck = await request(app).get('/api/v1/auth/check-username?username=Karthik.AP10');
    expect(availCheck.status).toBe(200);
    expect(availCheck.body.data.available).toBe(true);
    expect(availCheck.body.data.normalizedUsername).toBe('karthik.ap10');

    // 3. Mismatched confirmPassword rejected
    const mismatchRes = await request(app).post('/api/v1/auth/register').send({
      email: 'karthik@ap10.in',
      username: 'Karthik.AP10',
      password: 'StrongPassword1',
      confirmPassword: 'DifferentPassword1',
      fullName: 'Karthik Reddy',
      phone: '9876500111',
      state: 'Andhra Pradesh',
      district: 'Guntur',
      schoolName: 'ZPHS Guntur',
      className: 'Class 10',
      board: 'AP',
      device: deviceA,
    });
    expect(mismatchRes.status).toBe(400);

    // 4. Weak password rejected
    const weakRes = await request(app).post('/api/v1/auth/register').send({
      email: 'karthik@ap10.in',
      username: 'Karthik.AP10',
      password: 'password123',
      confirmPassword: 'password123',
      fullName: 'Karthik Reddy',
      phone: '9876500111',
      board: 'AP',
      device: deviceA,
    });
    expect(weakRes.status).toBe(400);

    // 5. Complete valid student registration succeeds with unpaid status
    const okRes = await request(app).post('/api/v1/auth/register').send({
      email: 'karthik@ap10.in',
      username: 'Karthik.AP10',
      password: 'StrongPassword1',
      confirmPassword: 'StrongPassword1',
      fullName: 'Karthik Reddy',
      phone: '9876500111',
      state: 'Andhra Pradesh',
      district: 'Guntur',
      schoolName: 'ZPHS Guntur',
      className: 'Class 10',
      board: 'AP',
      device: deviceA,
    });
    expect(okRes.status).toBe(201);
    expect(okRes.body.data.user.username).toBe('karthik.ap10');
    expect(okRes.body.data.user.state).toBe('Andhra Pradesh');
    expect(okRes.body.data.user.district).toBe('Guntur');
    expect(okRes.body.data.user.schoolName).toBe('ZPHS Guntur');
    expect(okRes.body.data.user.className).toBe('Class 10');
    expect(okRes.body.data.subscription.isActive).toBe(false);
    expect(okRes.body.data.subscription.status).toBe('unpaid');

    // 6. Taken username rejected (case-insensitive)
    const takenCheck = await request(app).get('/api/v1/auth/check-username?username=KARTHIK.AP10');
    expect(takenCheck.body.data.available).toBe(false);

    const dupUser = await request(app).post('/api/v1/auth/register').send({
      email: 'other@ap10.in',
      username: 'KARTHIK.AP10',
      password: 'StrongPassword1',
      confirmPassword: 'StrongPassword1',
      fullName: 'Other Student',
      phone: '9876500222',
      board: 'AP',
      device: deviceA,
    });
    expect(dupUser.status).toBe(409);
    expect(dupUser.body.error.code).toBe('USERNAME_EXISTS');

    // 7. Duplicate email rejected cleanly while sibling with same parent phone & unique username succeeds
    const dupEmail = await request(app).post('/api/v1/auth/register').send({
      email: 'karthik@ap10.in',
      username: 'otherstudent2',
      password: 'StrongPassword1',
      confirmPassword: 'StrongPassword1',
      fullName: 'Other Student Two',
      phone: '9876500111',
      board: 'AP',
      device: { ...deviceA, deviceId: 'android-device-phase2-b222' },
    });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.error.code).toBe('EMAIL_EXISTS');

    const siblingOk = await request(app).post('/api/v1/auth/register').send({
      email: 'sibling@ap10.in',
      username: 'sibling.ap10',
      password: 'StrongPassword1',
      confirmPassword: 'StrongPassword1',
      fullName: 'Sibling Reddy',
      phone: '9876500111',
      board: 'AP',
      device: { ...deviceA, deviceId: 'android-device-phase2-b223' },
    });
    expect(siblingOk.status).toBe(201);
    expect(siblingOk.body.data.user.username).toBe('sibling.ap10');
  });

  it('lists 3 backend-controlled plans (₹200/30d, ₹500/180d, ₹799/365d), preserves legacy ₹499 inactive, and blocks unpaid students from paid lessons', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: 'priya@ts10.in',
      username: 'priya.ts10',
      password: 'StrongPassword1',
      confirmPassword: 'StrongPassword1',
      fullName: 'Priya Sharma',
      phone: '9848099887',
      state: 'Telangana',
      district: 'Hyderabad',
      schoolName: 'TS Model School',
      className: 'Class 10',
      board: 'TS',
      device: deviceA,
    });
    const token = reg.body.data.tokens.accessToken;

    // 1. Verify plans endpoint returns strictly the 3 approved plans
    const plansRes = await request(app)
      .get('/api/v1/subscriptions/plans')
      .set('Authorization', `Bearer ${token}`);
    expect(plansRes.status).toBe(200);
    const { plans } = plansRes.body.data;
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => [p.code, p.priceRupees, p.durationDays])).toEqual([
      ['CLASS10_MONTHLY_200', 200, 30],
      ['CLASS10_HALFYEAR_500', 500, 180],
      ['CLASS10_ANNUAL_799', 799, 365],
    ]);
    expect(plans.find((p) => p.code === 'CLASS10_ANNUAL_799').isRecommended).toBe(true);

    // Legacy plan still exists in DB/store, marked inactive & blocked from explicit new checkout
    const legacyPlan = [...store.plans.values()].find((p) => p.code === 'CLASS10_ANNUAL_499');
    expect(legacyPlan).toBeTruthy();
    expect(legacyPlan.is_active).toBe(false);
    const legacySelect = await request(app)
      .post('/api/v1/subscriptions/select-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'CLASS10_ANNUAL_499' });
    expect(legacySelect.status).toBe(404);

    // 2. Unpaid student cannot access paid lesson
    const unpaidPlay = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: paidLessonId, deviceId: deviceA.deviceId });
    expect(unpaidPlay.status).toBe(403);
    expect(unpaidPlay.body.error.code).toBe('SUBSCRIPTION_REQUIRED');

    // 3. Selecting a plan sets status='pending' without activating subscription
    const selRes = await request(app)
      .post('/api/v1/subscriptions/select-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'CLASS10_HALFYEAR_500' });
    expect(selRes.status).toBe(200);
    expect(selRes.body.data.plan.priceRupees).toBe(500);
    expect(selRes.body.data.plan.durationDays).toBe(180);
    expect(selRes.body.data.subscription.status).toBe('pending');
    expect(selRes.body.data.subscription.isActive).toBe(false);

    // Pending student STILL cannot access paid lesson
    const pendingPlay = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: paidLessonId, deviceId: deviceA.deviceId });
    expect(pendingPlay.status).toBe(403);
    expect(pendingPlay.body.error.code).toBe('SUBSCRIPTION_UNPAID');
  });

  it('computes backend prices and exact validity durations (30d, 180d, 365d) across all 3 plans upon verified payment and rejects expired users', async () => {
    const planCases = [
      { code: 'CLASS10_MONTHLY_200', paise: 20000, rupees: 200, days: 30 },
      { code: 'CLASS10_HALFYEAR_500', paise: 50000, rupees: 500, days: 180 },
      { code: 'CLASS10_ANNUAL_799', paise: 79900, rupees: 799, days: 365 },
    ];

    for (let i = 0; i < planCases.length; i += 1) {
      const c = planCases[i];
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: `plan${i}@ap10.in`,
        username: `planuser${i}`,
        password: 'StrongPassword1',
        confirmPassword: 'StrongPassword1',
        fullName: `Student ${i}`,
        phone: `984800010${i}`,
        board: 'AP',
        device: { ...deviceA, deviceId: `device-plan-test-${i}` },
      });
      const token = reg.body.data.tokens.accessToken;

      const orderRes = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${token}`)
        .send({ planCode: c.code, amountPaise: 100 }); // untrusted client field ignored by validation/service
      expect(orderRes.status).toBe(201);
      expect(orderRes.body.data.amountPaise).toBe(c.paise);
      expect(orderRes.body.data.amountRupees).toBe(c.rupees);
      expect(orderRes.body.data.plan.durationDays).toBe(c.days);

      const { orderId } = orderRes.body.data;
      const payId = `pay_test_${i}_${Date.now()}`;
      const sig = hmacSha256Hex(config.RAZORPAY_KEY_SECRET, `${orderId}|${payId}`);

      const verifyRes = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({
          razorpayOrderId: orderId,
          razorpayPaymentId: payId,
          razorpaySignature: sig,
        });
      expect(verifyRes.status).toBe(200);
      const { subscription } = verifyRes.body.data;
      expect(subscription.status).toBe('active');
      const diffDays = Math.round(
        (new Date(subscription.expiresAt) - new Date(subscription.startsAt)) / (1000 * 60 * 60 * 24)
      );
      expect(diffDays).toBe(c.days);
    }

    // Expired subscription check returns expired and blocks playback
    const expiredReg = await request(app).post('/api/v1/auth/register').send({
      email: 'expired.check@ts10.in',
      username: 'expireduser',
      password: 'StrongPassword1',
      confirmPassword: 'StrongPassword1',
      fullName: 'Expired Student',
      phone: '9848000999',
      board: 'TS',
      device: { ...deviceA, deviceId: 'device-expired-check-1' },
    });
    const expToken = expiredReg.body.data.tokens.accessToken;
    const expUserId = expiredReg.body.data.user.id;
    const monthlyPlan = await store.getPlanByCode('CLASS10_MONTHLY_200');
    await store.createSubscription({
      user_id: expUserId,
      plan_id: monthlyPlan.id,
      status: 'active',
      starts_at: new Date(Date.now() - 40 * 86400_000).toISOString(),
      expires_at: new Date(Date.now() - 10 * 86400_000).toISOString(),
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'expired.check@ts10.in',
      password: 'StrongPassword1',
      device: { ...deviceA, deviceId: 'device-expired-check-1' },
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.subscription.status).toBe('expired');
    expect(loginRes.body.data.subscription.isActive).toBe(false);

    const expPlay = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${expToken}`)
      .send({ lessonId: paidLessonId, deviceId: 'device-expired-check-1' });
    expect(expPlay.status).toBe(403);
    expect(expPlay.body.error.code).toBe('SUBSCRIPTION_EXPIRED');
  });
});
