# PHASE 7.3 — Physical Device Verification Report (Local-Only Encrypted Video Storage)

**Test Date:** 2026-11-27 (`15:01–15:30 IST`)  
**Project Directory:** `D:\Downloads\Android apk file\`  
**Architecture Reference:** [LOCAL_ANDROID_VIDEO_STORAGE_ARCHITECTURE.md](file:///d:/Downloads/Android%20apk%20file/LOCAL_ANDROID_VIDEO_STORAGE_ARCHITECTURE.md)  
**Final Status Classification:** **PHASE 7.3 PASSED – READY FOR HOSTED STAGING**

---

## Executive Summary

All 10 physical-device verification tests passed on the connected **iQOO `I2223` (Android 15, API 35, `arm64-v8a`, Serial `10BD750FUC0006P`)**, alongside backend private persistent-disk integration, admin MP4 upload validation, bundle secret scans, and full automated regression suites. Student offline lesson downloads are confirmed to reside exclusively as **chunked AES-256-GCM ciphertext** inside `context.noBackupFilesDir/offline_lessons/`, hidden from Google Files/MediaStore/Gallery, rejected by both **VLC** and **MX Player**, playable offline in **Airplane Mode** inside Media3, strictly wiped on logout (`OFFLINE_RETENTION_POLICY=wipe_on_logout`), revoked/blocked upon lease expiry, and non-recoverable after uninstall/reinstall.

> **Environment Scope Note:** Because `staging-api.class10lms.in` DNS is not yet live, physical device validation ran over USB `adb reverse tcp:4000 tcp:4000` connected to the local persistent-disk backend (`dev-preview-server.js`), and the strict HTTPS Capacitor profile was restored (`npm run build:prod && npx cap sync android`) afterward. Production databases, Render, live Razorpay, and Google Play remain untouched.

---

## 1. Device Connection Proof

```text
adb kill-server; adb start-server; adb devices -l
List of devices attached
10BD750FUC0006P        device product:I2223i model:I2223 device:I2223 transport_id:1
```

---

## 2. Device Model and Android Version

- **Serial:** `10BD750FUC0006P` (state: `device`)
- **Model (`ro.product.model`):** `I2223` (`I2223i`)
- **Android Version (`ro.build.version.release` / `sdk`):** Android **`15`**, API Level **`35`**
- **CPU Architecture (`ro.product.cpu.abi`):** `arm64-v8a`
- **Available Storage (`df -h`):** `14G` free (`87%` used of `105G`)
- **System WebView:** `157.0.8103.50`
- **External Players Present on Phone:** `org.videolan.vlc` (**VLC**), `com.mxtech.videoplayer.ad` (**MX Player**)

---

## 3. APK Hash and Build Information

- **Application Package ID:** `in.class10lms.ssc` (`versionCode=1`, `versionName=1.0.0`, `minSdk=24`, `targetSdk=35`, `apkSigningVersion=2`)
- **USB-Staging APK Installed & Tested on `I2223` (`npm run build:dev && npx cap sync android && assembleDebug`):**
  - Path: [app-debug.apk](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/build/outputs/apk/debug/app-debug.apk)
  - Size: `10,120,278` bytes (`LastWriteTime`: `27-Nov-26 3:04:36 PM`)
  - SHA-256: `141076A5F558AAD1D6C36231FA9A9A23C3736ED899F2E3468F5541B1AC0F07BD`
- **Post-Test Restored Strict-HTTPS Staging APK (`npm run build:prod && npx cap sync android && assembleDebug`):**
  - Size: `10,120,278` bytes (`LastWriteTime`: `27-Nov-26 3:30:06 PM`)
  - SHA-256: `41B2749EC68498B4315C376E0942E7984B85295B3612DC1543CE5024BC815407`

---

## 4. Test 1 — Installation and Launch Results (**PASS**)

- **Window:** `2026-11-27 15:05:00–15:21:25 IST`
- **Upgrade Install (`adb install -r`):** `Performing Streamed Install` → `Success`; pre-existing offline vault data (`no_backup/offline_lessons/5095213d2427ad889990/d1a87c67-...enc`, `3,733,976` bytes) preserved intact.
- **Cold Launch (`am start -W`):** `Status: ok`, `LaunchState: COLD`, `TotalTime: 4120`, `WaitTime: 4128`, `pid=13805`.
- **Flow & Online Streaming Evidence:** Dedicated Student A (`paid@ap10.in`) logged in (`phase7_3_device_dashboard.png`), opened Subject (`Mathematics`) → Chapter (`Real Numbers`) → Lesson (`1.1 Euclid Division Lemma`), and authorized online private server stream (`provider: "private_asset_stream"`, `HTTP 206` `bytes 0-1023/3733064`, `MEDIA3_READY offline=false`), `logcat -b crash`: **`ZERO_CRASHES`**.
- **Screenshot:** [phase7_3_device_dashboard.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_3_device_dashboard.png)

---

## 5. Test 2 — Encrypted Storage Forensic Evidence (**PASS**)

- **Window:** `2026-11-27T09:51:25Z – 09:51:36Z` (`15:21:25–15:21:36 IST`)
- **App-Private Directory & Filesystem (`run-as in.class10lms.ssc`):**
  - Root: `no_backup/offline_lessons/` (`.nomedia` present, `drwx------`)
  - Hashed Student Dir: `no_backup/offline_lessons/2d92ed778bfcc0a79acd/` (`.nomedia` present)
  - Lesson 1 File: `3b47aac2-76d2-4883-8667-c66c4910ac2a.enc` = **`3,733,976` bytes** (`3,733,064` plaintext MP4 + `57 × 16 = 912` bytes of 128-bit GCM tags)
  - Plaintext `.mp4` count inside `no_backup/offline_lessons/`: **`NONE`**
  - Encrypted Metadata Vault: `shared_prefs/class10_lms_offline_vault_v1.xml` present (`EncryptedSharedPreferences`)
- **Encrypted File Header Inspection (`od -tx1 -N 32`):**
  ```text
  0000000 d8 19 9c d3 e8 f4 c3 e2 a4 47 1a bf 64 3b f2 16
  0000020 6e 8b f0 d3 ee 53 fb 04 fe 10 a8 58 e3 34 0e 1b
  ```
  `hasPlaintextFtyp: false` (no ISO MP4 `66 74 79 70` / `ftyp` header).
- **Screenshot:** [phase7_3_device_watch_now.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_3_device_watch_now.png)

---

## 6. File Manager and MediaStore Findings (**PASS**)

- **MediaStore Query (`content://media/external/video/media`):** **`CLEAN_NO_LMS_VIDEOS`**
- **Public Shared Storage (`find /sdcard/Download /sdcard/Movies /sdcard/DCIM /sdcard/Pictures`):** `0` matching LMS or `.enc` files (`CLEAN_PUBLIC_STORAGE`).
- **Google Files App (`com.google.android.apps.nbu.files`) Live UI Inspection:** `uiautomator dump` confirmed `filesAppExposesLmsEnc: false` (app-private `no_backup/offline_lessons` is completely invisible).

