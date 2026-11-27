# PHASE 6 — Initial Codebase Audit

**Project:** Class 10 LMS Android Application (`in.class10lms.ssc`)  
**Audit Date:** 2026-11-27  
**Verification Type:** Static Code Inspection + Automated Integration Verification  

---

## 1. Modules Inspected

- **Android (`frontend/android/app/src/main/java/in/class10lms/ssc/`):** `OfflineVideoVault.kt`, `AuthenticatedChunkedCipher.kt`, `EncryptedOfflineDataSource.kt`, `LmsMedia3PlayerActivity.kt`, `Class10OfflineDownloadPlugin.kt`, `OfflineCryptoEngine.kt`, `Class10SecurityPlugin.kt`, `LmsNavigationPolicy.kt`, `MainActivity.kt`, `AndroidManifest.xml`, `build.gradle`, `proguard-rules.pro`, `network_security_config.xml`, `file_paths.xml`.
- **Frontend (`frontend/src/`):** `AuthContext.jsx`, `WelcomePage.jsx`, `SignupPage.jsx`, `LoginPage.jsx`, `SubscriptionPage.jsx`, `CheckoutPage.jsx`, `PaymentResultPage.jsx`, `DashboardPage.jsx`, `CoursesPage.jsx`, `SubjectDetailPage.jsx`, `ChapterDetailPage.jsx`, `LessonPlayerPage.jsx`, `HandwrittenNotesViewer.jsx`, `LessonLearningTabs.jsx`, `VideoDownloadButton.jsx`, `LessonDetailsScreen.jsx`, `InAppVideoPlayer.jsx`, `MyDownloadsScreen.jsx`, `offlineDownloadService.js`, `nativeBridge.js`, `lmsApi.js`.
- **Backend (`backend/src/`):** `app.js`, `authService.js`, `auth.routes.js`, `paymentService.js`, `payments.routes.js`, `subscriptions.routes.js`, `studentDynamicService.js`, `student.routes.js`, `offlineDownloadService.js`, `offlineDownloads.routes.js`, `offlineStorageService.js`, `playbackService.js`, `supabaseStore.js`, `videoProviders/cloudflareR2Adapter.js`.
- **Admin Portal (`admin-portal/src/`):** `VideoLibraryPage.jsx`, `LessonsPage.jsx`, `adminApi.js`, `admin.routes.js`.
- **Database (`supabase/migrations/`):** `009_phase2_registration_and_plans.sql`, `010_phase4_learning_experience.sql`, and both rollback scripts.

---

## 2. Mismatches Found Between Layers

| # | Layer Mismatch | Root Cause Found | Resolution in Phase 6 |
|---|---|---|---|
| 1 | **Online Playback vs. Offline Asset Storage** (`PlaybackService` vs `OfflineDownloadService`) | `PlaybackService.authorizePlayback()` only queried `lesson_video_sources`. Lessons with an Admin-uploaded MP4 in `lesson_video_assets` (and no `lesson_video_sources` row) returned `404 VIDEO_UNAVAILABLE` for online streaming. | **FIXED LOCALLY:** Wired `offlineStorageService` into `PlaybackService` (`app.js`), added fallback to ready `lesson_video_assets` (`provider: 'private_asset_stream'`), and streamed via HMAC-signed `/api/v1/playback/stream/:token` with HTTP 206 Range support. Verified in `phase6_storage_and_playback_bridge.test.js`. |
| 2 | **Username Login Validation** (`SignupPage` vs `auth.routes.js` / `authService.js`) | Students register with a unique `username`, but `loginSchema` required `z.string().email()` and `authService.login()` did not resolve usernames to `profile.email`. | **FIXED LOCALLY:** Relaxed `loginSchema.email` to accept email or username (`3–150` chars) and added `getProfileByUsername()` lookup in `authService.login()`. Verified in `phase6_storage_and_playback_bridge.test.js`. |
| 3 | **Capacitor Embedded Web Assets Stale** (`frontend/android/app/src/main/assets/public/`) | Embedded APK assets (`index-10-4P5e1.js`) predate Phase 4–5 frontend edits (`index-D5nmZVdh.js`). | **FLAGGED FOR PRE-RELEASE SYNC:** Must run `npm run build && npx cap sync android` pointing to production Render URL before final signed AAB build. |
| 4 | **Cloudflare R2 Upload Gap** (`offlineStorageService.js` vs `cloudflareR2Adapter.js`) | `cloudflareR2Adapter.js` only signs playback URLs; `commitPreparedFile()` does not upload to R2. | **DOCUMENTED:** Recommended `persistent_disk` for V1 pilot; R2 S3 upload deferred to scale phase. |
| 5 | **Admin Portal Phase 4 Fields** (`LessonsPage.jsx` / `QuestionBankPage.jsx`) | Admin UI does not yet expose forms for `teacher_name`, `learning_objectives`, `lesson_concepts`, `lesson_revision_points`, or `previous_exam_questions.lesson_id`. | **DOCUMENTED:** Non-blocking for V1 core video/notes flow; scheduled for Admin Portal update. |

---

## 3. Pre-Edit Local Backups Created

Per Phase 6 Rule 14, backups were saved before modifying any local file:
- `scratch/phase6_backups/playbackService.js.bak`
- `scratch/phase6_backups/app.js.bak`
- `scratch/phase6_backups/authService.js.bak`
- `scratch/phase6_backups/auth.routes.js.bak`
