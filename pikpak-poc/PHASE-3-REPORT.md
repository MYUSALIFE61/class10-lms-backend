# Phase 3 Report — Localhost PikPak Streaming Proxy

**Date:** 2026-11-23  
**Scope:** Isolated PoC (`pikpak-poc/server/proxyServer.mjs`) — Zero production LMS files modified  
**Test Video:** `VID-20261108-WA0000.mp4` (`VP75WkqprAY1HT95P3QYcv8Ro2`, `1,400,481 bytes` / `1.34 MB`)  
**Overall Phase 3 Verdict:** **PASS**

---

## 1. Architecture & Security Controls Implemented

- **Implementation:** [proxyServer.mjs](file:///d:/Downloads/Android%20apk%20file/pikpak-poc/server/proxyServer.mjs) (zero third-party npm dependencies; built strictly on Node.js v22 standard library).
- **Localhost-Only Binding:** Bound strictly to `127.0.0.1` (default port `4555`; never binds `0.0.0.0` and never uses public tunnels).
- **Single-Video Allowlist:** Locked exclusively to `VP75WkqprAY1HT95P3QYcv8Ro2`.
- **Zero Credential / Signed URL Exposure:** Resolves playback URL via local authenticated `pikpak.exe play <fileID> --url-only` into RAM only; Android clients receive only `/api/pikpak-poc/stream` and never see PikPak tokens, `userid`, or signed URLs. Logs record only a 12-char SHA-256 URL fingerprint.
- **SSRF Protection:** `validatePikPakUpstreamUrl()` enforces `https:` protocol and strict hostname boundary (`mypikpak.com` or `*.mypikpak.com`) on initial URLs and all redirects (`MAX_REDIRECTS = 3`).
- **True Zero-Buffer Streaming:** Pipes `https.request` directly to the HTTP response without buffering the entire MP4 in RAM or writing video data to disk. Immediately destroys upstream sockets when the client disconnects or aborts mid-stream.
- **MIME & Range Compliance:** Preserves `HTTP 200`, `206 Partial Content`, and `416 Range Not Satisfiable`; preserves `Content-Range`, `Content-Length`, and `Accept-Ranges: bytes`; normalizes upstream `application/octet-stream` to `Content-Type: video/mp4`.
- **Expired URL Recovery:** Automatically intercepts upstream `401`/`403`/`410`, invalidates the cached URL, requests a fresh signed URL from the official PikPak CLI, and retries the client Range request transparently.

---

## 2. Executed Test Results (`pikpak-poc/scripts/test-phase3-proxy.mjs`)

| # | Test Scenario | Result | Observed Metrics & Evidence |
| :-: | :--- | :---: | :--- |
| 1 | **SSRF Hostname Protection** | **PASS** | Blocked `http://dl.mypikpak.com`, `https://evil-mypikpak.com`, `https://127.0.0.1`, and `https://169.254.169.254`. |
| 2 | **Metadata Zero-Leak Check** | **PASS** | `GET /api/pikpak-poc/metadata` returned `HTTP 200` with `mimeType: "video/mp4"` and zero `sign=` or `mypikpak.com` leakage. |
| 3 | **Initial Playback Request (`HEAD` + `bytes=0-4095`)** | **PASS** | `HEAD` returned `HTTP 200` (`Content-Length: 1400481`, `Accept-Ranges: bytes`, `Content-Type: video/mp4`). Initial Range returned `HTTP 206`, `Content-Range: bytes 0-4095/1400481`, valid MP4 `ftyp` header box, **`230 ms`**. |
| 4 | **Out-of-Bounds Range (`HTTP 416`)** | **PASS** | `Range: bytes=99999999-100000000` preserved upstream **`HTTP 416`**. |
| 5 | **Mid-File Seeking (50% offset)** | **PASS** | `Range: bytes=700000-704095` returned **`HTTP 206`**, `Content-Range: bytes 700000-704095/1400481`, distinct mid-file payload, **`288 ms`**. |
| 6 | **Multiple Sequential Range Requests** | **PASS** | 3 consecutive `8 KB` slices (`0-8191`, `8192-16383`, `16384-24575`) all returned `HTTP 206` in **`137 ms`, `128 ms`, `132 ms`**. |
| 7 | **Client Disconnect / Cancel Mid-Stream** | **PASS** | Aborted full `HTTP 200` stream after `3,531 bytes` (0.25% of file); upstream socket terminated immediately (`activeStreamsAfterDisconnect: 0`, `disconnectsRecorded: 1`). |
| 8 | **Explicit URL Refresh (`POST /api/pikpak-poc/refresh`)** | **PASS** | Rotated URL SHA-256 fingerprint via official CLI (`ttlMinutes: 1440`) without returning URL. |
| 9 | **Expired URL Auto-Recovery** | **PASS** | Simulated expired signature triggered upstream `HTTP 403`; proxy automatically invalidated cache, fetched a fresh URL via `pikpak play --url-only`, retried transparently, and delivered **`HTTP 206`** with valid MP4 `ftyp` bytes in **`1,237 ms`**. |

---

## 3. Conclusion

Phase 3 **PASSED** all proxy streaming, Range seeking, disconnect cleanup, SSRF, and expired-URL recovery requirements. Proceeding to **Phase 4 (Isolated Android Media3 ExoPlayer Test App)** inside `pikpak-poc/android-exo-poc/`.
