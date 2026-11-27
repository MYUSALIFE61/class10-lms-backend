# PHASE 6 — Physical Android Device Test Report

**Overall Physical-Device Status:** **BLOCKED** (No physical Android device or AVD emulator attached to this workstation)  
**Verification Date:** 2026-11-27  

---

## 1. Environment & ADB Detection Evidence

Executed command:
```powershell
adb version
adb devices -l
& "$env:ANDROID_HOME\emulator\emulator.exe" -list-avds
```

**Actual Observed Output:**
- **ADB Installed:** Yes — `Android Debug Bridge version 1.0.41` (`Version 37.0.0-14910828`, `C:\Users\USER1\AppData\Local\Android\Sdk\platform-tools\adb.exe`).
- **Attached Physical Devices:** `0` (`List of devices attached` empty).
- **Configured Emulators (AVDs):** `0` (empty output).
- **Debug APK Artifact Ready to Install:** `frontend/android/app/build/outputs/apk/debug/app-debug.apk` (`10,060,856` bytes).

---

## 2. How to Connect an Android Phone for Physical Validation

1. On the Android phone, open **Settings → About phone** and tap **Build number** 7 times to enable **Developer options**.
2. Open **Settings → System → Developer options** and enable **USB debugging**.
3. Connect the phone to this PC via a data-capable USB cable and tap **Allow USB debugging** on the phone's RSA fingerprint prompt.
4. Run `adb devices -l` on the PC and confirm the device shows status `device` (not `unauthorized`).
5. Install the freshly synced debug APK:
   ```powershell
   adb install -r "d:\Downloads\Android apk file\frontend\android\app\build\outputs\apk\debug\app-debug.apk"
   ```
6. Capture device metadata before testing:
   ```powershell
   adb shell getprop ro.product.model
   adb shell getprop ro.build.version.release
   adb shell df -h /data
   adb shell dumpsys package com.google.android.webview | Select-String "versionName"
   ```

---

## 3. Required 30-Case Physical-Device Test Checklist

| # | Test Case | Physical Device Status | Automated / Browser Coverage |
|---|---|---|---|
| 1 | Install Debug APK (`app-debug.apk`) | **BLOCKED** (No device) | APK built (`10.06 MB`) |
| 2 | Open Application (Splash → Welcome) | **BLOCKED** (No device) | Automated Vitest + Edge screenshot |
| 3 | Register New Student | **BLOCKED** (No device) | Automated Backend + Frontend + Edge |
| 4 | Login (Email & Username) | **BLOCKED** (No device) | Automated Backend + Frontend + Edge |
| 5 | Select Subscription Plan (₹200 / ₹500 / ₹799) | **BLOCKED** (No device) | Automated Backend + Frontend + Edge |
| 6 | Complete Razorpay TEST MODE Payment | **BLOCKED** (No device) | Automated Backend + Frontend + Edge |
| 7 | Verify Successful Payment | **BLOCKED** (No device) | Automated Backend + Frontend + Edge |
| 8 | Verify Thank You Screen | **BLOCKED** (No device) | Automated Frontend + Edge screenshot |
| 9 | Login After Successful Payment | **BLOCKED** (No device) | Automated Backend + Frontend + Edge |
| 10 | Open Student Dashboard | **BLOCKED** (No device) | Automated Frontend + Edge (`390×844` & `1280×800`) |
| 11 | Open Subject | **BLOCKED** (No device) | Automated Frontend + Edge |
| 12 | Open Chapter | **BLOCKED** (No device) | Automated Frontend + Edge |
| 13 | Open Lesson (5-Tab Player) | **BLOCKED** (No device) | Automated Frontend + Edge |
| 14 | Play Online Video | **BLOCKED** (No device) | Automated Backend Range stream + Vitest |
| 15 | Download Offline Video (AES-256-GCM) | **BLOCKED** (No device) | Automated Kotlin JUnit + Backend + Frontend |
| 16 | Pause Download | **BLOCKED** (No device) | Automated Frontend Vitest + Kotlin code verified |
| 17 | Resume Download (HTTP 206 Range) | **BLOCKED** (No device) | Automated Backend 206 + Kotlin chunk resume verified |
| 18 | Cancel Download | **BLOCKED** (No device) | Automated Frontend Vitest + Kotlin code verified |
| 19 | Retry Download | **BLOCKED** (No device) | Automated Frontend Vitest + Kotlin code verified |
| 20 | Open Downloaded Video (`Watch Now`) | **BLOCKED** (No device) | Automated Frontend Vitest + Kotlin Media3 DataSource |
| 21 | Play Downloaded Video | **BLOCKED** (No device) | Automated Kotlin `EncryptedOfflineDataSource` JUnit |
| 22 | Seek Forward & Backward | **BLOCKED** (No device) | Automated Kotlin `AuthenticatedChunkedCipherTest` seek tests |
| 23 | Lock & Unlock Phone | **BLOCKED** (No device) | Static inspection (`onStart`/`onResume` protection hooks) |
| 24 | Switch Applications | **BLOCKED** (No device) | Static inspection (`visibilitychange` + lifecycle) |
| 25 | Close & Reopen Application | **BLOCKED** (No device) | Automated `AuthContext` offline snapshot test |
| 26 | Verify Download & Playback States | **BLOCKED** (No device) | Automated `phase12` + `phase5` Vitest |
| 27 | Test Network Disconnection | **BLOCKED** (No device) | Automated Frontend offline tests |
| 28 | Test Airplane Mode | **BLOCKED** (No device) | Requires physical Android hardware |
| 29 | Test Expired Offline Authorization | **BLOCKED** (No device) | Automated Frontend + Kotlin `checkOfflineLeaseValid` |
| 30 | Test Subscription Renewal | **BLOCKED** (No device) | Automated Backend `/downloads/lease/refresh` |

*No physical-device result has been fabricated. All 30 cases remain `BLOCKED` until a physical Android phone is connected via USB debugging.*
