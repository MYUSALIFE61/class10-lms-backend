# PHASE 8.2 — FINAL GIT COMMIT SAFETY AUDIT & MANIFEST

**Project:** Class 10 SSC LMS (Android Capacitor + Kotlin Media3 + React + Node.js/Express + Supabase PostgreSQL)  
**Workspace:** `d:\Downloads\Android apk file`  
**Audit Date:** November 27, 2026 (16:07 IST)  
**Strict Audit Mode:** Zero commits, zero pushes, zero `git rm`, zero file deletions, zero production edits, zero cloud provisioning.

---

## 1. Git Verification Summary

| Metric | Value | Notes |
| :--- | :--- | :--- |
| **Current Branch** | `staging` | Local branch created safely without modifying `main` |
| **Current `HEAD` Commit** | `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579` | Zero new commits created yet |
| **`main` Branch Commit** | `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579` | **Untouched** |
| **`origin/main` Commit** | `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579` | **Untouched** |
| **Modified Files (`M`)** | **57** | All classified `INCLUDE` |
| **Deleted Files (`D`)** | **1** | `cloudflareR2Adapter.js` (`INCLUDE` — local-only policy) |
| **Untracked Files (`??`)** | **77** *(after creating this report)* | `63` `INCLUDE` + `14` test PDFs `EXCLUDE` |
| **Proposed Staging Commit File Count** | **121** *(or **122** with approved `.gitignore` update)* | `57 M + 1 D + 63 A` (excludes all `14` untracked PDFs; `18` already-tracked PDFs flagged `NEEDS APPROVAL`) |

---

## 2. PDF Upload Audit (`backend/uploads/resources/` — All 32 Files)

Every single one of the **32** PDFs on disk is an identical **47-byte synthetic empty PDF fixture** (`%PDF-1.4 1 0 obj <<>> endobj trailer <<>> %%EOF`) generated during automated test execution (`phase8_admin_portal_e2e.test.js`). None are real curriculum notes.

| # | Exact Filename | Size (Bytes) | Git Status | Content Assessment | Recommendation |
| :---: | :--- | :---: | :---: | :--- | :---: |
| 1 | `1795452909775_152d2db656f7_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** *(keep or separate `git rm --cached`)* |
| 2 | `1795453136451_fcfdb0609540_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 3 | `1795453710016_a483a68668bd_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 4 | `1795455750085_d2f3841ea3be_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 5 | `1795457960355_dd275c0dca3e_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 6 | `1795458031592_cd4003d3da6e_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 7 | `1795459296885_d1df4f38aeb0_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 8 | `1795462636825_0258c7023fb8_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 9 | `1795669941365_405c016ee667_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 10 | `1795670066230_df9bca79f5fe_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 11 | `1795673295352_44c7bb869f1f_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 12 | `1795679616599_7f256b5b542a_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 13 | `1795687462965_a41dc6cc5a5c_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 14 | `1795689022928_343d55897ba9_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 15 | `1795689895424_dd8365aefab1_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 16 | `1795691362735_476b669136c4_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 17 | `1795694214525_e8fcf9f9f0b0_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 18 | `1795703285318_1ffa55b5b7e5_real_numbers_notes.pdf` | 47 | Tracked (`main`) | Synthetic test fixture | **NEEDS APPROVAL** |
| 19 | `1795713824792_5e7229396e67_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 20 | `1795713889882_ded65904723b_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 21 | `1795748118847_1381dd8ffa0d_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 22 | `1795749359002_cf344faab785_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 23 | `1795751475067_d28e60adcb9a_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 24 | `1795751617806_74102f7f70c2_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 25 | `1795757086101_d455b21832ef_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 26 | `1795762700251_81394850ba06_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 27 | `1795762838828_276713c215b8_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 28 | `1795766043731_9d96a510d18b_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 29 | `1795773472325_d87f5d886db9_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 30 | `1795774510764_4d227641c255_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 31 | `1795774616009_ef8eac101382_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |
| 32 | `1795774810553_fc37fd7f5d7c_real_numbers_notes.pdf` | 47 | Untracked (`??`) | Synthetic test fixture | **EXCLUDE** |

