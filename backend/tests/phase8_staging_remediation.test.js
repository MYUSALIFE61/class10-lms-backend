import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import {
  resolveResourcesUploadDir,
  resolveUploadedFilePath,
} from '../src/repositories/adminStoreExtension.js';
import { OfflineStorageService } from '../src/services/offlineStorageService.js';
import {
  InMemoryAuthProvider,
  InMemoryDataStore,
  makeTestConfig,
} from './helpers/testHarness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');
const ROLLBACKS_DIR = path.join(MIGRATIONS_DIR, 'rollbacks');

async function createDisposablePgWithSupabaseStubs() {
  const db = new PGlite({ extensions: { pgcrypto } });
  // Provide minimal Supabase auth schema/roles in disposable local PostgreSQL engine
  await db.exec(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE
    );
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS UUID
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE OR REPLACE FUNCTION auth.role()
    RETURNS TEXT
    LANGUAGE sql
    STABLE
    AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
    $$;
  `);
  return db;
}

function readSql(dir, fileName) {
  return fs.readFileSync(path.join(dir, fileName), 'utf8');
}

describe('Phase 8 Remediation — Migrations, Upload Persistence, Path-Leak & Storage Policy', () => {
  const tempDirs = [];
  const prevResourcesUploadDir = process.env.RESOURCES_UPLOAD_DIR;

  afterEach(() => {
    if (prevResourcesUploadDir === undefined) {
      delete process.env.RESOURCES_UPLOAD_DIR;
    } else {
      process.env.RESOURCES_UPLOAD_DIR = prevResourcesUploadDir;
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it(
    'applies migrations 001..010 cleanly on disposable PostgreSQL, enforces constraints/FKs/RLS, and runs 010/009 rollbacks & re-apply',
    async () => {
    const db = await createDisposablePgWithSupabaseStubs();
    try {
      const migrationFiles = [
        '001_initial_schema.sql',
        '002_rls_policies.sql',
        '003_seed_ap_ts_syllabus_template.sql',
        '004_private_stream_provider.sql',
        '005_video_provider_sync.sql',
        '006_admin_portal_cms.sql',
        '007_gamified_video_mcq.sql',
        '008_offline_video_downloads.sql',
        '009_phase2_registration_and_plans.sql',
        '010_phase4_learning_experience.sql',
      ];

      for (const file of migrationFiles) {
        await db.exec(readSql(MIGRATIONS_DIR, file));
      }

      // Idempotent re-execution of 009 & 010 must succeed without errors
      await db.exec(readSql(MIGRATIONS_DIR, '009_phase2_registration_and_plans.sql'));
      await db.exec(readSql(MIGRATIONS_DIR, '010_phase4_learning_experience.sql'));

      // Verify student_lesson_progress does NOT exist and lesson_progress has last_accessed_at + watch_time_seconds
      const tableCheck = await db.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('lesson_progress', 'student_lesson_progress', 'lesson_concepts', 'lesson_revision_points')
        ORDER BY table_name;
      `);
      expect(tableCheck.rows.map((r) => r.table_name)).toEqual([
        'lesson_concepts',
        'lesson_progress',
        'lesson_revision_points',
      ]);

      const progressCols = await db.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lesson_progress'
          AND column_name IN ('watch_time_seconds', 'last_accessed_at', 'updated_at')
        ORDER BY column_name;
      `);
      expect(progressCols.rows.map((r) => r.column_name)).toEqual([
        'last_accessed_at',
        'updated_at',
        'watch_time_seconds',
      ]);

      const indexCheck = await db.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'lesson_progress'
          AND indexname = 'idx_lesson_progress_user_accessed';
      `);
      expect(indexCheck.rows).toHaveLength(1);

      // Verify RLS enabled on lesson_concepts and lesson_revision_points
      const rlsCheck = await db.query(`
        SELECT c.relname, c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('lesson_concepts', 'lesson_revision_points')
        ORDER BY c.relname;
      `);
      expect(rlsCheck.rows).toEqual([
        { relname: 'lesson_concepts', relrowsecurity: true },
        { relname: 'lesson_revision_points', relrowsecurity: true },
      ]);

      // Verify 009 subscription plans state
      const planCheck = await db.query(`
        SELECT code, price_paise, duration_days, is_active
        FROM public.subscription_plans
        ORDER BY display_order, code;
      `);
      expect(planCheck.rows).toEqual([
        { code: 'CLASS10_MONTHLY_200', price_paise: 20000, duration_days: 30, is_active: true },
        { code: 'CLASS10_HALFYEAR_500', price_paise: 50000, duration_days: 180, is_active: true },
        { code: 'CLASS10_ANNUAL_799', price_paise: 79900, duration_days: 365, is_active: true },
        { code: 'CLASS10_ANNUAL_499', price_paise: 49900, duration_days: 365, is_active: false },
      ]);

      // Exercise real inserts/queries matching supabaseStore.js & playbackService.js
      const userId = crypto.randomUUID();
      const subjectRes = await db.query(`SELECT id FROM public.subjects LIMIT 1;`);
      const subjectId = subjectRes.rows[0].id;
      await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2);`, [
        userId,
        'phase8.pgtest@ap10.in',
      ]);
      await db.query(
        `INSERT INTO public.profiles (id, email, full_name, username, state, board, student_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7);`,
        [
          userId,
          'phase8.pgtest@ap10.in',
          'PG Test Student',
          'pgtest01',
          'Andhra Pradesh',
          'AP',
          'C10-PGTEST-01',
        ]
      );
      const chapterRes = await db.query(
        `INSERT INTO public.chapters (subject_id, chapter_number, title)
         VALUES ($1, 99, 'Phase 8 Test Chapter') RETURNING id;`,
        [subjectId]
      );
      const chapterId = chapterRes.rows[0].id;
      const lessonRes = await db.query(
        `INSERT INTO public.lessons (subject_id, chapter_id, title, lesson_number, teacher_name, learning_objectives)
         VALUES ($1, $2, '1.1 Euclid Division Lemma', 1, 'Srinivas Sir', 'Understand Euclid Lemma') RETURNING id;`,
        [subjectId, chapterId]
      );
      const lessonId = lessonRes.rows[0].id;

      await db.query(
        `INSERT INTO public.lesson_progress (user_id, lesson_id, last_position_seconds, duration_seconds, completion_percent, watch_time_seconds, last_accessed_at)
         VALUES ($1, $2, 120, 900, 13, 125, NOW());`,
        [userId, lessonId]
      );
      await db.query(
        `INSERT INTO public.lesson_concepts (subject_id, chapter_id, lesson_id, title, explanation_markdown)
         VALUES ($1, $2, $3, 'Euclid Division Lemma', 'a = bq + r');`,
        [subjectId, chapterId, lessonId]
      );
      await db.query(
        `INSERT INTO public.lesson_revision_points (subject_id, chapter_id, lesson_id, point_type, title, content_markdown)
         VALUES ($1, $2, $3, 'formula', 'Division Algorithm', '0 <= r < b');`,
        [subjectId, chapterId, lessonId]
      );
      await db.query(
        `INSERT INTO public.previous_exam_questions (subject_id, chapter_id, lesson_id, board, exam_year, marks, question_type, question_text, model_answer, options_json, explanation)
         VALUES ($1, $2, $3, 'AP', 2024, 1, 'mcq', 'Find HCF(135, 225)', '45', '["15","45","35","25"]'::jsonb, 'By Euclid algorithm');`,
        [subjectId, chapterId, lessonId]
      );

      // Execute 010 then 009 rollbacks cleanly
      await db.exec(readSql(ROLLBACKS_DIR, '010_phase4_learning_experience.rollback.sql'));
      await db.exec(readSql(ROLLBACKS_DIR, '009_phase2_registration_and_plans.rollback.sql'));

      const postRollbackCols = await db.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lesson_progress' AND column_name = 'last_accessed_at';
      `);
      expect(postRollbackCols.rows).toHaveLength(0);

      const postRollbackTables = await db.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('lesson_concepts', 'lesson_revision_points');
      `);
      expect(postRollbackTables.rows).toHaveLength(0);

      const postRollbackPlans = await db.query(`
        SELECT code, is_active FROM public.subscription_plans WHERE code = 'CLASS10_ANNUAL_499';
      `);
      expect(postRollbackPlans.rows[0].is_active).toBe(true);

      // Re-apply 009 & 010 after rollback to confirm full reversibility
      await db.exec(readSql(MIGRATIONS_DIR, '009_phase2_registration_and_plans.sql'));
      await db.exec(readSql(MIGRATIONS_DIR, '010_phase4_learning_experience.sql'));

      const reappliedCols = await db.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lesson_progress' AND column_name = 'last_accessed_at';
      `);
      expect(reappliedCols.rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  }, 30000);

  it('persists uploaded admin resources via env-configured RESOURCES_UPLOAD_DIR across restarts without leaking host paths', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c10-p8-resources-'));
    tempDirs.push(tempRoot);
    const persistentResourcesDir = path.join(tempRoot, 'var_data_class10lms', 'resources');
    const customEnvStorageDir = '/var/data/class10lms/resources';

    const validatedEnv = loadEnv({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://staging.supabase.co',
      SUPABASE_ANON_KEY: 'staging-anon-key-1234567890123456',
      SUPABASE_SERVICE_ROLE_KEY: 'staging-service-key-1234567890123456',
      JWT_ACCESS_SECRET: 'staging-access-secret-minimum-32-chars-001',
      JWT_REFRESH_SECRET: 'staging-refresh-secret-minimum-32-chars-002',
      DEVICE_HASH_SECRET: 'staging-device-hmac-secret-min-32-chars-03',
      RAZORPAY_MODE: 'test',
      RAZORPAY_KEY_ID: 'rzp_test_staging123',
      RAZORPAY_KEY_SECRET: 'rzp_test_secret_123',
      RAZORPAY_WEBHOOK_SECRET: 'rzp_webhook_secret_123',
      OFFLINE_VIDEO_STORAGE_PROVIDER: 'persistent_disk',
      OFFLINE_VIDEO_STORAGE_DIR: '/var/data/class10lms/offline_videos',
      OFFLINE_VIDEO_TEMP_DIR: '/var/data/class10lms/tmp_jobs',
      RESOURCES_UPLOAD_DIR: customEnvStorageDir,
    });
    expect(validatedEnv.RESOURCES_UPLOAD_DIR).toBe(customEnvStorageDir);

    process.env.RESOURCES_UPLOAD_DIR = persistentResourcesDir;
    expect(resolveResourcesUploadDir()).toBe(path.resolve(persistentResourcesDir));

    const store = new InMemoryDataStore();
    const authProvider = new InMemoryAuthProvider();
    const subjectId = crypto.randomUUID();
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

    const config = makeTestConfig({
      RESOURCES_UPLOAD_DIR: persistentResourcesDir,
    });

    // Instance 1 (before simulated Render container restart)
    const { app: appBeforeRestart } = createApp({
      config,
      store,
      authProvider,
      disableRateLimit: true,
    });

    const adminLogin = await request(appBeforeRestart)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@class10lms.in', password: 'Admin@1234' });
    const adminToken = adminLogin.body.data.tokens.accessToken;

    const studentReg = await request(appBeforeRestart)
      .post('/api/v1/auth/register')
      .send({
        email: 'staging.pdf@ap10.in',
        password: 'Password1234',
        fullName: 'Staging Student',
        phone: '9876500011',
        board: 'AP',
        device: { deviceId: 'android-p8-pdf-01', deviceName: 'iQOO I2223', osVersion: '15' },
      });
    const studentToken = studentReg.body.data.tokens.accessToken;

    const samplePdfBytes = Buffer.from('%PDF-1.4\n%Phase8PersistentResourceTest\n%%EOF\n', 'utf8');
    const createRes = await request(appBeforeRestart)
      .post('/api/v1/admin/resources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Chapter 1 Handwritten Notes',
        subjectId,
        resourceType: 'chapter_notes',
        medium: 'EN',
        boardCodes: ['AP', 'TS'],
        fileName: 'ch1_notes.pdf',
        mimeType: 'application/pdf',
        contentBase64: samplePdfBytes.toString('base64'),
        isPremium: false,
        status: 'published',
      });

    expect(createRes.status).toBe(201);
    const createdResource = createRes.body.data;
    const resourceId = createdResource.id;

    // Must write into configured persistent dir, and JSON must NOT leak directory path
    const serializedCreate = JSON.stringify(createRes.body);
    expect(serializedCreate).not.toContain(persistentResourcesDir);
    expect(serializedCreate).not.toContain('var_data_class10lms');
    expect(createdResource.storage_path).toMatch(/^\d+_[a-f0-9]+_ch1_notes\.pdf$/);
    expect(fs.existsSync(path.join(persistentResourcesDir, createdResource.storage_path))).toBe(true);

    // Instance 2 (fresh Express app instance sharing same DB + persistent disk mount after restart)
    const { app: appAfterRestart } = createApp({
      config: makeTestConfig({ RESOURCES_UPLOAD_DIR: persistentResourcesDir }),
      store,
      authProvider,
      disableRateLimit: true,
    });

    const studentList = await request(appAfterRestart)
      .get('/api/v1/student/resources')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(studentList.status).toBe(200);
    expect(studentList.body.data.items).toHaveLength(1);
    expect(JSON.stringify(studentList.body)).not.toContain(persistentResourcesDir);
    expect(studentList.body.data.items[0].storage_path).toBeUndefined();

    const adminFileRes = await request(appAfterRestart)
      .get(`/api/v1/admin/resources/${resourceId}/file`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminFileRes.status).toBe(200);
    expect(Buffer.compare(adminFileRes.body, samplePdfBytes)).toBe(0);

    const studentFileRes = await request(appAfterRestart)
      .get(`/api/v1/student/resources/${resourceId}/download`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(studentFileRes.status).toBe(200);
    expect(Buffer.compare(studentFileRes.body, samplePdfBytes)).toBe(0);

    // Traversal & missing-file path-leak checks
    for (const badPath of ['../secret.pdf', '..\\secret.pdf', 'nested/file.pdf', '/etc/passwd', 'a\0b.pdf']) {
      expect(resolveUploadedFilePath(badPath, { uploadDir: persistentResourcesDir })).toBeNull();
    }

    fs.unlinkSync(path.join(persistentResourcesDir, createdResource.storage_path));
    const missingRes = await request(appAfterRestart)
      .get(`/api/v1/student/resources/${resourceId}/download`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(missingRes.status).toBe(404);
    expect(JSON.stringify(missingRes.body)).not.toContain(persistentResourcesDir);
    expect(JSON.stringify(missingRes.body)).not.toContain(tempRoot);
  });

  it('rejects all cloud object storage providers in both env validation and OfflineStorageService', () => {
    const blockedProviders = ['cloudflare_r2', 'r2', 's3', 'aws_s3', 'supabase_storage', 'firebase_storage'];
    for (const provider of blockedProviders) {
      expect(() =>
        loadEnv({
          NODE_ENV: 'production',
          SUPABASE_URL: 'https://staging.supabase.co',
          SUPABASE_ANON_KEY: 'staging-anon-key-1234567890123456',
          SUPABASE_SERVICE_ROLE_KEY: 'staging-service-key-1234567890123456',
          JWT_ACCESS_SECRET: 'staging-access-secret-minimum-32-chars-001',
          JWT_REFRESH_SECRET: 'staging-refresh-secret-minimum-32-chars-002',
          DEVICE_HASH_SECRET: 'staging-device-hmac-secret-min-32-chars-03',
          RAZORPAY_MODE: 'test',
          RAZORPAY_KEY_ID: 'rzp_test_staging123',
          RAZORPAY_KEY_SECRET: 'rzp_test_secret_123',
          RAZORPAY_WEBHOOK_SECRET: 'rzp_webhook_secret_123',
          OFFLINE_VIDEO_STORAGE_PROVIDER: provider,
        })
      ).toThrow(/Invalid backend environment configuration/i);

      expect(() => {
        new OfflineStorageService({
          config: { OFFLINE_VIDEO_STORAGE_PROVIDER: provider },
        });
      }).toThrow(/prohibited/i);
    }

    const persistentSvc = new OfflineStorageService({
      config: {
        OFFLINE_VIDEO_STORAGE_PROVIDER: 'persistent_disk',
        OFFLINE_VIDEO_STORAGE_DIR: '/var/data/class10lms/offline_videos',
      },
    });
    expect(persistentSvc.getStorageSummary().provider).toBe('persistent_disk');
  });
});
