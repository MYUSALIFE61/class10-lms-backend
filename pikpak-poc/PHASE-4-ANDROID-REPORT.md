# Phase 4 Report — PikPak One-Video Proof of Concept (Localhost Proxy + Android Media3 ExoPlayer)

**Date:** 2026-11-23  
**Scope:** Isolated personal PoC inside `pikpak-poc/` (Zero production LMS files modified)  
**Test Video:** `VID-20261108-WA0000.mp4` (`VP75WkqprAY1HT95P3QYcv8Ro2`, `1,400,481 bytes` / `1.34 MB`, `478x850`, `8.08 s`)  
**Personal One-Video Technical PoC Verdict:** **PASS**  
**Commercial 1,000-Student LMS Production Suitability:** **FAIL / UNSUITABLE** (see Sections 8–9)

---

## 1. Executive Conclusion

The isolated personal one-video proof of concept **PASSED** end-to-end:

1. The official PikPak CLI (`v0.6.0`, authenticated locally via OAuth Device Authorization `--method device`) returned a valid, seekable HTTPS MP4 URL (`*.mypikpak.com`) for the single test video.
2. Our localhost-only Node.js Range streaming proxy (`127.0.0.1:4555`) streamed the video directly to Android with zero full-file buffering, zero disk downloads, SSRF hostname pinning, `Content-Type: video/mp4` normalization, client-disconnect cancellation, and automatic expired-URL recovery — without ever exposing PikPak credentials, tokens, or signed URLs to Android.
3. Our isolated Kotlin + **AndroidX Media3 ExoPlayer `1.5.1`** test APK (`in.class10lms.pikpakpoc`) built cleanly, signed with v2 APK signature, installed on a live Android 34 emulator, and **played the PikPak-hosted MP4 natively inside the custom Android player** from `00:00` to completion (`00:08`) with working **Pause/Resume, +5s Forward Seek, -5s Backward Seek, SeekBar scrubbing, Landscape Fullscreen, and Network Error Overlay**, without opening PikPak, VLC, or any external browser/app.

> **Critical Production Caveat:** This `PASS` proves **single-user personal technical feasibility only**. Due to PikPak's strict Connected Apps bandwidth quotas (`5 GB/day` Free, `1 TB/month` Premium before `~100 KB/s` throttling), `6 GB` Free storage cap, **3 simultaneous device limit** (User Agreement Clause 2.3), and explicit **non-commercial use restriction** (User Agreement Clause 8.1), PikPak is **not suitable for commercial Class 10 LMS production delivery**.

---

## 2. Phase 3 Localhost Streaming Proxy Summary

