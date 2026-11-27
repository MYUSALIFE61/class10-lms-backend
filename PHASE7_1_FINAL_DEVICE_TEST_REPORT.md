# PHASE 7.1 — Final Physical Android Device Test Report

**Device Verified:** Physical **iQOO `I2223`** (`vivo` / Android 15 / API 35, `arm64-v8a`, WebView `157.0.8103.50`, `14 GB` free)  
**Test Environment:** Connected via USB ADB (`10BD750FUC0006P`) + `adb reverse tcp:4000 tcp:4000` to local staging backend (`http://localhost:4000/api/v1`) — **Production Supabase & Render 100% Untouched**.

---

## 1. Summary of Physical-Device Results vs. Untested Items

| Part | Test Area | Physical Result | Key Evidence / Notes |
|---|---|---|---|
| **1–2** | Device Detection & APK Badging | **PASSED** | `I2223` Android 15 (`arm64-v8a`), `app-debug.apk`, `APK_SECRET_SCAN_CLEAN=True` |
| **3** | APK Install & Cold Launch | **PASSED** | `Streamed Install: Success`, `TotalTime: 3646 ms`, fixed `env.js` dev-build loopback guard |
| **4** | Registration, Username & Email Auth, Logout | **PASSED** | Created `@iqoo.05847`; fixed `LoginPage.jsx` (`type="text"`) so username login works on Android WebView |
| **5** | Subscription Plans (₹200/₹500/₹799) & Razorpay Test Mode | **PASSED** | Fixed local simulator CORS; verified Fail → Pending → Success → History → Active Dashboard (`phase7_1_device_payment_success.png`); live external UPI app handoff (`NOT TESTED` offline/local) |
| **6** | Learning Experience (Dashboard → Subject → Chapter → 5 Tabs) | **PASSED** | Verified all 5 tabs (`phase7_1_device_pyqs.png`); noted minor CSS overlap in `LessonDetailsScreen` when `Watch Now` expands |
| **7** | Online Video Playback (`private_asset_stream`) | **PASSED** | `MEDIA3_READY offline=false durationMs=91040` on real `3.73 MB` Class 10 MP4 (hardware power-button lock cycle `NOT TESTED`) |
| **8** | Offline Download (`3.73 MB` + `163.8 MB` Pause/Resume/Cancel) | **PASSED** | Fixed Capacitor `PluginCall.getLong()` `Integer` bug (`readLongArg`); verified `3,733,976`-byte `.enc`, `14.15 MB` `.enc.part` Pause/Resume, Cancel cleanup, and `Watch Now` playback |
| **9** | Encrypted Private Storage & External Player Isolation | **PASSED** | Verified ciphertext bytes (`cc 1d d4 02...`), Tink `EncryptedSharedPreferences`, `CLEAN_NO_LMS_VIDEOS` in MediaStore/Gallery/sdcard, VLC blocked by Android sandbox (`E VLC: cannot open file`) |
| **10** | Real Airplane Mode & Offline License Lease Enforcement | **PASSED** | Cold launch in Airplane Mode → `MEDIA3_READY offline=true`; fixed `OfflineVideoVault.kt` `maxOf` lease precedence bug so expired lease blocks Media3; live `/lease/refresh` re-unlocks playback |
| **11** | `FLAG_SECURE` & Android Security | **PASSED** | `fl=... SECURE` verified on both Activities; `screencap -p` produced solid black frame (`phase7_1_flag_secure_screencap.png`); A15 physical Control-Center screen-record toggle `NOT TESTED` |
| **12** | Performance & Stability | **PASSED** | `193,240 KB` RSS/PSS total (`dumpsys meminfo`), `10%` CPU, **`ZERO_CRASHES`** |

---

## 2. Three Real Physical-Device Bugs Caught & Fixed During Phase 7.1

