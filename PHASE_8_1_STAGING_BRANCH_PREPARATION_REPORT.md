# PHASE 8.1 — STAGING BRANCH PREPARATION REPORT

**Project:** Class 10 SSC LMS (Android Capacitor + Kotlin Media3 + React + Node.js/Express + Supabase PostgreSQL)  
**Workspace:** `d:\Downloads\Android apk file`  
**Audit Timestamp:** November 27, 2026 (16:00 IST)  
**Action State:** Local branch `staging` created at `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579`. **Zero** commits created, **zero** pushes executed, **zero** Render/Supabase provisioning, **zero** migrations applied, **zero** production modifications.

---

## 1. Git Branch Status

| Ref | Commit Hash | Status | Verification |
| :--- | :--- | :---: | :--- |
| **`main`** | `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579` | **Unchanged** | Points to existing baseline (`Add Phase 7 Production Acceptance Testing Report`) |
| **`origin/main`** | `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579` | **Unchanged** | Remote production baseline untouched |
| **`staging`** *(active)* | `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579` | **Created Locally** | Created via `git checkout -b staging`; holds all uncommitted Phase 1–8 work without altering `main`; **0 commits / 0 pushes** |

---

## 2. Complete Git Working Tree & File Classification Inventory

**Summary Counts (`git status -uall --porcelain` + report):**
- **Modified (`M`):** `57` files
- **Deleted (`D`):** `1` file
- **Untracked (`??`):** `76` files (`14` local uploaded test PDFs, `40` Markdown reports/architecture docs, `6` backend tests, `12` frontend pages/components/tests, `4` SQL migration/rollback files)

### 2.1 Phase 1–7.2 Code Changes (Uncommitted in Working Tree)
- **Admin Portal (`3` modified):**
  - `admin-portal/src/pages/LessonsPage.jsx`
  - `admin-portal/src/pages/VideoLibraryPage.jsx`
  - `admin-portal/src/services/adminApi.js`
- **Backend Core, Routes & Services (`16` modified, `1` deleted):**
  - `backend/scripts/dev-preview-server.js`
  - `backend/src/repositories/supabaseStore.js`
  - `backend/src/routes/auth.routes.js`, `offlineDownloads.routes.js`, `payments.routes.js`, `subscriptions.routes.js` *(plus Phase 8 sanitized `student.routes.js`)*
  - `backend/src/services/authService.js`, `ffmpegProcessor.js`, `offlineDownloadService.js`, `paymentService.js`, `playbackService.js`, `studentDynamicService.js`, `videoProviders/index.js`, `videoSyncService.js`
  - **Deleted (`D`):** `backend/src/services/videoProviders/cloudflareR2Adapter.js` *(removed under Phase 7.2 local-only storage enforcement)*
- **Backend Tests (`2` modified, `5` new untracked):**
  - Modified: `backend/tests/helpers/testHarness.js`, `backend/tests/phase7_video_sync_and_stream.test.js`
  - New: `backend/tests/phase2_onboarding_and_plans.test.js`, `phase3_razorpay_payments.test.js`, `phase4_learning_experience.test.js`, `phase5_e2e_integration.test.js`, `phase6_storage_and_playback_bridge.test.js`
- **Frontend Web & Tests (`18` modified, `12` new untracked):**
  - Modified: `frontend/src/App.jsx`, `frontend/src/styles/app.css`, `frontend/src/config/env.js`, `frontend/src/context/AuthContext.jsx`, `frontend/src/components/offline/{InAppVideoPlayer.jsx,LessonDetailsScreen.jsx,VideoDownloadButton.jsx}`, `frontend/src/components/video/LMSVideoPlayer.jsx`, `frontend/src/pages/{ChapterDetailPage.jsx,CoursesPage.jsx,DashboardPage.jsx,LessonPlayerPage.jsx,LoginPage.jsx,ProfileSettingsPage.jsx,ProgressPage.jsx,SubjectDetailPage.jsx,SubscriptionPage.jsx}`, `frontend/src/services/{lmsApi.js,nativeBridge.js,offlineDownloadService.js}`, `frontend/src/test/phase4_video_player.test.jsx`
  - New Components/Pages (`8`): `HandwrittenNotesViewer.jsx`, `LessonLearningTabs.jsx`, `CheckoutPage.jsx`, `LegalPage.jsx`, `PaymentHistoryPage.jsx`, `PaymentResultPage.jsx`, `SignupPage.jsx`, `WelcomePage.jsx`
  - New Tests (`4`): `phase2_welcome_signup_plans.test.jsx`, `phase3_razorpay_payments.test.jsx`, `phase4_learning_experience.test.jsx`, `phase5_e2e_journey.test.jsx`
- **Android Native Kotlin & Manifest (`8` modified):**
  - `frontend/android/app/src/main/AndroidManifest.xml`
  - `frontend/android/app/src/main/java/in/class10lms/ssc/{Class10MediaPlayerPlugin.kt,Class10OfflineDownloadPlugin.kt,LmsMedia3PlayerActivity.kt,LmsNavigationPolicy.kt,MainActivity.kt,OfflineVideoVault.kt}`
  - `frontend/android/app/src/test/java/in/class10lms/ssc/LmsNavigationPolicyTest.kt`
