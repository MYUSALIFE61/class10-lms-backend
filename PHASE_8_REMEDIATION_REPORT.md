# PHASE 8 — CODE REMEDIATION & PRE-STAGING VERIFICATION REPORT

**Project:** Class 10 SSC LMS (Android Capacitor + Kotlin Media3 + React + Node.js/Express + Supabase PostgreSQL)  
**Workspace:** `d:\Downloads\Android apk file`  
**Execution Date:** November 27, 2026 (15:50 IST)  
**Scope:** Local Code & Schema Remediation Only — **Zero** Render provisioning, **zero** Supabase modifications, **zero** live migrations, **zero** git commits/pushes, **zero** live Razorpay activation, **zero** cloud object storage.

---

## 1. Executive Summary

Both code-level blockers identified in [PHASE_8_HOSTED_STAGING_READINESS_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE_8_HOSTED_STAGING_READINESS_REPORT.md) have been resolved locally and verified across all backend, frontend, admin portal, Android, migration compatibility, upload persistence, path-leak, and cloud-storage-rejection tests:

1. **Migration `010` & Rollback Schema Mismatch Fixed:** Updated [010_phase4_learning_experience.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/010_phase4_learning_experience.sql) and [010 rollback](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql) from non-existent `public.student_lesson_progress` to the canonical `public.lesson_progress` table created in [001_initial_schema.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/001_initial_schema.sql) and queried by [supabaseStore.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/supabaseStore.js). Verified end-to-end (`001` through `010`, idempotent re-run, `010`/`009` rollback, and re-apply) inside a disposable PostgreSQL engine (`@electric-sql/pglite`).
2. **Admin Upload Persistence Fixed (`RESOURCES_UPLOAD_DIR`):** Replaced the hardcoded `UPLOADS_DIR` in [adminStoreExtension.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/adminStoreExtension.js) with environment-based `resolveResourcesUploadDir()`, validated in [env.js](file:///d:/Downloads/Android%20apk%20file/backend/src/config/env.js), wired through [app.js](file:///d:/Downloads/Android%20apk%20file/backend/src/app.js) and [adminCmsService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/adminCmsService.js), and documented with the staging Render persistent-disk mount path `/var/data/class10lms/resources` in [backend/.env.example](file:///d:/Downloads/Android%20apk%20file/backend/.env.example). Verified restart persistence and strict path-traversal / path-leak defenses.
3. **Cloud Storage Rejection Hardened:** Converted [offlineStorageService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/offlineStorageService.js) constructor validation to a strict local allowlist (`['persistent_disk', 'pikpak_local']`) so any third-party cloud provider (`cloudflare_r2`, `r2`, `aws_s3`, `s3`, `supabase_storage`, `firebase_storage`, etc.) throws immediately.

---

## 2. Detailed Remediation Findings

### 2.1 Migration `010` Compatibility Audit (`001`–`010` + `supabaseStore.js`)
- **Root Cause:** `001_initial_schema.sql` (line 270) creates `public.lesson_progress` (`UNIQUE (user_id, lesson_id)`), `006_admin_portal_cms.sql` (line 106) extends it with `watch_time_seconds`, and `supabaseStore.js` (lines 646, 657, 667) + `adminStoreExtension.js` (line 762) query/upsert `lesson_progress`. Migration `010` previously altered `public.student_lesson_progress`, which did not exist.
- **Changes Made:**
  - `supabase/migrations/010_phase4_learning_experience.sql`: Updated `ALTER TABLE public.lesson_progress ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();` and `CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_accessed ON public.lesson_progress(user_id, last_accessed_at DESC);`.
  - `supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql`: Updated rollback to drop `public.idx_lesson_progress_user_accessed` (plus legacy `idx_student_progress_user_accessed` `IF EXISTS`) and drop `last_accessed_at` from `public.lesson_progress`.
- **Schema Verification Scope (Disposable PostgreSQL via `@electric-sql/pglite`):**
  - Executed `001` through `010` in strict order against disposable local PostgreSQL (`pgcrypto` extension + minimal `auth` stub).
  - Verified `public.lesson_progress` has `last_position_seconds`, `duration_seconds`, `completion_percent`, `watch_time_seconds`, `last_accessed_at`, `updated_at`, and `idx_lesson_progress_user_accessed`.
  - Verified `public.lessons` (`lesson_number`, `teacher_name`, `learning_objectives`), `public.lesson_concepts` (FKs to `subjects`, `chapters`, `lessons` + `relrowsecurity = true`), `public.lesson_revision_points` (FKs + `point_type` CHECK + `relrowsecurity = true`), `public.previous_exam_questions` (`lesson_id`, `question_type`, `question_image_url`, `options_json`, `explanation`), and `public.subscription_plans` (`CLASS10_MONTHLY_200`, `CLASS10_HALFYEAR_500`, `CLASS10_ANNUAL_799` active; `CLASS10_ANNUAL_499` inactive).
  - Verified live SQL inserts/constraints/FKs across `profiles`, `chapters`, `lessons`, `lesson_progress`, `lesson_concepts`, `lesson_revision_points`, and `previous_exam_questions`.
  - Verified idempotent re-execution of `009` and `010`, rollback execution (`010` -> `009`), and clean re-application (`009` -> `010`).

### 2.2 Admin Upload Persistence & Path-Leak Hardening
- **Staging Persistent Disk Path:** `/var/data/class10lms/resources` (alongside `/var/data/class10lms/offline_videos` and `/var/data/class10lms/tmp_jobs`).
- **Changes Made:**
  - [backend/src/config/env.js](file:///d:/Downloads/Android%20apk%20file/backend/src/config/env.js): Added `RESOURCES_UPLOAD_DIR: z.string().optional().default('')`.
  - [backend/.env.example](file:///d:/Downloads/Android%20apk%20file/backend/.env.example): Documented `RESOURCES_UPLOAD_DIR=` with staging Render Persistent Disk mount path `/var/data/class10lms/resources`.
  - [backend/src/repositories/adminStoreExtension.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/adminStoreExtension.js): Added `resolveResourcesUploadDir(overrideDir)`, updated `saveUploadedFile()` to strip directory prefixes via `path.basename` and write inside the configured persistent directory, and hardened `resolveUploadedFilePath()` to block `..`, `/`, `\`, null bytes, absolute paths, and boundary escapes outside `resolvedBase + path.sep`.
  - [backend/src/services/adminCmsService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/adminCmsService.js) & [backend/src/app.js](file:///d:/Downloads/Android%20apk%20file/backend/src/app.js): Passed `config` into `AdminCmsService` so create/update/download resolve `config.RESOURCES_UPLOAD_DIR || process.env.RESOURCES_UPLOAD_DIR || DEFAULT_RESOURCES_UPLOAD_DIR`.
  - [backend/src/routes/student.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/student.routes.js#L139): Sanitized `Content-Disposition` header filenames (`replace(/["\r\n\\]/g, '_')`).
- **Persistence & Path-Leak Verification:**
  - Verified admin upload writes exclusively into the configured persistent directory and returns only the generated basename (`storage_path`) in JSON (never host filesystem paths or `var_data_class10lms`).
  - Simulated a backend container restart by instantiating a fresh Express `createApp(...)` attached to the same `store` and `RESOURCES_UPLOAD_DIR`, confirming both admin (`/api/v1/admin/resources/:id/file`) and student (`/api/v1/student/resources/:id/download`) endpoints serve exact PDF bytes (`200 OK`).
  - Verified student listing omits `storage_path`, rejected traversal vectors (`../secret.pdf`, `..\\secret.pdf`, `nested/file.pdf`, `/etc/passwd`, null-byte paths), and verified `404` missing-file JSON responses never leak server filesystem paths.

---

## 3. Regression & Security Test Results

| Suite / Target | Command | Result | Details |
| :--- | :--- | :---: | :--- |
| **Backend Tests (Full Suite)** | `cd backend && npm test` *(with `TEMP`/`TMP` on `D:\` for 105 MB MP4 fixture)* | **PASS** | **14 test files passed, 39 tests passed (0 failed)** in `30.67s`. Includes PGlite `001`–`010` + rollbacks, `RESOURCES_UPLOAD_DIR` restart persistence & path-leak checks, cloud-storage rejection checks, `105 MB` MP4 upload/SHA-256 (`5970ms`), and `200`-student load test (`3782ms`). |
| **Frontend Tests** | `cd frontend && npm test` | **PASS** | **9 test files passed, 33 tests passed (0 failed)** in `37.19s`. |
| **Admin Portal Build** | `cd admin-portal && npm run build` | **PASS** | **Vite production build succeeded** (`1607` modules in `13.28s`; `dist/assets/index-CWW0ukzv.js` `335.50 kB`). |
| **Android Unit Tests & APK Build** | `cd frontend/android && .\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon --max-workers=1` | **PASS** | **`BUILD SUCCESSFUL` in `1m 37s`** (`185 actionable tasks`). **6 JUnit suites / 32 tests passed (`0` failures, `0` skipped)**. Debug APK built at [app-debug.apk](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/build/outputs/apk/debug/app-debug.apk) (`9,937,729` bytes, `SHA-256: A4614CF504F6D510C492C757A1BB1699F0FB2B2DE5366E91AEE7C22F10BE0626`). |

---

## 4. Phase 8 Remediation Changed Files

*(Uncommitted and unpushed per strict instructions; awaiting your diff review and approval.)*

| File | Change Summary |
| :--- | :--- |
| [010_phase4_learning_experience.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/010_phase4_learning_experience.sql) | Fixed `student_lesson_progress` -> `lesson_progress` table & `idx_lesson_progress_user_accessed` index |
| [010_phase4_learning_experience.rollback.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql) | Fixed rollback to drop index/column from `public.lesson_progress` |
| [backend/src/config/env.js](file:///d:/Downloads/Android%20apk%20file/backend/src/config/env.js) | Added `RESOURCES_UPLOAD_DIR` schema key |
| [backend/.env.example](file:///d:/Downloads/Android%20apk%20file/backend/.env.example) | Added `RESOURCES_UPLOAD_DIR=` with staging `/var/data/class10lms/resources` guidance |
| [backend/src/repositories/adminStoreExtension.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/adminStoreExtension.js) | Added `resolveResourcesUploadDir`, env-driven upload path resolution, and strict traversal boundary checks |
| [backend/src/services/adminCmsService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/adminCmsService.js) | Accepted `config` and routed resource save/lookup through configured `RESOURCES_UPLOAD_DIR` |
| [backend/src/app.js](file:///d:/Downloads/Android%20apk%20file/backend/src/app.js) | Injected `config` into `AdminCmsService` |
| [backend/src/routes/student.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/student.routes.js) | Sanitized `Content-Disposition` filename header on resource download |
| [backend/src/services/offlineStorageService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/offlineStorageService.js) | Enforced strict local-only provider allowlist (`persistent_disk`, `pikpak_local`) in constructor |
| [backend/package.json](file:///d:/Downloads/Android%20apk%20file/backend/package.json) & [backend/package-lock.json](file:///d:/Downloads/Android%20apk%20file/backend/package-lock.json) | Added `@electric-sql/pglite` `devDependency` for offline PostgreSQL migration testing |
| [backend/tests/phase8_staging_remediation.test.js](file:///d:/Downloads/Android%20apk%20file/backend/tests/phase8_staging_remediation.test.js) | Added automated PGlite `001`–`010` + rollback tests, `RESOURCES_UPLOAD_DIR` persistence/path-leak tests, and cloud-storage rejection tests |
| [PHASE_8_HOSTED_STAGING_READINESS_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE_8_HOSTED_STAGING_READINESS_REPORT.md) | Updated Migration `010` and Upload Persistence checks to `Passed (Remediated)` + documented `RESOURCES_UPLOAD_DIR=/var/data/class10lms/resources` |
| [PHASE_8_REMEDIATION_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE_8_REMEDIATION_REPORT.md) | This remediation report |

---

## 5. Remaining Prerequisites Before Hosted Staging Deployment

1. **Diff Review & Git Approval:** Review the local remediation diff above and approve committing & pushing to an isolated `staging` branch (keeping production `main` untouched).
2. **Staging Budget & Cloud Approval:** Approve Render `Starter` (`$7.00/mo`) + `10 GB` Persistent Disk (`$2.50/mo`, mounted at `/var/data/class10lms`) and separate free-tier Supabase staging project (`class10-lms-staging`).
3. **Staging Credentials & DNS:** Supply or authorize Render API access, staging Supabase URL/keys (`anon` + `service_role`), Razorpay **Test Mode** (`rzp_test_*`) keys + webhook secret, and `CNAME staging-api` on `class10lms.in`.
4. **Post-Approval Execution Sequence:** Create `class10-lms-staging` Supabase DB -> execute `001`–`010` on staging only -> create `class10-lms-backend-staging` + Persistent Disk (`/var/data/class10lms/offline_videos`, `/var/data/class10lms/tmp_jobs`, `/var/data/class10lms/resources`) -> verify HTTPS `/health`, Razorpay Test Mode, video upload/download, and physical iQOO I2223 acceptance test.
