# PHASE 8 — FINAL CODE REVIEW & PRE-STAGING SIGN-OFF CHECKLIST

**Project:** Class 10 SSC LMS (Android Capacitor + Kotlin Media3 + React + Node.js/Express + Supabase PostgreSQL)  
**Workspace:** `d:\Downloads\Android apk file`  
**Base Commit (`HEAD` / `main` / `origin/main`):** `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579`  
**Review Date:** November 27, 2026 (15:55 IST)  
**Action State:** **STOPPED FOR USER APPROVAL** — Zero git commits/pushes, zero Render/Supabase changes, zero migrations executed, zero live Razorpay activation, zero cloud object storage.

---

## 1. Phase 8 Remediation Git Diff Breakdown

> [!NOTE]
> Local `HEAD` (`main` at `ee720cf`) still has earlier uncommitted Phase 1–7.2 work in the working tree. Running `git diff` against `HEAD` therefore includes both prior local-only storage changes (`backend/src/routes/student.routes.js` route additions, `offlineStorageService.js` cloud removal, `env.js` Razorpay/local-only fields) **plus** the Phase 8 remediation edits shown below. New files (`010`, `010` rollback, `phase8_staging_remediation.test.js`, and Phase 8 Markdown reports) are currently untracked (`??`).

### 1.1 Exact Phase 8 Tracked Diffs (Relative to Pre-Phase 8 Working Tree & `HEAD`)

```diff
--- a/backend/.env.example
+++ b/backend/.env.example
@@ -44,6 +44,8 @@
 OFFLINE_VIDEO_STORAGE_PROVIDER=persistent_disk
 OFFLINE_VIDEO_STORAGE_DIR=
 OFFLINE_VIDEO_TEMP_DIR=
+# Staging Render Persistent Disk mount path example: /var/data/class10lms/resources
+RESOURCES_UPLOAD_DIR=
```

```diff
--- a/backend/package.json
+++ b/backend/package.json
@@ -29,6 +29,7 @@
     "zod": "^3.24.2"
   },
   "devDependencies": {
+    "@electric-sql/pglite": "^0.6.0",
     "supertest": "^7.0.0",
     "vitest": "^3.0.7"
   }
```

```diff
--- a/backend/src/config/env.js
+++ b/backend/src/config/env.js
@@ -55,5 +55,6 @@ const envSchema = z.object({
   OFFLINE_VIDEO_STORAGE_DIR: z.string().optional().default(''),
   OFFLINE_VIDEO_TEMP_DIR: z.string().optional().default(''),
+  RESOURCES_UPLOAD_DIR: z.string().optional().default(''),
```

```diff
--- a/backend/src/app.js
+++ b/backend/src/app.js
@@ -162,6 +162,7 @@ export function createApp({
     curriculumService,
     playbackService,
     videoSyncService,
+    config,
   });
```

```diff
--- a/backend/src/repositories/adminStoreExtension.js
+++ b/backend/src/repositories/adminStoreExtension.js
@@ -7,7 +7,16 @@ import { AppError } from '../utils/errors.js';
 
 const __filename = fileURLToPath(import.meta.url);
 const __dirname = path.dirname(__filename);
-export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/resources');
+export const DEFAULT_RESOURCES_UPLOAD_DIR = path.resolve(__dirname, '../../uploads/resources');
+export const UPLOADS_DIR = DEFAULT_RESOURCES_UPLOAD_DIR;
+
+export function resolveResourcesUploadDir(overrideDir = '') {
+  const explicit = String(overrideDir || '').trim();
+  if (explicit) return path.resolve(explicit);
+  const fromEnv = String(process.env.RESOURCES_UPLOAD_DIR || '').trim();
+  if (fromEnv) return path.resolve(fromEnv);
+  return DEFAULT_RESOURCES_UPLOAD_DIR;
+}
@@ -90,11 +99,13 @@ function isPublishedRecord(record) {
-export function saveUploadedFile({ fileName, mimeType, contentBase64 }) {
-  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
-  const safeBase = String(fileName || 'resource.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
+export function saveUploadedFile({ fileName, mimeType, contentBase64, uploadDir = '' }) {
+  const targetDir = resolveResourcesUploadDir(uploadDir);
+  fs.mkdirSync(targetDir, { recursive: true });
+  const rawBase = path.basename(String(fileName || 'resource.pdf'));
+  const safeBase = rawBase.replace(/[^a-zA-Z0-9._-]/g, '_') || 'resource.pdf';
   const storedName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}_${safeBase}`;
