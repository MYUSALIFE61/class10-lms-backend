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

describe('Phase 3: Razorpay Test Mode, Dual Verify, UPI/Card Flow, Webhooks & Transaction History', () => {
  let config;
  let store;
  let authProvider;
  let app;
  let gatewayPayments;
  let gatewayBehavior;

  const subjectId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  const paidLessonId = crypto.randomUUID();

  const deviceA = {
    deviceId: 'android-device-phase3-001',
    deviceName: 'iQOO Z7s 5G',
    manufacturer: 'iQOO',
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
      summary: 'Chapter 4',
      display_order: 4,
      is_active: true,
    });
    store.lessons.set(paidLessonId, {
      id: paidLessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: '4.1 Linear Equations Intro',
      description: 'Paid lesson',
      duration_seconds: 900,
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

  function buildGateway() {
    return {
      async createOrder({ amountPaise, currency }) {
        return {
          id: `order_test_${crypto.randomBytes(6).toString('hex')}`,
          amount: amountPaise,
          currency,
        };
      },
      async fetchPayment(paymentId) {
        if (gatewayBehavior?.overrideFetch) {
          return gatewayBehavior.overrideFetch(paymentId);
        }
        return gatewayPayments.get(paymentId) || null;
      },
      async fetchOrderPayments(orderId) {
        return {
          items: [...gatewayPayments.values()].filter((p) => p.order_id === orderId),
        };
      },
    };
  }

  async function registerStudent(email = 'phase3.student@ap10.in', username = 'phase3.student') {
    const res = await request(app).post('/api/v1/auth/register').send({
      email,
      username,
      password: 'StrongPassword1',
      confirmPassword: 'StrongPassword1',
      fullName: 'Tejaswini Rao',
      phone: '9848011122',
      state: 'Andhra Pradesh',
      district: 'Visakhapatnam',
      schoolName: 'ZPHS MVP Colony',
      className: 'Class 10',
      board: 'AP',
      device: deviceA,
    });
    expect(res.status).toBe(201);
    return {
      token: res.body.data.tokens.accessToken,
      userId: res.body.data.user.id,
    };
  }

  beforeEach(() => {
    config = makeTestConfig({
      RAZORPAY_MODE: 'test',
      RAZORPAY_KEY_ID: 'rzp_test_phase3demo123',
      SUBSCRIPTION_PLAN_CODE: 'CLASS10_ANNUAL_799',
      PRIVATE_STREAM_TOKEN_KEY: 'test-stream-secret-key-phase3',
    });
    store = new InMemoryDataStore();
    seedPaidLesson();
    authProvider = new InMemoryAuthProvider();
    gatewayPayments = new Map();
    gatewayBehavior = {};

    ({ app } = createApp({
      config,
      store,
      authProvider,
      paymentGateway: buildGateway(),
      disableRateLimit: true,
    }));
  });

  it('blocks live Razorpay keys when RAZORPAY_MODE=test so real charges cannot happen', async () => {
    const liveConfig = makeTestConfig({
      RAZORPAY_MODE: 'test',
      RAZORPAY_KEY_ID: 'rzp_live_accidentally_set',
    });
    const liveApp = createApp({
      config: liveConfig,
      store: new InMemoryDataStore(),
      authProvider: new InMemoryAuthProvider(),
      paymentGateway: buildGateway(),
      disableRateLimit: true,
    }).app;

    const reg = await request(liveApp).post('/api/v1/auth/register').send({
      email: 'guard@ap10.in',
      username: 'guard.test',
      password: 'StrongPassword1',
      confirmPassword: 'StrongPassword1',
      fullName: 'Guard Student',
      board: 'AP',
      device: deviceA,
    });

    const blockedOrder = await request(liveApp)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${reg.body.data.tokens.accessToken}`)
      .send({ planCode: 'CLASS10_MONTHLY_200' });

    expect(blockedOrder.status).toBe(403);
    expect(blockedOrder.body.error.code).toBe('TEST_MODE_ONLY');
  });

  it('completes UPI & Card Test Mode verified checkout, prevents duplicate activation, and exposes sanitized history', async () => {
    const { token } = await registerStudent();

    // 1. Create order in Test Mode for Half-Yearly (₹500 / 180d)
    const orderRes = await request(app)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'CLASS10_HALFYEAR_500' });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.data.isTestMode).toBe(true);
    expect(orderRes.body.data.razorpayKeyId).toBe('rzp_test_phase3demo123');
    expect(orderRes.body.data.amountPaise).toBe(50000);
    expect(orderRes.body.data.supportedMethods).toEqual(['upi', 'card']);
    const { orderId } = orderRes.body.data;

    // Secret key must NEVER appear in API response
    expect(JSON.stringify(orderRes.body)).not.toContain(config.RAZORPAY_KEY_SECRET);
    expect(JSON.stringify(orderRes.body)).not.toContain(config.RAZORPAY_WEBHOOK_SECRET);

    // Unpaid/pending order still blocks paid lesson playback
    const lockedBefore = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: paidLessonId, deviceId: deviceA.deviceId });
    expect(lockedBefore.status).toBe(403);

    // 2. Reject forged signature + detect gateway amount tampering
    const forged = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId: 'pay_forged_001',
        razorpaySignature: 'a'.repeat(64),
      });
    expect(forged.status).toBe(400);

    // Amount tampered at gateway even with valid signature must fail
    const tamperPayId = 'pay_tamper_001';
    gatewayPayments.set(tamperPayId, {
      id: tamperPayId,
      order_id: orderId,
      amount: 100, // tampered!
      currency: 'INR',
      method: 'card',
      status: 'captured',
    });
    const tamperSig = hmacSha256Hex(config.RAZORPAY_KEY_SECRET, `${orderId}|${tamperPayId}`);
    const tamperRes = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId: tamperPayId,
        razorpaySignature: tamperSig,
      });
    expect(tamperRes.status).toBe(400);

    // 3. Valid UPI Test Mode payment verification activates subscription cleanly
    const payId = 'pay_upi_valid_001';
    gatewayPayments.set(payId, {
      id: payId,
      order_id: orderId,
      amount: 50000,
      currency: 'INR',
      method: 'upi',
      status: 'captured',
    });
    const validSig = hmacSha256Hex(config.RAZORPAY_KEY_SECRET, `${orderId}|${payId}`);

    const verifyRes = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId: payId,
        razorpaySignature: validSig,
      });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.verified).toBe(true);
    expect(verifyRes.body.data.alreadyProcessed).toBe(false);
    expect(verifyRes.body.data.subscription.status).toBe('active');
    expect(verifyRes.body.data.subscription.isActive).toBe(true);
    expect(verifyRes.body.data.transaction.method).toBe('upi');
    const firstExpiresAt = verifyRes.body.data.subscription.expiresAt;

    // 4. Duplicate verify call must be idempotent without resetting validity
    const dupVerify = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId: payId,
        razorpaySignature: validSig,
      });
    expect(dupVerify.status).toBe(200);
    expect(dupVerify.body.data.alreadyProcessed).toBe(true);
    expect(dupVerify.body.data.subscription.expiresAt).toBe(firstExpiresAt);

    // 5. Paid lesson now unlocks for verified subscriber
    const unlocked = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: paidLessonId, deviceId: deviceA.deviceId });
    expect(unlocked.status).toBe(200);

    // 6. Transaction history returns record without signature/secret leakage
    const histRes = await request(app)
      .get('/api/v1/payments/history')
      .set('Authorization', `Bearer ${token}`);
    expect(histRes.status).toBe(200);
    expect(histRes.body.data.transactions).toHaveLength(1);
    expect(histRes.body.data.transactions[0]).toMatchObject({
      orderId,
      paymentId: payId,
      amountRupees: 500,
      status: 'captured',
      method: 'upi',
      planCode: 'CLASS10_HALFYEAR_500',
    });
    expect(histRes.body.data.transactions[0].razorpay_signature).toBeUndefined();
    expect(JSON.stringify(histRes.body)).not.toContain(validSig);
  });

  it('handles pending authorization, polling recovery, explicit card failure & webhook idempotency cleanly', async () => {
    const { token } = await registerStudent('pending.flow@ap10.in', 'pending.flow');

    // A) Failed card transaction recorded cleanly without activation
    const failOrder = await request(app)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'CLASS10_MONTHLY_200' });
    const failOrderId = failOrder.body.data.orderId;

    const failRecord = await request(app)
      .post('/api/v1/payments/failure')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpayOrderId: failOrderId,
        razorpayPaymentId: 'pay_card_fail_01',
        errorCode: 'BAD_REQUEST_ERROR',
        errorDescription: '3D-Secure authentication failed.',
        reason: 'authentication_failed',
        method: 'card',
      });
    expect(failRecord.status).toBe(200);
    expect(failRecord.body.data.status).toBe('failed');
    expect(failRecord.body.data.subscription.isActive).toBe(false);

    // B) Pending payment remains UNACTIVATED until captured, then recovers on status poll / webhook
    const retryOrder = await request(app)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'CLASS10_ANNUAL_799' });
    const retryOrderId = retryOrder.body.data.orderId;
    const pendingPayId = 'pay_card_pending_02';
    gatewayPayments.set(pendingPayId, {
      id: pendingPayId,
      order_id: retryOrderId,
      amount: 79900,
      currency: 'INR',
      method: 'card',
      status: 'authorized', // pending capture!
    });
    const pendingSig = hmacSha256Hex(config.RAZORPAY_KEY_SECRET, `${retryOrderId}|${pendingPayId}`);

    const verifyPending = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        razorpayOrderId: retryOrderId,
        razorpayPaymentId: pendingPayId,
        razorpaySignature: pendingSig,
      });
    expect(verifyPending.status).toBe(200);
    expect(verifyPending.body.data.verified).toBe(false);
    expect(verifyPending.body.data.pending).toBe(true);
    expect(verifyPending.body.data.status).toBe('pending');
    expect(verifyPending.body.data.subscription.isActive).toBe(false);

    // Still locked while pending!
    const playWhilePending = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: paidLessonId, deviceId: deviceA.deviceId });
    expect(playWhilePending.status).toBe(403);

    // Forged webhook rejected
    const badWebhook = await request(app)
      .post('/api/v1/payments/webhook')
      .set('X-Razorpay-Signature', 'deadbeef'.repeat(8))
      .send({ event: 'payment.captured', payload: { payment: { entity: { id: pendingPayId, order_id: retryOrderId } } } });
    expect(badWebhook.status).toBe(403);

    // Valid payment.captured webhook activates + duplicate webhook event idempotently ignored
    const webhookBody = JSON.stringify({
      id: 'evt_rzp_test_001',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: pendingPayId,
            order_id: retryOrderId,
            method: 'card',
          },
        },
      },
    });
    const whSig = hmacSha256Hex(config.RAZORPAY_WEBHOOK_SECRET, webhookBody);

    const wh1 = await request(app)
      .post('/api/v1/payments/webhook')
      .set('X-Razorpay-Signature', whSig)
      .set('X-Razorpay-Event-Id', 'evt_rzp_test_001')
      .set('Content-Type', 'application/json')
      .send(webhookBody);
    expect(wh1.status).toBe(200);
    expect(wh1.body.data.action).toBe('activated');

    // Duplicate webhook with same event ID must be ignored idempotently
    const whDupSameEvent = await request(app)
      .post('/api/v1/payments/webhook')
      .set('X-Razorpay-Signature', whSig)
      .set('X-Razorpay-Event-Id', 'evt_rzp_test_001')
      .set('Content-Type', 'application/json')
      .send(webhookBody);
    expect(whDupSameEvent.status).toBe(200);
    expect(whDupSameEvent.body.data.idempotent).toBe(true);

    // Delayed out-of-order failure webhook must NEVER deactivate already-captured payment
    const lateFailBody = JSON.stringify({
      id: 'evt_rzp_test_late_fail',
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_stale_attempt',
            order_id: retryOrderId,
          },
        },
      },
    });
    const lateFailSig = hmacSha256Hex(config.RAZORPAY_WEBHOOK_SECRET, lateFailBody);
    const whLateFail = await request(app)
      .post('/api/v1/payments/webhook')
      .set('X-Razorpay-Signature', lateFailSig)
      .set('X-Razorpay-Event-Id', 'evt_rzp_test_late_fail')
      .set('Content-Type', 'application/json')
      .send(lateFailBody);
    expect(whLateFail.status).toBe(200);
    expect(whLateFail.body.data.idempotent).toBe(true);

    // Order status endpoint now reports captured & history shows both attempts (Annual captured + Monthly failed)
    const statusPoll = await request(app)
      .get(`/api/v1/payments/orders/${retryOrderId}/status`)
      .set('Authorization', `Bearer ${token}`);
    expect(statusPoll.status).toBe(200);
    expect(statusPoll.body.data.status).toBe('captured');
    expect(statusPoll.body.data.subscription.isActive).toBe(true);

    const historyRes = await request(app)
      .get('/api/v1/payments/history')
      .set('Authorization', `Bearer ${token}`);
    expect(historyRes.body.data.transactions).toHaveLength(2);
    expect(historyRes.body.data.transactions.map((t) => t.status)).toContain('captured');
    expect(historyRes.body.data.transactions.map((t) => t.status)).toContain('failed');
  });
});
