# PHASE 5 — End-to-End LMS Integration & Secure Offline Video System Report

**Project:** Class 10 LMS Android & Web Application (`in.class10lms.ssc`, AP SSC & Telangana SSC)  
**Production Safety Confirmation:** Zero production changes were performed. Migrations `009` and `010` were NOT applied to live Supabase (`hxllgasepsxrpsonljct`); Render (`srv-dc41v1vf3r2c73a29agg`) was NOT redeployed; Razorpay remains in Test Mode only; Android release AAB was built locally and NOT uploaded to Google Play.

---

## 1. Initial Codebase Audit (Part 1)

All Android Kotlin sources, React frontend pages/components/services, Node.js/Express backend services/routes, Admin Portal pages, Supabase migrations `001`–`010`, Gradle/Manifest/ProGuard configs, and Phase 1–4 reports were inspected before making changes.

### Feature Status Matrix

| Feature Area | Status | Notes |
|---|---|---|
| Welcome, Registration, Username Uniqueness & Legal Screens | **COMPLETED AND TESTED** | Backend + Frontend Vitest + Edge screenshots verified |
| 3 Subscription Plans (₹200 / ₹500 / ₹799, Backend-Controlled) | **COMPLETED AND TESTED** | Legacy ₹499 preserved inactive for historical records |
| Razorpay Test Mode Checkout (UPI, Card, 3DS, Dual Verify, Webhook Idempotency) | **COMPLETED AND TESTED** | Live keys blocked when `RAZORPAY_MODE=test` |
| Student Login, JWT Refresh, Logout & Single-Device Restriction | **COMPLETED AND TESTED** | `MAX_DEVICES_PER_STUDENT=1` enforced |
| Student Dashboard, Subjects, Chapters (`display_order`), Lessons & Progress | **COMPLETED AND TESTED** | 12 multi-viewport screenshots, 0 console errors |
| 5-Tab Lesson Player (Video, Notes, Concepts, Revision, PYQs) | **COMPLETED AND TESTED** | Preserves Media3, `FLAG_SECURE`, watermark |
| Private Video Storage (`persistent_disk` & `supabase_storage`) | **COMPLETED AND TESTED** | Streaming upload, SHA-256, HTTP 206 Range resume |
| Cloudflare R2 Private Upload Integration | **PARTIALLY IMPLEMENTED** | Signed URL playback exists (`cloudflareR2Adapter.js`); S3/R2 upload in `commitPreparedFile` not yet implemented |
| Admin Portal MP4 Upload (Live Progress, MIME/Size Validation, SHA-256, Retry) | **COMPLETED AND TESTED** | Upgraded to XHR upload progress + retry; Admin Portal Vite build clean |
| Android AES-256-GCM 64 KB Chunked Vault + Keystore + `EncryptedOfflineDataSource` | **COMPLETED AND TESTED** | Verified via 32 Kotlin JUnit tests (`AuthenticatedChunkedCipherTest`, `OfflineIntegrationAndSecurityTest`) |
| Download → Pause → Resume → Cancel → Retry → Watch Now State Machine | **COMPLETED AND TESTED** | Added `PAUSED` state & `pauseDownload()` in Kotlin + React |
| Server-Signed Offline Subscription Authorization Lease (7-Day Cap + Clock-Rollback Guard) | **COMPLETED AND TESTED** | Added `signOfflineLease`, `POST /downloads/lease/refresh`, Keystore-backed lease check in `LmsMedia3PlayerActivity.kt` |
| Encrypted Offline Handwritten Notes (PDF Vault) | **PARTIALLY IMPLEMENTED** | Authenticated online PDF/image/markdown viewer + download works; encrypted app-private offline PDF vault not yet implemented |
| Physical Android Device Verification (Airplane Mode, File Manager, Gallery, External Player) | **IMPLEMENTED BUT NOT FULLY TESTED** | No physical Android device attached (`adb devices` empty); automated Kotlin unit tests + APK/AAB builds verified |
| Production Migrations `009` & `010` Applied to Live Supabase | **BLOCKED** | Intentionally withheld pending explicit user approval |
| Google Play Release Signing (`keystore.properties`) & Play Console Upload | **BLOCKED** | Requires production upload keystore + Play Console manual declarations |

---

## 2. Architecture Findings

