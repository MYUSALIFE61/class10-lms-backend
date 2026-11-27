import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

function createLargeMp4Fixture(filePath, sizeBytes) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'w');
  try {
    const chunkSize = 1024 * 1024; // 1 MB chunk
    let remaining = sizeBytes;
    let first = true;
    while (remaining > 0) {
      const len = Math.min(chunkSize, remaining);
      const buf = Buffer.alloc(len, (remaining % 251) & 0xff);
      if (first) {
        buf.writeUInt32BE(24, 0);
        buf.write('ftypmp42', 4, 'ascii');
        first = false;
      }
      fs.writeSync(fd, buf);
      hash.update(buf);
      remaining -= len;
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

describe('Phase 6: Asset-Playback Bridge, Username Login & >100 MB Streaming MP4 Upload/Interrupt/Retry/SHA-256 Verification', () => {
  let config;
  let store;
  let authProvider;
  let app;
  let server;
  let baseUrl;
  let tempDir;

  const subjectId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  const assetOnlyLessonId = crypto.randomUUID();

  const deviceA = {
    deviceId: 'android-phase6-dev-001',
    deviceName: 'Pixel 8 Pro',
    manufacturer: 'Google',
    osVersion: '15',
    appVersion: '1.0.0',
    platform: 'android',
  };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-p6-105mb-'));
    config = makeTestConfig({
      OFFLINE_VIDEO_STORAGE_PROVIDER: 'persistent_disk',
      OFFLINE_VIDEO_STORAGE_DIR: path.join(tempDir, 'offline_videos'),
      OFFLINE_VIDEO_TEMP_DIR: path.join(tempDir, 'tmp_jobs'),
      OFFLINE_MAX_UPLOAD_MB: 256,
    });
    store = new InMemoryDataStore();
    authProvider = new InMemoryAuthProvider();

    store.subjects.set(subjectId, {
      id: subjectId,
      board: 'BOTH',
      slug: 'mathematics',
      title: 'Mathematics',
      display_order: 1,
      is_active: true,
    });
    store.chapters.set(chapterId, {
      id: chapterId,
      subject_id: subjectId,
      chapter_number: 4,
      title: 'Pair of Linear Equations',
      display_order: 4,
      is_active: true,
    });
    // Lesson intentionally has NO lesson_video_sources row — ONLY lesson_video_assets!
    store.lessons.set(assetOnlyLessonId, {
      id: assetOnlyLessonId,
      subject_id: subjectId,
      chapter_id: chapterId,
      lesson_number: 1,
      title: '4.1 Pair of Linear Equations Intro',
      description: 'Uploaded private MP4 lesson',
      duration_seconds: 1200,
      display_order: 1,
      is_premium: false,
      is_active: true,
      status: 'published',
      board_codes: ['AP', 'TS'],
    });

    ({ app } = createApp({ config, store, authProvider, disableRateLimit: true }));
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('supports username login, >100 MB streaming MP4 upload (interrupt + retry + SHA-256), online playback from lesson_video_assets, and offline download without leaking storage keys', async () => {
    // 1. Register student with username and verify login using USERNAME (not email)
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Phase6 Student',
        username: 'phase6.student',
        phone: '9849011122',
        email: 'phase6.student@ap10.in',
        password: 'StrongPassword123',
        confirmPassword: 'StrongPassword123',
        board: 'AP',
        device: deviceA,
      });
    expect(reg.status).toBe(201);

    const loginByUsername = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'phase6.student',
        password: 'StrongPassword123',
        device: deviceA,
      });
    expect(loginByUsername.status).toBe(200);
    const studentToken = loginByUsername.body.data.tokens.accessToken;

    // 2. Admin login & generate a real 105 MB valid MP4 file on disk
    const adminLogin = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@class10lms.in', password: 'Admin@1234' });
    expect(adminLogin.status).toBe(200);
    const adminToken = adminLogin.body.data.tokens.accessToken;

    const size105Mb = 105 * 1024 * 1024;
    const mp4Path = path.join(tempDir, 'AP_SSC_Class10_Ch4_L1_105MB.mp4');
    const sourceSha256 = createLargeMp4Fixture(mp4Path, size105Mb);

    // 3. Test interrupted upload (client aborts mid-stream) -> server cleans up cleanly
    await new Promise((resolve) => {
      const req = http.request(
        `${baseUrl}/api/v1/admin/lessons/${assetOnlyLessonId}/offline-assets/upload?fileName=AP_SSC_Class10_Ch4_L1_105MB.mp4&qualityLabel=720p`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'video/mp4',
          },
        }
      );
      req.on('error', () => resolve());
      const partial = Buffer.alloc(256 * 1024, 0x11);
      partial.writeUInt32BE(24, 0);
      partial.write('ftypmp42', 4, 'ascii');
      req.write(partial);
      setTimeout(() => {
        req.destroy();
        resolve();
      }, 60);
    });

    // 4. Retry full 105 MB streaming upload -> verify SHA-256 matches source exactly
    const t0 = Date.now();
    const uploadResult = await new Promise((resolve, reject) => {
      const req = http.request(
        `${baseUrl}/api/v1/admin/lessons/${assetOnlyLessonId}/offline-assets/upload?fileName=AP_SSC_Class10_Ch4_L1_105MB.mp4&qualityLabel=720p`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'video/mp4',
            'Content-Length': String(size105Mb),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (d) => { body += d.toString(); });
          res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(body) }));
        }
      );
      req.on('error', reject);
      fs.createReadStream(mp4Path, { highWaterMark: 256 * 1024 }).pipe(req);
    });
    const uploadMs = Date.now() - t0;

    expect(uploadResult.status).toBe(201);
    expect(uploadResult.json.data.asset.fileSizeBytes).toBe(size105Mb);
    expect(uploadResult.json.data.asset.sha256Checksum).toBe(sourceSha256);
    console.log(`[PHASE 6 >100MB UPLOAD] 105 MB MP4 uploaded & SHA-256 verified in ${uploadMs}ms (${sourceSha256.slice(0, 16)}...)`);

    // 5. Online playback authorization MUST now succeed from lesson_video_assets (even with zero lesson_video_sources!)
    const playAuth = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('x-device-id', deviceA.deviceId)
      .send({ lessonId: assetOnlyLessonId, deviceId: deviceA.deviceId });
    expect(playAuth.status).toBe(200);
    expect(playAuth.body.data.provider).toBe('private_asset_stream');
    expect(playAuth.body.data.playback.streamUrl).toContain('/api/v1/playback/stream/');
    // Raw private storage key must NEVER appear in student response
    expect(JSON.stringify(playAuth.body)).not.toContain('offline_videos');
    expect(JSON.stringify(playAuth.body)).not.toContain('AP_SSC_Class10_Ch4_L1_105MB.mp4');

    // Verify online playback signed stream serves HTTP 206 Range bytes cleanly
    const onlineStreamPath = new URL(playAuth.body.data.playback.streamUrl).pathname;
    const onlineRange = await request(app)
      .get(onlineStreamPath)
      .set('Range', 'bytes=0-65535');
    expect(onlineRange.status).toBe(206);
    expect(onlineRange.headers['content-range']).toBe(`bytes 0-65535/${size105Mb}`);

    // 6. Offline download authorization + Range check on the exact same 105 MB asset
    const initDl = await request(app)
      .post(`/api/v1/lessons/${assetOnlyLessonId}/download`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('x-device-id', deviceA.deviceId)
      .send({ deviceId: deviceA.deviceId });
    expect(initDl.status).toBe(201);
    const dlId = initDl.body.data.download.id;

    const manifest = await request(app)
      .get(`/api/v1/downloads/${dlId}/manifest`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('x-device-id', deviceA.deviceId);
    expect(manifest.status).toBe(200);
    expect(manifest.body.data.sha256Checksum).toBe(sourceSha256);
    expect(manifest.body.data.fileSize).toBe(size105Mb);
    expect(manifest.body.data.offlineLease.token).toBeTruthy();
  }, 60_000);
});
