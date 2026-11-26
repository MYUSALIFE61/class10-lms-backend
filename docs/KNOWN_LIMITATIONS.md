# Known Limitations & Security Transparency

This document explicitly records architectural and security limitations of the initial low-budget YouTube Unlisted + Android APK architecture so business, product, and compliance stakeholders make informed decisions.

---

## 1. YouTube Unlisted Video Hosting Limitations

1. **YouTube Unlisted is NOT DRM:**
   - Unlisted videos simply do not appear in YouTube search results or channel listings. Anyone who obtains the 11-character YouTube Video ID (`https://youtu.be/<id>`) can watch the video directly in a browser or YouTube app.
2. **Backend Authorization Cannot Revoke Extracted Unlisted Links:**
   - Our Express backend strictly validates student authentication, active ₹499 subscription status, verified payment, subscription expiry, and registered-device limits **before** returning a video ID to the LMS player.
   - However, once a legitimately subscribed student plays a video in the official YouTube IFrame Player, an attacker with network/WebView inspection tools or by following YouTube's built-in attribution link can observe the video ID. Revoking or expiring their LMS subscription stops future LMS access, **but cannot revoke a previously copied YouTube Unlisted link** unless the video is replaced or re-uploaded.
3. **Mandatory YouTube Branding & Controls:**
   - Per YouTube API Terms of Service, `LMSVideoPlayer.jsx` uses the official YouTube IFrame Player API with `controls: 1` and preserves required YouTube branding, attribution, and player controls. We do not strip YouTube logos or extract direct media streams.
4. **Embed Policy Dependency:**
   - Videos must be configured as **Unlisted** with **Allow embedding = ON** and **No age restriction** in YouTube Studio. Private videos or embed-disabled videos trigger YouTube error codes `100` / `101` / `150`, which the player catches cleanly and reports to the student.

---

## 2. Android `FLAG_SECURE` Limitations

- `Class10SecurityPlugin.kt` applies `WindowManager.LayoutParams.FLAG_SECURE` on the Video Player, Class Notes, Previous Papers, and Formula screens.
- **What it blocks:** Standard Android screenshots, MediaProjection screen recorders, and Recents/App Switcher preview thumbnails on stock Android devices.
- **What it CANNOT block:**
  - Recording the phone screen externally with a second smartphone or camera.
  - Rooted / modified Android devices running LSPosed/Magisk modules that strip `FLAG_SECURE`.
  - Hardware HDMI/USB-C capture dongles on devices supporting raw video out.
- **Deterrent layer:** The moving semi-transparent student watermark (`studentCode • masked phone/email • time`) survives external filming and supports forensic deterrence.

---

## 3. Google Play Integrity API Limitations

- Play Integrity provides **probabilistic risk signals**, not an absolute cryptographic guarantee against advanced rooted devices.
- **Sideloaded APK caveat:** When distributing the APK directly outside Google Play Store, Google returns `appRecognitionVerdict = UNRECOGNIZED_VERSION`. Therefore, backend config defaults to `INTEGRITY_DISTRIBUTION_MODE=sideload` (which evaluates `deviceRecognitionVerdict` such as `MEETS_BASIC_INTEGRITY` / `MEETS_DEVICE_INTEGRITY` instead of falsely locking out genuine students). Switch to `INTEGRITY_DISTRIBUTION_MODE=play_store` once distributed through Google Play.
- Devices without Google Play Services (e.g., some Huawei/custom ROM devices) cannot generate Play Integrity tokens; keep `INTEGRITY_ENFORCEMENT_MODE=monitor` until you confirm Play Services coverage across your AP/TS student base.

---

## 4. Network & Device Edge Cases

- Mobile carriers in AP & Telangana (Jio, Airtel, Vi) frequently rotate CGNAT IP addresses. Concurrent-login detection therefore keys on **distinct registered devices** rather than raw IP changes to prevent false lockouts.
- Because videos are streamed on-demand via YouTube (never bundled in the APK), active internet connectivity is required for video playback.
