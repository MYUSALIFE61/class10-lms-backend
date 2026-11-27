import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { OfflineStorageService } from '../src/services/offlineStorageService.js';
import { createVideoProvider } from '../src/services/videoProviders/index.js';
import { validatePikPakUpstreamUrl } from '../src/services/videoProviders/pikpakLocalAdapter.js';
import { parseVideoOrganisation } from '../src/services/videoOrganisation.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

function createMockPikPakProvider() {
  const mp4Payload = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypmp42', 'ascii'),
    Buffer.alloc(2048, 0x41),
  ]);

  return {
    name: 'pikpak_local',
    isCommercialSafe: false,
    async listVideos() {
      return [
        {
          provider: 'pikpak_local',
          providerFileId: 'VP75WkqprAY1HT95P3QYcv8Ro2',
          fileName: 'VID-20261108-WA0000.mp4',
          title: 'VID-20261108-WA0000',
          folderName: 'My Pack',
          sizeLabel: '1.34 MB',
          sizeBytes: mp4Payload.length,
          mimeType: 'video/mp4',
          modifiedAt: '2026-11-23T10:00:00Z',
        },
      ];
    },
    async streamVideoToResponse({ req, res, mimeType }) {
      const range = req.headers.range;
      if (range) {
        const m = /^bytes=(\d+)-(\d*)$/.exec(range);
        const start = Number(m[1]);
        const end = m[2] ? Math.min(Number(m[2]), mp4Payload.length - 1) : mp4Payload.length - 1;
        if (start >= mp4Payload.length) {
          res.writeHead(416, { 'Content-Range': `bytes */${mp4Payload.length}` });
          return res.end();
        }
        const slice = mp4Payload.subarray(start, end + 1);
        res.writeHead(206, {
          'Content-Type': mimeType || 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${mp4Payload.length}`,
          'Content-Length': String(slice.length),
        });
        return res.end(req.method === 'HEAD' ? undefined : slice);
      }
      res.writeHead(200, {
        'Content-Type': mimeType || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(mp4Payload.length),
      });
      return res.end(req.method === 'HEAD' ? undefined : mp4Payload);
    },
  };
}

describe('Phase 7: Swappable Video Sync, Student Dashboard Visibility & Own-Player Range Stream', () => {
  it('syncs PikPak uploads into Student Dashboard, authorizes signed own-player URL without leaking PikPak URLs, and serves HTTP 206 Range bytes', async () => {
    const store = new InMemoryDataStore();
    const authProvider = new InMemoryAuthProvider();
    const config = makeTestConfig({ VIDEO_STORAGE_PROVIDER: 'pikpak_local' });

    const { app } = createApp({
      config,
      store,
      authProvider,
      videoProvider: createMockPikPakProvider(),
      disableRateLimit: true,
    });

    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'syncstudent@ap10.in',
        password: 'Password1234',
        fullName: 'Kiran Student',
        board: 'AP',
        device: { deviceId: 'android-dev-sync-0001', deviceName: 'Pixel Test' },
      })
      .expect(201);

    const token = regRes.body.data.tokens.accessToken;

    const syncRes = await request(app)
      .post('/api/v1/curriculum/videos/sync')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(syncRes.body.data.syncedCount).toBe(1);
    expect(syncRes.body.data.videos[0].fileName).toBe('VID-20261108-WA0000.mp4');
    const syncedLessonId = syncRes.body.data.videos[0].id;

    const dashRes = await request(app)
      .get('/api/v1/curriculum/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(dashRes.body.data.syncedVideos).toHaveLength(1);
    expect(dashRes.body.data.syncedVideos[0].id).toBe(syncedLessonId);
    expect(dashRes.body.data.syncedVideos[0].provider).toBe('pikpak_local');

    const authPlayRes = await request(app)
      .post('/api/v1/playback/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ lessonId: syncedLessonId, deviceId: 'android-dev-sync-0001' })
      .expect(200);

    const { provider, playback } = authPlayRes.body.data;
    expect(provider).toBe('pikpak_local');
    expect(playback.youtubeVideoId).toBeNull();
    expect(playback.streamUrl).toContain('/api/v1/playback/stream/');
    expect(playback.streamUrl).not.toContain('mypikpak.com');

    const streamPath = new URL(playback.streamUrl).pathname;
    const rangeRes = await request(app)
      .get(streamPath)
      .set('Range', 'bytes=0-15')
      .expect(206);

    expect(rangeRes.headers['content-type']).toBe('video/mp4');
    expect(rangeRes.headers['accept-ranges']).toBe('bytes');
    expect(rangeRes.headers['content-range']).toMatch(/^bytes 0-15\//);

    await request(app)
      .get(`${streamPath}tampered`)
      .set('Range', 'bytes=0-15')
      .expect(401);
  });

  it('enforces PikPak SSRF host guard and rejects third-party cloud object storage providers', () => {
    expect(() => validatePikPakUpstreamUrl('http://dl.mypikpak.com/v.mp4')).toThrow();
    expect(() => validatePikPakUpstreamUrl('https://evil-mypikpak.com/v.mp4')).toThrow();
    expect(() => validatePikPakUpstreamUrl('https://127.0.0.1/v.mp4')).toThrow();
    expect(validatePikPakUpstreamUrl('https://dl-a10.mypikpak.com/stream?sign=abc')).toBeTruthy();

    expect(() => createVideoProvider({ config: { VIDEO_STORAGE_PROVIDER: 'cloudflare_r2' } })).toThrow(
      /prohibited/i
    );
    expect(() =>
      new OfflineStorageService({ config: { OFFLINE_VIDEO_STORAGE_PROVIDER: 'supabase_storage' } })
    ).toThrow(/prohibited/i);
    expect(() =>
      loadEnv({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key-must-be-at-least-20-chars',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key-must-be-at-least-20-chars',
        JWT_ACCESS_SECRET: 'access-secret-must-be-at-least-32-chars',
        JWT_REFRESH_SECRET: 'refresh-secret-must-be-at-least-32-chars',
        DEVICE_HASH_SECRET: 'device-secret-must-be-at-least-32-chars',
        RAZORPAY_KEY_ID: 'rzp_test_123456',
        RAZORPAY_KEY_SECRET: 'rzp_test_secret_123456',
        RAZORPAY_WEBHOOK_SECRET: 'rzp_webhook_secret_123',
        OFFLINE_VIDEO_STORAGE_PROVIDER: 'cloudflare_r2',
      })
    ).toThrow();
  });

  it('auto-maps Class 10 folder hierarchy and naming convention into Subject, Chapter, Order, and Video Type', () => {
    const folderMapped = parseVideoOrganisation({
      fileName: '04_Exercise_Solutions.mp4',
      folderSegments: ['Class_10', '01_Mathematics', 'Ch01_Real_Numbers'],
    });
    expect(folderMapped.subjectSlug).toBe('mathematics');
    expect(folderMapped.chapterNumber).toBe(1);
    expect(folderMapped.chapterTitle).toBe('Real Numbers');
    expect(folderMapped.displayOrder).toBe(4);
    expect(folderMapped.videoType).toBe('exercise');

    const nameMapped = parseVideoOrganisation({
      fileName: 'Class10_Maths_Ch02_02_Concepts.mp4',
      folderSegments: ['My Upload'],
    });
    expect(nameMapped.subjectSlug).toBe('mathematics');
    expect(nameMapped.chapterNumber).toBe(2);
    expect(nameMapped.displayOrder).toBe(2);
    expect(nameMapped.videoType).toBe('concept');
    expect(nameMapped.displayTitle).toBe('2. Concepts');

    const revMapped = parseVideoOrganisation({
      fileName: '05_Revision.mp4',
      folderSegments: ['Class_10', '08_Revision_Series'],
    });
    expect(revMapped.specialZone).toBe('revision_series');
    expect(revMapped.videoType).toBe('revision');
  });
});
