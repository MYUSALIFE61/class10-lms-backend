import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

function createValidMp4Buffer(byteLength = 4096) {
  const buf = Buffer.alloc(byteLength);
  buf.writeUInt32BE(24, 0);
  buf.write('ftypisom', 4, 'ascii');
  for (let i = 12; i < byteLength; i += 1) {
    buf[i] = (i * 19 + 7) & 0xff;
  }
  return buf;
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

describe('Phase 12 — Authorized Offline Video Downloads, Range Streaming & Integrity Verification', () => {
  let app;
  let store;
  let services;
  let tempRoot;
  let storageDir;
  let jobTempDir;
  let adminToken;
  let paidStudentToken;
  let unpaidStudentToken;
  let paidStudentId;
  let freeLessonId;
  let premiumLessonId;
  let secondFreeLessonId;
  let sampleMp4;
  let sampleHash;

  beforeEach(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c10-offline-test-'));
    storageDir = path.join(tempRoot, 'permanent_storage');
    jobTempDir = path.join(tempRoot, 'ffmpeg_tmp');

    store = new InMemoryDataStore();
    const authProvider = new InMemoryAuthProvider();
    const config = {
      ...makeTestConfig(),
      OFFLINE_VIDEO_STORAGE_PROVIDER: 'persistent_disk',
      OFFLINE_VIDEO_STORAGE_DIR: storageDir,
      OFFLINE_VIDEO_TEMP_DIR: jobTempDir,
      OFFLINE_DOWNLOAD_TOKEN_TTL_SECONDS: 1800,
      OFFLINE_MAX_UPLOAD_MB: 50,
      OFFLINE_RETENTION_POLICY: 'wipe_on_logout',
    };

    const built = createApp({ config, store, authProvider, disableRateLimit: true });
    app = built.app;
    services = built.services;

    // Seed Subject, Chapter, Free Lesson (with legacy YouTube Unlisted URL), Premium Lesson & 2nd Lesson
    const subjectId = crypto.randomUUID();
    const chapterId = crypto.randomUUID();
    freeLessonId = crypto.randomUUID();
    premiumLessonId = crypto.randomUUID();
    secondFreeLessonId = crypto.randomUUID();

    store.subjects.set(subjectId, {
      id: subjectId,
      slug: 'mathematics',
      title: 'Mathematics',
      board: 'BOTH',
      board_codes: ['AP', 'TS'],
      is_active: true,
      status: 'published',
      display_order: 1,
    });
    store.chapters.set(chapterId, {
      id: chapterId,
      subject_id: subjectId,
      chapter_number: 1,
      title: 'Real Numbers',
      is_active: true,
      status: 'published',
      display_order: 1,
    });
    store.lessons.set(freeLessonId, {
      id: freeLessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: '1.1 Euclid Division Lemma',
      description: 'Class 10 AP/TS SSC Real Numbers concept lesson',
      thumbnail_url: 'https://cdn.class10lms.in/thumbs/ch1-l1.jpg',
      duration_seconds: 900,
      is_premium: false,
      is_active: true,
      status: 'published',
      display_order: 1,
    });
    store.videoSources.set(freeLessonId, {
      lesson_id: freeLessonId,
      provider: 'youtube_unlisted',
      youtube_video_id: 'dQw4w9WgXcQ',
    });

    store.lessons.set(premiumLessonId, {
      id: premiumLessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: '1.2 Fundamental Theorem of Arithmetic',
      description: 'Premium Class 10 SSC lesson',
      thumbnail_url: 'https://cdn.class10lms.in/thumbs/ch1-l2.jpg',
      duration_seconds: 1200,
      is_premium: true,
      is_active: true,
      status: 'published',
      display_order: 2,
    });

    store.lessons.set(secondFreeLessonId, {
      id: secondFreeLessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: '1.3 Irrational Numbers Proof',
      description: 'Second downloadable lesson for concurrent test',
      duration_seconds: 750,
      is_premium: false,
      is_active: true,
      status: 'published',
      display_order: 3,
    });

    // Login Super Admin
    const adminRes = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@class10lms.in', password: 'Admin@1234' });
    adminToken = adminRes.body.data.tokens.accessToken;

    // Register Student A (Paid)
    const regPaid = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'paid.offline@ap10.in',
        password: 'Password1234',
        fullName: 'Ravi Teja',
        phone: '9876543211',
        board: 'AP',
        device: { deviceId: 'android-offline-dev-01', deviceName: 'iQOO Z7s', osVersion: '15' },
      });
    paidStudentToken = regPaid.body.data.tokens.accessToken;
    paidStudentId = regPaid.body.data.user.id;

    // Activate subscription with verified captured payment for Student A
    const plan = await store.getPlanByCode('CLASS10_ANNUAL_499');
    const capturedPayment = await store.createPaymentTransaction({
      user_id: paidStudentId,
      plan_id: plan.id,
      razorpay_order_id: 'order_offline_test_001',
      razorpay_payment_id: 'pay_offline_test_001',
      amount_paise: plan.price_paise,
      currency: 'INR',
      status: 'captured',
      verified_at: new Date().toISOString(),
    });
    await store.createSubscription({
      user_id: paidStudentId,
      plan_id: plan.id,
      status: 'active',
      latest_payment_id: capturedPayment.id,
      starts_at: new Date(Date.now() - 3600_000).toISOString(),
      expires_at: new Date(Date.now() + 365 * 86400_000).toISOString(),
    });

    // Register Student B (Unpaid)
    const regUnpaid = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'unpaid.offline@ap10.in',
        password: 'Password1234',
        fullName: 'Sneha Reddy',
        phone: '9876543212',
        board: 'AP',
        device: { deviceId: 'android-offline-dev-02', deviceName: 'Redmi Note 13', osVersion: '14' },
      });
    unpaidStudentToken = regUnpaid.body.data.tokens.accessToken;

    sampleMp4 = createValidMp4Buffer(8192);
    sampleHash = sha256Hex(sampleMp4);
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('ingests authorized MP4 via streaming upload, rejects spoofed non-MP4 files, and never leaks YouTube URLs or storage keys', async () => {
    // Reject spoofed non-MP4 upload
    const badRes = await request(app)
      .post(`/api/v1/admin/lessons/${freeLessonId}/offline-assets/upload`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'video/mp4')
      .set('X-File-Name', 'fake.mp4')
      .send(Buffer.from('NOT_AN_MP4_EXECUTABLE_PAYLOAD'));
    expect(badRes.status).toBe(400);
    expect(badRes.body.error.code).toBe('INVALID_MP4_FILE');

    // Upload valid organization-owned MP4
    const upRes = await request(app)
      .post(`/api/v1/admin/lessons/${freeLessonId}/offline-assets/upload?qualityLabel=720p`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'video/mp4')
      .set('X-File-Name', 'Real Numbers Intro.mp4')
      .send(sampleMp4);
    expect(upRes.status).toBe(201);
    expect(upRes.body.data.asset.fileSizeBytes).toBe(sampleMp4.length);
    expect(upRes.body.data.asset.sha256Checksum).toBe(sampleHash);

    // Temp job folder must have been cleaned up immediately
    const leftoverTmp = fs.existsSync(jobTempDir) ? fs.readdirSync(jobTempDir) : [];
    expect(leftoverTmp.length).toBe(0);

    // Scenario 1: First-time lesson opening returns safe metadata & ZERO YouTube URL / storage_key exposure
    const detailRes = await request(app)
      .get(`/api/v1/lessons/${freeLessonId}`)
      .set('Authorization', `Bearer ${unpaidStudentToken}`);
    expect(detailRes.status).toBe(200);
    const bodyStr = JSON.stringify(detailRes.body);
    expect(bodyStr).not.toContain('dQw4w9WgXcQ');
    expect(bodyStr).not.toContain('youtube.com');
    expect(bodyStr).not.toContain('storage_key');
    expect(bodyStr).not.toContain(storageDir);
    expect(detailRes.body.data.lesson.title).toBe('1.1 Euclid Division Lemma');
    expect(detailRes.body.data.lesson.chapterTitle).toBe('Real Numbers');
    expect(detailRes.body.data.playbackCapabilities.hasDownloadableAsset).toBe(true);
    expect(detailRes.body.data.offlineAsset.sha256Checksum).toBe(sampleHash);
  });

  it('enforces auth, subscription eligibility, ownership isolation, and blocks unauthorized access (Scenario 12)', async () => {
    // Upload authorized MP4 to premium lesson
    await request(app)
      .post(`/api/v1/admin/lessons/${premiumLessonId}/offline-assets/upload`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'video/mp4')
      .send(sampleMp4)
      .expect(201);

    // Unauthenticated rejected
    await request(app).get(`/api/v1/lessons/${premiumLessonId}/download-info`).expect(401);

    // Unpaid student blocked from premium lesson download-info and download initiation
    const deniedInfo = await request(app)
      .get(`/api/v1/lessons/${premiumLessonId}/download-info`)
      .set('Authorization', `Bearer ${unpaidStudentToken}`);
    expect(deniedInfo.status).toBe(403);

    const deniedInit = await request(app)
      .post(`/api/v1/lessons/${premiumLessonId}/download`)
      .set('Authorization', `Bearer ${unpaidStudentToken}`)
      .send({ deviceId: 'android-offline-dev-02' });
    expect(deniedInit.status).toBe(403);

    // Paid student succeeds
    const okInit = await request(app)
      .post(`/api/v1/lessons/${premiumLessonId}/download`)
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .send({ deviceId: 'android-offline-dev-01' });
    expect(okInit.status).toBe(201);
    const downloadId = okInit.body.data.download.id;

    // Cross-student isolation: unpaid student CANNOT read status, manifest, or delete paid student's download
    await request(app)
      .get(`/api/v1/downloads/${downloadId}/status`)
      .set('Authorization', `Bearer ${unpaidStudentToken}`)
      .expect(403);
    await request(app)
      .get(`/api/v1/downloads/${downloadId}/manifest`)
      .set('Authorization', `Bearer ${unpaidStudentToken}`)
      .expect(403);
    await request(app)
      .delete(`/api/v1/downloads/${downloadId}`)
      .set('Authorization', `Bearer ${unpaidStudentToken}`)
      .expect(403);
  });

  it('supports resumable HTTP 206 Range streaming, duplicate prevention, strict SHA-256 completion gate, and progress sync (Scenarios 3, 4, 7, 8, 9, 13, 14)', async () => {
    // Upload MP4 to two lessons for concurrent download testing
    await request(app)
      .post(`/api/v1/admin/lessons/${freeLessonId}/offline-assets/upload`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'video/mp4')
      .send(sampleMp4)
      .expect(201);

    const secondMp4 = createValidMp4Buffer(6144);
    const secondHash = sha256Hex(secondMp4);
    await request(app)
      .post(`/api/v1/admin/lessons/${secondFreeLessonId}/offline-assets/upload`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'video/mp4')
      .send(secondMp4)
      .expect(201);

    // Initiate download for lesson 1 + verify duplicate prevention
    const init1 = await request(app)
      .post(`/api/v1/lessons/${freeLessonId}/download`)
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .send({ deviceId: 'android-offline-dev-01' })
      .expect(201);
    const downloadId1 = init1.body.data.download.id;

    const dupInit = await request(app)
      .post(`/api/v1/lessons/${freeLessonId}/download`)
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .send({ deviceId: 'android-offline-dev-01' })
      .expect(200);
    expect(dupInit.body.data.duplicatePrevented).toBe(true);
    expect(dupInit.body.data.download.id).toBe(downloadId1);

    // Concurrent download for lesson 2 (Scenario 14)
    const init2 = await request(app)
      .post(`/api/v1/lessons/${secondFreeLessonId}/download`)
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .send({ deviceId: 'android-offline-dev-01' })
      .expect(201);
    const downloadId2 = init2.body.data.download.id;
    expect(downloadId2).not.toBe(downloadId1);

    // Fetch signed manifest for lesson 1
    const manifestRes = await request(app)
      .get(`/api/v1/downloads/${downloadId1}/manifest`)
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .expect(200);
    const streamPath = new URL(manifestRes.body.data.streamUrl).pathname + new URL(manifestRes.body.data.streamUrl).search;
    expect(manifestRes.body.data.supportsRange).toBe(true);
    expect(manifestRes.body.data.sha256Checksum).toBe(sampleHash);

    // Tampered token rejected
    await request(app)
      .get(`/api/v1/downloads/${downloadId1}/stream?token=tampered.token`)
      .expect(401);

    // Resumable Range streaming: Part 1 (bytes 0-3999) + Part 2 (bytes 4000-end) = exact original MP4 (Scenario 7)
    const part1 = await request(app)
      .get(streamPath)
      .set('Range', 'bytes=0-3999')
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(part1.status).toBe(206);
    expect(part1.headers['content-range']).toBe(`bytes 0-3999/${sampleMp4.length}`);
    expect(part1.body.length).toBe(4000);

    const part2 = await request(app)
      .get(streamPath)
      .set('Range', 'bytes=4000-')
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(part2.status).toBe(206);
    const reassembled = Buffer.concat([part1.body, part2.body]);
    expect(reassembled.equals(sampleMp4)).toBe(true);
    expect(sha256Hex(reassembled)).toBe(sampleHash);

    // Scenario 9: Corrupted checksum MUST be rejected (422) and NOT marked completed
    const badComplete = await request(app)
      .patch(`/api/v1/downloads/${downloadId1}/status`)
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .send({
        status: 'completed',
        fileSize: sampleMp4.length,
        bytesDownloaded: sampleMp4.length,
        verifiedChecksum: '0'.repeat(64),
      });
    expect(badComplete.status).toBe(422);
    expect(badComplete.body.error.code).toBe('CHECKSUM_MISMATCH');

    // Scenario 3 & 4: Verified checksum succeeds and marks completed
    const okComplete = await request(app)
      .patch(`/api/v1/downloads/${downloadId1}/status`)
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .send({
        status: 'completed',
        fileSize: sampleMp4.length,
        bytesDownloaded: sampleMp4.length,
        verifiedChecksum: sampleHash,
      })
      .expect(200);
    expect(okComplete.body.data.download.downloadStatus).toBe('completed');
    expect(okComplete.body.data.download.downloadedAt).toBeTruthy();

    // Mark second concurrent download completed too
    await request(app)
      .patch(`/api/v1/downloads/${downloadId2}/status`)
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .send({
        status: 'completed',
        fileSize: secondMp4.length,
        bytesDownloaded: secondMp4.length,
        verifiedChecksum: secondHash,
      })
      .expect(200);

    // List My Downloads shows both completed lessons
    const listRes = await request(app)
      .get('/api/v1/downloads')
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .expect(200);
    expect(listRes.body.data.items.length).toBe(2);

    // Save offline playback position -> mirrors to lesson_progress & student_video_downloads
    await request(app)
      .post(`/api/v1/lessons/${freeLessonId}/progress`)
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .send({ positionSeconds: 245, durationSeconds: 900, markCompleted: false })
      .expect(200);

    const statusAfterProg = await request(app)
      .get(`/api/v1/downloads/${downloadId1}/status`)
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .expect(200);
    expect(statusAfterProg.body.data.download.lastPlayedPosition).toBe(245);

    // Scenario 13: File missing sync resets downloadedAt
    const missingSync = await request(app)
      .patch(`/api/v1/downloads/${downloadId1}/status`)
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .send({ status: 'file_missing' })
      .expect(200);
    expect(missingSync.body.data.download.downloadStatus).toBe('file_missing');

    // Scenario 8 / Delete download
    await request(app)
      .delete(`/api/v1/downloads/${downloadId2}`)
      .set('Authorization', `Bearer ${paidStudentToken}`)
      .expect(200);

    // Sweep stale temp directories (>30 min old) without touching permanent storage
    const staleJob = path.join(jobTempDir, 'job_stale_test');
    fs.mkdirSync(staleJob, { recursive: true });
    const oldTime = new Date(Date.now() - 45 * 60 * 1000);
    fs.utimesSync(staleJob, oldTime, oldTime);
    const swept = await services.ffmpegProcessor.sweepStaleTempJobs();
    expect(swept).toBe(1);
    expect(fs.existsSync(staleJob)).toBe(false);
  });
});
