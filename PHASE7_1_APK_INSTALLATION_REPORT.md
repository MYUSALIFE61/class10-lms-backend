# PHASE 7.1 — APK Verification & Physical Installation Report

**Status:** **PASSED**  
**Target Device:** iQOO `I2223` (Android 15 / API 35, Serial `10BD750FUC0006P`)

---

## 1. Staging APK Metadata & Security Verification

| Check | Expected | Actual Observed Result | Status |
|---|---|---|---|
| **APK Path** | `frontend/android/app/build/outputs/apk/debug/app-debug.apk` | Present on disk (`9,937,101` bytes initial Phase 7 staging build; rebuilt after physical bugfixes) | **PASSED** |
| **Package / Application ID** | `in.class10lms.ssc` | `package: name='in.class10lms.ssc' versionCode='1' versionName='1.0.0'` (`aapt2 dump badging`) | **PASSED** |
| **SDK Levels & Compatibility** | `minSdk >= 24`, `targetSdk 35`, compatible with Android 15 (`arm64-v8a`) | `minSdkVersion: 24`, `targetSdkVersion: 35`, `compileSdkVersion: 36` | **PASSED** |
| **Embedded Staging URL** | Staging URL embedded in APK bundle | `STAGING_URL_IN: assets/public/assets/index-CBlt7GrF.js` (initial) and USB-staging URL for local ADB rehearsal | **PASSED** |
| **No Production Secrets Embedded** | Zero secrets in APK assets | `APK_SECRET_SCAN_CLEAN=True` (`0` hits for `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `rzp_live_`) | **PASSED** |
| **Permissions** | Minimal permissions only | `INTERNET`, `ACCESS_NETWORK_STATE`, `DETECT_SCREEN_RECORDING` | **PASSED** |

---

## 2. ADB Installation & Cold Launch Verification

- **Installation Output (`adb -s 10BD750FUC0006P install -r app-debug.apk`):** `Performing Streamed Install` → **`Success`**
- **Cold Launch Output (`adb shell am start -W -n in.class10lms.ssc/.MainActivity`):**
  - `LaunchState: COLD`
  - `Status: ok`
  - `TotalTime: 3646 ms` / `WaitTime: 3649 ms`
- **Process & Crash Check:** `pidof in.class10lms.ssc` active (`24794` initial, `29904` / `30959` across runs), zero `AndroidRuntime` fatal exceptions, `logcat -b crash` → `ZERO_CRASHES`.
- **Screenshots Captured:** [phase7_1_device_welcome.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_welcome.png) (plus [phase7_1_flag_secure_screencap.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_flag_secure_screencap.png) proving `FLAG_SECURE` blacked-out screencap).

---

## 3. Physical-Device Bug Fixed During Installation/Launch

- **Bug Found on Real Phone:** `vite build --mode development` sets `import.meta.env.PROD = true`, triggering the production-only loopback guard in [env.js](file:///d:/Downloads/Android%20apk%20file/frontend/src/config/env.js) (`Uncaught Error: [SECURITY ERROR] Production builds must NEVER use loopback/localhost API endpoints`).
- **Fix Applied:** Refined `IS_STRICT_PROD = Boolean(import.meta.env.PROD) && import.meta.env.MODE !== 'development'` in [env.js](file:///d:/Downloads/Android%20apk%20file/frontend/src/config/env.js) (keeping strict `vite build` production builds strictly HTTPS-locked). App booted cleanly immediately afterward.
