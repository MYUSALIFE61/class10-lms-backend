# PHASE 11 — PHYSICAL ANDROID DEVICE SECURITY VALIDATION REPORT

**Last Updated:** `2026-11-24 01:15 +05:30`  
**Clean Production-Config APK:** `frontend/android/app/build/outputs/apk/debug/app-debug.apk`  
**APK Size:** `10,044,798 bytes` (~9.58 MB)  
**APK Build Timestamp:** `2026-11-24 01:12:29 +05:30` *(bundles production HTTPS API default `https://api.class10lms.in/api/v1`; 0 `localhost` URLs; 0 demo credentials)*  
**Evidence Files:**
- Physical Android 15 Logcat: `phase11-device-logcat.txt`
- Automated Test, Production Bundle Audit & APK Manifest Output: `docs/phase11-test-results.txt`
- Supplementary Android 14 Emulator Logcat *(non-physical)*: `docs/phase11-android14-logcat.txt`
- *(No `phase11-casting-logcat.txt` created because no physical Chromecast/Miracast/HDMI hardware was connected.)*

---

## 1. Executive Final Verification Matrix

| Test | Status | Evidence |
| --- | --- | --- |
| Android 15 recording protection | **PASS** | Physical `vivo I2223` (Android 15 / API 35): `ScreenRecordingCallbackController` `isVisibleInScreenRecording=true/false`, `phase11-device-logcat.txt`, native Kotlin overlay + Media3 pause + manual `Resume Lesson` verified |
| Android 15 screenshot protection | **PASS** | Physical `vivo I2223` (Android 15 / API 35): `fl=... SECURE ...` on `MainActivity` & `LmsMedia3PlayerActivity`; `screencap` verified **0 / 2,380** non-black viewport pixels |
| Android 14 `FLAG_SECURE` (Physical) | **BLOCKED** | No physical Android 14 (API 34) handset connected via ADB *(supplementary API 34 emulator verified `fl=... SECURE ...` on launch, app switch & landscape in `docs/phase11-android14-logcat.txt` — not counted as physical PASS)* |
| Android 14 callback compatibility (Physical) | **BLOCKED** | No physical Android 14 (API 34) handset connected via ADB *(verified via Kotlin JUnit `android14GracefullyEnforcesFlagSecureWithoutFalseRecordingWarning` + API 34 emulator Logcat `Android API 34 < 35: addScreenRecordingCallback unavailable; enforcing FLAG_SECURE + DisplayManager guard.`)* |
| Chromecast | **NOT TESTED** | No physical Chromecast hardware connected (`SecondaryDisplayClassifier` unit-tested in Kotlin JUnit) |
| Miracast | **NOT TESTED** | No physical Miracast / Wireless Display sink connected (`SecondaryDisplayClassifier` unit-tested in Kotlin JUnit) |
| HDMI / USB-C display | **NOT TESTED** | No physical HDMI / USB-C external monitor connected (`SecondaryDisplayClassifier` unit-tested in Kotlin JUnit) |
| Foldable false-positive guard | **PASS** | Automated unit verification in `ScreenCaptureProtectionManagerTest` (`Built-in Screen`, `Secondary Built-in Screen`, `Cover Screen`, `Outer Display`, `Inner Display`, `Sub Screen` -> `isUnsafe=false`, `reason=foldable_internal_display`) |
| Backend security telemetry | **PASS** | Physical `vivo I2223` live HTTP `201` events (`screen_recording_detected`, `screen_recording_stopped`, `playback_resumed_after_capture`) verified in `GET /api/v1/admin/security-events`, plus API 34 external-display telemetry & zero-secret leakage verified in `backend/tests/phase10_video_security.test.js` |
| Automated tests | **PASS** | **52 / 52 PASS** across Backend Vitest (**23/23**), Frontend Vitest (**14/14**), and Kotlin JUnit (**15/15**) — logged in `docs/phase11-test-results.txt` |