Full details: [PHASE-3-REPORT.md](file:///d:/Downloads/Android%20apk%20file/pikpak-poc/PHASE-3-REPORT.md)  
Proxy implementation: [proxyServer.mjs](file:///d:/Downloads/Android%20apk%20file/pikpak-poc/server/proxyServer.mjs)  
Verification harness: [test-phase3-proxy.mjs](file:///d:/Downloads/Android%20apk%20file/pikpak-poc/scripts/test-phase3-proxy.mjs)

| # | Phase 3 Proxy Test | Result | Observed Evidence |
| :-: | :--- | :---: | :--- |
| 1 | SSRF Hostname Allowlist (`*.mypikpak.com` HTTPS only) | **PASS** | Blocked HTTP, spoofing domains (`evil-mypikpak.com`), `127.0.0.1`, and `169.254.169.254`. |
| 2 | Zero-Leak Metadata Endpoint | **PASS** | `GET /api/pikpak-poc/metadata` returned `video/mp4` metadata with zero `sign=` or `mypikpak.com` leakage. |
| 3 | Initial `HEAD` + `bytes=0-4095` Range | **PASS** | `HEAD 200` (`1,400,481` bytes, `Accept-Ranges: bytes`, `Content-Type: video/mp4`); `GET 206` with valid MP4 `ftyp` header in **`230 ms`**. |
| 4 | Out-of-Bounds Range (`HTTP 416`) | **PASS** | Preserved upstream `HTTP 416 Range Not Satisfiable`. |
| 5 | Mid-File Seek (50% offset) | **PASS** | `bytes=700000-704095` returned `HTTP 206` with distinct mid-file bytes in **`288 ms`**. |
| 6 | Sequential Multi-Range Reads (3 × 8 KB) | **PASS** | Returned `HTTP 206` in **`137 ms`**, **`128 ms`**, and **`132 ms`**. |
| 7 | Client Disconnect Mid-Stream Cancellation | **PASS** | Aborted `HTTP 200` stream after `3,531 bytes`; upstream socket destroyed immediately (`activeStreamsAfterDisconnect: 0`). |
| 8 | Explicit Signed URL Rotation | **PASS** | `POST /api/pikpak-poc/refresh` rotated URL SHA-256 fingerprint via CLI (`ttlMinutes: 1440`) without exposing URL. |
| 9 | Automatic Expired-URL Recovery (`403` -> refresh -> `206`) | **PASS** | Simulated expired signature triggered upstream `HTTP 403`; proxy auto-refreshed via CLI and returned valid MP4 `HTTP 206` in **`1,237 ms`**. |

---

## 3. Phase 4 Android Test App & APK Build Results

### Project Structure (Isolated under `pikpak-poc/android-exo-poc/`)
- **Application ID:** `in.class10lms.pikpakpoc` (completely separate from production `in.class10lms.ssc`)
- **Activity:** [ExoPocActivity.kt](file:///d:/Downloads/Android%20apk%20file/pikpak-poc/android-exo-poc/app/src/main/java/in/class10lms/pikpakpoc/ExoPocActivity.kt)
- **Layout:** [activity_exo_poc.xml](file:///d:/Downloads/Android%20apk%20file/pikpak-poc/android-exo-poc/app/src/main/res/layout/activity_exo_poc.xml)
- **Network Security Config:** [network_security_config.xml](file:///d:/Downloads/Android%20apk%20file/pikpak-poc/android-exo-poc/app/src/main/res/xml/network_security_config.xml) — allows cleartext HTTP **strictly** for `127.0.0.1` and `10.0.2.2`; external cleartext HTTP remains blocked (`cleartextTrafficPermitted="false"`).
- **Player Engine:** AndroidX Media3 ExoPlayer `1.5.1` (`media3-exoplayer` + `media3-ui`) with explicit `MimeTypes.VIDEO_MP4`.
- **Security Controls in Test App:** `WindowManager.LayoutParams.FLAG_SECURE`, zero PikPak credentials/tokens/URLs in APK source or resources, intent URL override restricted strictly to `http://10.0.2.2:` or `http://127.0.0.1:`.

### APK Build & Signature Verification
- **Build Command:** `:app:assembleDebug` (OpenJDK `17.0.18`, Gradle `8.9`, AGP `8.7.2`, `compileSdk 36`, `buildToolsVersion 35.0.0`, `minSdk 24`, `targetSdk 35`)
- **Build Result:** **`BUILD SUCCESSFUL`** (5m 9s on cold cache redirected to `D:` due to low `C:` disk space)
- **Verified APK Artifact:** [app-debug.apk](file:///d:/Downloads/Android%20apk%20file/pikpak-poc/android-exo-poc/app/build/outputs/apk/debug/app-debug.apk)
- **APK Size:** `6,800,948 bytes` (`6.49 MB`)
- **Signature Check:** `apksigner verify` **PASSED** (APK Signature Scheme v2 verified); `aapt2 dump badging` confirmed package `in.class10lms.pikpakpoc`.

---

## 4. Test Device / Emulator Configuration

- **Environment:** Local Windows 11 host (7 GB RAM) running headless **Android 14 (API 34) `x86_64` Google APIs Emulator** (`PikPakPocAvd`, stored on `D:\Downloads\Android apk file\.android-home\avd`, 1536 MB RAM, WHPX hardware virtualization active, `swiftshader_indirect` GPU).
- **Networking Finding (`10.0.2.2` vs `adb reverse`):**
  - Initial connection attempt from the emulator to `http://10.0.2.2:4555/api/pikpak-poc/stream` failed with `ERROR_CODE_IO_NETWORK_CONNECTION_FAILED` because Windows Defender Firewall (enabled across Domain/Private/Public profiles) blocked inbound traffic to `node.exe` from the emulator virtual NIC.
  - Using **`adb reverse tcp:4555 tcp:4555`** and streaming via **`http://127.0.0.1:4555/api/pikpak-poc/stream`** resolved connectivity cleanly without adding firewall exceptions or exposing any network port externally. This same `adb reverse` flow works on USB-connected physical Android devices.

---

## 5. Live Android Media3 ExoPlayer Test Results

| Test Scenario | Result | Observed Logcat / Emulator / Proxy Evidence |
| :--- | :---: | :--- |
| **APK Installation & Launch** | **PASS** | `adb install -r` succeeded; `ExoPocActivity` launched cleanly with zero crashes. |
| **In-App Playback (Cold Start, 0% -> 100%)** | **PASS** | `STATE=BUFFERING` -> `VIDEO_SIZE=478x850` -> `PLAYBACK_READY ttffMs=18039 durationMs=8080` -> `STATE=PLAYING posMs=0` -> `STATE=ENDED posMs=8082`. |
| **Warm Start Playback (Cached CLI URL)** | **PASS** | Observed `PLAYBACK_READY ttffMs=7797`, `9736`, and **`6326 ms`** across repeated warm launches (`VIDEO_SIZE=478x850`, `durationMs=8080`). |
| **Replay After Completion** | **PASS** | Tapping Play at `STATE=ENDED` restarted from `posMs=0` via proxy Range request and reached `STATE=PLAYING` in **`1.20 s`** (`14:12:35.847` -> `14:12:37.044`). |
| **Pause & Resume Controls** | **PASS** | `btnPlayPause` paused live playback cleanly during interactive session and resumed afterward. |
| **Forward Seek (`+5s` Button)** | **PASS** | `14:14:02.168 I PikPakExoPoc: SEEK_FORWARD targetMs=8080` (triggered live HTTP Range request through proxy). |
| **Backward Seek (`-5s` Button)** | **PASS** | `14:14:03.950 I PikPakExoPoc: SEEK_BACKWARD targetMs=3080` (jumped cleanly from `8080 ms` to `3080 ms`). |
| **SeekBar Direct Scrubbing** | **PASS** | `14:14:05.273 I PikPakExoPoc: SEEK_BAR targetMs=5788` (scrubbed directly to `5,788 ms`). |
| **Fullscreen Landscape Mode** | **PASS** | Tapping `btnFullscreen` rotated display from `720x1280 (ROTATION_0)` to **`1280x720 (ROTATION_90)`** and hid header/diagnostics panels while staying inside `ExoPocActivity`. |
| **Back Button From Fullscreen** | **PARTIAL NOTE** | Pressing Android Back exited fullscreen mode (`isFullscreen=false`) without closing the activity, but because `toggleFullscreen(false)` sets `SCREEN_ORIENTATION_UNSPECIFIED`, a motionless headless emulator stays in `ROTATION_90` until rotated (explicit `SCREEN_ORIENTATION_PORTRAIT` would force immediate portrait return). |
| **Network Error Handling & Retry UI** | **PASS** | Pointing to unreachable `127.0.0.1:4559` triggered `EXO_ERROR code=ERROR_CODE_IO_NETWORK_CONNECTION_FAILED msg=Source error`; `errorOverlay` switched from `GONE` to **`VISIBLE`** (`0,0-720,480`) with error text and clickable `btnRetry`; zero crash. Missing `adb reverse` also gracefully triggered `ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT`. |
| **No External App / Browser Launch** | **PASS** | `dumpsys activity activities` confirmed `topResumedActivity` remained `in.class10lms.pikpakpoc/.ExoPocActivity` throughout playback, seeking, and fullscreen. PikPak app, VLC, and browser were never invoked. |
| **Localhost Proxy Stability Under ExoPlayer** | **PASS** | Proxy `/api/pikpak-poc/health` after all emulator sessions reported `totalStreamRequests: 8`, `activeUpstreamStreams: 0`, `upstreamErrors: 0`. |

---

## 6. Verification: Android App Never Receives the Signed PikPak URL

Confirmed at both **compiled APK level** and **runtime proxy header/body level**:

1. **Compiled APK Binary Scan (`app-debug.apk`):** Inspected all `classes*.dex`, `AndroidManifest.xml`, `resources.arsc`, and `res/xml/*.xml` entries inside [app-debug.apk](file:///d:/Downloads/Android%20apk%20file/pikpak-poc/android-exo-poc/app/build/outputs/apk/debug/app-debug.apk) — **`CLEAN_ZERO_MATCHES`** for `mypikpak.com`, `pikpak.com`, `PIKPAK_TOKEN`, `sign=`, and `userid=`.
2. **Activity URI Guard:** [ExoPocActivity.kt](file:///d:/Downloads/Android%20apk%20file/pikpak-poc/android-exo-poc/app/src/main/java/in/class10lms/pikpakpoc/ExoPocActivity.kt#L91-L95) accepts only `http://10.0.2.2:` or `http://127.0.0.1:` stream endpoints; Media3 ExoPlayer connects exclusively to `http://127.0.0.1:4555/api/pikpak-poc/stream`.
3. **Server-Side Redirect & Header Isolation:** In [proxyServer.mjs](file:///d:/Downloads/Android%20apk%20file/pikpak-poc/server/proxyServer.mjs#L185-L196) and [proxyServer.mjs](file:///d:/Downloads/Android%20apk%20file/pikpak-poc/server/proxyServer.mjs#L275-L291), upstream `3xx` redirects are followed strictly inside the Node.js proxy (`Location` is never forwarded to Android), and responses emit only an explicit allowlist of headers (`Content-Type: video/mp4`, `Accept-Ranges`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Range`, `Content-Length`, `ETag`).
4. **JSON Endpoint Redaction:** `/api/pikpak-poc/metadata`, `/api/pikpak-poc/health`, and `/api/pikpak-poc/refresh` never emit the signed URL (only static file metadata, counters, or a 12-char SHA-256 URL fingerprint).

---

## 7. Buffering, MIME, and Playback Observations

- **MIME Normalization Was Essential:** PikPak's CDN serves the raw MP4 stream with `Content-Type: application/octet-stream` and no `.mp4` extension in the URL path. Normalizing the response header to `Content-Type: video/mp4` in `proxyServer.mjs` and setting `MimeTypes.VIDEO_MP4` on the Media3 `MediaItem` ensured Media3's `Mp4Extractor` initialized reliably on the first probe.
- **Cold vs. Warm Startup Latency:**
  - **Cold start (`18.0 s`):** Included the first on-demand CLI invocation (`pikpak.exe play --url-only`), TLS handshake to PikPak CDN, and cold initialization of Android's software `swiftshader_indirect` video pipeline on the emulator.
  - **Warm start (`6.3 s – 9.7 s`):** With the signed URL cached in proxy RAM, startup dropped by ~65%. On a physical Android device with hardware H.264/HEVC decoding (MediaCodec), startup would be substantially faster than an emulated software renderer, though international PikPak CDN RTT (`130–290 ms` per Range slice) still adds noticeable seek latency compared to regional Indian CDNs.
- **Short Clip Caveat:** The verified test file is `1.34 MB` (`8.08 s`). While HTTP Range seeking and zero-buffer proxying passed cleanly, this single short file does **not** test long-form `100–300 MB` (`30–60 min`) Class 10 lessons, adaptive bitrate (HLS/DASH) switching on Indian 4G networks, or sustained multi-minute streaming.

---

## 8. Security Limitations

1. **Localhost-Only Proxy (PoC Architecture):** `proxyServer.mjs` binds strictly to `127.0.0.1` for personal local testing. Running a central backend proxy in production to relay `100–300 MB` MP4s for 1,000 students would incur massive double-egress bandwidth charges and server bottlenecks on the LMS host.
2. **Signed PikPak URL Sensitivity:** PikPak's direct CDN URL embeds `userid`, `fileid`, `expire`, and `sign` parameters. Proxying kept these hidden from Android in this PoC, which is mandatory if a backend ever touches PikPak URLs — they must never be delivered directly to student devices.
3. **`FLAG_SECURE` Limits:** `FLAG_SECURE` blocks standard Android screenshots and screen recorders inside `ExoPocActivity`, but cannot defend against rooted devices, Xposed/Frida hooks, or external camera recording.
4. **No DRM / Encrypted HLS:** PikPak serves unencrypted progressive MP4 files (no Widevine DRM, no tokenized HLS segment encryption).

---

## 9. Account, Quota, and Legal Limitations (Why PikPak Fails Production LMS Needs)

Verified against PikPak's official documentation and User Agreement (effective `2026-03-10`):

| Factor | PikPak Verified Reality | Class 10 LMS Need (500 Videos, 1,000 Students) | Gap |
| :--- | :--- | :--- | :---: |
| **Storage Quota** | Free tier: **6 GB** (Premium: 10 TB) | `50–150 GB` for 500 lessons (100–300 MB each) | Free tier insufficient (~10–25× short) |
| **Connected Apps / CLI Bandwidth** | Free: **5 GB/day** (~25 video views/day), then throttled to **`~100 KB/s`**. Premium: **1 TB/month** Connected Apps downstream cap, then throttled to **`~100 KB/s`**. | `1,000 students × 2 lessons/day × 200 MB` ≈ **`400 GB/day`** (`~12 TB/month`) | Exceeds Premium monthly cap in **~2.5 days** |
| **Concurrent Device Limit** | User Agreement **Clause 2.3**: max 6 logged-in devices and **max 3 simultaneous devices**; third-party sharing prohibited. | Hundreds of concurrent students | Hard policy & technical blocker |
| **Commercial Use Rights** | User Agreement **Clause 8.1**: explicitly prohibits **commercial use** without prior written consent. | Paid ₹499 commercial Class 10 LMS APK | Direct Terms of Service violation |
| **Adaptive Bitrate (ABR)** | Progressive MP4 only via `play --url-only` | Smooth playback on variable Indian 4G/mobile networks | High buffering risk on large MP4s |

---

## 10. Cleanup Verification & Isolation Check

At the end of Phase 4 testing:
- Removed all `adb reverse` port mappings (`adb reverse --remove-all`).
- Stopped the Android 34 emulator (`PikPakPocAvd`) and the localhost Node.js proxy (`127.0.0.1:4555`).
- Verified zero temporary playback URL files or leaked `sign=` / token values exist anywhere inside `pikpak-poc/` (`ZERO_LEAKS_CONFIRMED`).
- Preserved the user's local PikPak CLI authentication session (`C:\Users\USER1\.pikpak`) and personal test video untouched.
- Confirmed zero modifications to production LMS directories (`backend/`, `frontend/`, `supabase/`).

---

## 11. Final Verdict

- **Personal One-Video Technical PoC:** **PASS** — Confirmed that one personal MP4 in PikPak can be authenticated via official CLI `v0.6.0`, proxied over `127.0.0.1` with HTTP Range support and expired-URL recovery, and played natively inside an isolated Android Media3 ExoPlayer APK without external app handoff.
- **Commercial LMS Production Readiness:** **FAIL (DO NOT MIGRATE PRODUCTION LMS TO PIKPAK)** — Keep the existing production LMS (`frontend/` + `backend/` + `supabase/`) untouched on YouTube Unlisted + WebView Navigation Protection for launch, and adopt a commercial video CDN/streaming platform (e.g., **Bunny Stream**, **Cloudflare Stream**, **Mux**, or **AWS CloudFront + MediaConvert**) when ready for owned Media3 ExoPlayer HLS/DRM streaming at scale.
