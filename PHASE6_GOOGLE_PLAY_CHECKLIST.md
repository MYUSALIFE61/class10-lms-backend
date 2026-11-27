# PHASE 6 — Google Play Store Release Readiness Checklist

**Publishing Status:** **NOT PUBLISHED** (Local AAB built and verified only; zero upload to Google Play Console)

---

## 1. Technical Android Build Configuration (Verified in Repo)

| Requirement | Current Configuration | Status |
|---|---|---|
| Package Name / `applicationId` | `in.class10lms.ssc` (`build.gradle`) | **COMPLETED AND TESTED** |
| `versionCode` / `versionName` | `1` / `"1.0.0"` (`build.gradle`) | **COMPLETED AND TESTED** |
| `minSdkVersion` / `targetSdkVersion` / `compileSdkVersion` | `24` / `35` / `36` (`variables.gradle` — meets Play API 35 mandate) | **COMPLETED AND TESTED** |
| Release Minification & Shrinking | `minifyEnabled true`, `shrinkResources true`, `debuggable false` | **COMPLETED AND TESTED** |
| AAB Release Bundle Generation | `app-release.aab` (`6,324,086` bytes) built cleanly via `:app:bundleRelease` | **COMPLETED AND TESTED** |
| Debug APK Generation | `app-debug.apk` (`10,060,856` bytes) built cleanly via `:app:assembleDebug` | **COMPLETED AND TESTED** |
| App Icons & Splash Screen | Adaptive mipmaps (`mdpi`–`xxxhdpi`) + `splash.xml` present | **COMPLETED AND TESTED** |
| Permissions | `INTERNET`, `ACCESS_NETWORK_STATE`, `DETECT_SCREEN_RECORDING` (minimal) | **COMPLETED AND TESTED** |
| Backup & Cleartext Policy | `allowBackup="false"`, `fullBackupContent="false"`, `usesCleartextTraffic="false"` | **COMPLETED AND TESTED** |
| Capacitor Embedded Web Assets Sync | `assets/public/` needs fresh `npm run build && npx cap sync android` with prod URL | **PARTIALLY IMPLEMENTED** |
| Production Upload Keystore (`keystore.properties`) | Gradle signing block ready; production `.jks` keystore must be generated securely offline | **BLOCKED** (Human action) |

---

## 2. Policy, Legal & Play Console Requirements (Human / Legal Review Required)

| Item | Action Required Before Play Store Submission | Status |
|---|---|---|
| **Google Play Payments Policy (CRITICAL LEGAL REVIEW)** | **FLAGGED:** Google Play's Payments Policy requires digital in-app subscriptions (like LMS course access sold inside an Android app) in India to either use **Google Play Billing** or enroll in Google Play's **User Choice Billing / Alternative Billing for India** program (which still requires Play Billing integration or official Play Console declaration & service fee reporting). Using standalone Razorpay inside a Play Store Android app without enrolling in Play's India Alternative Billing program risks **Play Store rejection**. Review with legal/Play Console team before submission. | **BLOCKED** (Policy review) |
| **Public Privacy Policy & Terms URLs** | Host `/legal/privacy` and `/legal/terms` at public HTTPS URLs for Play Console listing | **BLOCKED** (Human action) |
| **Account & Data Deletion URL** | Google Play mandates a public web URL where students can request account/data deletion outside the app | **BLOCKED** (Human action) |
| **Data Safety Declaration** | Declare collected data: Name, Email, Phone, School/District, Device ID, Razorpay Payment status, Learning Progress, Security Telemetry | **BLOCKED** (Human action) |
| **Video Content Rights** | Confirm 100% ownership of uploaded MP4 lectures; zero YouTube ripping/downloading | **COMPLETED AND TESTED** |
| **Reviewer Test Credentials** | Create a dedicated Play Review student account (with active subscription) + clear login instructions in Play Console | **BLOCKED** (Human action) |
| **Store Listing & Screenshots** | Prepare feature graphic (`1024×500`), phone screenshots (can reuse verified Phase 4 screens), and short/full descriptions | **PARTIALLY IMPLEMENTED** |
