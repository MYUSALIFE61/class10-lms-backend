import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hmacSha256Hex } from '../src/utils/crypto.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

function makeValidMp4Buffer(size = 8192) {
  const buf = Buffer.alloc(size, 0x3b);
  buf.writeUInt32BE(24, 0);
  buf.write('ftypmp42', 4, 'ascii');
  return buf;
}

describe('Phase 5: End-to-End Student Journey, Private Storage, Signed Offline Lease & Payment Gating', () => {
  let config;
  let store;
  let authProvider;
  let app;
  let tempDir;
  let gatewayPayments;

  const subjectId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  const paidLessonId = crypto.randomUUID();

  const deviceA = {
    deviceId: 'android-e2e-p5-device-001',
    deviceName: 'Redmi Note 13',
    manufacturer: 'Xiaomi',
    osVersion: '14',
    appVersion: '1.0.0',
    platform: 'android',
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-p5-e2e-'));
    config = makeTestConfig({
      OFFLINE_VIDEO_STORAGE_PROVIDER: 'persistent_disk',
      OFFLINE_VIDEO_STORAGE_DIR: path.join(tempDir, 'offline_videos'),
      OFFLINE_VIDEO_TEMP_DIR: path.join(tempDir, 'tmp_jobs'),
      OFFLINE_LEASE_DAYS: 7,
      RAZORPAY_MODE: 'test',
    });
    store = new InMemoryDataStore();
    authProvider = new InMemoryAuthProvider();
    gatewayPayments = new Map();

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
      chapter_number: 1,
      title: 'Real Numbers',
      summary: 'Euclid Division Lemma',
      display_order: 1,
      is_active: true,
    });
    store.lessons.set(paidLessonId, {
      id: paidLessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      lesson_number: 1,
      title: '1.1 Euclid Division Lemma',
      description: 'Paid Class 10 lesson',
      teacher_name: 'Prof. Venkata Rao',
      duration_seconds: 900,
      display_order: 1,
      is_premium: true,
      is_active: true,
      status: 'published',
      board_codes: ['AP', 'TS'],
    });

    const paymentGateway = {
      async createOrder({ amountPaise, receipt }) {
        return {
          id: `order_p5_${crypto.randomBytes(6).toString('hex')}`,
          amount: amountPaise,
          currency: 'INR',
          receipt,
          status: 'created',
        };
      },
      async fetchPayment(paymentId) {
        return gatewayPayments.get(paymentId) || null;
      },
    };

    ({ app } = createApp({ config, store, authProvider, paymentGateway }));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('executes connected journey: Signup -> 3 Plans -> Razorpay Test Checkout -> Login -> Learning -> Private MP4 -> Signed Offline Lease -> Range Download', async () => {
    // 1. Username uniqueness + Student Registration
    const unameCheck = await request(app).get('/api/v1/auth/check-username?username=karthik.ap10');
    expect(unameCheck.status).toBe(200);
    expect(unameCheck.body.data.available).toBe(true);

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Karthik Reddy',
        username: 'karthik.ap10',
        phone: '9849055511',
        email: 'karthik.p5@ap10.in',
        password: 'StrongPassword123',
        confirmPassword: 'StrongPassword123',
        board: 'AP',
        district: 'Guntur',
        schoolName: 'ZPHS Guntur',
        device: deviceA,
      });
    expect(reg.status).toBe(201);
    const unpaidToken = reg.body.data.tokens.accessToken;
    expect(reg.body.data.subscription.isActive).toBe(false);

    // 2. Unpaid student blocked from offline lease refresh and paid lesson download
    const unpaidLease = await request(app)
      .post('/api/v1/downloads/lease/refresh')
      .set('Authorization', `Bearer ${unpaidToken}`)
      .set('x-device-id', deviceA.deviceId);
    expect(unpaidLease.status).toBe(403);

    const unpaidDl = await request(app)
      .post(`/api/v1/lessons/${paidLessonId}/download`)
      .set('Authorization', `Bearer ${unpaidToken}`)
      .set('x-device-id', deviceA.deviceId)
      .send({ deviceId: deviceA.deviceId });
    expect(unpaidDl.status).toBe(403);

    // 3. Verify 3 subscription plans (₹200, ₹500, ₹799) & Razorpay Test Mode Checkout
    const plansRes = await request(app)
      .get('/api/v1/subscriptions/plans')
      .set('Authorization', `Bearer ${unpaidToken}`)
      .set('x-device-id', deviceA.deviceId);
    expect(plansRes.status).toBe(200);
    const prices = (plansRes.body.data.plans || []).map((p) => Number(p.priceRupees));
    expect(prices).toEqual(expect.arrayContaining([200, 500, 799]));

    const orderRes = await request(app)
      .post('/api/v1/payments/create-order')
      .set('Authorization', `Bearer ${unpaidToken}`)
      .set('x-device-id', deviceA.deviceId)
      .send({ planCode: 'CLASS10_ANNUAL_799' });
    expect(orderRes.status).toBe(201);
    const { orderId, amountPaise } = orderRes.body.data;
    expect(amountPaise).toBe(79900);

    const fakePaymentId = `pay_p5_${crypto.randomBytes(6).toString('hex')}`;
    const validSig = hmacSha256Hex(config.RAZORPAY_KEY_SECRET, `${orderId}|${fakePaymentId}`);
    gatewayPayments.set(fakePaymentId, {
      id: fakePaymentId,
      order_id: orderId,
      amount: 79900,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
    });

    const verifyRes = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${unpaidToken}`)
      .set('x-device-id', deviceA.deviceId)
      .send({
        razorpayOrderId: orderId,
        razorpayPaymentId: fakePaymentId,
        razorpaySignature: validSig,
      });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.verified).toBe(true);
    expect(verifyRes.body.data.subscription.isActive).toBe(true);

    // 4. Student Login -> Active Subscription & Dashboard
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'karthik.p5@ap10.in',
        password: 'StrongPassword123',
        device: deviceA,
      });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.data.tokens.accessToken;

    const homeRes = await request(app)
      .get('/api/v1/student/home')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-id', deviceA.deviceId);
    expect(homeRes.status).toBe(200);
    expect(homeRes.body.data.subscription.isActive).toBe(true);

    // 5. Admin private MP4 upload (SHA-256) + Student authorized download + Server-signed Offline Lease + HTTP 206 Range
    const mp4Buf = makeValidMp4Buffer(8192);
    const expectedSha = crypto.createHash('sha256').update(mp4Buf).digest('hex');

    const adminLogin = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@class10lms.in', password: 'Admin@1234' });
    expect(adminLogin.status).toBe(200);
    const adminToken = adminLogin.body.data.tokens.accessToken;

    const uploadRes = await request(app)
      .post(`/api/v1/admin/lessons/${paidLessonId}/offline-assets/upload?fileName=ch1_paid.mp4&qualityLabel=720p`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'video/mp4')
      .send(mp4Buf);
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data.asset.sha256Checksum).toBe(expectedSha);

    const initDl = await request(app)
      .post(`/api/v1/lessons/${paidLessonId}/download`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-id', deviceA.deviceId)
      .send({ deviceId: deviceA.deviceId });
    expect(initDl.status).toBe(201);
    const downloadId = initDl.body.data.download.id;

    const manifestRes = await request(app)
      .get(`/api/v1/downloads/${downloadId}/manifest`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-id', deviceA.deviceId);
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.body.data.offlineLease.token).toBeTruthy();
    expect(manifestRes.body.data.offlineLease.expiresAtEpochMs).toBeGreaterThan(Date.now());
    expect(manifestRes.body.data.sha256Checksum).toBe(expectedSha);

    // Verify HTTP 206 Range resume on private stream
    const parsedStream = new URL(manifestRes.body.data.streamUrl);
    const rangeRes = await request(app)
      .get(`${parsedStream.pathname}${parsedStream.search}`)
      .set('Range', 'bytes=0-1023');
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers['content-range']).toBe(`bytes 0-1023/${mp4Buf.length}`);

    // Verify offline lease refresh succeeds for active subscriber
    const refreshLease = await request(app)
      .post('/api/v1/downloads/lease/refresh')
      .set('Authorization', `Bearer ${token}`)
      .set('x-device-id', deviceA.deviceId);
    expect(refreshLease.status).toBe(200);
    expect(refreshLease.body.data.offlineLease.token).toBeTruthy();
    expect(refreshLease.body.data.offlineLease.leaseDays).toBe(7);
  });
});
