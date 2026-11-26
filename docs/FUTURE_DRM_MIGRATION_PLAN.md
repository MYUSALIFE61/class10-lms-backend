# Future DRM Video Migration Plan

The initial architecture deliberately keeps infrastructure near zero by using **YouTube Unlisted + Official IFrame Player API** for the first 1,000 students at ₹499/year. As revenue scales, migrating from YouTube Unlisted to **Widevine / FairPlay DRM-protected streaming** requires **zero database redesign and zero curriculum restructuring** because the video vault is already abstracted.

---

## 1. Built-In Migration Readiness Already Implemented

1. **Isolated Video Source Table (`public.lesson_video_sources`):**
   - Already supports `provider IN ('youtube_unlisted', 'drm_widevine', 'drm_fairplay')` plus `drm_asset_id` and `drm_manifest_url` columns alongside `youtube_video_id`.
2. **Backend Authorization Contract (`POST /api/v1/playback/authorize`):**
   - Already returns `{ provider, playback, watermark, navigation }`. For DRM lessons, the backend simply returns `{ provider: 'drm_widevine', playback: { manifestUrl, licenseServerUrl, licenseToken, resumePositionSeconds } }` without changing any authentication, subscription, Razorpay, or device-limit code.
3. **Encapsulated Player Component (`LMSVideoPlayer.jsx`):**
   - All curriculum pages render `<LMSVideoPlayer />` without knowing the underlying playback engine. Adding a `provider === 'drm_widevine'` branch (using **ExoPlayer / Media3** via a Capacitor native video plugin on Android, or **Shaka Player** with EME in WebView) seamlessly upgrades playback.

---

## 2. Recommended DRM Migration Path by Scale

| Stage | Student Scale | Recommended Video Stack | Est. Monthly Cost | Security Level |
| :--- | :--- | :--- | :--- | :--- |
| **Phase A (Current)** | 0 – 1,000 students | YouTube Unlisted + Official IFrame + Backend Sub Gate + `FLAG_SECURE` + Watermark | ~₹2,500/mo (Supabase + API VPS) | Deterrence & access control (No DRM) |
| **Phase B (Growth)** | 1,000 – 5,000 students | **VdoCipher** or **Bunny Stream + MediaCage/Widevine DRM** or **Gumlet DRM** | ~₹12,000 – ₹35,000/mo | Widevine L1/L3 hardware-encrypted HLS/DASH + short-lived OTP license tokens |
| **Phase C (Scale)** | 5,000+ students | **AWS MediaConvert + CloudFront Signed URLs + Widevine/FairPlay License Proxy (Axinom / EZDRM / PallyCon)** + Native Android Media3 ExoPlayer | Pay-as-you-go CDN (~₹0.50–₹1.50/GB in India) | Enterprise studio-grade DRM + offline encrypted downloads |

---

## 3. Step-by-Step Zero-Downtime Cutover Procedure

1. **Upload Master Videos** (1080p MP4) to the chosen DRM provider; generate adaptive bitrate HLS/DASH ladders (`360p`, `480p`, `720p`) optimized for Indian 4G/3G networks.
2. **Populate `lesson_video_sources`:** Update lessons incrementally (`provider = 'drm_widevine'`, `drm_asset_id`, `drm_manifest_url`) starting with flagship Mathematics & Physical Science chapters.
3. **Add Native Android Media3 ExoPlayer Plugin:** Implement a Kotlin plugin wrapping `androidx.media3:media3-exoplayer-dash` + `DefaultDrmSessionManager` (Widevine UUID) bound to the existing `FLAG_SECURE` surface so hardware-backed L1/L3 decryption renders directly to a secure `SurfaceView`.
4. **Issue Per-Session DRM License Tokens on Express Backend:** Inside `PlaybackService.authorizePlayback()`, sign short-lived (60-second) Widevine license authorization tokens after running the existing 7-step subscription & device gate.
5. **Dual-Mode Rollout:** Both `youtube_unlisted` and `drm_widevine` lessons coexist cleanly in the same app version, allowing gradual chapter-by-chapter migration without breaking older lessons.
6. **Optional Offline Encrypted Downloads:** Using Media3 `DownloadManager` with Widevine offline license keys (expiring automatically at `subscriptions.expires_at`), students in low-connectivity rural AP/TS areas can download encrypted lessons that auto-expire when their ₹499 pass ends.