- **Preserved Stack:** React + Vite + Capacitor 7 + Kotlin + AndroidX Media3 (`1.5.1`) + Node.js/Express + Supabase PostgreSQL.
- **Gaps Identified & Closed in Phase 5:**
  1. **Offline Subscription Lease Gap (Closed):** Previously, `LmsMedia3PlayerActivity.kt` verified encrypted file integrity but did not enforce a time-limited server-signed offline license. Phase 5 added HMAC-SHA256 server-signed offline leases (`OFFLINE_LEASE_DAYS=7`, capped at `subscription.expires_at`), `POST /api/v1/downloads/lease/refresh`, Keystore-backed `EncryptedSharedPreferences` lease persistence, and basic wall-clock rollback detection (`> 10 min` backward jump blocked).
  2. **Pause/Resume Gap (Closed):** `Class10OfflineDownloadPlugin.kt` previously only had `cancelDownload` (which deleted `.enc.part`). Phase 5 added `pauseDownload` that cleanly truncates `.enc.part` to the last full 64 KB GCM chunk boundary (`65,552` bytes), persists `STATUS_PAUSED`, and resumes via HTTP `Range: bytes=<offset>-`.
  3. **Admin MP4 Upload UX Gap (Closed):** `VideoLibraryPage.jsx` + `adminApi.js` previously used `fetch()` with no upload progress bar or client-side validation/retry. Phase 5 upgraded it to `XMLHttpRequest` with live `%` and MB progress, client-side MP4/size validation, and one-click Retry.

---

## 3. Storage Provider Assessment (Part 3)

| Provider | Actual Code State | Upload Limits & File Size | Download Performance | Cost | Security | Recommendation |
|---|---|---|---|---|---|---|
| **`persistent_disk`** | **Fully implemented** in `offlineStorageService.js` (`commitPreparedFile`, HTTP 200/206/416 streaming, delete) | Up to `OFFLINE_MAX_UPLOAD_MB` (default `1024 MB`) | Fast local disk I/O; zero external hop | Render Persistent Disk (low fixed monthly cost, $0 egress on Render) | App-private directory outside webroot; signed 30-min token | **Recommended for immediate Pilot / Launch** (zero new cloud accounts or adapters needed) |
| **`supabase_storage`** | **Fully implemented** in `offlineStorageService.js` (stream upload, 900s signed URL + HTTPS Range proxy) | Free tier 50 MB/file; Pro up to 50 GB with resumable TUS | Good, but double-hop proxied through Render | Free tier 5 GB egress; Pro 250 GB egress then $0.09/GB | Private bucket + service role key | Suitable only for small pilot; egress costs scale poorly for 120+ MB videos |
| **`cloudflare_r2`** | **Partially implemented** — `cloudflareR2Adapter.js` only signs playback URLs; `commitPreparedFile()` does **NOT** upload to R2 yet | S3 multipart up to 5 TB | Best global edge performance | $0.015/GB storage, **$0 egress** | Private bucket + signed Worker / presigned S3 URLs | **Recommended for Commercial Scale (>500 students)** once S3-compatible R2 upload (`@aws-sdk/client-s3`) is added in Phase 6 |

**Decision:** Keep `persistent_disk` (or `supabase_storage` for small pilot) for immediate staging/pilot with zero new credentials, and add S3-compatible `cloudflare_r2` upload in Phase 6 before scaling past 500+ concurrent video downloaders. **YouTube-to-MP4 ripping/downloading is strictly excluded** to maintain Google Play Store & YouTube ToS compliance.

---

## 4. Files Created