---

## 2. Connected Device Discovery & Classification

Executed via `adb devices -l` and `adb -s <SERIAL> shell getprop` on `2026-11-24 01:04 +05:30`:

| ADB Serial | Classification | Manufacturer | Model | Android Version | API Level | CPU ABI | Active Displays |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `10BD750FUC0006P` | **Physical Android 15 / API 35** | `vivo` | `I2223` (iQOO Z7s 5G) | `15` (Funtouch OS 15, patch `2026-04-01`) | `35` | `arm64-v8a` | `1` (`Built-in Screen`, `1080x2400`) |
| `emulator-5554` | **Emulator (Android 14 / API 34)** | `Google` | `sdk_gphone64_x86_64` | `14` | `34` | `x86_64` | `1` (`Built-in Screen`, `720x1280`) |
| *(none)* | **Physical Android 14 / API 34** | — | Not connected | — | — | — | — |
| *(none)* | **External Casting / Monitor Hardware** | — | Not connected | — | — | — | — |

---

## 3. Android 15 Physical Verification (`vivo I2223` — Preserved Evidence)

Tested live on physical **`vivo I2223` (iQOO Z7s 5G, Android 15 / API 35, serial `10BD750FUC0006P`)** using USB-debug APK (`10,044,815 bytes`, built `2026-11-24 00:48:12 +05:30`, connected over `adb reverse tcp:4000 tcp:4000`; `android.permission.DETECT_SCREEN_RECORDING: granted=true`):

| # | Scenario | Status | Physical-Device Evidence |
| --- | --- | --- | --- |
| 1 | Student login / authenticated session | **PASS** | Authenticated student session loaded live Home Dashboard (`6` subjects, live upcoming exam, live PikPak Continue Learning card); JWT Bearer accepted (`HTTP 201`) on telemetry & progress sync |
| 2 | Open an authorized lesson | **PASS** | Opened *AP SSC Class10 Statistics Assumed Mean Method* (`pikpak_local`); launched `LmsMedia3PlayerActivity` (`Displayed ... +502ms`) |
| 3 | PikPak video playback | **PASS** | `Class10Media3: MEDIA3_READY durationMs=457374` (7:37 MP4 streamed live; observed at `05:31 / 07:37` & resumed from `posMs=4517` -> `posSec=8`) |
| 4 | Built-in screen recording | **PASS** | Foreground `Record screen` blocked upfront by Funtouch OS 15 Toast (`FLAG_SECURE`); starting `VivoScreenRecorder` (`com.vivo.smartshot`, `TYPE_SCREEN_CAPTURE`) from Home and returning to `LmsMedia3PlayerActivity` exercised active capture |
| 5 | Native recording callback | **PASS** | `ScreenRecordingCallbackController`: `callback=android.os.BinderProxy@2bb409d uid=10255`, `isVisibleInScreenRecording=true`; Logcat: `Registered Android 15+ ScreenRecordingCallback (initialVisible=true)` |
| 6 | Immediate Media3 pause | **PASS** | `MEDIA3_PROTECTION_LOCKED isRecording=true isUnsafeDisplay=false canManualResume=false threat=SCREEN_RECORDING`; `controlsDeck=GONE`; playback frozen at `posMs=4517` |
| 7 | Native dark warning overlay | **PASS** | `screenProtectionOverlay=VISIBLE` (`0,0-1080,655`) showing `SCREEN RECORDING DETECTED!`, exact protection message, and `● Screen Recording Active — Playback Locked` |
| 8 | Resume unavailable during recording | **PASS** | `btnProtectionResume` verified `GF.D..C..` (**`GONE` & `DISABLED`**; `hasResumeButton=False`) |
| 9 | Stop screen recording | **PASS** | `Media Projection: null`; `isVisibleInScreenRecording=false`; Logcat: `Android 15 ScreenRecordingCallback fired: state=0 isVisible=false` |
| 10 | Active recording warning disappears | **PASS** | `badgeProtectionWarning` transitioned to `GONE`; heading switched to `Playback Paused` |
| 11 | Playback remains paused (no auto-resume) | **PASS** | `MEDIA3_PROTECTION_LOCKED isRecording=false ... canManualResume=true`; playback remained paused at `posMs=4517` until manual tap |
| 12 | Manual `Resume Lesson` restores playback | **PASS** | `btnProtectionResume` (`▶   Resume Lesson`) became `VISIBLE & ENABLED`; tap logged `MEDIA3_MANUAL_RESUME_CONFIRMED posMs=4517`, hid overlay (`GONE`), restored `controlsDeck` (`VISIBLE`), and resumed playback to `posSec=8` |
| 13 | Screenshot protection (`FLAG_SECURE`) | **PASS** | `fl=LAYOUT_IN_SCREEN SECURE ...` on both `MainActivity` and `LmsMedia3PlayerActivity`; `screencap` pixel audit measured **0 / 2,380** non-black viewport pixels (100% SurfaceFlinger blackout) |
| 14 | App switching and return | **PASS** | `HOME` -> Recent Apps returned directly to `LmsMedia3PlayerActivity` with `fl=... SECURE ...` intact and fresh `ScreenRecordingCallback` re-registration |
| 15 | Rotation / Fullscreen landscape & portrait | **PASS** | Landscape fullscreen (`0,0-2400,1080`) hid header & controls until video tap revealed `btnFsExit`; Back restored portrait (`0,176-1080,830`) with `fl=... SECURE ...` intact |
| 16 | Dynamic student watermark | **PASS** | Live student identity watermark (`txtWatermark=VISIBLE`) shifted across corners in portrait and remained visible in fullscreen landscape (`1956,33-2367,90`) |
| 17 | Backend security events & lesson progress | **PASS** | `GET /api/v1/admin/security-events` confirmed all 3 live events (`screen_recording_detected`, `screen_recording_stopped`, `playback_resumed_after_capture`) linked to student, lesson & `api=35` with zero sensitive secrets; lesson progress synced (`posSec=8 / durSec=457`) |