*(Also note: [phase8_admin_portal_e2e.test.js](file:///d:/Downloads/Android%20apk%20file/backend/tests/phase8_admin_portal_e2e.test.js) still creates a test PDF in the default directory unless `RESOURCES_UPLOAD_DIR` is passed in test setup, which makes ignoring `backend/uploads/` in `.gitignore` mandatory.)*

---

## 3. `.gitignore` Review & Prepared Update

### 3.1 Existing Coverage vs Gap
[.gitignore](file:///d:/Downloads/Android%20apk%20file/.gitignore#L15-L33) currently ignores `dist/`, `build/`, `coverage/`, `backend/storage/`, `backend/tmp/`, `.gradle-home*`, `.android-home/`, `.tmp/`, `.tools/`, `frontend/android/app/build/`, `keystore.properties`, `*.keystore`, `*.jks`, `.env`, and `*.log` — **but lacks `backend/uploads/`**.

### 3.2 Prepared `.gitignore` Patch (Not Yet Applied)
```diff
--- a/.gitignore
+++ b/.gitignore
@@ -18,6 +18,7 @@ build/
 coverage/
 backend/storage/
 backend/tmp/
+backend/uploads/
 .gradle-home/
```

- **Untracked files excluded once added:** All **14** untracked 47-byte PDFs (`1795713824792_*` through `1795774810553_*`) plus any future local PDF uploads under `backend/uploads/`.
- **Already-tracked files remaining tracked:** The **18** PDFs (`1795452909775_*` through `1795703285318_*`) committed earlier on `main` (`ee720cf`) will **continue to stay tracked in Git** even after adding `backend/uploads/` to `.gitignore`.
- **Approval needed for tracked PDF cleanup:** Because `.gitignore` does not untrack already-committed paths, removing those 18 synthetic 47-byte PDFs from `staging` index requires your explicit approval to execute `git rm --cached backend/uploads/resources/179545*.pdf ...` on `staging` (leaving `main` untouched). **Per Phase 8.2 restrictions, `git rm` was NOT executed.**

---

## 4. Complete File-by-File Proposed Commit Manifest (`staging` Branch)

### 4.1 Backend Source Code (`20` Modified)
| File | Status | Classification | Notes |
| :--- | :---: | :---: | :--- |
| `backend/scripts/dev-preview-server.js` | `M` | **INCLUDE** | Local preview harness update |
| `backend/src/app.js` | `M` | **INCLUDE** | Wires `config` into `AdminCmsService` & offline storage |
| `backend/src/config/env.js` | `M` | **INCLUDE** | `RAZORPAY_MODE`, local-only storage rules, `RESOURCES_UPLOAD_DIR` |
| `backend/src/repositories/adminStoreExtension.js` | `M` | **INCLUDE** | `resolveResourcesUploadDir()` + traversal guards |
| `backend/src/repositories/supabaseStore.js` | `M` | **INCLUDE** | Phase 1–7.2 schema/query updates |
| `backend/src/routes/auth.routes.js` | `M` | **INCLUDE** | Username & registration enhancements |
| `backend/src/routes/offlineDownloads.routes.js` | `M` | **INCLUDE** | Offline download routes |
| `backend/src/routes/payments.routes.js` | `M` | **INCLUDE** | Razorpay order/verify/webhook routes |
| `backend/src/routes/student.routes.js` | `M` | **INCLUDE** | Learning tabs, recent lessons & sanitized `Content-Disposition` |
| `backend/src/routes/subscriptions.routes.js` | `M` | **INCLUDE** | Multi-plan subscription endpoints |
| `backend/src/services/adminCmsService.js` | `M` | **INCLUDE** | Config-routed persistent resource storage |
| `backend/src/services/authService.js` | `M` | **INCLUDE** | Auth & device binding updates |
| `backend/src/services/ffmpegProcessor.js` | `M` | **INCLUDE** | FFmpeg processor & temp sweep |
| `backend/src/services/offlineDownloadService.js` | `M` | **INCLUDE** | Signed lease & download service |
| `backend/src/services/offlineStorageService.js` | `M` | **INCLUDE** | Strict local-only allowlist & byte-range streaming |
| `backend/src/services/paymentService.js` | `M` | **INCLUDE** | Razorpay Test/Live mode & 3-plan pricing |
| `backend/src/services/playbackService.js` | `M` | **INCLUDE** | Asset-playback bridge & `last_accessed_at` progress sync |
| `backend/src/services/studentDynamicService.js` | `M` | **INCLUDE** | Concepts, revision, PYQs, notes, recent lessons |
| `backend/src/services/videoProviders/index.js` | `M` | **INCLUDE** | Removes R2 adapter export |
| `backend/src/services/videoSyncService.js` | `M` | **INCLUDE** | Video sync updates |

### 4.2 Deleted Cloud Storage Adapter (`1` Deleted)
| File | Status | Classification | Notes |
| :--- | :---: | :---: | :--- |
| `backend/src/services/videoProviders/cloudflareR2Adapter.js` | `D` | **INCLUDE** | Required deletion under Phase 7.2 local-only storage architecture |

### 4.3 Frontend Web Application (`28`: `20` Modified, `8` New)
| File | Status | Classification | Notes |
| :--- | :---: | :---: | :--- |
| `frontend/src/App.jsx` | `M` | **INCLUDE** | Routes & shell updates |
| `frontend/src/components/offline/InAppVideoPlayer.jsx` | `M` | **INCLUDE** | Player integration |
| `frontend/src/components/offline/LessonDetailsScreen.jsx` | `M` | **INCLUDE** | Offline UI updates |
| `frontend/src/components/offline/VideoDownloadButton.jsx` | `M` | **INCLUDE** | Download state controls |
| `frontend/src/components/video/LMSVideoPlayer.jsx` | `M` | **INCLUDE** | Video player updates |
| `frontend/src/config/env.js` | `M` | **INCLUDE** | `IS_STRICT_PROD` & HTTPS guard |
| `frontend/src/context/AuthContext.jsx` | `M` | **INCLUDE** | Auth context & session handling |
| `frontend/src/pages/ChapterDetailPage.jsx` | `M` | **INCLUDE** | Chapter view enhancements |
| `frontend/src/pages/CoursesPage.jsx` | `M` | **INCLUDE** | Subject/course view updates |
| `frontend/src/pages/DashboardPage.jsx` | `M` | **INCLUDE** | Student dashboard updates |
| `frontend/src/pages/LessonPlayerPage.jsx` | `M` | **INCLUDE** | 5-tab lesson experience |
| `frontend/src/pages/LoginPage.jsx` | `M` | **INCLUDE** | Username/email login |
| `frontend/src/pages/ProfileSettingsPage.jsx` | `M` | **INCLUDE** | Student settings & support UI |
| `frontend/src/pages/ProgressPage.jsx` | `M` | **INCLUDE** | Progress analytics UI |
| `frontend/src/pages/SubjectDetailPage.jsx` | `M` | **INCLUDE** | Subject chapter navigation |
| `frontend/src/pages/SubscriptionPage.jsx` | `M` | **INCLUDE** | 3-plan selection |
| `frontend/src/services/lmsApi.js` | `M` | **INCLUDE** | API client updates |
| `frontend/src/services/nativeBridge.js` | `M` | **INCLUDE** | Capacitor native bridge updates |
| `frontend/src/services/offlineDownloadService.js` | `M` | **INCLUDE** | Local vault download manager |
| `frontend/src/styles/app.css` | `M` | **INCLUDE** | UI styles |
| `frontend/src/components/learning/HandwrittenNotesViewer.jsx` | `??` | **INCLUDE** | New Notes PDF/markdown viewer |
| `frontend/src/components/learning/LessonLearningTabs.jsx` | `??` | **INCLUDE** | New Notes/Concepts/Revision/PYQs tabs |
| `frontend/src/pages/CheckoutPage.jsx` | `??` | **INCLUDE** | New Razorpay checkout page |
| `frontend/src/pages/LegalPage.jsx` | `??` | **INCLUDE** | New Terms & Privacy page |
| `frontend/src/pages/PaymentHistoryPage.jsx` | `??` | **INCLUDE** | New payment history screen |
| `frontend/src/pages/PaymentResultPage.jsx` | `??` | **INCLUDE** | New payment result screen |
| `frontend/src/pages/SignupPage.jsx` | `??` | **INCLUDE** | New full student registration screen |
| `frontend/src/pages/WelcomePage.jsx` | `??` | **INCLUDE** | New onboarding landing screen |

*(Exact totals across all sections: `20` backend non-test + `3` config/deps + `2` backend tests + `20` frontend non-test + `1` frontend test + `3` admin-portal + `8` Android = **`57` Modified**, `1` Deleted, `63` Included Untracked = **`121` Staging Commit Files**.)*

### 4.4 Admin Portal (`3` Modified)
| File | Status | Classification | Notes |
| :--- | :---: | :---: | :--- |
| `admin-portal/src/pages/LessonsPage.jsx` | `M` | **INCLUDE** | Teacher metadata & lesson editor updates |
| `admin-portal/src/pages/VideoLibraryPage.jsx` | `M` | **INCLUDE** | Video ingestion & persistent-disk upload UI |
| `admin-portal/src/services/adminApi.js` | `M` | **INCLUDE** | XHR progress MP4 upload (`VITE_API_BASE_URL`) |

### 4.5 Android Native Kotlin & Manifest (`8` Modified)
| File | Status | Classification | Notes |
| :--- | :---: | :---: | :--- |
| `frontend/android/app/src/main/AndroidManifest.xml` | `M` | **INCLUDE** | Cleartext disabled & Media3 player activity config |
| `frontend/android/app/src/main/java/in/class10lms/ssc/Class10MediaPlayerPlugin.kt` | `M` | **INCLUDE** | Media3 native player plugin |
| `frontend/android/app/src/main/java/in/class10lms/ssc/Class10OfflineDownloadPlugin.kt` | `M` | **INCLUDE** | Encrypted chunk download bridge |
| `frontend/android/app/src/main/java/in/class10lms/ssc/LmsMedia3PlayerActivity.kt` | `M` | **INCLUDE** | Protected playback + `FLAG_SECURE` + screen-recording block |
| `frontend/android/app/src/main/java/in/class10lms/ssc/LmsNavigationPolicy.kt` | `M` | **INCLUDE** | Strict in-app HTTPS navigation policy |
| `frontend/android/app/src/main/java/in/class10lms/ssc/MainActivity.kt` | `M` | **INCLUDE** | WebView/security init |
| `frontend/android/app/src/main/java/in/class10lms/ssc/OfflineVideoVault.kt` | `M` | **INCLUDE** | `context.noBackupFilesDir/offline_lessons/` AES-256-GCM vault |
| `frontend/android/app/src/test/java/in/class10lms/ssc/LmsNavigationPolicyTest.kt` | `M` | **INCLUDE** | Unit test updates |

### 4.6 SQL Migrations & Rollback Scripts (`4` Untracked)
| File | Status | Classification | Notes |
| :--- | :---: | :---: | :--- |
| `supabase/migrations/009_phase2_registration_and_plans.sql` | `??` | **INCLUDE** | Student registration columns & 3 plans |
| `supabase/migrations/010_phase4_learning_experience.sql` | `??` | **INCLUDE** | Remediated `public.lesson_progress` + Phase 4 tables & RLS |
| `supabase/migrations/rollbacks/009_phase2_registration_and_plans.rollback.sql` | `??` | **INCLUDE** | Reversible Migration `009` rollback |
| `supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql` | `??` | **INCLUDE** | Remediated `public.lesson_progress` rollback |

### 4.7 Automated Tests (`13`: `3` Modified, `10` New)
| File | Status | Classification | Notes |
| :--- | :---: | :---: | :--- |
| `backend/tests/helpers/testHarness.js` | `M` | **INCLUDE** | Updated test harness |
| `backend/tests/phase7_video_sync_and_stream.test.js` | `M` | **INCLUDE** | Local-only video sync tests |
| `backend/tests/phase2_onboarding_and_plans.test.js` | `??` | **INCLUDE** | Signup & plans suite |
| `backend/tests/phase3_razorpay_payments.test.js` | `??` | **INCLUDE** | Razorpay Test Mode suite |
| `backend/tests/phase4_learning_experience.test.js` | `??` | **INCLUDE** | Learning tabs suite |
| `backend/tests/phase5_e2e_integration.test.js` | `??` | **INCLUDE** | End-to-end journey suite |
| `backend/tests/phase6_storage_and_playback_bridge.test.js` | `??` | **INCLUDE** | 105 MB streaming upload/playback suite |
| `backend/tests/phase8_staging_remediation.test.js` | `??` | **INCLUDE** | PGlite `001`–`010` + rollbacks, `RESOURCES_UPLOAD_DIR` & cloud rejection tests |
| `frontend/src/test/phase4_video_player.test.jsx` | `M` | **INCLUDE** | Player tests |
| `frontend/src/test/phase2_welcome_signup_plans.test.jsx` | `??` | **INCLUDE** | Welcome & signup UI tests |
| `frontend/src/test/phase3_razorpay_payments.test.jsx` | `??` | **INCLUDE** | Payment checkout UI tests |
| `frontend/src/test/phase4_learning_experience.test.jsx` | `??` | **INCLUDE** | 5-tab UI tests |
| `frontend/src/test/phase5_e2e_journey.test.jsx` | `??` | **INCLUDE** | Offline lease UI tests |

### 4.8 Configuration & Dependency Changes (`3` Modified + `.gitignore` Proposed)
| File | Status | Classification | Notes |
| :--- | :---: | :---: | :--- |
| `backend/.env.example` | `M` | **INCLUDE** | Env template only (no secrets; includes `RESOURCES_UPLOAD_DIR=`) |
| `backend/package.json` | `M` | **INCLUDE** | Adds `@electric-sql/pglite` `devDependency` |
| `backend/package-lock.json` | `M` | **INCLUDE** | Deterministic lockfile for `@electric-sql/pglite` |
| `.gitignore` | Clean *(prepared)* | **NEEDS APPROVAL** | Apply `backend/uploads/` ignore line before `git add` |

### 4.9 Phase & Architecture Documentation (`41` Untracked)
| Files | Status | Classification | Notes |
| :--- | :---: | :---: | :--- |
| `LOCAL_ANDROID_VIDEO_STORAGE_ARCHITECTURE.md`, `PHASE1_MASTER_AUDIT_REPORT.md` through `PHASE8_VIDEO_INGESTION_REPORT.md`, `PHASE_7_3_PHYSICAL_DEVICE_VERIFICATION_REPORT.md`, `PHASE_8_HOSTED_STAGING_READINESS_REPORT.md`, `PHASE_8_REMEDIATION_REPORT.md`, `PHASE_8_FINAL_CODE_REVIEW.md`, `PHASE_8_1_STAGING_BRANCH_PREPARATION_REPORT.md`, `PHASE_8_2_FINAL_COMMIT_MANIFEST.md` (`41` files) | `??` | **INCLUDE** | Zero secrets; complete audit trail (note synthetic regex match note in `PHASE_8_1` describes dummy test token only) |

### 4.10 Non-Repo / Ignored Runtime Artifacts (Verified Excluded from Commit)
| Artifact Group | Location / Count | Status | Classification |
| :--- | :--- | :---: | :---: |
| **APK / AAB Builds** | `frontend/android/app/build/outputs/apk/debug/app-debug.apk` (`9,937,729` B), `frontend/android/app/build/outputs/bundle/release/app-release.aab` (`6,342,997` B), intermediate AABs, `pikpak-poc/.../app-debug.apk` (`6,800,948` B) | Ignored by `.gitignore` | **EXCLUDE** |
| **Local Offline Videos** | `36` MP4 files (`3.73 MB` / `163.86 MB`) in `backend/storage/offline_videos/` | Ignored by `.gitignore` | **EXCLUDE** |
| **Keystores & Signing Props** | `frontend/android/keystore.properties` (`127` B), `frontend/android/app/release-upload.jks` (`2,800` B), `.android-home/debug.keystore` (`2,618` B) | Ignored by `.gitignore` | **EXCLUDE** |
| **Logs & Temp Caches** | `.tmp/`, `.gradle-home*`, `.tools/`, `hs_err_pid13472.log`, `replay_pid13472.log`, `frontend/android/.kotlin/errors/*.log` | Ignored by `.gitignore` | **EXCLUDE** |

---

## 5. Security & Production Configuration Audit

- **API Keys, JWT Secrets, Supabase Prod Keys & Razorpay Live Credentials:** Zero live keys, zero `SUPABASE_SERVICE_ROLE_KEY`, zero `rnd_*` Render keys, zero `AKIA*` AWS keys, zero `AIza*` Google keys, zero `.pem`/`.key`/`.p12`/`.pfx` private certificates, zero database dumps (`.db`/`.sqlite`/`.dump`), and zero real `.env` files exist anywhere in tracked or untracked commit candidates.
- **Regex Scan Exception Confirmed Harmless:** Only `backend/tests/phase3_razorpay_payments.test.js:143` contains the hardcoded synthetic test fixture string `"rzp_live_accidental..."` (and `PHASE_8_1_STAGING_BRANCH_PREPARATION_REPORT.md:105` references it) used exclusively to test live-key blocking in `RAZORPAY_MODE=test`.
- **Production Configuration Unchanged:**
  - `main` & `origin/main` remain pinned at `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579`.
  - [frontend/capacitor.config.json](file:///d:/Downloads/Android%20apk%20file/frontend/capacitor.config.json) has zero diff; [frontend/src/config/env.js](file:///d:/Downloads/Android%20apk%20file/frontend/src/config/env.js) preserves `DEFAULT_PROD_API_BASE_URL = 'https://api.class10lms.in/api/v1'`.
  - Production Render (`srv-dc41v1vf3r2c73a29agg`), production Supabase (`hxllgasepsxrpsonljct`), and live Razorpay remain untouched.

---

## 6. Unresolved Decisions & Exact Approvals Needed

Before executing `git add` / `git commit` on `staging`, please confirm:
1. **`.gitignore` Update (`NEEDS APPROVAL`):** Approve adding `backend/uploads/` to `.gitignore` so the `14` untracked test PDFs (and future test runs) are excluded automatically.
2. **18 Already-Tracked Test PDFs (`NEEDS APPROVAL`):** Approve whether to run `git rm --cached backend/uploads/resources/*.pdf` on branch `staging` (removing the 18 legacy 47-byte synthetic PDFs from `staging` index without deleting local files or touching `main`), OR leave those 18 tracked files as-is on `staging`.
3. **Commit & Push to `origin/staging` (`NEEDS APPROVAL`):** Approve committing the manifest (`121` files + `.gitignore`) onto local branch `staging` and pushing `origin/staging` (leaving `main` unchanged).