1. **`Class10OfflineDownloadPlugin.kt` & `Class10MediaPlayerPlugin.kt` (`PluginCall.getLong()` Bug):** Capacitor 7's `PluginCall.getLong()` returns `null` when JS numbers `< 2^31` arrive as `Integer` in JSONObject (`3,733,064` bytes became `0L`), breaking all `< 2 GB` downloads on real Android phones. Fixed with `readLongArg()`.
2. **`LoginPage.jsx` (`type="email"` HTML5 Block):** Blocked students from logging in with their newly registered `username` on Android WebView. Fixed by changing `#email` to `type="text"`.
3. **`OfflineVideoVault.kt` (`maxOf` Lease Precedence Bug):** Previously took `maxOf(recordLeaseExp, studentLeaseExp)` so updating/expiring a student lease did not revoke already-downloaded videos until their original download window elapsed. Fixed so `studentLeaseExp` governs when present, verified on live phone (`MEDIA3_READY` blocked on expired lease).
*(Plus local dev-only fixes in `frontend/src/config/env.js` for `vite build --mode development` and `backend/scripts/dev-preview-server.js` for `/dev-razorpay/simulate` CORS.)*

---

## 3. Complete List of Phase 7.1 Reports & Screenshots

1. [PHASE7_1_DEVICE_INFORMATION.md](file:///d:/Downloads/Android%20apk%20file/PHASE7_1_DEVICE_INFORMATION.md)
2. [PHASE7_1_APK_INSTALLATION_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE7_1_APK_INSTALLATION_REPORT.md)
3. [PHASE7_1_AUTHENTICATION_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE7_1_AUTHENTICATION_REPORT.md)
4. [PHASE7_1_PAYMENT_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE7_1_PAYMENT_REPORT.md)
5. [PHASE7_1_LEARNING_EXPERIENCE_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE7_1_LEARNING_EXPERIENCE_REPORT.md)
6. [PHASE7_1_VIDEO_PLAYBACK_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE7_1_VIDEO_PLAYBACK_REPORT.md)
7. [PHASE7_1_OFFLINE_DOWNLOAD_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE7_1_OFFLINE_DOWNLOAD_REPORT.md)
8. [PHASE7_1_OFFLINE_SECURITY_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE7_1_OFFLINE_SECURITY_REPORT.md)
9. [PHASE7_1_PERFORMANCE_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE7_1_PERFORMANCE_REPORT.md)
10. [PHASE7_1_FINAL_DEVICE_TEST_REPORT.md](file:///d:/Downloads/Android%20apk%20file/PHASE7_1_FINAL_DEVICE_TEST_REPORT.md)

**Real-Device Screenshots:** [welcome](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_welcome.png), [plans](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_plans.png), [checkout](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_checkout.png), [payment success](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_payment_success.png), [dashboard](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_dashboard.png), [lesson](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_lesson_before_download.png), [PYQs](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_pyqs.png), [Watch Now](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_watch_now.png), [My Downloads](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_my_downloads.png), [Airplane Mode offline](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_airplane_downloads.png), [`FLAG_SECURE` blacked-out screencap](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_flag_secure_screencap.png).

---

## 4. Remaining Blockers Before Production Cutover (Phase 8)

1. **Production DB Migrations `009` & `010`:** Intentionally NOT applied yet to live Supabase (`hxllgasepsxrpsonljct`).
2. **Hosted Backend & Persistent Storage Deployment:** Live Render deployment + persistent disk / R2 upload still pending approval.
3. **Production Upload Keystore & Play Store India Billing Review:** Must resolve Razorpay vs. Google Play User Choice / Alternative Billing compliance, host public Privacy/Terms/Account Deletion URLs, and fix the minor `.lesson-details-screen` CSS spacing observed in `phase7_1_device_watch_now.png`.

**STRICT STOP CONDITIONS HONORED** — Zero production deployments, zero live migrations, zero live payments, zero Play Store uploads. Awaiting your approval before beginning Phase 8.