### Verbatim Physical Android 15 Logcat (`phase11-device-logcat.txt`)
```text
11-24 00:58:50.174 I/Class10ScreenProtect( 6707): Registered Android 15+ ScreenRecordingCallback (initialVisible=false)
11-24 00:58:51.317 I/Class10Media3( 6707): MEDIA3_READY durationMs=457374
11-24 00:59:07.539 I/Class10ScreenProtect( 6707): Registered Android 15+ ScreenRecordingCallback (initialVisible=true)
11-24 00:59:07.542 I/Class10Media3( 6707): MEDIA3_PROTECTION_LOCKED isRecording=true isUnsafeDisplay=false canManualResume=false threat=SCREEN_RECORDING
11-24 00:59:07.631 I/Class10SecurityReport( 6707): Reported security event [screen_recording_detected] -> HTTP 201
11-24 00:59:18.601 I/Class10ScreenProtect( 6707): Android 15 ScreenRecordingCallback fired: state=0 isVisible=false
11-24 00:59:18.605 I/Class10Media3( 6707): MEDIA3_PROTECTION_LOCKED isRecording=false isUnsafeDisplay=false canManualResume=true threat=NONE
11-24 00:59:18.625 I/Class10SecurityReport( 6707): Reported security event [screen_recording_stopped] -> HTTP 201
11-24 00:59:25.518 I/Class10Media3( 6707): MEDIA3_MANUAL_RESUME_CONFIRMED posMs=4517
11-24 00:59:25.531 I/Class10SecurityReport( 6707): Reported security event [playback_resumed_after_capture] -> HTTP 201
11-24 00:59:29.906 I/Class10ScreenProtect( 6707): Registered Android 15+ ScreenRecordingCallback (initialVisible=false)
```

---