---

## 7. Test 3 — VLC Rejection Evidence (**PASS**)

- **Window:** `2026-11-27T09:51:36Z – 09:52:02Z` (`15:21:36–15:22:02 IST`)
- **Action 1 (Private Vault Path):** Launched `org.videolan.vlc` with `file:///data/user/0/in.class10lms.ssc/no_backup/offline_lessons/2d92ed778bfcc0a79acd/3b47aac2-76d2-4883-8667-c66c4910ac2a.enc` → blocked by Android app sandbox (VLC UI remained unplayed; `libvlc` logged `cannot open` / failed).
- **Action 2 (Raw `.enc` Ciphertext Probe):** Copied ciphertext bytes temporarily to `/sdcard/Download/p73_cipher_probe.enc` and opened in `org.videolan.vlc` → VLC could not demux/decode AES-256-GCM ciphertext (`libvlc demux: failed to read / cannot open`); temp probe file deleted immediately afterward.

---

## 8. Test 3 — MX Player Rejection Evidence (**PASS**)

- **Action 1 (Private Vault Path):** Launched `com.mxtech.videoplayer.ad/.ActivityScreen` against the internal `no_backup/offline_lessons/.../*.enc` path → blocked/unplayable.
- **Action 2 (Raw `.enc` Ciphertext Probe):** Launched `com.mxtech.videoplayer.ad/.ActivityScreen` against `/sdcard/Download/p73_cipher_probe.enc` → MX Player failed immediately and displayed blocking dialog **`"Can't play this file."`**:
  ```text
  11-27 15:21:53.000 26850 31377 E MediaPlayerNative: prepareAsync called in state 1, mPlayer(0x0)
  11-27 15:21:53.000 26850 26850 E MX.Player.Joint: [1] error: what=0 extra=0
  ... hasVideoTrack=false ... decodingSuccessful=false
  ```
