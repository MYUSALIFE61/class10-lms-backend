# PHASE 6 — Offline Video Security & Subscription Authorization Policy Report

**Status:**
- **Cryptographic Architecture & Automated Verification:** **COMPLETED AND TESTED**
- **Physical Storage / Gallery / VLC / MX Player Inspection on Real Hardware:** **BLOCKED** (Pending physical Android device)

---

## 1. Verified Encrypted Offline Video Architecture (Part C)

| Security Layer | Implementation Verified | Verification Method |
|---|---|---|
| **Encryption Cipher** | AES-256-GCM authenticated encryption in 64 KB (`65,536`-byte) plaintext chunks + 16-byte GCM auth tag (`65,552` bytes/chunk) in `AuthenticatedChunkedCipher.kt` | Automated Kotlin JUnit (`AuthenticatedChunkedCipherTest`) |
| **Per-Video DEK & AAD Binding** | Unique 256-bit random DEK + 8-byte random salt per video; per-chunk AAD bound to `lessonId|studentId|chunkIndex` | Automated Kotlin JUnit (`OfflineIntegrationAndSecurityTest`) |
| **Key Storage** | DEKs wrapped via Android Keystore MasterKey (`AES256_GCM`) and stored inside `EncryptedSharedPreferences` (`OfflineVideoVault.kt`) | Static code inspection + Kotlin JUnit |
| **App-Private Storage** | `context.noBackupFilesDir/offline_lessons/<sha256(studentId)>/<lessonId>.enc` + `.nomedia` sentinel | Static code inspection + `AndroidManifest.xml` (`allowBackup="false"`) |
| **FileProvider Exclusion** | `res/xml/file_paths.xml` only declares `external-path` and `cache-path`; `noBackupFilesDir` is NOT exposed | Static config verification |
| **Decryption Playback** | `EncryptedOfflineDataSource.kt` decrypts 64 KB chunks on-the-fly directly into AndroidX Media3 `ExoPlayer` (zero plaintext MP4 written to disk) | Automated Kotlin JUnit + static inspection |
| **Integrity Gate** | Full decrypted SHA-256 checksum + per-chunk GCM tag verified BEFORE `.enc.part` → `.enc` atomic rename | Automated Kotlin JUnit + Backend `PATCH /status` gate |
| **Screen Capture Protection** | Unconditional `FLAG_SECURE`, Android 15 `addScreenRecordingCallback`, secondary display guard, moving student watermark (`LmsMedia3PlayerActivity.kt`) | Automated Kotlin JUnit (`ScreenCaptureProtectionManagerTest`) |

---

## 2. Honest Security Limitations

- **Rooted / Compromised Devices:** On rooted devices or devices with Frida/Xposed hooking, application-level protections (`FLAG_SECURE`, Keystore software fallback, memory scraping) can be weakened or bypassed.
- **External Camera Recording:** Recording the physical screen with a second phone/camera cannot be prevented in software; dynamic student watermarking (`studentCode • masked phone/email`) serves as a forensic deterrent only.
- **Offline Revocation Window:** A device kept 100% offline cannot receive real-time server revocation until its 7-day lease expires or connectivity returns.

---

## 3. Offline Subscription Authorization Policy & Test Matrix (Part D)

| Scenario | Expected & Implemented Behavior | Verification Method | Status |
|---|---|---|---|
| Active subscription & valid lease | Offline playback allowed via `EncryptedOfflineDataSource` | Backend E2E + Frontend Vitest | **COMPLETED AND TESTED** |
| No valid lease / unpaid student | Download & lease refresh rejected (`403`) | `phase5_e2e_integration.test.js` | **COMPLETED AND TESTED** |
| Lease expired (`> 7 days` offline) | `checkOfflineLeaseValid()` & `isOfflineLeaseValid()` block playback with renewal prompt | `phase5_e2e_journey.test.jsx` + Kotlin code | **COMPLETED AND TESTED** |
| Subscription expires before 7-day lease | `effectiveExp = min(now + 7d, subscription.expires_at)` caps lease strictly at subscription expiry | `offlineDownloadService.js` (`signOfflineLease`) | **COMPLETED AND TESTED** |
| Internet reconnects | `AuthContext` `online` listener triggers `POST /downloads/lease/refresh` | `AuthContext.jsx` + Backend E2E | **COMPLETED AND TESTED** |
| Subscription renewed | Fresh 7-day HMAC-SHA256 lease issued on next online sync/login | `phase5_e2e_integration.test.js` | **COMPLETED AND TESTED** |
| Normal student logout | Configured via `OFFLINE_RETENTION_POLICY` (currently `wipe_on_logout` for shared family device privacy — wipes student `.enc` files + wrapped DEKs + lease; can be set to `keep_encrypted_require_reauth` if product policy prefers preserving files across logout) | `phase12_offline_video_downloader.test.jsx` + `AuthContext.jsx` | **COMPLETED AND TESTED** |
| Device clock moved backward (`> 10 min`) | `OfflineVideoVault.checkOfflineLeaseValid` detects rollback against monotonic `clock_<student>` watermark in `EncryptedSharedPreferences` and blocks playback | Static inspection (`OfflineVideoVault.kt`) | **IMPLEMENTED BUT NOT FULLY TESTED** |
| App data cleared / App reinstalled | `allowBackup="false"` + `noBackupFilesDir` + Keystore MasterKey wipe all vault files and keys; full reauthorization required | Static config verification | **IMPLEMENTED BUT NOT FULLY TESTED** |
| Device changed (`MAX_DEVICES_PER_STUDENT=1`) | Old device revoked; next online call fires `DEVICE_REVOKED` wipe of local vault | `phase1.auth_devices.test.js` + `AuthContext.jsx` | **COMPLETED AND TESTED** |
| Subscription revoked / account suspended online | Next online `/me` or `/lease/refresh` returns `401`/`403`; local session & vault revoked | `phase2.subscription_playback.test.js` + `AuthContext.jsx` | **COMPLETED AND TESTED** |

---

## 4. Handwritten Notes Offline Decision (Part G)

**Recommended V1 Decision: Option A — Authenticated Online-Only Notes for Version 1.**
- **Rationale:** `HandwrittenNotesViewer.jsx` already enforces JWT + active subscription gating online without exposing public storage URLs. Implementing a separate encrypted offline PDF vault in V1 would add WebView/native PDFium complexity and release risk without blocking the core offline video requirement.
- **V1 Scope Documentation:** Clearly disclose in app/store notes that video lessons support encrypted offline downloads, while Handwritten Notes PDFs require an active internet connection in V1. Encrypted offline PDF vault is scheduled for V2.