## 4. Android 14 Physical Verification (`BLOCKED` — Supplementary Emulator Observations Only)

- **Physical Android 14 (API 34) Handset Status:** **BLOCKED** — No physical Android 14 device is connected via USB or Wireless ADB.
- **Supplementary Android 14 Emulator Observations (`emulator-5554`, API 34 — NOT counted as physical PASS; saved to `docs/phase11-android14-logcat.txt`):**
  - Clean production APK installed (`Performing Streamed Install -> Success`).
  - Logcat confirmed graceful unsupported-API handling with **zero crashes** and **zero false recording warnings**:
    ```text
    11-24 00:00:03.967 I/Class10ScreenProtect( 7278): Android API 34 < 35: addScreenRecordingCallback unavailable; enforcing FLAG_SECURE + DisplayManager guard.
    11-24 00:18:02.840 I/Class10ScreenProtect( 7561): Android API 34 < 35: addScreenRecordingCallback unavailable; enforcing FLAG_SECURE + DisplayManager guard.
    ```
  - Earlier Phase 10 warm emulator inspection also verified `fl=LAYOUT_IN_SCREEN SECURE ...` on launch, after `HOME` -> return, and across Portrait/Landscape rotation.
- **Still Required on Physical Android 14 Handset:** Install production/configured APK on a real Android 14 phone, verify student login, Media3 playback, watermark, physical screenshot denial toast, Recent Apps preview masking, built-in screen recorder producing a black video frame without crashing, and no false warning overlay.

---

## 5. Casting & External Display Security Audit & Verification

### Hardware Test Status
| Scenario | Physical Hardware Status | Automated Classifier / Engine Test Status |
| --- | --- | --- |
| Chromecast connection | **NOT TESTED** *(no Chromecast hardware connected)* | **PASS** (JUnit: `SecondaryDisplayClassifier`) |
| Miracast connection | **NOT TESTED** *(no Miracast TV/sink connected)* | **PASS** (JUnit: `SecondaryDisplayClassifier` + `ScreenProtectionEngine`) |
| Wireless Display / Wi-Fi Display | **NOT TESTED** *(no wireless display connected)* | **PASS** (JUnit: `SecondaryDisplayClassifier`) |
| HDMI external monitor | **NOT TESTED** *(no HDMI monitor connected)* | **PASS** (JUnit: `SecondaryDisplayClassifier` + API 34 test) |
| USB-C / DisplayPort monitor | **NOT TESTED** *(no USB-C monitor connected)* | **PASS** (JUnit: `SecondaryDisplayClassifier`) |
| Android Presentation display (`FLAG_PRESENTATION`) | **NOT TESTED** *(no external display connected)* | **PASS** (JUnit: `presentation_flag` classification) |
| Foldable internal display (`Built-in`, `Cover`, `Outer`, `Inner`, `Sub`) | **NOT TESTED** *(no foldable handset connected)* | **PASS** (JUnit: `foldable_internal_display` -> zero false positive) |
| Normal screen rotation & primary display | **PASS** *(verified on physical `vivo I2223`)* | **PASS** (JUnit: `default_display` -> zero false positive) |

### Security Audit Improvements Applied (`ScreenCaptureProtectionManager.kt`)
1. **Added `DisplayManager.DISPLAY_CATEGORY_PRESENTATION` Enumeration:** `evaluateActiveDisplays()` now inspects the union of `dm.displays` and `dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)` (deduplicated by `displayId`) so Android Presentation displays (Miracast, Wi-Fi Display, HDMI presentation routes) are never missed across OEM `DisplayManager` implementations.
2. **Hardened `SecondaryDisplayClassifier` with Structured `DisplayClassification(isUnsafe, reason)`:**
   - Expanded external/casting detection tokens to cover `chromecast`, `miracast`, `wireless`, `wifi display`, `wi-fi display`, `wfd`, `screen cast`, `smart mirroring`, `smart view`, `cast`, `virtual`, `overlay`, `hdmi`, `displayport`, `usb-c`, `external`, and `presentation`, plus `FLAG_PRESENTATION` and non-private secondary displays.
   - Expanded foldable/dual-screen internal panel guard (`built-in`, `cover screen`, `cover display`, `outer screen`, `outer display`, `inner screen`, `inner display`, `main screen`, `sub screen`) so foldable cover/inner panels never false-positive unless explicitly flagged as `FLAG_PRESENTATION` or an external/cast display.
   - Added non-PII diagnostic Logcat markers when an unsafe secondary/presentation display connects or disconnects.
