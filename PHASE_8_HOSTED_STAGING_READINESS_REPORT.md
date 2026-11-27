# PHASE 8 — HOSTED STAGING INFRASTRUCTURE READINESS REPORT

**Project:** Class 10 SSC LMS (Android Capacitor + Kotlin Media3 + React + Node.js/Express + Supabase PostgreSQL)  
**Workspace:** `d:\Downloads\Android apk file`  
**Audit Scope:** Read-Only Pre-Provisioning Infrastructure, Schema, Storage, Security & Cost Audit  
**Provisioning Status:** **STOPPED FOR USER APPROVAL** (Zero paid resources provisioned; zero production systems touched; zero migrations executed)

---

## 1. Status Classification Summary

| Category | Item | Classification | Evidence / Notes |
| :--- | :--- | :---: | :--- |
| **Read-Only Audit** | Codebase, env contract, security middleware, Render docs, SQL migrations `001`–`010`, rollbacks, DNS resolution | **Completed** | All target configs, source files, migrations, and DNS records inspected in read-only mode. |
| **Phase 7.2 Storage Policy** | Cloud object storage prohibition (`R2`, `S3`, `Supabase Storage`, `Firebase Storage`) | **Passed** | `backend/src/services/offlineStorageService.js` throws `CLOUD_STORAGE_DISABLED` for cloud providers; `backend/src/config/env.js` restricts `OFFLINE_VIDEO_STORAGE_PROVIDER` to `persistent_disk` or `pikpak_local`. |
| **Backend HTTP & Streaming Readiness** | `0.0.0.0` bind, `/health`, Helmet, CORS allowlist, `Range` / `206` uncompressed streaming, Zod env schema | **Passed** | Verified in `backend/src/server.js`, `backend/src/app.js`, `backend/src/routes/health.routes.js`, `backend/src/middleware/security.js`, and `backend/src/config/env.js`. |
| **Migration `009` Review** | `009_phase2_registration_and_plans.sql` & `009` rollback | **Passed** | Idempotent (`IF NOT EXISTS`, `ON CONFLICT`), preserves `CLASS10_ANNUAL_499` FK integrity while upserting ₹200 / ₹500 / ₹799 plans. |
| **Migration `010` Review** | `010_phase4_learning_experience.sql` & `010` rollback | **Passed (Remediated)** | Patched `public.student_lesson_progress` -> `public.lesson_progress` (and `idx_lesson_progress_user_accessed`) and verified `001`–`010` + rollbacks in disposable PostgreSQL (`@electric-sql/pglite`). See [PHASE_8_REMEDIATION_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE_8_REMEDIATION_REPORT.md). |
| **Admin PDF Upload Persistence** | `backend/src/repositories/adminStoreExtension.js` (`RESOURCES_UPLOAD_DIR`) | **Passed (Remediated)** | Replaced hardcoded `UPLOADS_DIR` with env-configured `RESOURCES_UPLOAD_DIR` (staging target: `/var/data/class10lms/resources`), wired through `env.js` -> `app.js` -> `AdminCmsService`, and verified restart persistence & path-leak protection. See [PHASE_8_REMEDIATION_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE_8_REMEDIATION_REPORT.md). |
| **Git Staging Branch Sync** | `git status --short` vs `MYUSALIFE61/class10-lms-backend` | **Blocked** | Phase 1–7.2 code (`backend/`, `frontend/`, `admin-portal/`, `009`, `010`, `rollbacks/`) is currently uncommitted/untracked locally; Render cannot build Phase 7.2+ code until committed/pushed to a dedicated `staging` branch (after approval). |
| **Staging Env & Blueprint Files** | `render.yaml`, `backend/.env`, `backend/.env.staging`, `admin-portal/.env.example` | **Blocked** | Absent from disk; staging env variables must be generated/supplied and configured exclusively in a separate staging Render service. |
| **DNS Resolution** | `staging-api.class10lms.in` and `api.class10lms.in` | **Blocked** | `Resolve-DnsName` returned empty for both hostnames; DNS CNAME for `staging-api` does not exist yet. |
| **Staging Infra Provisioning & E2E Tests** | Supabase staging creation, Render Starter + Persistent Disk creation, `009`/`010` execution, staging backend deploy, staging APK & physical device verification | **Not tested** | Intentionally deferred pending fixes to Migration `010` and explicit user approval of resources & cost. |
| **Paid Resource Spend & Deployment** | Render Starter (`$7/mo`) + Render Persistent Disk 10 GB (`~$2.50/mo`), staging DB setup, DNS & TLS setup | **Requires user approval** | Must be approved before creating any Render service/disk, creating staging Supabase, pushing staging branch, or adding DNS records. |

