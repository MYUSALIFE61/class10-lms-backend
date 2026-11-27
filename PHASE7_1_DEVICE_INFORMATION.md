# PHASE 7.1 — Physical Android Device Information Report

**Status:** **PASSED** (Physical device detected, authorized, and verified over USB ADB)  
**Test Date:** 2026-11-27

---

## 1. ADB Detection & Hardware Telemetry

- **ADB Version:** `Android Debug Bridge version 1.0.41` (`Version 37.0.0-14910828`, `C:\Users\USER1\AppData\Local\Android\Sdk\platform-tools\adb.exe`)
- **ADB Device Listing (`adb devices -l`):** `10BD750FUC0006P        device product:I2223i model:I2223 device:I2223 transport_id:1`

| Property | Observed Device Value |
|---|---|
| **Device Serial** | `10BD750FUC0006P` |
| **Manufacturer / Brand** | `vivo` / `iQOO` |
| **Model** | `I2223` (`I2223i`) |
| **Android Version / API Level** | **Android 15** (**SDK / API 35**) |
| **Security Patch Level** | `2026-04-01` |
| **CPU Architecture (ABI)** | `arm64-v8a` (`arm64-v8a,armeabi-v7a,armeabi`) |
| **Display Size / Density** | `1080×2400` px @ `440 dpi` |
| **System RAM** | `5,448 MB` total (`281 MB` free baseline) |
| **Internal Storage (`/data` / OBB)** | `105 GB` total, **`14 GB` available** (`15,224,471,552` bytes free reported by `StatFs`) |
| **Android System WebView** | `com.google.android.webview` version **`157.0.8103.50`** (`versionCode: 810305003`, `targetSdkVersion: 36`) |
| **External Players / File Apps Installed** | VLC (`org.videolan.vlc`), MX Player (`com.mxtech.videoplayer.ad`), Files (`com.google.android.apps.nbu.files`), Google Photos (`com.google.android.apps.photos`), Vivo Gallery (`com.vivo.gallery`) |

---

## 2. Connectivity Mode for Controlled Staging Rehearsal

- Public staging DNS (`staging-api.class10lms.in`) is not yet provisioned (`STAGING_DNS_NOT_CONFIGURED`).
- To perform genuine physical-device testing without touching production Supabase or Render, ADB reverse port-forwarding (`adb -s 10BD750FUC0006P reverse tcp:4000 tcp:4000`) connected the physical iQOO phone cleanly to the local staging Node.js server (`http://localhost:4000/api/v1`) running on the development host.
