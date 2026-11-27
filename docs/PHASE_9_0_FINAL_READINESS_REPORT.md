# PHASE 9.0 — HOSTED STAGING FINAL READINESS REPORT

**Project:** Class 10 LMS (AP & Telangana SSC)
**Phase:** 9.0 — Hosted Staging Infrastructure Preparation (**PREPARATION ONLY — STOPPED FOR APPROVAL**)
**Verified Staging Commit:** `1995379fd8f7ffdfd1130657d2ec0d793356478a` (`staging` / `origin/staging`)
**Production Baseline (`main` / `origin/main`):** `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579` (**Untouched**)
**Working Tree:** Clean (`git status --short` empty)

---

## 1. Companion Deliverables Created (`docs/`)

1. [PHASE_9_0_STAGING_ARCHITECTURE.md](file:///d:/Downloads/Android%20apk%20file/docs/PHASE_9_0_STAGING_ARCHITECTURE.md) — Target staging topology diagram, isolation matrix, and code-verified routes.
2. [PHASE_9_0_RENDER_CONFIGURATION.md](file:///d:/Downloads/Android%20apk%20file/docs/PHASE_9_0_RENDER_CONFIGURATION.md) — Render Starter specs, `/var/data/class10lms` paths, complete source-derived env table, and FFmpeg behavior.
3. [PHASE_9_0_SUPABASE_MIGRATION_CHECKLIST.md](file:///d:/Downloads/Android%20apk%20file/docs/PHASE_9_0_SUPABASE_MIGRATION_CHECKLIST.md) — Ordered `001`–`010` execution checklist, verification SQL, rollback scripts, and `admin_users` seed finding.
4. [PHASE_9_0_DOMAIN_DNS_CHECKLIST.md](file:///d:/Downloads/Android%20apk%20file/docs/PHASE_9_0_DOMAIN_DNS_CHECKLIST.md) — `staging-api.class10lms.in` CNAME, TLS, health check, and CORS verification steps.
5. [PHASE_9_0_ANDROID_ADMIN_STAGING_CONFIG.md](file:///d:/Downloads/Android%20apk%20file/docs/PHASE_9_0_ANDROID_ADMIN_STAGING_CONFIG.md) — Isolated staging Android APK & Admin Portal build configurations preserving production defaults.
6. [PHASE_9_0_STAGING_SECURITY_CHECKLIST.md](file:///d:/Downloads/Android%20apk%20file/docs/PHASE_9_0_STAGING_SECURITY_CHECKLIST.md) — Control status separating locally verified vs pending hosted staging vs missing prerequisites.
7. [PHASE_9_0_STAGING_TEST_PLAN.md](file:///d:/Downloads/Android%20apk%20file/docs/PHASE_9_0_STAGING_TEST_PLAN.md) — Backend, DB, Razorpay Test Mode, Android physical device, Admin CMS, private storage, and 50/100/200 load plan.
8. [PHASE_9_0_COST_AND_RESOURCE_PLAN.md](file:///d:/Downloads/Android%20apk%20file/docs/PHASE_9_0_COST_AND_RESOURCE_PLAN.md) — `~$9.50/mo` cost estimate plus disk, 512 MB RAM, FFmpeg, and bandwidth constraints.

---

## 2. Executive Synthesis of Preparation Findings

### 2.1 Git & Codebase Verification Summary
- Active branch is `staging` at `1995379fd8f7ffdfd1130657d2ec0d793356478a` pushed cleanly to `origin/staging`.
- `main` and `origin/main` remain pinned at `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579`.
- **Entrypoint / Commands:** Build `cd backend && npm ci --omit=dev`; Start `cd backend && npm start` (`node src/server.js`, binds `0.0.0.0:$PORT`); Health `/health` & `/api/v1/health`.
- **Storage Policy:** Strictly private persistent disk (`OFFLINE_VIDEO_STORAGE_DIR=/var/data/class10lms/offline_videos`, `OFFLINE_VIDEO_TEMP_DIR=/var/data/class10lms/tmp_jobs`, `RESOURCES_UPLOAD_DIR=/var/data/class10lms/resources`). Cloud storage (`cloudflare_r2`, `s3`, `aws_s3`, `supabase_storage`, `firebase_storage`) is explicitly rejected.

### 2.2 Code Observations & Non-Blocking Findings (Documented Without Altering App Code)
1. **Staging `super_admin` Account Bootstrap Needed:** Migration `006_admin_portal_cms.sql` seeds 8 RBAC roles in `public.roles` but **does not insert an initial `admin_users` row** (`adminStoreExtension.js` seeds `admin@class10lms.in` only in `InMemoryDataStore`). A staging `super_admin` row must be inserted into staging `public.admin_users` (using `adminRbac.hashPassword()`) after migrations `001`–`010`.
2. **`SUBSCRIPTION_PLAN_CODE` Default in `env.js`:** Defaults to legacy `CLASS10_ANNUAL_499` (deactivated by Migration `009`), so Render staging env must explicitly set `SUBSCRIPTION_PLAN_CODE=CLASS10_ANNUAL_799`.
3. **FFmpeg Absence Graceful Fallback:** `ffmpeg-static` is not installed, so Render native Node runtime falls back cleanly to verified MP4 pass-through (`ffmpegProcessor.js:209`). Pre-encode staging MP4s with `+faststart` or add `ffmpeg` via Dockerfile later if server-side transcoding is needed.
4. **Missing `admin-portal/.env.example`:** Admin Portal reads `VITE_API_BASE_URL` cleanly (`adminApi.js`), though no `.env.example` template exists yet in `admin-portal/` (recommend adding in a separate cleanup commit if desired).

---

## 3. Exact Prerequisites Missing Before Provisioning

1. **Budget & Spend Approval:** Confirm **~\$9.50/month** for Render **Starter Web Service (`$7/mo`) + 10 GB Persistent Disk (`$2.50/mo`)**.
2. **Cloud Provider Credentials / Access:**
   - Render API token or dashboard authorization to create `class10-lms-backend-staging` & `10 GB` Persistent Disk + optional Admin Static Site.
   - New free Supabase project **`class10-lms-staging`** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
   - Razorpay **Test Mode** credentials (`rzp_test_*` Key ID, Key Secret, Test Webhook Secret).
   - Registrar DNS access for `class10lms.in` to create `CNAME staging-api -> <render-staging-host>`.

---

## 4. Exact Step-by-Step Deployment Sequence (Execute Only After Approval)

1. **Provision Supabase Staging (`class10-lms-staging`):** Create project -> run migrations `001` through `010` in SQL Editor -> run verification queries -> execute one-time rollback drill (`010`/`009` rollback -> re-apply `009`/`010`) -> seed one staging `super_admin` in `public.admin_users`.
2. **Provision Render Staging Backend:** Create `class10-lms-backend-staging` (`Starter`, Singapore, branch `staging`) + attach `10 GB` Persistent Disk at `/var/data/class10lms` -> inject all verified staging env vars (`RAZORPAY_MODE=test`, `SUBSCRIPTION_PLAN_CODE=CLASS10_ANNUAL_799`, fresh staging JWT/device secrets, persistent paths) -> deploy and verify native `.onrender.com/health`.
3. **Configure DNS & TLS:** Register custom domain `staging-api.class10lms.in` in Render -> add registrar `CNAME staging-api -> <render-provided-host>` -> verify SSL issuance and `https://staging-api.class10lms.in/health`.
4. **Configure Razorpay Test Webhook:** Register `https://staging-api.class10lms.in/api/v1/payments/webhook` in Razorpay Test Dashboard with staging webhook secret.
5. **Deploy/Build Staging Admin Portal:** Build with `VITE_API_BASE_URL=https://staging-api.class10lms.in/api/v1/admin` -> add its origin to backend `ALLOWED_ORIGINS` -> log in with staging `super_admin`, upload sample MP4 + PDF, verify restart persistence & HTTP `206` streaming.
6. **Build & Validate Staging Android APK:** Build locally with `VITE_API_BASE_URL=https://staging-api.class10lms.in/api/v1` (`build:prod` + `npx cap sync android` + `assembleDebug`) -> install on physical `iQOO I2223` -> execute full staging acceptance suite (Signup -> Razorpay Test Mode -> Download -> Airplane Mode -> Lease Expiry -> Device Limit -> Logout Wipe).
