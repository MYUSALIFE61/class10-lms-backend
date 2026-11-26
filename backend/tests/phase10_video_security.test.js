import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../src/app.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

describe('Phase 10 — Native Android Video Security Settings & Security Event Telemetry', () => {
  let app;
  let store;
  let adminToken;
  let studentToken;
  let lessonId;

  beforeEach(async () => {
    store = new InMemoryDataStore();
    const authProvider = new InMemoryAuthProvider();
    const config = makeTestConfig();
    const built = createApp({ config, store, authProvider, disableRateLimit: true });
    app = built.app;

    // Seed a subject, chapter, free lesson & private stream source
    const subjectId = crypto.randomUUID();
    const chapterId = crypto.randomUUID();
    lessonId = crypto.randomUUID();
    store.subjects.set(subjectId, {
      id: subjectId,
      slug: 'physical-science',
      title: 'Physical Science',
      board: 'BOTH',
      board_codes: ['AP', 'TS'],
      is_active: true,
      status: 'published',
      display_order: 1,
    });
    store.chapters.set(chapterId, {
      id: chapterId,
      subject_id: subjectId,
      title: 'Chemical Reactions and Equations',
      is_active: true,
      status: 'published',
      display_order: 1,
    });
    store.lessons.set(lessonId, {
      id: lessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: 'Balancing Chemical Equations',
      description: 'Class 10 protected video lesson',
      duration_seconds: 600,
      is_premium: false,
      is_active: true,
      status: 'published',
      display_order: 1,
    });
    store.videoSources.set(lessonId, {
      lesson_id: lessonId,
      provider: 'private_stream',
      stream_url: 'https://stream.class10lms.in/lessons/chem-01.mp4',
    });

    // Login as seeded Super Admin
    const adminLogin = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@class10lms.in', password: 'Admin@1234' });
    adminToken = adminLogin.body.data.tokens.accessToken;

    // Register & authenticate student
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'kavya.sec@ap10.in',
        password: 'Password1234',
        fullName: 'Kavya Sharma',
        phone: '9876543210',
        board: 'AP',
        device: { deviceId: 'android-pixel9-api35', deviceName: 'Pixel 9', osVersion: '15' },
      });
    studentToken = reg.body.data.tokens.accessToken;
  });

  it('returns videoSecurity defaults during playback authorization and enforces mandatory floor on Admin updates', async () => {
    const authRes = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ lessonId, deviceId: 'android-pixel9-api35' });

    expect(authRes.status).toBe(200);
    expect(authRes.body.data.videoSecurity).toMatchObject({
      protectedPlaybackEnabled: true,
      screenshotProtection: true,
      screenRecordingWarning: true,
      screenSharingProtection: true,
      studentWatermarkEnabled: true,
      securityEventLogging: true,
      warningHeading: 'SCREEN RECORDING DETECTED!',
      mandatoryProtectionFloorActive: true,
    });

    // Admin tries to weaken screenshotProtection & screenRecordingWarning while protectedPlaybackEnabled is true
    const patchRes = await request(app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        videoSecurity: {
          protectedPlaybackEnabled: true,
          screenshotProtection: false,
          screenRecordingWarning: false,
          screenSharingProtection: true,
          studentWatermarkEnabled: false,
          warningHeading: 'CAPTURE BLOCKED!',
          securityPolicy: 'strict',
        },
      });

    expect(patchRes.status).toBe(200);
    // Mandatory native protection floor MUST stay enforced!
    expect(patchRes.body.data.videoSecurity.screenshotProtection).toBe(true);
    expect(patchRes.body.data.videoSecurity.screenRecordingWarning).toBe(true);
    expect(patchRes.body.data.videoSecurity.studentWatermarkEnabled).toBe(false);
    expect(patchRes.body.data.videoSecurity.warningHeading).toBe('CAPTURE BLOCKED!');

    // Student playback immediately sees updated admin config while mandatory floor stays true
    const authRes2 = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ lessonId, deviceId: 'android-pixel9-api35' });

    expect(authRes2.status).toBe(200);
    expect(authRes2.body.data.videoSecurity.warningHeading).toBe('CAPTURE BLOCKED!');
    expect(authRes2.body.data.videoSecurity.screenshotProtection).toBe(true);
    expect(authRes2.body.data.videoSecurity.studentWatermarkEnabled).toBe(false);
  });

  it('accepts student screen recording security events, deduplicates bursts, rejects invalid payloads, and surfaces them to Admin', async () => {
    // 1. Valid screen_recording_detected event
    const ev1 = await request(app)
      .post('/api/v1/student/security/events')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        lessonId,
        deviceId: 'android-pixel9-api35',
        eventType: 'screen_recording_detected',
        timestamp: new Date().toISOString(),
        androidApiLevel: 35,
        protectionAction: 'playback_paused_overlay_shown',
      });
    expect(ev1.status).toBe(201);
    expect(ev1.body.data).toMatchObject({ accepted: true, logged: true, deduplicated: false });

    // 2. Immediate duplicate within 5s window -> deduplicated (202)
    const evDup = await request(app)
      .post('/api/v1/student/security/events')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        lessonId,
        deviceId: 'android-pixel9-api35',
        eventType: 'screen_recording_detected',
        androidApiLevel: 35,
        protectionAction: 'playback_paused_overlay_shown',
      });
    expect(evDup.status).toBe(202);
    expect(evDup.body.data.deduplicated).toBe(true);

    // 3. Different event type (screen_recording_stopped) logs cleanly
    const ev2 = await request(app)
      .post('/api/v1/student/security/events')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        lessonId,
        deviceId: 'android-pixel9-api35',
        eventType: 'screen_recording_stopped',
        androidApiLevel: 35,
        protectionAction: 'manual_resume_available',
      });
    expect(ev2.status).toBe(201);

    // 4. Invalid event type rejected with 400
    const bad = await request(app)
      .post('/api/v1/student/security/events')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        eventType: 'arbitrary_untrusted_event',
        protectionAction: 'none',
      });
    expect(bad.status).toBe(400);

    // 5. Admin views enriched security events (and student token cannot access admin endpoint)
    const forbidden = await request(app)
      .get('/api/v1/admin/security-events')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(forbidden.status).toBe(401);

    const adminEvents = await request(app)
      .get('/api/v1/admin/security-events')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminEvents.status).toBe(200);
    expect(adminEvents.body.data.items.length).toBeGreaterThanOrEqual(2);
    const detected = adminEvents.body.data.items.find(
      (e) => e.eventType === 'screen_recording_detected'
    );
    expect(detected).toBeDefined();
    expect(detected.studentEmail).toBe('kavya.sec@ap10.in');
    expect(detected.lessonTitle).toBe('Balancing Chemical Equations');
    expect(detected.androidApiLevel).toBe(35);
    expect(detected.protectionAction).toBe('playback_paused_overlay_shown');
  });

  it('logs external display detection/disconnect/manual-resume telemetry on API 34 without exposing sensitive secrets', async () => {
    const extDetected = await request(app)
      .post('/api/v1/student/security/events')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        lessonId,
        deviceId: 'android14-test-device',
        eventType: 'screen_sharing_display_detected',
        timestamp: new Date().toISOString(),
        androidApiLevel: 34,
        protectionAction: 'playback_paused_external_display',
      });
    expect(extDetected.status).toBe(201);

    const extStopped = await request(app)
      .post('/api/v1/student/security/events')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        lessonId,
        deviceId: 'android14-test-device',
        eventType: 'screen_sharing_display_stopped',
        timestamp: new Date().toISOString(),
        androidApiLevel: 34,
        protectionAction: 'manual_resume_available',
      });
    expect(extStopped.status).toBe(201);

    const resumed = await request(app)
      .post('/api/v1/student/security/events')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        lessonId,
        deviceId: 'android14-test-device',
        eventType: 'playback_resumed_after_capture',
        timestamp: new Date().toISOString(),
        androidApiLevel: 34,
        protectionAction: 'manual_resume_confirmed',
      });
    expect(resumed.status).toBe(201);

    const adminEvents = await request(app)
      .get('/api/v1/admin/security-events')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminEvents.status).toBe(200);

    const serialized = JSON.stringify(adminEvents.body.data.items);
    expect(serialized).not.toContain('Password1234');
    expect(serialized).not.toContain(studentToken);
    expect(serialized).not.toContain('Bearer');

    const extEv = adminEvents.body.data.items.find(
      (e) => e.eventType === 'screen_sharing_display_detected'
    );
    expect(extEv).toBeDefined();
    expect(extEv.androidApiLevel).toBe(34);
    expect(extEv.lessonTitle).toBe('Balancing Chemical Equations');
    expect(extEv.studentEmail).toBe('kavya.sec@ap10.in');
    expect(extEv.protectionAction).toBe('playback_paused_external_display');
  });
});