-  const fullPath = path.join(UPLOADS_DIR, storedName);
+  const fullPath = path.join(targetDir, storedName);
   const buffer = Buffer.from(contentBase64, 'base64');
   fs.writeFileSync(fullPath, buffer);
   return {
@@ -104,11 +115,25 @@ export function saveUploadedFile({ fileName, mimeType, contentBase64 }) {
-export function resolveUploadedFilePath(storagePath) {
-  if (!storagePath || storagePath.includes('..') || path.isAbsolute(storagePath)) return null;
-  const full = path.join(UPLOADS_DIR, storagePath);
-  if (!fs.existsSync(full)) return null;
-  return full;
+export function resolveUploadedFilePath(storagePath, { uploadDir = '' } = {}) {
+  if (!storagePath || typeof storagePath !== 'string') return null;
+  if (
+    storagePath.includes('\0') ||
+    storagePath.includes('..') ||
+    storagePath.includes('/') ||
+    storagePath.includes('\\') ||
+    path.isAbsolute(storagePath)
+  ) {
+    return null;
+  }
+  const targetDir = resolveResourcesUploadDir(uploadDir);
+  const resolvedBase = path.resolve(targetDir);
+  const resolved = path.resolve(resolvedBase, storagePath);
+  if (!resolved.startsWith(`${resolvedBase}${path.sep}`)) {
+    return null;
+  }
+  if (!fs.existsSync(resolved)) return null;
+  return resolved;
 }
```

```diff
--- a/backend/src/services/adminCmsService.js
+++ b/backend/src/services/adminCmsService.js
@@ -1,6 +1,10 @@
 import crypto from 'node:crypto';
 import { assertSubjectScope } from './adminRbac.js';
-import { saveUploadedFile, resolveUploadedFilePath } from '../repositories/adminStoreExtension.js';
+import {
+  saveUploadedFile,
+  resolveUploadedFilePath,
+  resolveResourcesUploadDir,
+} from '../repositories/adminStoreExtension.js';
@@ -41,12 +45,26 @@ export class AdminCmsService {
-  constructor({ store, adminAuthService, curriculumService, playbackService, videoSyncService = null }) {
+  constructor({
+    store,
+    adminAuthService,
+    curriculumService,
+    playbackService,
+    videoSyncService = null,
+    config = {},
+  }) {
     this.store = store;
     this.adminAuthService = adminAuthService;
     this.curriculumService = curriculumService;
     this.playbackService = playbackService;
     this.videoSyncService = videoSyncService;
+    this.config = config;
+  }
+
+  _getResourcesUploadDir() {
+    return this.config?.RESOURCES_UPLOAD_DIR
+      ? resolveResourcesUploadDir(this.config.RESOURCES_UPLOAD_DIR)
+      : resolveResourcesUploadDir();
   }
@@ -708,6 +726,7 @@ export class AdminCmsService {
         fileName: data.fileName || `${slugify(data.title)}.pdf`,
         mimeType,
         contentBase64: data.contentBase64,
+        uploadDir: this._getResourcesUploadDir(),
       });
@@ -775,6 +794,7 @@ export class AdminCmsService {
         fileName: patch.fileName || existing.file_name || 'resource.pdf',
         mimeType,
         contentBase64: patch.contentBase64,
+        uploadDir: this._getResourcesUploadDir(),
       });
@@ -798,6 +818,8 @@ export class AdminCmsService {
   getResourceDiskPath(resource) {
-    return resolveUploadedFilePath(resource.storage_path);
+    return resolveUploadedFilePath(resource.storage_path, {
+      uploadDir: this._getResourcesUploadDir(),
+    });
   }
 }
```

```diff
--- a/backend/src/routes/student.routes.js
+++ b/backend/src/routes/student.routes.js
@@ -137,7 +137,8 @@ export function createStudentRoutes({
       const diskPath = adminCmsService.getResourceDiskPath(resource);
       if (!diskPath) throw new NotFoundError('Resource file not found on server');
       res.type(resource.mime_type || 'application/pdf');
-      res.setHeader('Content-Disposition', `inline; filename="${resource.file_name || 'resource.pdf'}"`);
+      const safeDispositionName = String(resource.file_name || 'resource.pdf').replace(/["\r\n\\]/g, '_');
+      res.setHeader('Content-Disposition', `inline; filename="${safeDispositionName}"`);
       res.sendFile(diskPath);
```

```diff
--- a/backend/src/services/offlineStorageService.js
+++ b/backend/src/services/offlineStorageService.js
@@ -64,7 +64,7 @@ export class OfflineStorageService {
     this.videoProvider = videoProvider;
     this.logger = logger;
     this.provider = config.OFFLINE_VIDEO_STORAGE_PROVIDER || 'persistent_disk';
-    if (['cloudflare_r2', 'supabase_storage', 'aws_s3', 's3', 'firebase_storage'].includes(this.provider)) {
+    if (!['persistent_disk', 'pikpak_local'].includes(this.provider)) {
       throw new AppError(
         `Third-party cloud object storage "${this.provider}" is prohibited by local-only storage policy.`,
         500,
```

### 1.2 Phase 8 SQL Changes (Currently Untracked `??` vs `HEAD`)

Because `supabase/migrations/010_phase4_learning_experience.sql` and `supabase/migrations/rollbacks/` are untracked against `HEAD`, their Phase 8 edits are inside lines 8–23 of [010_phase4_learning_experience.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/010_phase4_learning_experience.sql#L8-L23) and lines 20–23 of [010_phase4_learning_experience.rollback.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql#L20-L23):

```diff
--- a/supabase/migrations/010_phase4_learning_experience.sql (pre-Phase 8 local)
+++ b/supabase/migrations/010_phase4_learning_experience.sql (remediated)
@@ -6,23 +6,23 @@
 -- Reuses existing tables: subjects, chapters, lessons, lesson_notes,
 -- study_resources, previous_exam_questions, important_formulas,
--- student_lesson_progress, lesson_video_sources, lesson_video_assets.
+-- lesson_progress, lesson_video_sources, lesson_video_assets.
 ...
--- 2. Extend public.student_lesson_progress with explicit last_accessed_at timestamp
-ALTER TABLE public.student_lesson_progress
+-- 2. Extend public.lesson_progress with explicit last_accessed_at timestamp
+ALTER TABLE public.lesson_progress
     ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
 
-CREATE INDEX IF NOT EXISTS idx_student_progress_user_accessed
-    ON public.student_lesson_progress(user_id, last_accessed_at DESC);
+CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_accessed
+    ON public.lesson_progress(user_id, last_accessed_at DESC);
```

```diff
--- a/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql (pre-Phase 8 local)
+++ b/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql (remediated)
@@ -20,3 +20,4 @@
-DROP INDEX IF EXISTS public.idx_student_progress_user_accessed;
-ALTER TABLE public.student_lesson_progress
+DROP INDEX IF EXISTS public.idx_lesson_progress_user_accessed;
+DROP INDEX IF EXISTS public.idx_student_progress_user_accessed;
+ALTER TABLE public.lesson_progress
     DROP COLUMN IF EXISTS last_accessed_at;
```

---

## 2. Migration `010` Changes & Rollback Behavior

1. **Why the Fix Was Required:**
   - [001_initial_schema.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/001_initial_schema.sql#L270-L284) defines `public.lesson_progress` (`UNIQUE (user_id, lesson_id)`), [006_admin_portal_cms.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/006_admin_portal_cms.sql#L106-L107) extends it with `watch_time_seconds`, and both [supabaseStore.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/supabaseStore.js#L644-L673) (`getLessonProgress`, `listUserProgress`, `upsertLessonProgress`) and [adminStoreExtension.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/adminStoreExtension.js#L762) query `lesson_progress`.
   - Meanwhile, [playbackService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/playbackService.js#L412) and [studentDynamicService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/studentDynamicService.js#L156-L181) read/write `last_accessed_at` via `lesson_progress`. Because Migration `010` previously targeted `public.student_lesson_progress`, running `010` on a fresh database failed (`relation "public.student_lesson_progress" does not exist`).
2. **Forward Behavior ([010_phase4_learning_experience.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/010_phase4_learning_experience.sql)):**
   - Adds `lesson_number`, `teacher_name`, `learning_objectives` cleanly to `public.lessons` (`IF NOT EXISTS`).
   - Adds `last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` and index `idx_lesson_progress_user_accessed` on `public.lesson_progress(user_id, last_accessed_at DESC)`.
   - Creates `public.lesson_concepts` and `public.lesson_revision_points` with cascading FKs (`subjects`, `chapters`, `lessons`) and enables Row-Level Security (`lesson_concepts_select_entitled`, `lesson_revision_select_entitled`).
   - Adds `lesson_id`, `question_type`, `question_image_url`, `options_json`, `explanation`, and partial index `idx_pyq_lesson_order` on `public.previous_exam_questions`.
3. **Rollback Behavior ([010_phase4_learning_experience.rollback.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql)):**
   - Drops RLS policies and tables `lesson_revision_points` and `lesson_concepts`.
   - Drops the additive PYQ columns (`lesson_id`, `question_type`, `question_image_url`, `options_json`, `explanation`) and `idx_pyq_lesson_order` **without deleting pre-existing PYQ rows**.
   - Drops both `idx_lesson_progress_user_accessed` and legacy `idx_student_progress_user_accessed` (`IF EXISTS`), then drops `last_accessed_at` from `public.lesson_progress` **without touching existing progress rows (`last_position_seconds`, `watch_time_seconds`, `completion_percent`)**.
   - Drops `lesson_number`, `teacher_name`, `learning_objectives` from `public.lessons` **without deleting existing lessons**.
   - **Data-Loss Precaution:** Running the rollback in a populated environment permanently deletes newly authored rows in `lesson_concepts` / `lesson_revision_points` and the dropped metadata columns; backups must precede rollback on populated DBs.

---

## 3. Why PGlite Does NOT Replace Actual Supabase Staging Validation

`@electric-sql/pglite` proved local PostgreSQL syntax, FK/CHECK/UNIQUE constraints, index creation, and rollback DDL, **but it does not validate hosted Supabase runtime behavior**:
1. **Supabase Auth & `auth.users` Triggers:** PGlite used a synthetic `auth` schema stub (`auth.users`, `auth.uid()`, `auth.role()`). Real Supabase GoTrue user creation, JWT claims, email/password flows, and `auth.users` integration are unverified until executed on Supabase.
2. **PostgREST & `supabase-js` Queries:** Our PGlite test ran direct SQL, whereas [supabaseStore.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/supabaseStore.js) communicates via `@supabase/supabase-js` -> PostgREST schema cache (`PGRST` schema reload, nested foreign-key `.select('*, subscription_plans(*)')`, `.upsert(..., { onConflict })`, `.range()`).
3. **RLS Runtime Enforcement:** PGlite verified `relrowsecurity = true` and policy creation DDL, not actual `anon` / `authenticated` JWT-scoped `SELECT` evaluations through Supabase Data APIs or `has_active_subscription(auth.uid())` under active vs expired subscriptions.
4. **Managed Infra Behavior:** Connection pooling / PgBouncer transaction mode, SSL/TLS latency between Render Singapore and Supabase region, and SQL Editor transactional behavior remain unverified until hosted staging testing.

---

## 4. Persistent Disk Alignment for Both Videos & Admin Resources

On Render Staging (one `10 GB` Persistent Disk mounted at `/var/data/class10lms`):
- **Offline Videos & Temp Jobs ([offlineStorageService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/offlineStorageService.js) + [app.js](file:///d:/Downloads/Android%20apk%20file/backend/src/app.js)):**
  - `OFFLINE_VIDEO_STORAGE_PROVIDER=persistent_disk`
  - `OFFLINE_VIDEO_STORAGE_DIR=/var/data/class10lms/offline_videos`
  - `OFFLINE_VIDEO_TEMP_DIR=/var/data/class10lms/tmp_jobs`
- **Admin Handwritten Notes / PDFs / Diagrams ([env.js](file:///d:/Downloads/Android%20apk%20file/backend/src/config/env.js) + [adminStoreExtension.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/adminStoreExtension.js) + [adminCmsService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/adminCmsService.js)):**
  - `RESOURCES_UPLOAD_DIR=/var/data/class10lms/resources`
- **Zero Cloud Object Storage:** Constructor allowlist in `offlineStorageService.js` (`['persistent_disk', 'pikpak_local']`) plus Zod validation in `env.js` reject `cloudflare_r2`, `r2`, `aws_s3`, `s3`, `supabase_storage`, and `firebase_storage`.

---

## 5. Verification That Production Config, Secrets & Files Are Untouched

- **No `.env` Secrets on Disk:** Recursive `.env*` scan found **only** [backend/.env.example](file:///d:/Downloads/Android%20apk%20file/backend/.env.example) and [frontend/.env.example](file:///d:/Downloads/Android%20apk%20file/frontend/.env.example). Zero `.env`, `.env.production`, `.env.staging`, service-account JSONs, or `.keystore`/`.jks` files were created or modified.
- **Production Frontend/Capacitor Config Untouched in Phase 8:**
  - [frontend/capacitor.config.json](file:///d:/Downloads/Android%20apk%20file/frontend/capacitor.config.json) has zero diff against `HEAD` (`https://app.class10lms.in`, `cleartext: false`, `webContentsDebuggingEnabled: false`).
  - [frontend/src/config/env.js](file:///d:/Downloads/Android%20apk%20file/frontend/src/config/env.js) retains `DEFAULT_PROD_API_BASE_URL = 'https://api.class10lms.in/api/v1'` (unchanged by Phase 8).
- **Production Cloud Infra Untouched:**
  - Production Render service `srv-dc41v1vf3r2c73a29agg` (`api.class10lms.in` / `cdm-dc4216p5efls73cr9l30`) was **not** accessed or modified.
  - Production Supabase `hxllgasepsxrpsonljct` was **not** accessed or modified.
  - Razorpay live mode (`rzp_live_*`) was **not** enabled (`RAZORPAY_MODE` defaults to `test`).

---

## 6. Confirmation of Safe `staging` Branch Creation Without Modifying `main`

- Checked `git branch -vv`, `git rev-parse HEAD`, and `git rev-parse origin/main`:
  - Current branch: `main`
  - `HEAD` == `main` == `origin/main` == `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579`.
- **Why `main` Will Not Change:** Running `git checkout -b staging` switches the working tree onto a new local branch `staging` rooted at `ee720cf` while leaving local `main` and remote `origin/main` pinned at `ee720cf`. Subsequent `git add` / `git commit` / `git push -u origin staging` (only after explicit user approval) records commits **only** on `staging`, keeping `main` completely unmodified.

---

## 7. Exact Changed-File List (Phase 8 Remediation)

| File | Category | Status |
| :--- | :--- | :--- |
| [010_phase4_learning_experience.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/010_phase4_learning_experience.sql) | Schema Fix (`lesson_progress`) | Untracked (`??` vs `HEAD`) |
| [010_phase4_learning_experience.rollback.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql) | Rollback Parity (`lesson_progress`) | Untracked (`??` vs `HEAD`) |
| [backend/src/config/env.js](file:///d:/Downloads/Android%20apk%20file/backend/src/config/env.js) | Env Schema (`RESOURCES_UPLOAD_DIR`) | Modified (`M`) |
| [backend/.env.example](file:///d:/Downloads/Android%20apk%20file/backend/.env.example) | Env Template (`RESOURCES_UPLOAD_DIR`) | Modified (`M`) |
| [backend/src/repositories/adminStoreExtension.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/adminStoreExtension.js) | Env Upload Path & Traversal Guards | Modified (`M`) |
| [backend/src/services/adminCmsService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/adminCmsService.js) | Config-Routed Resource Persistence | Modified (`M`) |
| [backend/src/app.js](file:///d:/Downloads/Android%20apk%20file/backend/src/app.js) | Injects `config` into `AdminCmsService` | Modified (`M`) |
| [backend/src/routes/student.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/student.routes.js) | Header Filename Sanitization | Modified (`M`) |
| [backend/src/services/offlineStorageService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/offlineStorageService.js) | Constructor Local-Only Allowlist | Modified (`M`) |
| [backend/package.json](file:///d:/Downloads/Android%20apk%20file/backend/package.json) & [backend/package-lock.json](file:///d:/Downloads/Android%20apk%20file/backend/package-lock.json) | Added `@electric-sql/pglite` devDep | Modified (`M`) |
| [backend/tests/phase8_staging_remediation.test.js](file:///d:/Downloads/Android%20apk%20file/backend/tests/phase8_staging_remediation.test.js) | PGlite, Upload Persistence & Cloud Rejection Tests | Untracked (`??`) |
| [PHASE_8_HOSTED_STAGING_READINESS_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE_8_HOSTED_STAGING_READINESS_REPORT.md) | Updated Readiness Audit | Created/Updated |
| [PHASE_8_REMEDIATION_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE_8_REMEDIATION_REPORT.md) | Remediation Report | Created |
| [PHASE_8_FINAL_CODE_REVIEW.md](file:///d:/Downloads/Android%20apk%20file/PHASE_8_FINAL_CODE_REVIEW.md) | This Final Code Review | Created |

*(Pre-existing uncommitted Phase 1–7.2 files in `backend/`, `frontend/`, `admin-portal/`, and Phase 1–7 report files remain in the working tree for branch `staging` unless selectively staged.)*

---

## 8. Residual Risks & Remaining Prerequisites

1. **Git Working Tree Hygiene Before Commit:** Because Phase 1–7.2 work is currently uncommitted alongside Phase 8, confirm whether to commit **all** verified Phase 1–8 files together onto the new `staging` branch or stage Phase 8 separately.
2. **Pre-Existing Local PDFs / Temp Folder:** Note local test artifacts in `backend/uploads/resources/*.pdf` (untracked) should NOT be committed to Git (`backend/uploads/` is not currently in `.gitignore`).
3. **FFmpeg Availability on Render Native Node Runtime:** `ffmpeg-static` is not in `backend/package.json`; verify whether `ffmpeg`/`ffprobe` exist on the Render staging container image or pre-encode staging MP4s before upload.
4. **Pending User Approvals Required to Proceed:**
   - Approval to branch (`git checkout -b staging`), commit, and push to `origin/staging` (without modifying `main`).
   - Approval of Render `Starter` (`\$7/mo`) + `10 GB` Persistent Disk (`\$2.50/mo` at `/var/data/class10lms`) and separate free Supabase staging project (`class10-lms-staging`).
   - Staging credentials: Render API key, staging Supabase URL/keys, Razorpay **Test Mode** (`rzp_test_*`) keys + webhook secret, and `CNAME staging-api` on `class10lms.in`.