- **SQL Migrations (`3` pre-Phase 8 untracked + `2` Phase 8 remediated below):**
  - `supabase/migrations/009_phase2_registration_and_plans.sql`
  - `supabase/migrations/rollbacks/009_phase2_registration_and_plans.rollback.sql`
- **Phase 1–7 Documentation (`36` untracked reports):**
  - `LOCAL_ANDROID_VIDEO_STORAGE_ARCHITECTURE.md`, `PHASE1_MASTER_AUDIT_REPORT.md` through `PHASE8_VIDEO_INGESTION_REPORT.md`, and `PHASE_7_3_PHYSICAL_DEVICE_VERIFICATION_REPORT.md`

### 2.2 Phase 8 Remediation Changes (Uncommitted in Working Tree)
- **Modified Tracked Files (`9`):**
  - `backend/src/config/env.js` (`RESOURCES_UPLOAD_DIR` Zod env schema field)
  - `backend/.env.example` (`RESOURCES_UPLOAD_DIR=` + staging `/var/data/class10lms/resources` guidance)
  - `backend/src/repositories/adminStoreExtension.js` (`resolveResourcesUploadDir()`, traversal/boundary guards in `saveUploadedFile` / `resolveUploadedFilePath`)
  - `backend/src/services/adminCmsService.js` (`config`-injected upload path resolution)
  - `backend/src/app.js` (wires `config` into `AdminCmsService`)
  - `backend/src/routes/student.routes.js` (`Content-Disposition` header filename sanitization)
  - `backend/src/services/offlineStorageService.js` (strict local-only constructor allowlist `['persistent_disk', 'pikpak_local']`)
  - `backend/package.json` & `backend/package-lock.json` (`@electric-sql/pglite` `devDependency` for disposable PostgreSQL tests)
- **Remediated SQL & New Phase 8 Files (`6` untracked):**
  - `supabase/migrations/010_phase4_learning_experience.sql` (`student_lesson_progress` → `lesson_progress` + `idx_lesson_progress_user_accessed`)
  - `supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql` (`lesson_progress` rollback parity)
  - `backend/tests/phase8_staging_remediation.test.js`
  - `PHASE_8_HOSTED_STAGING_READINESS_REPORT.md`
  - `PHASE_8_REMEDIATION_REPORT.md`
  - `PHASE_8_FINAL_CODE_REVIEW.md`
  - `PHASE_8_1_STAGING_BRANCH_PREPARATION_REPORT.md` *(this report)*

---

## 3. Files Excluded From Git & Commit-Safety Findings

