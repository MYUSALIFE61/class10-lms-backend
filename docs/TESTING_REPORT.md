# Testing & Verification Report

**Application:** Class 10 SSC LMS Android APK (`in.class10lms.ssc`, v1.0.0)  
**Target Environment:** AP & Telangana Class 10 SSC (1,000 students / 200 simultaneous active target)  
**Verification Date:** 2026-11-23  

> [!NOTE]
> Every test outcome below reflects **real executed commands** in this workspace. Tests requiring a connected physical Android device (`adb devices` currently has 0 attached devices) are explicitly marked **Pending On-Device Verification** rather than fabricated.

---

## 1. Automated Test Summary

| Test Suite | Runner | Test Files | Passed | Failed | Key Scenarios Verified |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Backend Auth, Devices & Security** | Vitest + Supertest (`backend/tests/phase1.auth_devices.test.js`) | 1 | 7 | 0 | Health check, student register/login, incorrect password (`401`), `MAX_DEVICES_PER_STUDENT=1` block & revoke-to-rebind, refresh-token rotation & reuse-attack revocation, logout invalidation, suspicious concurrent-login detection. |
| **Backend Subscriptions, Razorpay & Playback Gate** | Vitest + Supertest (`backend/tests/phase2.subscription_playback.test.js`) | 1 | 6 | 0 | Unpaid premium block (`403`), free preview allowed, catalog video ID non-leakage, Razorpay ₹499 order + forged signature rejection + valid HMAC-SHA256 activation, resume progress sync, server-side MCQ grading, expired subscription block (`403 SUBSCRIPTION_EXPIRED`), Razorpay refund webhook revocation (`403 SUBSCRIPTION_REVOKED`), invalid YouTube ID (`422`), missing video source (`404`), Play Integrity nonce + enforce mode blocking, `private_stream` signed token URL. |
| **Backend 200-Concurrent-Student Load Benchmark** | Vitest + Supertest (`backend/tests/phase6.performance_load.test.js`) | 1 | 1 | 0 | **200 simultaneous active paid students** executing 400 concurrent authenticated calls (`/curriculum/dashboard` + `/playback/authorize`): **100% succeeded (400/400) in 3,686 ms**. |
| **Frontend Learning Modules, `LMSVideoPlayer` & Auth Flows** | Vitest + Testing Library (`frontend/src/test/*.test.jsx`) | 3 | 9 | 0 | MCQ load/submit/grading, locked vs unlocked Notes/PYQs/Formulas, official YouTube IFrame API (`controls=1`), dynamic student watermark, speed (`1.5x`), seek, fullscreen + Android back-button exit, prev/next lesson, resume progress, invalid video ID rejection, YouTube error codes `100` & `150`, visibilitychange background pause, offline error recovery, `private_stream` mode, incorrect login error, login -> Dashboard -> Logout flow. |
| **Android WebView Navigation Protection** | Gradle JUnit 4 (`LmsNavigationPolicyTest.kt`) | 1 | 6 | 0 | Internal LMS HTTPS allowed; main-frame YouTube watch/shorts/channel/`youtu.be` blocked; subframe YouTube watch/`youtu.be`/redirect blocked; required YouTube embed/CDN/API subframes (`youtube.com/embed`, `youtube-nocookie.com/embed`, `googlevideo.com`, `ytimg.com`, `youtubei.googleapis.com`, Razorpay Checkout) allowed; `intent://`, `market://`, `vnd.youtube://`, `tel:`, `mailto:`, `javascript:`, `file://` blocked; external sites & spoofed hostnames (`notyoutube.com`, `app.class10lms.in.attacker.com`) blocked. |

**Total Automated Tests Executed:** **29 passed, 0 failed**.

---

## 2. Android APK Build & Signature Verification

| Artifact | Path | Size | Build Status | Signature & Badging Verification |
| :--- | :--- | :--- | :--- | :--- |
| **Debug APK** | `frontend/android/app/build/outputs/apk/debug/app-debug.apk` | `5,134,736 bytes` (**4.90 MB**) | `BUILD SUCCESSFUL` (258 tasks, 0 errors) | `apksigner verify`: **Verifies** (v2 scheme `true`, RSA 2048-bit). `aapt2 dump badging`: `in.class10lms.ssc`, `versionCode=1`, `versionName=1.0.0`, `minSdk=24`, `targetSdk=35`, `compileSdk=36`, label `Class 10 SSC LMS`. |
| **Signed Release APK** | Pending final browser sign-off & release build | — | Deferred per user request (*"check in the browser every functionality once its fine then rebuild"*) | Release keystore config (`signingConfigs.release` + R8 ProGuard) is configured in `app/build.gradle`; run `.\gradlew.bat assembleRelease` after browser QA sign-off and freeing space on `C:` drive. |

---

## 3. Feature & On-Device Verification Matrix

| Scenario | Automated Verification | Physical Android Device Status |
| :--- | :---: | :--- |
| Successful login & incorrect login | Passed (`phase1`, `phase6`) | Ready to verify once `backend/.env` is configured |
| Active / expired / unpaid / unauthorized lesson access | Passed (`phase2`) | Ready to verify on device |
| Device registration & revocation | Passed (`phase1`) | Ready to verify on device |
| Logout session invalidation | Passed (`phase1`, `phase6`) | Ready to verify on device |
| Official YouTube IFrame playback, speed, seek, resume | Passed (`phase4`) | Pending physical Android phone (`adb devices` = 0 attached) |
| YouTube logo / watch / `youtu.be` / `intent://` / popup blocking | Passed (`LmsNavigationPolicyTest` + `MainActivity.kt`) | Pending physical Android phone (`adb logcat -s Class10LMSWebView`) |
| Fullscreen playback, landscape rotation, captions & Android back button | Passed (JS unit + `MainActivity.kt` `onShowCustomView`/`OnBackPressedCallback`) | Pending physical Android phone |
| Network disconnection & invalid/unavailable video IDs | Passed (`phase2`, `phase4`) | Ready to verify on device |
| App background & foreground pause | Passed (`phase4`) | Pending physical Android phone |
| APK installation (`adb install -r app-debug.apk`) | APK verified via `apksigner` & `aapt2` | Pending physical Android phone connection |