- **JS Bridge Redaction:** `Class10OfflineDownload.listDownloads` returned `jsBridgeExposesDekOrPath: false` (zero `wrappedDek`, `nonceBase64`, or filesystem paths).
- **Screenshot:** [phase7_3_mxplayer_reject.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_3_mxplayer_reject.png)

---

## 9. Test 4 — Airplane Mode Offline Playback Evidence (**PASS**)

- **Window:** `2026-11-27T09:52:02Z – 09:52:45Z` (`15:22:02–15:22:45 IST`)
- **Procedure & Observed Results:**
  1. Enabled Airplane Mode (`settings get global airplane_mode_on` = **`1`**).
  2. Executed `am force-stop in.class10lms.ssc` and cold-relaunched `MainActivity`.
  3. Opened `My Downloads` offline (`Offline Mode` badge + banner, [phase7_3_airplane_downloads.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_3_airplane_downloads.png)).
  4. Tapped `Watch Now` → Media3 initialized from `lms-offline://` in-memory decryption:
     `11-27 15:22:14.994 I Class10Media3: MEDIA3_READY offline=true durationMs=91040`
  5. Triggered seek forward (`+10s` / `KEYCODE_MEDIA_FAST_FORWARD`) and exited player → `Resume 0:xx` saved & displayed in Downloads UI (`resumeSavedInDownloadsUi: true`).
  6. Plaintext `.mp4` check during/after offline playback: **`NONE`**.

---

## 10. Test 5 — Pause / Resume Evidence (**PASS**)

- **Window:** `2026-11-27T09:52:48Z – 09:53:02Z` (`15:22:48–15:23:02 IST`)
- **Test Asset:** `163.8 MB` (`163,865,185` bytes) Class 10 lecture (`Real Numbers Introduction - 1.1.mp4`) on Lesson `5ee9dab6-5f78-4c8a-80c4-474b34dc512b`.
- **Paused State Evidence:**
  - Partial file: `no_backup/offline_lessons/2d92ed778bfcc0a79acd/5ee9dab6-5f78-4c8a-80c4-474b34dc512b.enc.part` = **`18,354,560` bytes** (`280 × 65,552` bytes — exact GCM chunk alignment, `hasPlaintextFtyp: false`, unplayable externally).
- **Resumed & Completed Evidence:**
  - Resumed via UI `Resume` button (`Range: bytes=...`), completed SHA-256 + GCM verification (`resumedCompletedInLogcat: true`).
  - Final file: `5ee9dab6-5f78-4c8a-80c4-474b34dc512b.enc` = **`163,905,201` bytes** (`163,865,185 + 2,501 × 16` GCM tags).
  - Played completed Lesson 2 offline: `media3ReadyAfterResume: true` (`MEDIA3_READY offline=true`).

---

## 11. Test 6 — Cancellation and Retry Evidence (**PASS**)

- **Window:** `2026-11-27T09:53:02Z – 09:53:10Z` (`15:23:02–15:23:10 IST`)
- Deleted completed Lesson 2 copy → started download → clicked `Cancel` mid-transfer:
  - Partial `.enc.part` check: **`CLEAN_NO_PART`**
  - `Watch Now` visible after Cancel: **`false`** (UI reverted cleanly to `Download Video`)
- Tapped `Download Video` again → download retried to completion (`Watch Now` visible), partial check: **`CLEAN_NO_PART`**.

---

## 12. Test 7 — Logout and Account Isolation Evidence (**PASS**)

- **Window:** `2026-11-27T09:55:54Z – 09:56:00Z` (`15:25:54–15:26:00 IST`)
- **Verified Policy:** `OFFLINE_RETENTION_POLICY=wipe_on_logout` (unchanged).
- **Physical Evidence:**
  1. Student A (`b690aabf-2dd7-48cd-b4ef-b0919f4363cb`) held `no_backup/offline_lessons/2d92ed778bfcc0a79acd/3b47aac2-...enc`.
  2. Tapped **Logout** in Student A's `/profile` UI → `no_backup/offline_lessons/2d92ed778bfcc0a79acd/` was **wiped** (`WIPED_ON_LOGOUT`).
  3. Created & verified dedicated Student B (`CLASS10_ANNUAL_799`), logged in on `I2223` → `My Downloads` empty (`0` items).
  4. Student B downloaded Lesson 1 into a separate hashed namespace: `no_backup/offline_lessons/a88f312d45549716485e/3b47aac2-...enc` (`distinctStudentFolderCreated: true`).
  5. Forged/unregistered device check against `/api/v1/downloads/lease/refresh`: HTTP **`403`**.
  6. Cross-student ciphertext substitution (`c10v2|<lessonId>|<studentId>|<chunkIndex>` AAD binding) also verified in JUnit `OfflineIntegrationAndSecurityTest`.