### 3.1 Properly Ignored by `.gitignore` (Verified Absent from `git status`)
- **Env Templates & Missing `.env` Secrets:** Only [backend/.env.example](file:///d:/Downloads/Android%20apk%20file/backend/.env.example) and [frontend/.env.example](file:///d:/Downloads/Android%20apk%20file/frontend/.env.example) exist on disk. Zero `.env`, `.env.local`, `.env.production`, `.env.staging`, or `service-account*.json` files exist.
- **Keystores & Signing Credentials (Excluded by `.gitignore`):**
  - `frontend/android/keystore.properties` (`keystore.properties` rule)
  - `frontend/android/app/release-upload.jks` (`*.jks` rule)
  - `.android-home/debug.keystore` (`.android-home/` & `*.keystore` rules)
- **Local Uploaded Videos & Temp Media (Excluded by `.gitignore`):**
  - `36` local MP4 files in `backend/storage/offline_videos/` (`backend/storage/` rule)
- **Generated Build Outputs, APK/AAB & Logs (Excluded by `.gitignore`):**
  - `frontend/android/app/build/outputs/apk/debug/app-debug.apk`
  - `frontend/android/app/build/outputs/bundle/release/app-release.aab`
  - `pikpak-poc/android-exo-poc/app/build/outputs/apk/debug/app-debug.apk`
  - `frontend/dist/`, `admin-portal/dist/`, `.gradle-home*`, `.tmp/`, `.tools/`, `hs_err_pid13472.log`, `replay_pid13472.log`, `frontend/android/.kotlin/errors/*.log`
- **Local Databases:** Zero `.db`, `.sqlite`, or `.sqlite3` files exist in the workspace.

### 3.2 Commit-Safety Alert: Untracked PDFs NOT Ignored by `.gitignore`
- `backend/uploads/resources/` currently holds `32` generated PDF files on disk:
  - `18` older files are already tracked in `main` (`ee720cf`).
  - **`14` newer local test PDFs (`1795713824792_*` through `1795774810553_*`) appear as `??` untracked in `git status -uall`**, because `.gitignore` ignores `backend/storage/` and `backend/tmp/`, **not `backend/uploads/`**.
- **Required Guard Before Committing:** Either add `backend/uploads/` to `.gitignore` (recommended) or exclude `backend/uploads/` explicitly during `git add` so generated PDF artifacts never enter Git history.

---

## 4. Secret & Credential Scan Results

Scanned all source, SQL, config, test, and documentation files (excluding `node_modules/`, `.git/`, binaries, and build caches) for live Razorpay (`rzp_live_*`), Render (`rnd_*`), AWS (`AKIA*`), Google (`AIza*`), PEM private keys, and JWT secrets:
- **`SECRET_SCAN` Result:** **Zero live secrets or real credentials detected.**
- **Single Synthetic Test Match:** `backend/tests/phase3_razorpay_payments.test.js:143` contains dummy string `rzp_live_accidental...` used exclusively to assert that `RAZORPAY_MODE=test` rejects live keys.

---

## 5. Hosted Staging Configuration Checklist (For Post-Approval Execution)

### Backend (Render Staging — Isolated from Production `srv-dc41v1vf3r2c73a29agg`)
- [ ] Render **Starter** Web Service (`class10-lms-backend-staging`, Singapore, tracked branch `staging`)
- [ ] Render **Persistent Disk** (`10 GB`) mounted at `/var/data/class10lms`
- [ ] `OFFLINE_VIDEO_STORAGE_PROVIDER=persistent_disk`
- [ ] `OFFLINE_VIDEO_STORAGE_DIR=/var/data/class10lms/offline_videos`
- [ ] `OFFLINE_VIDEO_TEMP_DIR=/var/data/class10lms/tmp_jobs`
- [ ] `RESOURCES_UPLOAD_DIR=/var/data/class10lms/resources`
- [ ] Fresh staging-only 64-char hex `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DEVICE_HASH_SECRET`
- [ ] `ALLOWED_ORIGINS` limited to `https://app.class10lms.in`, `https://localhost`, and staging Admin Portal origin

### Database (Separate Free Supabase Staging — Isolated from `hxllgasepsxrpsonljct`)
- [ ] Provision new Supabase project (`class10-lms-staging`); confirm zero connection to `hxllgasepsxrpsonljct`
- [ ] Apply migrations `001` through `010` sequentially on staging only
- [ ] Verify PostgREST queries via `@supabase/supabase-js`, Auth signup/login JWT flows, and RLS runtime policies (`has_active_subscription(auth.uid())`) on `lesson_concepts`, `lesson_revision_points`, `lesson_progress`

### Media & Streaming
- [ ] Verify `ffmpeg` & `ffprobe` availability on Render staging runtime (or supply pre-encoded `faststart` MP4s)
- [ ] Verify HTTP `200` and `206 Partial Content` uncompressed byte-range streaming from persistent disk
- [ ] Verify Admin resource PDF upload & download persistence across a staging container restart using `/var/data/class10lms/resources`
- [ ] Confirm cloud object storage (`AWS S3`, `Cloudflare R2`, `Supabase Storage`, `Firebase Storage`) remains disabled (`VIDEO_STORAGE_PROVIDER=none`, `CLOUD_STORAGE_DISABLED` guard active)

### Payments
- [ ] Configure `RAZORPAY_MODE=test` with `rzp_test_*` key ID, secret, and staging webhook secret
- [ ] Register Render staging webhook URL (`https://staging-api.class10lms.in/api/v1/payments/webhook` or native Render URL) in Razorpay Test Mode dashboard

---

## 6. Remaining Risks

1. **Untracked Test PDFs (`14` files in `backend/uploads/resources/`):** Will be accidentally committed if `git add -A` is used without adding `backend/uploads/` to `.gitignore` or excluding them.
2. **Large Mixed Staging Commit:** `57` modified files + `76` untracked files combine Phase 1–7.2 and Phase 8 changes in one working tree; staging should be committed cleanly without touching `main`.
3. **FFmpeg Binary on Render Native Node:** `ffmpeg-static` is not bundled in `backend/package.json`; runtime validation on Render staging is required after deployment.
4. **Live Supabase PostgREST/RLS Parity:** Local PGlite verification used `auth` SQL stubs; full GoTrue + PostgREST + JWT RLS validation still requires live staging Supabase execution.

---

## 7. Exact Actions Requiring User Approval

Please explicitly approve which next step(s) to proceed with:
1. **`.gitignore` + Staging Commit:** Approve adding `backend/uploads/` to `.gitignore` (keeping existing tracked repo files untouched), staging verified application/migration/report files onto local branch `staging` (leaving `main` untouched at `ee720cf`), creating the commit, and pushing `origin/staging`.
2. **Hosted Staging Provisioning & Cost (`~$9.50/mo`):** Approve creating Render `Starter` (`$7/mo`) + `10 GB` Persistent Disk (`$2.50/mo` at `/var/data/class10lms`) and separate free Supabase `class10-lms-staging`.
3. **Credentials & DNS:** Supply/authorize Render API key, staging Supabase URL/keys, Razorpay **Test Mode** keys/webhook secret, and `CNAME staging-api` on `class10lms.in`.
