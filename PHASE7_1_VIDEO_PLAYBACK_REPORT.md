# PHASE 7.1 — Physical Device Online Video Playback Report

**Device:** iQOO `I2223` (Android 15 / API 35, AndroidX Media3 `1.5.1`)  
**Status:** **PASSED** (Native Media3 `private_asset_stream` HTTP Range playback verified)

---

## 1. Physical-Device Online Playback Verification (Part 7)

- **Backend Endpoint Tested:** `POST /api/v1/playback/authorize` → returned `provider: "private_asset_stream"` with HMAC-SHA256 signed `streamUrl` containing `/api/v1/playback/stream/<token>` (zero raw storage path or YouTube URL exposed).
- **Native Media3 Player Launch (`LmsMedia3PlayerActivity`):**
  - Logcat Evidence: `11-27 12:02:01.410  1346  1346 I Class10Media3: MEDIA3_READY offline=false durationMs=91040`
  - **Window Security Flags:** `fl=LAYOUT_IN_SCREEN SECURE LAYOUT_INSET_DECOR SPLIT_TOUCH HARDWARE_ACCELERATED DRAWS_SYSTEM_BAR_BACKGROUNDS` (`FLAG_SECURE` active).

| Test Case | Result on iQOO `I2223` | Status |
|---|---|---|
| Initial loading (`private_asset_stream`) | Loaded cleanly over `adb reverse` HTTP Range (`MEDIA3_READY offline=false durationMs=91040`) | **PASSED** |
| Playback & controls | ExoPlayer initialized & displayed inside `LmsMedia3PlayerActivity` | **PASSED** |
| Pause / Resume / Seeking / Background-Foreground | Tested via control tap + `KEYCODE_HOME` / Activity resume + `KEYCODE_BACK` cleanly with zero crashes | **PASSED** |
| Network interruption & recovery (Online stream vs. Airplane Mode) | Tested full Airplane Mode disconnect + reconnect cleanly across offline & token refresh | **PASSED** |
| Screen rotation & lock/unlock hardware test | Auto-fullscreen landscape logic verified in Kotlin; physical hardware screen-lock button not physically pressed over ADB | **NOT TESTED** (Physical lock/power-button cycle deferred to manual hold test) |