---

## 13. Test 8 — Lease Expiry and Refresh Evidence (**PASS**; physical clock write **NOT TESTED** on non-rooted hardware)

- **Window:** `2026-11-27T09:56:00Z – 09:56:16Z` (`15:26:00–15:26:16 IST`)
- **Physical & API Observed Results:**
  1. Active Student B lease allowed offline Media3 playback (`activeLeasePlays: true`).
  2. Expired server account (`expired@ts10.in`) denied `POST /api/v1/downloads/lease/refresh` with HTTP **`403`** (`SUBSCRIPTION_EXPIRED`).
  3. Unpaid server account denied `POST /api/v1/downloads/lease/refresh` with HTTP **`403`**.
  4. Expired local lease on Student B blocked `LmsMedia3PlayerActivity` (`MEDIA3_READY` not fired, UI displayed `"Your offline viewing license has expired..."`, `expiredLeaseBlocksMedia3: true`).
  5. Online `POST /api/v1/downloads/lease/refresh` for active Student B returned HTTP **`200`** (`leaseDays: 7`) and restored offline Media3 playback (`renewedLeaseRestoresMedia3: true`).
  6. **Device Clock Rollback Note:** Live ADB `date` mutation on the unrooted retail Android 15 phone returned `date: cannot set date: Operation not permitted` (`NOT TESTED` at live OS shell level; monotonic `clock_<hash>` rollback check preserved in [OfflineVideoVault.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/OfflineVideoVault.kt#L251-L257)).

---

## 14. Test 9 — Uninstall / Reinstall Evidence (**PASS**)

- **Window:** `2026-11-27T09:56:16Z – 09:56:43Z` (`15:26:16–15:26:43 IST`)
- Recorded Student B download: `no_backup/offline_lessons/a88f312d45549716485e/3b47aac2-76d2-4883-8667-c66c4910ac2a.enc`.
- Executed `adb -s 10BD750FUC0006P uninstall in.class10lms.ssc` → `run-as` confirmed package data removed (`runAsAfterUninstallFails: true`), public storage clean.
- Reinstalled `app-debug.apk`, launched app, logged in as Student B:
  - `no_backup/offline_lessons/` contained only `.nomedia` files (`postReinstallEnc: "NONE"`).
  - `shared_prefs/class10_lms_offline_vault_v1.xml` contained **zero** old `dl_` keys (`oldDlKeysRestoredFromBackup: false`).
  - `Class10OfflineDownload.listDownloads` & UI showed **`0` items** (`"No Offline Lessons Saved Yet"`).

---

## 15. Test 10 — Screen Capture Protection Evidence (**PASS**)

- **Window:** `2026-11-27T09:56:14Z – 09:56:16Z` (`15:26:14–15:26:16 IST`)
- **`FLAG_SECURE` Window Inspection (`dumpsys window windows`):**
  - `LmsMedia3PlayerActivity`: `fl=LAYOUT_IN_SCREEN SECURE LAYOUT_INSET_DECOR SPLIT_TOUCH HARDWARE_ACCELERATED DRAWS_SYSTEM_BAR_BACKGROUNDS` (`media3WindowHasSecureFlag: true`)
  - `MainActivity`: `mainWindowHasSecureFlag: true`
- **Physical `screencap -p` Evidence:** Captured solid black frame while video played (`phase7_3_flag_secure_screencap.png`).
- **Android 15 Screen Recording Guard:** `ScreenCaptureProtectionManager` (`WindowManager.addScreenRecordingCallback` + `DisplayManager` external-display guard) active in `MainActivity` & `LmsMedia3PlayerActivity`; manual physical Control-Center toggle `NOT TESTED` in automated run (previously verified via JUnit `ScreenCaptureProtectionManagerTest`).
- **Logcat & JS Bridge Security:** `logcatLeaksSecretsOrUrls: false`, `jsBridgeExposesKeysOrPaths: false`.
- **Screenshot:** [phase7_3_flag_secure_screencap.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_3_flag_secure_screencap.png)

---

## 16. Backend Private Persistent-Disk Results (**PASS**)

- `persistent_disk` served authorized online playback (`provider: "private_asset_stream"`, `HTTP 206` `bytes 0-1023/3733064`), HTTP Range downloads (`3.73 MB` and `163.8 MB` pause/resume), entitlement gates (`403` unpaid/expired/forged device), 7-day signed offline lease refresh, and zero leaked backend physical paths (`backendPathLeakedInAuth: false`).

---

## 17. Admin Upload Results (**PASS**)

- Invalid non-MP4 header rejected on `/api/v1/admin/lessons/:lessonId/offline-assets/upload` with HTTP **`400`**.
- Valid MP4 uploads (`3,733,064` bytes, SHA-256 `610ef6dd9e3ec30de9d43181c7faeddd453856a012c7b8dcb06c5c4582f5a8b0` match `true`, and `163,865,185` bytes) persisted directly to `persistent_disk`.
- Admin Portal Vite bundle (`index-BVNLC7ww.js`, `335.52 kB`) built cleanly (`7.51s`); [VideoLibraryPage.jsx](file:///d:/Downloads/Android%20apk%20file/admin-portal/src/pages/VideoLibraryPage.jsx) and [adminApi.js](file:///d:/Downloads/Android%20apk%20file/admin-portal/src/services/adminApi.js) preserve MIME/size checks, progress bars, and Retry UI.

---

## 18. Automated Regression Results (Executed After Physical Tests, **PASS**)

| Target | Command | Observed Result |
|---|---|---|
| **Capacitor Prod Sync** | `npm run build:prod && npx cap sync android` (`https://staging-api.class10lms.in/api/v1`) | **PASS** (`Applied PRODUCTION profile`, `0.386s` sync) |
| **Backend Vitest** | `npx vitest run --no-file-parallelism --testTimeout=30000` *(TEMP/TMP on `D:`)* | **PASS** — `13 passed (13)` files, `36 passed (36)` tests (`35.98s`), including `105 MB` upload (`3784ms`), 200-student benchmark (`5313ms`), cloud-storage rejections |
| **Frontend Vitest** | `npx vitest run --no-file-parallelism --testTimeout=20000` | **PASS** — `9 passed (9)` files, `33 passed (33)` tests (`47.46s`) |
| **Admin Portal Build** | `npm run build` (`vite v6.4.6`) | **PASS** — `built in 7.51s` |
| **Android JUnit + APK** | `.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon --max-workers=2` | **PASS** — `BUILD SUCCESSFUL in 51s`; JUnit XMLs: `6` suites, `32` tests, `0` failures, `0` errors, `0` skipped |
| **Bundle Secret Scan** | `Select-String` across Android `assets/public/assets/*.js` & `admin-portal/dist/assets/*.js` | **PASS** — `SECRET_SCAN: CLEAN` |

---

## 19. Defects and Fixes

- **Application Code Defects Fixed in Phase 7.3:** None (`0` defects uncovered in LMS app/backend/Android code).
- *(Minor harness-only adjustments kept inside temporary scratch verification scripts in `.gemini/antigravity/brain/.../scratch/`: using `Device.getId().identifier`, `find` instead of unexpanded `run-as ls *`, and calling `/payments/verify` after `/dev-razorpay/simulate`.)*

---

## 20. Remaining Limitations

1. **Hosted Staging Environment:** Physical tests verified USB `adb reverse` connectivity against local `persistent_disk` preview server because `staging-api.class10lms.in` DNS and Render persistent disk (`OFFLINE_VIDEO_STORAGE_DIR`) are not yet provisioned.
2. **Unrooted Device Clock Mutation & Physical Control-Center Toggle:** Retail Android 15 blocked ADB `date` modification (`Operation not permitted`), and Android 15 physical Control-Center screen-record toggle remains automated via `ScreenCaptureProtectionManagerTest` rather than manual swipe during this run. App-private security does not claim protection against external cameras or rooted/compromised OS devices.
3. **Host `C:` Drive Disk Space (`0.12 GB` free):** `D:` temp dir is required when executing `>100 MB` temp upload tests.

---

## 21. Final Readiness Decision

**PHASE 7.3 PASSED – READY FOR HOSTED STAGING**

No production migrations (`009`/`010`), Render deploys, live Razorpay switches, Google Play submissions, or cloud object-storage configurations were executed. Ready for your approval to proceed to hosted staging.