---

## 2. Existing Infrastructure Inspection Findings

### 2.1 Backend Architecture & Runtime (`backend/`)
- **Entrypoint & Binding:** [server.js](file:///d:/Downloads/Android%20apk%20file/backend/src/server.js) loads `dotenv/config`, validates `env` via Zod (`loadEnv()`), binds `HOST = process.env.HOST || '0.0.0.0'` on `config.PORT` (Render injects `PORT`), and registers graceful `SIGTERM`/`SIGINT` shutdown handlers.
- **Node Version:** [.node-version](file:///d:/Downloads/Android%20apk%20file/.node-version) specifies `22.14.0`, satisfying [package.json](file:///d:/Downloads/Android%20apk%20file/backend/package.json) (`"engines": { "node": ">=20.0.0" }`).
- **Health Checks:** [health.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/health.routes.js) exposes `/health` and `/api/v1/health` returning HTTP `200` with `{"success":true,"status":"ok","service":"class10-lms-backend",...}`.
- **Security & Video Streaming Middleware:** [security.js](file:///d:/Downloads/Android%20apk%20file/backend/src/middleware/security.js) enables `trust proxy`, Helmet (`crossOriginResourcePolicy: 'cross-origin'`, `contentSecurityPolicy: false`), strict CORS against `ALLOWED_ORIGINS` (while permitting native mobile/webhook requests with no `Origin` header), exposes `Content-Range`, `Accept-Ranges`, `Content-Length`, `X-Content-SHA256`, and disables HTTP compression on `/playback/stream/` and `/downloads/*/stream` so `206 Partial Content` byte-range streams are never buffered.
- **FFmpeg Processing:** [ffmpegProcessor.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/ffmpegProcessor.js) invokes `FFMPEG_PATH || 'ffmpeg'` and `FFPROBE_PATH || 'ffprobe'`, uses `OFFLINE_VIDEO_TEMP_DIR`, and sweeps stale job folders older than 30 minutes every 10 minutes. Note that `ffmpeg-static` is not listed in `backend/package.json`; on Render, either `ffmpeg`/`ffprobe` availability must be ensured in the runtime/build step or uploaded staging assets must be pre-encoded standard MP4s with `faststart` (`moov` atom at front).

### 2.2 Storage Architecture Alignment (Phase 7.2 Local-Only Rule)
- **Compliance Verified:** [offlineStorageService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/offlineStorageService.js) strictly stores master MP4 files on server private disk (`OFFLINE_VIDEO_STORAGE_DIR`, defaulting locally to `backend/storage/offline_videos`) with `64 KB` streaming chunks and `200`/`206`/`416` Byte-Range support. Cloud storage adapters (`cloudflare_r2`, `s3`, `supabase_storage`, `firebase_storage`) are explicitly rejected.
- **Student Android Storage:** Encrypted downloads on the device remain strictly inside `context.noBackupFilesDir/offline_lessons/` using AES-256-GCM + Android Keystore + Media3 `EncryptedOfflineDataSource`.
- **Gap Found for Hosted Render Disk:** [adminStoreExtension.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/adminStoreExtension.js#L10) hardcodes `UPLOADS_DIR = path.resolve(__dirname, '../../uploads/resources')`. When deploying to Render with a Persistent Disk mounted at `/var/data/class10lms`, `RESOURCES_UPLOAD_DIR` (or a persistent symlink) should point to `/var/data/class10lms/resources` so admin-uploaded handwritten note PDFs also survive Render container restarts/redeploys.
- **Outdated Doc Warning:** [RENDER_PRODUCTION_DEPLOYMENT_REPORT.md](file:///d:/Downloads/Android%20apk%20file/docs/RENDER_PRODUCTION_DEPLOYMENT_REPORT.md) (from November 26, 2026) mentions `Supabase Storage` as a storage option; that option is **obsolete and prohibited** under Phase 7.2 (`LOCAL_ANDROID_VIDEO_STORAGE_ARCHITECTURE.md`).

### 2.3 Existing Production Render & Supabase Assets (DO NOT MODIFY)
From [PHASE7_ENVIRONMENT_AUDIT.md](file:///d:/Downloads/Android%20apk%20file/PHASE7_ENVIRONMENT_AUDIT.md) and [RENDER_PRODUCTION_DEPLOYMENT_REPORT.md](file:///d:/Downloads/Android%20apk%20file/docs/RENDER_PRODUCTION_DEPLOYMENT_REPORT.md):
- **Production Render Service (Untouched):** `srv-dc41v1vf3r2c73a29agg` (`class10-lms-backend`, region `singapore`, plan `free`, hostname `https://class10-lms-backend.onrender.com`, custom domain ID `cdm-dc4216p5efls73cr9l30` -> `api.class10lms.in`).
- **Production Supabase Project (Untouched):** `hxllgasepsxrpsonljct`.
- **Current Staging Assets:** None exist (`render.yaml` absent, `backend/.env` absent, `backend/.env.staging` absent, `staging-api.class10lms.in` DNS absent).

### 2.4 Frontend & Admin Portal Configuration
- **Android Capacitor Config:** [capacitor.config.json](file:///d:/Downloads/Android%20apk%20file/frontend/capacitor.config.json) sets `appId: "in.class10lms.ssc"`, `server.androidScheme: "https"`, `server.hostname: "app.class10lms.in"`, `cleartext: false`, `webContentsDebuggingEnabled: false`.
- **Frontend API Config:** [env.js](file:///d:/Downloads/Android%20apk%20file/frontend/src/config/env.js) defaults strict release builds to `https://api.class10lms.in/api/v1` and blocks loopback/non-HTTPS URLs in production builds. For staging APK verification, Vite build must pass `VITE_API_BASE_URL=https://staging-api.class10lms.in/api/v1` (or the staging Render HTTPS URL prior to DNS cutover).
- **Admin Portal Config:** [adminApi.js](file:///d:/Downloads/Android%20apk%20file/admin-portal/src/services/adminApi.js#L2) reads `import.meta.env.VITE_API_BASE_URL || '/api/v1/admin'`. [vite.config.js](file:///d:/Downloads/Android%20apk%20file/admin-portal/vite.config.js) proxies `/api` to `http://127.0.0.1:4000` in dev only. No `admin-portal/.env.example` exists yet.

---

## 3. Strict Staging vs Production Isolation Matrix

| Component | Staging Environment (Proposed) | Production Environment (Untouched) | Isolation Guarantee |
| :--- | :--- | :--- | :--- |
| **Render Service** | `class10-lms-backend-staging` (new service ID, Starter tier) | `srv-dc41v1vf3r2c73a29agg` (`class10-lms-backend`) | Completely separate Render service & deploy pipeline |
| **Git Branch** | Dedicated `staging` branch (after committing Phase 7.2+ code) | `main` branch | Zero auto-deploy cross-triggering |
| **API Domain** | `https://staging-api.class10lms.in` | `https://api.class10lms.in` | Separate subdomain & TLS certificate |
| **Persistent Disk** | Dedicated 10 GB Render disk mounted at `/var/data/class10lms` on staging service | Never shared with staging | Independent filesystem & video inventory |
| **Supabase Project** | New free project `class10-lms-staging` | `hxllgasepsxrpsonljct` | Separate PostgreSQL instance, Auth users, & API keys |
| **JWT & Device Secrets** | Fresh staging-only 64-char hex `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DEVICE_HASH_SECRET` | Production secrets | Staging tokens cannot validate against prod & vice versa |
| **Payment Gateway** | `RAZORPAY_MODE=test` with `rzp_test_*` keys + staging webhook secret | Live keys (`rzp_live_*`) when enabled | Zero real financial charges in staging |
| **Video & PDF Assets** | Staging curriculum test MP4 + staging handwritten note PDFs | Production curriculum assets | Zero test pollution |
| **User Accounts** | Dedicated QA student (`staging_student_01`) & staging admin credentials | Real production accounts | Isolated `profiles`, `subscriptions`, `user_devices` |

---

## 4. Database Migration Audit & Staging Execution Plan

### 4.1 Migration Inventory (`supabase/migrations/`)
All 10 migrations (`001`–`010`) and rollbacks (`009`, `010`) exist locally:
- `001_initial_schema.sql` through `008_offline_video_downloads.sql` (base schema, RLS, syllabus seed, stream/sync providers, CMS, gamified MCQs, offline downloads)
- [009_phase2_registration_and_plans.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/009_phase2_registration_and_plans.sql) & [009 rollback](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/009_phase2_registration_and_plans.rollback.sql)
- [010_phase4_learning_experience.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/010_phase4_learning_experience.sql) & [010 rollback](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql)

### 4.2 Critical Schema Blocker Found in Migration `010`
- `001_initial_schema.sql` line 270 creates **`public.lesson_progress`**.
- `002_rls_policies.sql`, `006_admin_portal_cms.sql`, `008_offline_video_downloads.sql`, [supabaseStore.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/supabaseStore.js#L646-L667), and [adminStoreExtension.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/adminStoreExtension.js#L762) all reference **`public.lesson_progress`**.
- [010_phase4_learning_experience.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/010_phase4_learning_experience.sql#L19-L23) and [010 rollback](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql#L20-L22) erroneously target **`public.student_lesson_progress`**, which does not exist anywhere in `001`–`008`.
- **Required Fix Before Staging Migration Run:** Update `010_phase4_learning_experience.sql` (lines 8, 18, 19, 23) and `010` rollback (lines 20–22) to target **`public.lesson_progress`**, then verify forward migration (`009` -> `010`), row-level security, and rollback/re-apply on the **staging** Supabase project only.

### 4.3 Staging-Only Migration Execution Order (After Approval)
1. Provision separate staging Supabase project (`class10-lms-staging`).
2. Apply base migrations `001` through `008` in order.
3. Patch Migration `010` & `010` rollback table target from `student_lesson_progress` to `lesson_progress`.
4. Apply `009_phase2_registration_and_plans.sql` and verify:
   - `profiles.username` + `profiles.state` exist; `uq_profiles_username_lower` index exists.
   - `subscription_plans` contains active `CLASS10_MONTHLY_200` (`20000`), `CLASS10_HALFYEAR_500` (`50000`), `CLASS10_ANNUAL_799` (`79900`) and inactive `CLASS10_ANNUAL_499`.
5. Apply `010_phase4_learning_experience.sql` and verify:
   - `lessons` has `lesson_number`, `teacher_name`, `learning_objectives`.
   - `lesson_progress` has `last_accessed_at` and `idx_student_progress_user_accessed`.
   - `lesson_concepts` and `lesson_revision_points` exist with RLS enabled (`relrowsecurity = true`).
   - `previous_exam_questions` has `lesson_id`, `question_type`, `question_image_url`, `options_json`, `explanation`.
6. Execute staging rollback drill (`010` rollback -> `009` rollback -> re-apply `009` -> `010`) on the empty/test staging DB before seeding real QA content.

---

## 5. Staging Resource Sizing, Configuration & Cost Estimate

### 5.1 Proposed Staging Resources & Monthly Cost
| Resource | Provider & Tier | Specs / Purpose | Estimated Cost |
| :--- | :--- | :--- | :---: |
| **Staging Backend API** | Render Web Service (`Starter`, Singapore region recommended) | 512 MB RAM / 0.5 CPU, always-on (no cold-start sleep), supports Persistent Disk & byte-range video downloads | **\$7.00 / month** |
| **Private Persistent Disk** | Render Persistent Disk (attached to staging Web Service at `/var/data/class10lms`) | **10 GB** SSD (`$0.25/GB/month`) for encrypted-origin MP4 master files (`/var/data/class10lms/offline_videos`), temp FFmpeg jobs (`/var/data/class10lms/tmp_jobs`), and uploaded PDFs (`/var/data/class10lms/resources`) | **\$2.50 / month** |
| **Staging Database & Auth** | Supabase (`Free` Tier, separate project `class10-lms-staging`) | PostgreSQL 500 MB DB + Supabase Auth (Supabase Storage unused/prohibited) | **\$0.00 / month** |
| **Staging Admin Portal** | Render Static Site (Free Tier, `admin-portal/dist`) | Static React build connecting over HTTPS to `staging-api.class10lms.in` | **\$0.00 / month** |
| **Custom Domain & TLS** | DNS `CNAME staging-api -> <render-staging-host>` + Render Let's Encrypt | HTTPS termination for Android release/staging builds & Razorpay webhooks | **\$0.00 / month** (existing domain) |
| **Razorpay Gateway** | Razorpay **Test Mode** (`rzp_test_*`) | Sandbox orders, checkout signatures, webhook verification | **\$0.00** |
| **Total Estimated Monthly Staging Cost** | | | **~\$9.50 / month** |

> [!IMPORTANT]
> Why **Render Free Tier** cannot be used for the staging backend: Render Free Web Services do not support Persistent Disks and wipe all container files on redeploy or spin-down (`OFFLINE_VIDEO_STORAGE_DIR` would be lost on every restart). Render **Starter (\$7/mo) + Persistent Disk (\$2.50/mo for 10 GB)** is the minimum hosted configuration that satisfies Phase 7.2 persistent private-disk video storage. (Optional: 20 GB disk adds +\$2.50/mo for \$12.00/mo total.)

### 5.2 Staging Backend Environment Variable Matrix (Secrets Never Committed)
Required variables per [env.js](file:///d:/Downloads/Android%20apk%20file/backend/src/config/env.js):
- `NODE_ENV=production` *(strict runtime mode inside staging Render service)*
- `PORT=10000` *(Render default, bound automatically via `config.PORT`)*
- `TRUST_PROXY=1`
- `ALLOWED_ORIGINS=https://app.class10lms.in,https://localhost,https://<staging-admin-site>.onrender.com` *(plus `https://staging-admin.class10lms.in` if custom domain added)*
- `SUPABASE_URL=<staging-supabase-url>`
- `SUPABASE_ANON_KEY=<staging-supabase-anon-key>`
- `SUPABASE_SERVICE_ROLE_KEY=<staging-supabase-service-role-key>`
- `JWT_ACCESS_SECRET=<new-staging-64-char-hex>`
- `JWT_REFRESH_SECRET=<new-staging-64-char-hex>`
- `DEVICE_HASH_SECRET=<new-staging-64-char-hex>`
- `JWT_ACCESS_TTL=15m`
- `JWT_REFRESH_TTL_DAYS=7`
- `SUBSCRIPTION_PLAN_CODE=CLASS10_ANNUAL_799`
- `MAX_DEVICES_PER_STUDENT=1`
- `CONCURRENT_SESSION_WINDOW_MINUTES=10`
- `RAZORPAY_MODE=test`
- `RAZORPAY_KEY_ID=<rzp_test_...>`
- `RAZORPAY_KEY_SECRET=<test_secret>`
- `RAZORPAY_WEBHOOK_SECRET=<staging_webhook_secret>`
- `VIDEO_STORAGE_PROVIDER=none`
- `OFFLINE_VIDEO_STORAGE_PROVIDER=persistent_disk`
- `OFFLINE_VIDEO_STORAGE_DIR=/var/data/class10lms/offline_videos`
- `OFFLINE_VIDEO_TEMP_DIR=/var/data/class10lms/tmp_jobs`
- `RESOURCES_UPLOAD_DIR=/var/data/class10lms/resources`
- `OFFLINE_DOWNLOAD_TOKEN_TTL_SECONDS=900`
- `OFFLINE_LEASE_DAYS=7`
- `OFFLINE_MAX_UPLOAD_MB=1024`
- `OFFLINE_RETENTION_POLICY=wipe_on_logout`
- `GOOGLE_PLAY_PACKAGE_NAME=in.class10lms.ssc`
- `INTEGRITY_DISTRIBUTION_MODE=sideload`
- `INTEGRITY_ENFORCEMENT_MODE=monitor` *(switch to `enforce` once Play Integrity credentials are configured for staging/prod)*

### 5.3 DNS & HTTPS Cutover Requirements
Currently, `Resolve-DnsName staging-api.class10lms.in` returns **empty**. After provisioning `class10-lms-backend-staging` on Render, the following DNS record will be needed at the `class10lms.in` DNS registrar:
- **Type:** `CNAME`
- **Host / Name:** `staging-api`
- **Target:** `<assigned-staging-service>.onrender.com`
- **TTL:** `300` (or Auto)

Until DNS propagation completes, staging API health checks can also target Render's native `https://<assigned-staging-service>.onrender.com` URL.

---

## 6. Explicit Approval Checklist Before Proceeding

Please confirm approval for the following before any provisioning, commits, or deployments are executed:
1. **Budget & Paid Render Resources:** Approve **~\$9.50/month** for Render **Starter Web Service (\$7/mo)** + **10 GB Persistent Disk (\$2.50/mo)** in Singapore region (`class10-lms-backend-staging`).
2. **Database & Patch Approval:** Approve creating a new free **Supabase staging project** (`class10-lms-staging`), patching the `student_lesson_progress` -> `lesson_progress` table name bug in Migration `010` (and its rollback), and running `001`–`010` on staging only.
3. **Code Fix & Staging Branch:** Approve configuring `UPLOADS_DIR` in `backend/src/repositories/adminStoreExtension.js` to accept an env var (`OFFLINE_RESOURCES_DIR` or persistent mount path) so PDFs persist alongside videos on `/var/data/class10lms`, and committing/pushing Phase 1–7.2 code to a dedicated `staging` branch without altering `main` or production `srv-dc41v1vf3r2c73a29agg`.
4. **Credentials Needed Once Approved:** Confirm whether you will supply (or authorize creating via CLI/API) the **Render API key / dashboard creation**, **staging Supabase URL + keys**, **Razorpay Test Mode (`rzp_test_*`) keys + webhook secret**, and **`class10lms.in` DNS CNAME** for `staging-api`.
