# Class 10 LMS — Local Android Video Storage Architecture & Audit Report

**Policy:** **LOCAL ANDROID VIDEO STORAGE ONLY** — Zero third-party cloud object storage (`Cloudflare R2`, `AWS S3`, `Supabase Storage`, `Firebase Storage` prohibited and removed from runtime configuration/adapters).  
**Report Date:** 2026-11-27  
**Environment:** Local audit & post-change build verified; production databases and hosted deployments untouched.

---

## 1. Architecture Summary & Code Changes Applied

Student offline lesson videos are downloaded from our own access-controlled backend server disk over HTTPS (HTTP `200`/`206` Byte-Range) and stored **exclusively inside Android app-private storage** encrypted with **AES-256-GCM** and **Android Keystore**-wrapped keys.

### Changes Applied in This Session

1. **Removed Cloud Object Storage Adapters & Configuration:**
   - Deleted [cloudflareR2Adapter.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/videoProviders/cloudflareR2Adapter.js).
   - Updated [env.js](file:///d:/Downloads/Android%20apk%20file/backend/src/config/env.js) and [.env.example](file:///d:/Downloads/Android%20apk%20file/backend/.env.example): removed `R2_CUSTOM_DOMAIN`, `R2_SIGNING_SECRET`, and `SUPABASE_OFFLINE_BUCKET`; restricted `VIDEO_STORAGE_PROVIDER` to `none | pikpak_local` and `OFFLINE_VIDEO_STORAGE_PROVIDER` to `persistent_disk | pikpak_local`; added `OFFLINE_LEASE_DAYS` (default `7`).
   - Updated [offlineStorageService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/offlineStorageService.js): removed all `cloudflare_r2`, `supabase_storage`, and `_proxyHttpsRangeStream` upload/delete/streaming paths; added explicit `CLOUD_STORAGE_DISABLED` (`410` / `500`) rejection for `cloudflare_r2`, `supabase_storage`, `aws_s3`, `s3`, and `firebase_storage`.
   - Updated [index.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/videoProviders/index.js) and [playbackService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/playbackService.js): explicitly block `cloudflare_r2`, `supabase_storage`, `aws_s3`, and `firebase_storage`, preserving private server streaming (`private_asset_stream` via `/api/v1/playback/stream/:streamToken` and `pikpak_local` / `private_stream`).
   - Updated [offlineDownloads.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/offlineDownloads.routes.js) (`registerExternalAssetSchema` restricted to `persistent_disk | pikpak_local`), [supabaseStore.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/supabaseStore.js), [videoSyncService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/videoSyncService.js), [dev-preview-server.js](file:///d:/Downloads/Android%20apk%20file/backend/scripts/dev-preview-server.js), and [LessonsPage.jsx](file:///d:/Downloads/Android%20apk%20file/admin-portal/src/pages/LessonsPage.jsx).
   - Updated [LMSVideoPlayer.jsx](file:///d:/Downloads/Android%20apk%20file/frontend/src/components/video/LMSVideoPlayer.jsx) and [phase4_video_player.test.jsx](file:///d:/Downloads/Android%20apk%20file/frontend/src/test/phase4_video_player.test.jsx) to replace `cloudflare_r2` with `private_asset_stream`.
   - Updated [phase7_video_sync_and_stream.test.js](file:///d:/Downloads/Android%20apk%20file/backend/tests/phase7_video_sync_and_stream.test.js) and [testHarness.js](file:///d:/Downloads/Android%20apk%20file/backend/tests/helpers/testHarness.js) with negative tests verifying `loadEnv()`, `createVideoProvider()`, and `OfflineStorageService` reject cloud object storage providers.
2. **Aligned Offline Subscription Lease Enforcement:**
   - Updated [offlineDownloadService.js](file:///d:/Downloads/Android%20apk%20file/frontend/src/services/offlineDownloadService.js) so `isOfflineLeaseValid()` prioritizes `studentExp` over `recExp` (matching Kotlin `OfflineVideoVault.kt`) and added `expireLocalOfflineLease()`, which immediately sets `leaseExpiresAtEpochMs = 1` when `refreshOfflineLease()` receives `403 SUBSCRIPTION_*`, `PAYMENT_UNVERIFIED`, or `DEVICE_REVOKED`.
   - Updated [AuthContext.jsx](file:///d:/Downloads/Android%20apk%20file/frontend/src/context/AuthContext.jsx) so `bootstrap()` and `login()` also call `expireLocalOfflineLease()` whenever the backend reports `!subscription.isActive`.

---

## 2. Exact Storage Directory & Filesystem Isolation

- **Root Directory (Android):** `context.noBackupFilesDir/offline_lessons/` (resolved in [OfflineVideoVault.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/OfflineVideoVault.kt#L162-L180))
- **Student Partitioning:** `<root>/<sha256(studentId).take(20)>/`
- **File Naming:**
  - In-progress / paused resumable ciphertext: `<sanitizedLessonId>.enc.part`
  - Verified completed ciphertext: `<sanitizedLessonId>.enc`
  - Scanner exclusion markers: `.nomedia` created inside both `offline_lessons/` and each student subdirectory
- **External / Backup / Provider Exclusion:**
  - Zero writes to `Downloads`, `Movies`, `DCIM`, `Pictures`, `MediaStore`, or external SD cards.
  - [AndroidManifest.xml](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/AndroidManifest.xml#L32-L42) sets `android:allowBackup="false"`, `android:fullBackupContent="false"`, and `android:usesCleartextTraffic="false"`.
  - [file_paths.xml](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/res/xml/file_paths.xml) limits `FileProvider` strictly to `my_images` (`external-path`) and `my_cache_images` (`cache-path`), never exposing `noBackupFilesDir`.
  - `OfflineVideoRecord.toPublicJsMap()` omits `wrappedDek`, `nonceBase64`, and raw filesystem paths from all Capacitor JS responses.

---

## 3. Encryption Implementation

- **Cipher:** Chunked **AES-256-GCM** (`CIPHER_FORMAT_V2_GCM = "v2_gcm"`) in [AuthenticatedChunkedCipher.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/AuthenticatedChunkedCipher.kt) (with legacy `v1_ctr` `CtrSeekCipher` retained in [OfflineCryptoEngine.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/OfflineCryptoEngine.kt) solely for reading older CTR downloads).
- **Framing & Parameters:**
  - Plaintext chunk size: `64 KB` (`65,536` bytes)
  - Per-chunk authentication tag: `16` bytes (`128` bits)
  - Physical chunk size: `65,552` bytes (trailing chunk: `remainingBytes + 16`)
  - Unique per-chunk 12-byte IV: `8`-byte `SecureRandom` per-video salt + `4`-byte big-endian `chunkIndex`
  - Additional Authenticated Data (AAD): UTF-8 `"c10v2|<lessonId>|<studentId>|<chunkIndex>"`, preventing chunk swapping, reordering, truncation, or cross-student substitution
- **Streaming Download & Verification ([Class10OfflineDownloadPlugin.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/Class10OfflineDownloadPlugin.kt)):**
  - Pre-flight `StatFs` capacity check requiring `remainingNeeded + 100 MB` (`STORAGE_SAFETY_BUFFER_BYTES`).
  - Downloads in 64 KB chunks over HTTPS directly into AES-256-GCM encryption in memory and writes `.enc.part` with `output.fd.sync()` — **zero plaintext MP4 or temporary unencrypted video files** are ever written to disk.
  - **Pause/Resume/Cancel:** Pause truncates `.enc.part` cleanly to the last complete `65,552`-byte boundary; Resume requests `Range: bytes=<resumeOffset>-` reusing the wrapped DEK and salt; Cancel deletes `.enc.part`, `.enc`, and metadata.
  - **Integrity Gate:** Decrypts chunks in memory to compute streaming SHA-256 and verify every 128-bit GCM tag before atomic rename `.enc.part` → `.enc` and transitioning to `DOWNLOADED`.

---

## 4. Key-Management Implementation

- **Master Key Protection ([AndroidKeystoreKeyWrapper](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/OfflineCryptoEngine.kt#L137-L184)):**
  - Generates and stores a non-exportable 256-bit `AES/GCM/NoPadding` key under alias `class10_lms_offline_video_master_v1` inside `AndroidKeyStore`.
- **Per-Video DEK Wrapping:**
  - Every lesson download receives a fresh `SecureRandom` 32-byte DEK (`generateDek()`) wrapped with the `AndroidKeyStore` master key (12-byte IV + ciphertext, Base64-encoded).
  - Plaintext DEK bytes exist only transiently in JVM memory and are zeroed in `finally` / `close()` blocks (`dek.fill(0)`).
- **Encrypted Metadata Store ([OfflineVideoVault.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/OfflineVideoVault.kt#L182-L193)):**
  - Stores wrapped DEKs, download records, offline leases, and clock rollback watermarks in Jetpack `EncryptedSharedPreferences` (`class10_lms_offline_vault_v1`) protected by `MasterKey.KeyScheme.AES256_GCM` with `AES256_SIV` key encryption and `AES256_GCM` value encryption.

---

## 5. Media3 Playback Path & Backend Streaming Source

- **Offline Playback ([LmsMedia3PlayerActivity.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/LmsMedia3PlayerActivity.kt) + [EncryptedOfflineDataSource.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/EncryptedOfflineDataSource.kt)):**
  - [MyDownloadsScreen.jsx](file:///d:/Downloads/Android%20apk%20file/frontend/src/pages/MyDownloadsScreen.jsx) and [VideoDownloadButton.jsx](file:///d:/Downloads/Android%20apk%20file/frontend/src/components/offline/VideoDownloadButton.jsx) invoke `InAppVideoPlayer` → `Class10MediaPlayerPlugin.playOfflineVideo()` → `LmsMedia3PlayerActivity`.
  - Media3 loads internal URI `lms-offline://<sanitizedLessonId>` through `DefaultMediaSourceFactory(EncryptedOfflineDataSource.Factory(...))`.
  - Reads perform `O(1)` random-access seeks via `AuthenticatedChunkedCipher.readPlaintextRange()`, decrypting and tag-verifying only the requested 64 KB chunks in RAM.
  - Enforces unconditional `WindowManager.LayoutParams.FLAG_SECURE`, Android 15 `ScreenCaptureProtectionManager`, `DisplayManager` external-display blocking, and moving student watermarks.
- **Online Streaming Source ([playbackService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/playbackService.js), [offlineStorageService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/offlineStorageService.js)):**
  - Online lesson playback streams exclusively from our own backend persistent server disk (`DEFAULT_PERSISTENT_OFFLINE_DIR = backend/storage/offline_videos`, configurable via `OFFLINE_VIDEO_STORAGE_DIR`) using HMAC-SHA256 signed URLs (`/api/v1/playback/stream/:streamToken` and `/api/v1/downloads/:downloadId/stream`) with HTTP `200`/`206`/`416` Byte-Range support. Third-party cloud object storage is completely removed.

---

## 6. Offline Subscription Enforcement & Retention Policy

- **Signed Leases:** Backend [OfflineDownloadService.signOfflineLease](file:///d:/Downloads/Android%20apk%20file/backend/src/services/offlineDownloadService.js#L112-L151) mints an HMAC-SHA256 lease (`OFFLINE_LEASE_DAYS = 7` default) capped at `subscriptionExpiresAt`.
- **Native Enforcement:** [OfflineVideoVault.checkOfflineLeaseValid](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/OfflineVideoVault.kt#L246-L281) rejects playback in `LmsMedia3PlayerActivity.onCreate()` before ExoPlayer initializes if `nowEpochMs > studentLeaseExp` or if a `> 10 minute` system-clock rollback is detected (`clock_<hash>` watermark).
- **Online Renewal & Expiry Revocation:** [AuthContext.jsx](file:///d:/Downloads/Android%20apk%20file/frontend/src/context/AuthContext.jsx) and [offlineDownloadService.js](file:///d:/Downloads/Android%20apk%20file/frontend/src/services/offlineDownloadService.js#L665-L716) renew leases online via `POST /api/v1/downloads/lease/refresh` when the subscription is active, and immediately revoke the local lease (`leaseExpiresAtEpochMs = 1`) if the subscription is expired/revoked.
- **Logout & Uninstall Policy:**
  - `OFFLINE_RETENTION_POLICY=wipe_on_logout`: Logout (`AuthContext.logout()`) calls `clearDownloadsOnLogout` → `Class10OfflineDownloadPlugin.clearStudentDownloads()` → `OfflineVideoVault.clearStudentDownloads(studentId)` to delete all `.enc`, `.enc.part`, `dl_*`, `lease_*`, and `clock_*` entries for that student.
  - App uninstall deletes app-private `noBackupFilesDir` and `EncryptedSharedPreferences`; `allowBackup="false"` and `fullBackupContent="false"` prevent cloud/ADB restoration across reinstalls.

---

## 7. Automated Test & Build Evidence (Verified Post-Change)

- **Backend Vitest:** `13 passed (13)` test files, `36 passed (36)` tests (`phase6_storage_and_playback_bridge.test.js` 105 MB persistent-disk streaming upload + SHA-256 check passed in `3237ms`; `phase7_video_sync_and_stream.test.js` confirmed `loadEnv`, `createVideoProvider`, and `OfflineStorageService` throw on `cloudflare_r2` / `supabase_storage`; `phase6.performance_load.test.js` 200-student benchmark passed in `6665ms`).
- **Frontend Vitest:** `9 passed (9)` test files, `33 passed (33)` tests (`npx vitest run --no-file-parallelism --testTimeout=20000`).
- **Admin Portal Build:** `npm run build` (`vite v6.4.6`) succeeded in `7.64s`.
- **Android Build & Unit Suite:** `npm run build:prod && npx cap sync android` (`Applied PRODUCTION (strict https/no-debugging) profile`) followed by `.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon --max-workers=2` → `BUILD SUCCESSFUL in 1m 16s`.

---

## 8. Physical Device Validation Status (iQOO Android 15) — PENDING RECONNECTION

When checked via `adb kill-server; adb start-server; adb devices -l` on 2026-11-27 (`12:33 IST`), **no physical Android device was attached** (`List of devices attached` was empty). Therefore, **fresh post-change validation on the physical iQOO Android 15 device has NOT run yet** for this build.

| # | Required Validation Item | Post-Change Status | Earlier Phase 7.1 Baseline (Pre-Change Build) |
|---|---|---|---|
| 1 | Download a lesson | **PENDING PHYSICAL RECONNECTION** | Passed on `I2223` (`3,733,064` B MP4 & `163.8 MB` Pause/Resume) |
| 2 | Inspect app-private storage & confirm encrypted content | **PENDING PHYSICAL RECONNECTION** | Verified `.enc` (`3,733,976` B, ciphertext `cc 1d d4 02...`) in `noBackupFilesDir/offline_lessons/` |
| 3 | Inspect File Manager and Gallery | **PENDING PHYSICAL RECONNECTION** | Verified `CLEAN_NO_LMS_VIDEOS` in MediaStore/Gallery |
| 4 | Confirm no plaintext video appears | **PENDING PHYSICAL RECONNECTION** | Verified ciphertext on disk + no `ftyp` header |
| 5 | Attempt to open downloaded content using VLC and MX Player | **PENDING PHYSICAL RECONNECTION** | VLC blocked (`E VLC: cannot open file ...`); **MX Player NOT yet tested on device** |
| 6 | Enable Airplane Mode | **PENDING PHYSICAL RECONNECTION** | Verified `airplane_mode_on = 1` cold launch |
| 7 | Play downloaded content inside the LMS | **PENDING PHYSICAL RECONNECTION** | Verified `MEDIA3_READY offline=true durationMs=91040` |
| 8 | Verify expired lease blocks playback | **PENDING PHYSICAL RECONNECTION** | Verified expired lease blocked `LmsMedia3PlayerActivity` |
| 9 | Verify valid renewed lease restores playback | **PENDING PHYSICAL RECONNECTION** | Verified live `/downloads/lease/refresh` restored playback |
| 10 | Verify uninstall/reinstall and logout behavior vs. retention policy | **PENDING PHYSICAL RECONNECTION** | Logout / uninstall retention verification **NOT yet executed on physical phone** |

---

## 9. Remaining Limitations

1. **Physical Device Re-Verification Needed:** All 10 items above — specifically including **MX Player rejection**, **uninstall/reinstall**, **logout wipe** on `I2223`, and our new `expireLocalOfflineLease()` revocation path — require reconnecting the iQOO Android 15 device over ADB.
2. **Backend Host Disk Sizing:** Because third-party cloud object storage is disabled, the hosted backend server (e.g., Render/VPS) **must** mount a non-ephemeral persistent disk (`OFFLINE_VIDEO_STORAGE_DIR`) sized to hold the master curriculum MP4 catalog.
3. **Production Environments Untouched:** No migrations (`009`/`010`), Render deploys, or live database modifications were executed.