3. **Protection Response Policy Preserved:** Detecting an unsafe external/presentation display immediately pauses Media3, hides playback controls, displays the native dark-navy warning overlay (`SCREEN SHARING DETECTED!`), disables **Resume Lesson** while connected, reports `screen_sharing_display_detected` / `screen_sharing_display_stopped` / `playback_resumed_after_capture` to the existing backend endpoint, and strictly requires manual tap on **Resume Lesson** after disconnection (never auto-resumes).

---

## 6. Automated Tests & Clean Production Build Verification (`docs/phase11-test-results.txt`)

| Suite / Check | Result | Details |
| --- | --- | --- |
| Backend Vitest (`backend/npm test`) | **PASS (23/23)** | 7/7 files pass, including new external-display API 34 telemetry & zero-secret-leakage test in `backend/tests/phase10_video_security.test.js` |
| Frontend Vitest (`frontend/npm test`) | **PASS (14/14)** | 4/4 files pass under strict zero-network `fetch` guard |
| Kotlin JUnit (`:app:testDebugUnitTest`) | **PASS (15/15)** | `ScreenCaptureProtectionManagerTest` (**8/8**), `LmsNavigationPolicyTest` (**6/6**), `ExampleUnitTest` (**1/1**) |
| Student Frontend Production Build (`frontend/npm run build`) | **PASS** | Verified `https://api.class10lms.in/api/v1` bundled; **0 `localhost` URLs**; **0 demo credentials** |
| Admin Portal Production Build (`admin-portal/npm run build`) | **PASS** | Clean Vite bundle; **0 `localhost` URLs**; **0 demo credentials** |
| Capacitor Sync (`npx cap sync android`) | **PASS** | 6 Capacitor plugins + clean production web bundle synced |
| Android APK Build (`:app:assembleDebug`) | **PASS** | `frontend/android/app/build/outputs/apk/debug/app-debug.apk` (**10,044,798 bytes**, `2026-11-24 01:12:29 +05:30`) |
| APK Manifest Permissions (`aapt2 dump permissions`) | **PASS** | Only `INTERNET`, `ACCESS_NETWORK_STATE`, `DETECT_SCREEN_RECORDING` (+ standard app dynamic receiver permission) — zero accessibility services or surveillance permissions |

---

## 7. Known Platform & OEM Limitations

1. **Android 14 and below (`API <= 34`):** Android does not provide `WindowManager.addScreenRecordingCallback()` below API 35. Protection relies on `FLAG_SECURE` (SurfaceFlinger blackout) + `DisplayManager` external-display monitoring; `detectionApiSupported` is honestly reported as `false`.
2. **Casting & third-party screen sharing protocol variance:** Android's public `DisplayManager` API reliably detects external monitors, HDMI/USB-C outputs, Miracast/Wi-Fi Display, and presentation virtual displays, while `FLAG_SECURE` blacks out non-secure virtual displays at SurfaceFlinger. However, OEM-specific casting stacks or cloud/cast protocols that do not expose a secondary `Display` entry cannot be detected universally through public APIs without invasive permissions (intentionally excluded).
3. **Remaining hardware sign-offs:** Physical **Android 14 (API 34)** handset testing and physical **Chromecast / Miracast / HDMI / USB-C** external display testing remain `BLOCKED` / `NOT TESTED` until that hardware is attached.