| File | Purpose |
|---|---|
| [phase5_e2e_integration.test.js](file:///d:/Downloads/Android%20apk%20file/backend/tests/phase5_e2e_integration.test.js) | Connected end-to-end backend test: Username check → Register → Unpaid blocks → 3 Plans (`₹200`/`₹500`/`₹799`) → Razorpay Test Checkout → Login → Dashboard → Admin MP4 Upload (SHA-256) → Signed Offline Lease → HTTP 206 Range stream → Lease refresh. |
| [phase5_e2e_journey.test.jsx](file:///d:/Downloads/Android%20apk%20file/frontend/src/test/phase5_e2e_journey.test.jsx) | Frontend test verifying `PAUSED` (`Resume` + `Cancel`) download states and expired offline lease blocking `Watch Now` playback. |
| [PHASE5_END_TO_END_INTEGRATION_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE5_END_TO_END_INTEGRATION_REPORT.md) | This complete Phase 5 audit, integration, security, build, migration, and Play Store readiness report. |

---

## 5. Files Modified

| File | Summary of Changes |
|---|---|
| [offlineDownloadService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/offlineDownloadService.js) | Added `signOfflineLease`, `verifyOfflineLease`, `refreshOfflineLease`, and embedded `offlineLease` inside `getDownloadManifest()`. |
| [offlineDownloads.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/offlineDownloads.routes.js) | Registered `POST /api/v1/downloads/lease/refresh`. |
| [OfflineVideoVault.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/OfflineVideoVault.kt) | Added `STATUS_PAUSED`, `offlineLeaseExpiresAtEpochMs`, Keystore-backed `saveStudentOfflineLease()`, and `checkOfflineLeaseValid()` with clock-rollback guard. |
| [Class10OfflineDownloadPlugin.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/Class10OfflineDownloadPlugin.kt) | Added `pauseDownload` (chunk-aligned `.enc.part` preservation) and `updateOfflineLease` Capacitor `@PluginMethod`s; persists offline lease on `startDownload`. |
| [LmsMedia3PlayerActivity.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/LmsMedia3PlayerActivity.kt) | Enforced `vault.checkOfflineLeaseValid()` prior to starting `EncryptedOfflineDataSource` offline playback. |
| [nativeBridge.js](file:///d:/Downloads/Android%20apk%20file/frontend/src/services/nativeBridge.js) | Added `pauseNativeOfflineDownload` and `updateNativeOfflineLease` bridge methods. |
| [lmsApi.js](file:///d:/Downloads/Android%20apk%20file/frontend/src/services/lmsApi.js) | Added `refreshOfflineLease()` API client call. |
| [offlineDownloadService.js](file:///d:/Downloads/Android%20apk%20file/frontend/src/services/offlineDownloadService.js) | Added `DOWNLOAD_STATES.PAUSED`, `pauseDownload()`, `refreshOfflineLease()`, and `isOfflineLeaseValid()`. |
| [VideoDownloadButton.jsx](file:///d:/Downloads/Android%20apk%20file/frontend/src/components/offline/VideoDownloadButton.jsx) | Added `Pause` button during `DOWNLOADING` and `PAUSED` state showing `Resume` + `Cancel`. |
| [LessonDetailsScreen.jsx](file:///d:/Downloads/Android%20apk%20file/frontend/src/components/offline/LessonDetailsScreen.jsx) | Wired `handlePauseDownload`, `onResume`, and pre-playback `isOfflineLeaseValid` enforcement. |
| [AuthContext.jsx](file:///d:/Downloads/Android%20apk%20file/frontend/src/context/AuthContext.jsx) | Automatically refreshes the server-signed offline lease on `bootstrap`, `login`, and browser/device `online` reconnect. |
| [adminApi.js](file:///d:/Downloads/Android%20apk%20file/admin-portal/src/services/adminApi.js) | Upgraded `uploadLessonOfflineMp4` to `XMLHttpRequest` with live upload progress callback. |
| [VideoLibraryPage.jsx](file:///d:/Downloads/Android%20apk%20file/admin-portal/src/pages/VideoLibraryPage.jsx) | Added client-side MP4 MIME/size validation, live `%` & MB progress bar, and Retry button on upload error. |

---

## 6. Database Changes

- **No new migration (`011`) was required in Phase 5.** All offline lease signing is stateless HMAC-SHA256 bound to existing `subscriptions.expires_at` and `user_devices.id`.
- Migrations `009_phase2_registration_and_plans.sql` and `010_phase4_learning_experience.sql` (and their rollback scripts) remain local-only and verified compatible with Migrations `001`–`008`.

---

## 7. API Changes

- **Added:** `POST /api/v1/downloads/lease/refresh` — Requires valid JWT + active device + active subscription; returns fresh HMAC-SHA256 signed `offlineLease` (`token`, `issuedAt`, `expiresAt`, `expiresAtEpochMs`, `subscriptionExpiresAt`, `leaseDays`). Returns `403 SUBSCRIPTION_REQUIRED` if unpaid/expired/revoked.
- **Enriched:** `GET /api/v1/downloads/:downloadId/manifest` — Now includes `offlineLease` alongside `streamUrl`, `sha256Checksum`, `fileSize`, `watermark`, and `videoSecurity`.

---

## 8. Payment Integration Findings (Part 7)

Verified across `phase3_razorpay_payments.test.js` (3 tests), `phase2_onboarding_and_plans.test.js` (3 tests), `phase5_e2e_integration.test.js` (1 connected E2E test), and `phase3_razorpay_payments.test.jsx` (4 frontend tests):
- `RAZORPAY_MODE=test` blocks live keys (`403 TEST_MODE_ONLY`).
- UPI, Card, 3DS checkout, forged signature rejection (`400`), gateway amount tampering rejection (`400`), pending authorization recovery, failed payment retry, duplicate webhook idempotency, and refund revocation all **PASSED**.
- Expired, pending, failed, and unpaid students are strictly blocked (`403`) from premium playback, offline downloads, and offline lease refresh.

---

## 9. Video Upload Results (Part 3)

- Backend binary streaming upload (`POST /api/v1/admin/lessons/:lessonId/offline-assets/upload`) verified in `phase12_offline_video_downloads.test.js` and `phase5_e2e_integration.test.js`:
  - Rejects spoofed non-MP4 files and oversized files (`413 PAYLOAD_TOO_LARGE`).
  - Streams to temp dir without heap buffering, computes SHA-256, commits to private storage, records metadata in `lesson_video_assets`, and writes admin audit log.
  - Admin Portal `VideoLibraryPage.jsx` now displays live upload `%`/MB progress and Retry on failure (Admin Portal Vite build verified clean).

---

## 10. Encrypted Download Results (Parts 4 & 5)

- `Class10OfflineDownloadPlugin.kt` streams in 64 KB chunks through `AuthenticatedChunkedCipher` (AES-256-GCM, 12-byte deterministic nonce per chunk, AAD bound to `lessonId|studentId|chunkIndex`) into `context.noBackupFilesDir/offline_lessons/<sha256(studentId)>/<lessonId>.enc.part`.
- Pre-flight `StatFs` storage check enforces `+100 MB` safety buffer.
- `pauseDownload()` truncates cleanly to full `65,552`-byte GCM chunk boundary and emits `PAUSED`; `startDownload()` resumes via `Range: bytes=<offset>-`.
- Full decrypted SHA-256 + per-chunk GCM tag verification executes BEFORE atomic `.enc.part` → `.enc` rename and BEFORE switching button to **Watch Now**.

---

## 11. Offline Playback Results (Part 5)

- `EncryptedOfflineDataSource.kt` decrypts 64 KB GCM chunks on-the-fly directly into AndroidX Media3 `ExoPlayer` with seek support (zero plaintext MP4 ever written to disk).
- `LmsMedia3PlayerActivity.kt` verifies file existence, encryption metadata, and `vault.checkOfflineLeaseValid()` before playback, preserving `FLAG_SECURE`, dynamic moving student watermark, and screen-recording/external-display blocking.

---

## 12. Offline Subscription Authorization Policy (Part 6)

| Scenario | Documented Policy & Implemented Behavior |
|---|---|
| **Lease Issuance** | Server mints HMAC-SHA256 signed `offlineLease` during `GET /downloads/:id/manifest` and `POST /downloads/lease/refresh`, stored in Android Keystore-backed `EncryptedSharedPreferences`. |
| **Lease Validity Window** | `min(now + 7 days, subscription.expires_at)` for paid lessons (configurable via `OFFLINE_LEASE_DAYS`; 30 days for free preview lessons). |
| **Lease Renewal** | Automatically refreshed via `POST /downloads/lease/refresh` on `login`, `bootstrap`, and device `online` reconnect while subscription is active. |
| **Subscription Expiry** | Lease expiry never exceeds `subscription.expires_at`; once elapsed (even offline), `LmsMedia3PlayerActivity` blocks playback with renewal prompt. Online lease refresh returns `403`. |
| **Logout** | Controlled by `OFFLINE_RETENTION_POLICY` (currently `wipe_on_logout` for maximum device privacy on shared family phones, wiping student `.enc` files + wrapped DEKs + lease keys cleanly; configurable to retain encrypted files requiring re-login). |
| **Device Change / Revocation** | Single-device policy (`MAX_DEVICES_PER_STUDENT=1`) revokes old device session; upon next online call, `onUnauthorizedSession` triggers `DEVICE_REVOKED` wipe of local encrypted downloads and lease. |
| **App Reinstall** | `allowBackup="false"` + `noBackupFilesDir` + Android Keystore MasterKey ensure reinstalled app starts clean; previously encrypted files cannot be restored or decrypted. |
| **Subscription Renewal** | Re-connecting online after renewal automatically fetches a new 7-day lease via `POST /downloads/lease/refresh` and unlocks existing valid downloads. |
| **Known Offline Revocation Limitation** | A device that stays 100% offline (Airplane Mode) cannot receive real-time admin/refund revocation until the current 7-day lease window expires or connectivity returns. Basic clock-rollback (`> 10 min` backward jump) is detected via `EncryptedSharedPreferences` monotonic clock watermark, though a rooted device with tampered OS time remains an inherent offline limitation. |

---

## 13. Android Security Results (Part 10)

| Check | Result | Verification Method |
|---|---|---|
| Encrypted files stored privately (`noBackupFilesDir/offline_lessons/`) | **PASS** | Code audit + `OfflineIntegrationAndSecurityTest.kt` |
| No plaintext MP4 written to shared storage / Gallery / MediaStore | **PASS** | `.nomedia` + `noBackupFilesDir` + `file_paths.xml` excludes vault |
| Cannot open in external media players (VLC/MX Player) | **PASS** | AES-256-GCM encrypted `.enc` chunks + no `FileProvider` exposure |
| Offline playback in Airplane Mode | **IMPLEMENTED (JUnit Verified)** | `EncryptedOfflineDataSource` + `OfflineIntegrationAndSecurityTest` (physical device test pending) |
| Unauthorized lessons blocked from download | **PASS** | `phase12_offline_video_downloads.test.js` + `phase5_e2e_integration.test.js` |
| Expired offline authorization rejected | **PASS** | `OfflineVideoVault.checkOfflineLeaseValid` + `phase5_e2e_journey.test.jsx` |
| Single-device restriction (`MAX_DEVICES_PER_STUDENT=1`) | **PASS** | `phase1.auth_devices.test.js` |
| `FLAG_SECURE` & Dynamic Watermark preserved | **PASS** | `LmsMedia3PlayerActivity.kt` + `ScreenCaptureProtectionManagerTest.kt` |
| Zero secrets in frontend bundle / APK assets | **PASS** | `SECRET_SCAN: CLEAN` on Vite production build |

---

## 14. Google Play Store Readiness Audit & Checklist (Part 11)

| Item | Current Value / Status | Ready? |
|---|---|---|
| `applicationId` | `in.class10lms.ssc` | Ready |
| `versionCode` / `versionName` | `1` / `"1.0.0"` | Ready |
| `minSdkVersion` / `compileSdkVersion` / `targetSdkVersion` | `24` / `36` / `35` (meets Google Play API 35 requirement) | Ready |
| `minifyEnabled` / `shrinkResources` / `debuggable` (release) | `true` / `true` / `false` (`proguard-rules.pro` verified with R8) | Ready |
| Permissions (`AndroidManifest.xml`) | `INTERNET`, `ACCESS_NETWORK_STATE`, `DETECT_SCREEN_RECORDING` (minimal; zero storage/media/camera permissions) | Ready |
| Network Security (`network_security_config.xml`) | `cleartextTrafficPermitted="false"`, system trust anchors | Ready |
| Backup Policy (`AndroidManifest.xml`) | `android:allowBackup="false"`, `android:fullBackupContent="false"` | Ready |
| AAB Release Build (`:app:bundleRelease`) | Built cleanly (`6.32 MB` `app-release.aab`) | Ready |
| Release Upload Keystore (`keystore.properties`) | Conditional Gradle signing configured; production keystore file NOT present in repo (security best practice) | **Action Required before upload** |
| Privacy Policy & Terms URLs | In-app `/legal/privacy` and `/legal/terms` exist; host public HTTPS URLs for Play Console listing | **Action Required before upload** |
| Account / Data Deletion URL & Play Data Safety Form | Must declare Razorpay payment metadata, student profile fields, and public account deletion request URL in Play Console | **Action Required before upload** |
| Play Integrity (`INTEGRITY_DISTRIBUTION_MODE`) | Currently `sideload`/`monitor` in `.env.example`; switch to `play_store` + configure `GOOGLE_CLOUD_PROJECT_NUMBER` & service account before enforcing | **Action Required before upload** |

---

## 15. Backend Test Results (Part 12)

- **Syntax Check (`npm run lint:syntax`):** Exit `0` (`src/server.js`, `src/app.js`).
- **Vitest Suite (`npx vitest run`):** **12 test files passed (12), 35 tests passed (35)** (including `phase5_e2e_integration.test.js`, `phase12_offline_video_downloads.test.js`, `phase3_razorpay_payments.test.js`, `phase4_learning_experience.test.js`, and 200-concurrent-student load benchmark `phase6.performance_load.test.js`: 400 concurrent API calls, 100% succeeded in `6930ms`).

---

## 16. Frontend Test Results (Part 12)

- **Vitest Suite (`npx vitest run --no-file-parallelism --testTimeout=15000`):** **9 test files passed (9), 33 tests passed (33)** (including `phase5_e2e_journey.test.jsx`, `phase4_learning_experience.test.jsx`, `phase12_offline_video_downloader.test.jsx`, `phase3_razorpay_payments.test.jsx`, `phase2_welcome_signup_plans.test.jsx`, `phase10_security_and_gamified_mcq.test.jsx`).

---

## 17. Android Test Results (Part 12)

- **Gradle Unit Tests (`.\gradlew.bat :app:testDebugUnitTest --rerun-tasks --no-daemon --max-workers=1`):** **`BUILD SUCCESSFUL`** (128 tasks executed; all 6 JUnit suites / **32 unit tests passed**, including `AuthenticatedChunkedCipherTest`, `OfflineCryptoEngineTest`, `OfflineIntegrationAndSecurityTest`, `LmsNavigationPolicyTest`, `ScreenCaptureProtectionManagerTest`, `ExampleUnitTest`).

---

## 18. Build Results (Part 12)

| Target | Command | Result | Output |
|---|---|---|---|
| **Backend Syntax** | `npm run lint:syntax` | **PASS** | Exit `0` |
| **Frontend Production** | `npx vite build --outDir dist-check` | **PASS** | `1,647` modules in `7.02s`; `SECRET_SCAN: CLEAN` |
| **Admin Portal Production** | `npx vite build --outDir dist-check` | **PASS** | `1,607` modules in `17.65s` |
| **Android Debug APK** | `.\gradlew.bat :app:assembleDebug` | **PASS** | `app-debug.apk` (`10,060,856` bytes) |
| **Android Release AAB** | `.\gradlew.bat :app:bundleRelease --no-daemon --max-workers=1` | **PASS** | `app-release.aab` (`6,324,086` bytes, R8 minified, NOT published) |

---

## 19. Physical-Device Testing Evidence (Part 10)

- **Honest Status:** `adb devices` returned **0 attached physical devices / emulators** on this workstation (`List of devices attached` empty).
- Therefore, **no live physical-device test was executed during Phase 5**. All Android cryptography, chunked AES-256-GCM encryption/decryption, navigation security, screen-capture protection, APK assembly, and R8 release AAB bundling were verified via automated Gradle JUnit tests and builds. Physical-device Airplane Mode + File Manager + Media3 verification should be executed after installing `app-debug.apk` on an Android test phone.

---

## 20. Screenshots (Complete Student Journey)

Verified headless Edge screenshots across Phases 2–4 (zero console errors):
- **Onboarding & 3 Plans (Phase 2):** [phase2_welcome.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase2_welcome.png), [phase2_signup.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase2_signup.png), [phase2_plans.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase2_plans.png), [phase2_legal_privacy.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase2_legal_privacy.png)
- **Razorpay Test Checkout & Result Screens (Phase 3):** [phase3_checkout.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase3_checkout.png), [phase3_failure.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase3_failure.png), [phase3_pending.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase3_pending.png), [phase3_success.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase3_success.png), [phase3_history.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase3_history.png)
- **Dashboard → Subjects → Chapters → Lessons → 5-Tab Player → Progress (Phase 4):** [phase4_dashboard_mobile390.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase4_dashboard_mobile390.png), [phase4_dashboard_desktop.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase4_dashboard_desktop.png), [phase4_subjects.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase4_subjects.png), [phase4_chapters.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase4_chapters.png), [phase4_lessons.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase4_lessons.png), [phase4_lesson_video.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase4_lesson_video.png), [phase4_notes.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase4_notes.png), [phase4_concepts.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase4_concepts.png), [phase4_revision.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase4_revision.png), [phase4_pyqs.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase4_pyqs.png), [phase4_progress.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase4_progress.png)

---

## 21. Missing Credentials or Configuration

- Production Android upload keystore (`frontend/android/keystore.properties` + `.jks` file).
- Production Render env vars (when ready for live launch): `RAZORPAY_MODE=live`, `RAZORPAY_KEY_ID` (`rzp_live_...`), `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `OFFLINE_VIDEO_STORAGE_PROVIDER`, `OFFLINE_VIDEO_STORAGE_DIR` (mounted persistent disk) or Cloudflare R2 S3 credentials, `OFFLINE_LEASE_DAYS=7`, `GOOGLE_CLOUD_PROJECT_NUMBER`, `GOOGLE_SERVICE_ACCOUNT_JSON`.

---

## 22. Known Limitations

1. **Offline PDF Notes Not Yet Encrypted:** `HandwrittenNotesViewer.jsx` uses authenticated `Bearer` fetches online; encrypted app-private offline PDF vault storage is deferred so the video vault stays isolated and unweakened.
2. **Cloudflare R2 Upload Adapter Pending:** `cloudflareR2Adapter.js` only signs playback URLs; R2 multipart upload (`@aws-sdk/client-s3`) is needed before switching `OFFLINE_VIDEO_STORAGE_PROVIDER=cloudflare_r2`.
3. **Capacitor `dist/` Sync Pending Production URL:** `frontend/android/app/src/main/assets/public/` should be re-synced via `npm run build && npx cap sync android` with the production Render API URL before generating the final signed Play Store AAB.
4. **Physical Android Device Verification:** Pending USB/ADB connection of a physical Android phone.

---

## 23. Production Migration Execution Checklist (Part 9 — NOT Applied)

Execute in exact order ONLY after taking a Supabase PITR/SQL backup:
1. **Pre-Check:** Confirm Migrations `001`–`008` exist and verify current `subscription_plans` rows (legacy `CLASS10_ANNUAL_499`).
2. **Apply Migration 009:** Run [009_phase2_registration_and_plans.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/009_phase2_registration_and_plans.sql).
   - Verify `CLASS10_MONTHLY_200` (₹200 / 30d), `CLASS10_HALFYEAR_500` (₹500 / 180d), `CLASS10_ANNUAL_799` (₹799 / 365d) are active, and `CLASS10_ANNUAL_499` is preserved with `is_active = false`.
   - Rollback ready: [009_phase2_registration_and_plans.rollback.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/009_phase2_registration_and_plans.rollback.sql).
3. **Apply Migration 010:** Run [010_phase4_learning_experience.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/010_phase4_learning_experience.sql).
   - Verify new columns on `lessons`, `student_lesson_progress`, `previous_exam_questions`, and new RLS-protected tables `lesson_concepts` & `lesson_revision_points`.
   - Rollback ready: [010_phase4_learning_experience.rollback.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql).
4. **Post-Check:** Run read-only smoke queries against `/health`, `/api/v1/subscriptions/plans`, and `/api/v1/student/home`.

---

## 24. Deployment Prerequisites

1. Approve and execute Migrations `009` and `010` on Supabase (`hxllgasepsxrpsonljct`).
2. Attach Render Persistent Disk (or configure Supabase Private Bucket / Cloudflare R2 upload) and deploy `backend/` to Render.
3. Run `npm run build && npx cap sync android` in `frontend/` pointing to the live Render HTTPS URL.
4. Connect a physical Android device (`adb devices`), install `app-debug.apk`, and complete the physical-device Airplane Mode / File Manager / Media3 security verification checklist.
5. Configure `keystore.properties`, public Privacy Policy / Terms / Data Deletion URLs, and Razorpay Live Mode only after staging sign-off.

---

## 25. Recommended Next Phase

- **Phase 6 — Production Cutover, Physical-Device Verification & Play Store Launch Prep:**
  1. Execute approved Migrations `009` & `010` on Supabase and deploy backend to Render.
  2. Perform physical Android device verification (Airplane Mode offline playback, File Manager invisibility, `FLAG_SECURE`, Razorpay UPI intent).
  3. Add optional Cloudflare R2 S3 multipart upload adapter and encrypted offline PDF notes vault if required before Play Store submission.

---

**PHASE 5 COMPLETE — Stopping here without deploying, publishing, applying production migrations, or enabling live payments. Awaiting your approval.**
