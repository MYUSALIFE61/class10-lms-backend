import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hmacSha256Hex } from '../src/utils/crypto.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

describe('Phase 6: Performance & 200 Simultaneous Active Students Load Target', () => {
  it('handles 200 simultaneous authenticated students fetching dashboard & authorizing playback within latency budget', async () => {
    const config = makeTestConfig();
    const store = new InMemoryDataStore();
    const authProvider = new InMemoryAuthProvider();

    const subjectId = crypto.randomUUID();
    const chapterId = crypto.randomUUID();
    const lessonId = crypto.randomUUID();

    store.subjects.set(subjectId, {
      id: subjectId,
      board: 'BOTH',
      slug: 'mathematics',
      title: 'Mathematics',
      description: 'Class 10 SSC Maths',
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
      summary: 'Chapter 1',
      display_order: 1,
      is_active: true,
    });
    store.lessons.set(lessonId, {
      id: lessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: 'Euclid Division Lemma',
      description: 'SSC Class 10',
      duration_seconds: 900,
      display_order: 1,
      is_premium: true,
      is_active: true,
    });
    store.videoSources.set(lessonId, {
      lesson_id: lessonId,
      provider: 'youtube_unlisted',
      youtube_video_id: 'M7lc1UVf-VE',
    });

    const paymentGateway = {
      async createOrder({ amountPaise, currency }) {
        return { id: `order_${crypto.randomBytes(6).toString('hex')}`, amount: amountPaise, currency };
      },
    };

    const { app } = createApp({
      config,
      store,
      authProvider,
      paymentGateway,
      disableRateLimit: true,
    });

    // Provision 200 active paid students
    const STUDENT_COUNT = 200;
    const students = [];
    for (let i = 0; i < STUDENT_COUNT; i += 1) {
      const deviceId = `android-load-device-${String(i).padStart(4, '0')}`;
      const reg = await request(app).post('/api/v1/auth/register').send({
        email: `student${i}@apts10.in`,
        password: 'Password1234',
        fullName: `Student ${i}`,
        board: i % 2 === 0 ? 'AP' : 'TS',
        device: { deviceId, deviceName: 'Redmi 12', platform: 'android' },
      });
      const token = reg.body.data.tokens.accessToken;
      const order = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      const orderId = order.body.data.orderId;
      const paymentId = `pay_load_${i}`;
      const sig = hmacSha256Hex(config.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
      await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ razorpayOrderId: orderId, razorpayPaymentId: paymentId, razorpaySignature: sig });

      students.push({ token, deviceId });
    }

    // Fire 200 simultaneous dashboard + playback authorization requests
    const startMs = Date.now();
    const responses = await Promise.all(
      students.map((s) =>
        Promise.all([
          request(app)
            .get('/api/v1/curriculum/dashboard')
            .set('Authorization', `Bearer ${s.token}`),
          request(app)
            .post('/api/v1/playback/authorize')
            .set('Authorization', `Bearer ${s.token}`)
            .send({ lessonId, deviceId: s.deviceId }),
        ])
      )
    );
    const elapsedMs = Date.now() - startMs;

    let dashOk = 0;
    let playOk = 0;
    for (const [dashRes, playRes] of responses) {
      if (dashRes.status === 200 && dashRes.body.data.subscription.isActive) dashOk += 1;
      if (playRes.status === 200 && playRes.body.data.playback.youtubeVideoId === 'M7lc1UVf-VE') {
        playOk += 1;
      }
    }

    expect(dashOk).toBe(STUDENT_COUNT);
    expect(playOk).toBe(STUDENT_COUNT);
    expect(elapsedMs).toBeLessThan(10000);
    console.log(
      `[LOAD BENCHMARK] 200 simultaneous active students (400 concurrent API calls): 100% succeeded in ${elapsedMs}ms`
    );
  }, 30000);
});
