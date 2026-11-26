# Phase 6 Deployment Guide — Offline Video Downloader & Encrypted In-App Playback

This guide covers exact installation commands, environment variables, database migration steps, backend deployment, Android APK build steps, and the production verification checklist for the **Class 10 SSC LMS Offline Video Downloader** integrated into the existing Capacitor 7 + React 18 + Native Kotlin + AndroidX Media3 + Express + Supabase ecosystem.

---

## 1. Dependencies & Installation Commands

### Backend (`backend/`)
Zero extra npm packages are required beyond the existing `backend/package.json` dependencies (uses Node.js built-in `crypto`, `fs`, `https`, `child_process` streaming).

```bash
cd backend
npm install
```

### Optional Server Video Processing (`FFmpeg` / `FFprobe`)
Install FFmpeg on your backend server to enable automatic MP4 `+faststart` moov-atom optimization and optional `480p`/`720p` H.264/AAC variant transcoding for uploaded organization-owned MP4 lessons (when FFmpeg is not installed, the backend safely validates MP4 headers and streams verified source MP4s with SHA-256 hashing):

- **Ubuntu / Debian VPS:**
  ```bash
  sudo apt-get update && sudo apt-get install -y ffmpeg
  ffmpeg -version && ffprobe -version
  ```
- **Windows (PowerShell / winget):**
  ```powershell
  winget install Gyan.FFmpeg
  ```
- **Docker (Dockerfile snippet):**
  ```dockerfile
  RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
  ```

### Frontend Mobile App (`frontend/`) & Admin Portal (`admin-portal/`)
No new npm or Gradle dependencies are required—uses already-installed `androidx.media3:media3-exoplayer:1.5.1`, `androidx.media3:media3-ui:1.5.1`, `androidx.security:security-crypto:1.1.0-alpha06` (Android Keystore `MasterKey` + `EncryptedSharedPreferences`), and `@capacitor/core:7.0.1`.

```bash
cd frontend && npm install
cd ../admin-portal && npm install
```

---

## 2. Backend Environment Variables (`backend/.env`)

Append or verify these variables in `backend/.env` (see [backend/.env.example](file:///d:/Downloads/Android%20apk%20file/backend/.env.example)):

```env
# Storage Provider Selection:
# - persistent_disk  : Mounted persistent volume / VPS directory outside webroot (zero extra cloud subscription)
# - cloudflare_r2    : Recommended commercial production private R2 bucket ($0 egress)
# - supabase_storage : Existing Supabase private bucket (small pilot only; monitor egress)
# - pikpak_local     : Local personal testing ONLY (not permitted for commercial use)
OFFLINE_VIDEO_STORAGE_PROVIDER=persistent_disk

# Permanent private directory (MUST be on persistent storage, NEVER ephemeral container /tmp)
OFFLINE_VIDEO_STORAGE_DIR=/var/data/class10lms/offline_videos

# Isolated temporary workspace for per-job FFmpeg optimization (auto-swept every 10 min for jobs >30 min)
OFFLINE_VIDEO_TEMP_DIR=/tmp/class10lms_offline_jobs

# Short-lived HMAC-SHA256 download stream token TTL (seconds)
OFFLINE_DOWNLOAD_TOKEN_TTL_SECONDS=1800

# Maximum authorized MP4 upload size per lesson (MB)
OFFLINE_MAX_UPLOAD_MB=1024

# Student logout cleanup retention policy: wipe_on_logout | keep_encrypted_bound_to_student
OFFLINE_RETENTION_POLICY=wipe_on_logout

# Required only when OFFLINE_VIDEO_STORAGE_PROVIDER=supabase_storage
SUPABASE_OFFLINE_BUCKET=lesson-offline-videos

# Optional explicit binary paths if ffmpeg/ffprobe are not on PATH
FFMPEG_PATH=
FFPROBE_PATH=
```

> [!WARNING]
> **Never use ephemeral PaaS container root storage (e.g., default Render/Railway container filesystem) for `OFFLINE_VIDEO_STORAGE_DIR`.** Always mount a persistent block volume (e.g., `/var/data/...`) or set `OFFLINE_VIDEO_STORAGE_PROVIDER=cloudflare_r2` with `R2_CUSTOM_DOMAIN` + `R2_SIGNING_SECRET`.

---

## 3. Supabase Database Migration

Apply additive migration [008_offline_video_downloads.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/008_offline_video_downloads.sql) in Supabase SQL Editor or via Supabase CLI:

```bash
supabase db push
```

Or run manually in Supabase Dashboard -> **SQL Editor** -> paste and execute `supabase/migrations/008_offline_video_downloads.sql`.

**Verified Schema Guarantees:**
- Zero duplicate lesson tables (reuses existing `public.lessons`, `public.profiles`, `public.user_devices`, `public.lesson_progress`).
- Creates `public.lesson_video_assets` (backend-only vault; `REVOKE ALL FROM anon, authenticated`).
- Creates `public.student_video_downloads` (foreign keys, active-device unique index, student-only `SELECT` RLS policy, service-role mutations only).

---

## 4. Backend & Admin Portal Deployment Instructions

1. **Apply Migration `008_offline_video_downloads.sql`** to production Supabase PostgreSQL.
2. **Configure Persistent Storage / Cloudflare R2:**
   - For VPS / Persistent Disk: `mkdir -p /var/data/class10lms/offline_videos && chmod 700 /var/data/class10lms/offline_videos`.
   - For Cloudflare R2 (recommended for commercial launch): set `OFFLINE_VIDEO_STORAGE_PROVIDER=cloudflare_r2`, `VIDEO_STORAGE_PROVIDER=cloudflare_r2`, `R2_CUSTOM_DOMAIN`, and `R2_SIGNING_SECRET`.
3. **Run Backend Syntax & Automated Tests:**
   ```bash
   cd backend
   npm run lint:syntax
   npm test
   ```
4. **Start Backend Production Server:**
   ```bash
   NODE_ENV=production npm start
   ```
   Verify reverse proxy (Nginx/Cloudflare) allows large streaming MP4 admin uploads (`client_max_body_size 1024m; proxy_request_buffering off; proxy_buffering off;`) and forwards `Range` headers without buffering!
5. **Build Admin Portal:**
   ```bash
   cd admin-portal
   VITE_API_BASE_URL=https://api.class10lms.in/api/v1/admin npm run build
   ```
   Deploy `admin-portal/dist` to your admin host and upload authorized MP4 assets per lesson via **Video Library -> Offline MP4**.

---

## 5. Android APK Build Instructions

1. **Build Production React Mobile Bundle & Sync Capacitor:**
   ```bash
   cd frontend
   VITE_API_BASE_URL=https://api.class10lms.in/api/v1 npm run build
   npx cap sync android
   ```
2. **Run Native Kotlin Unit Tests & Assemble APK:**
   ```bash
   cd frontend/android
   ./gradlew testDebugUnitTest assembleDebug --no-daemon
   ```
   For a signed Play Store / production release APK/AAB (requires `frontend/android/keystore.properties`):
   ```bash
   ./gradlew assembleRelease bundleRelease --no-daemon
   ```
3. **APK Output Path:**
   - Debug: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`
   - Release: `frontend/android/app/build/outputs/apk/release/app-release.apk`

---

## 6. Security Disclosure & Rooted-Device Limitations

- **Enforced Protections:** JWT + active device binding, server-side subscription gate, HMAC-SHA256 signed range-streaming tokens, Android app-private storage (`noBackupFilesDir/offline_lessons/` + `.nomedia` + `allowBackup="false"`), hardware-backed Android Keystore AES-256-GCM Master Key wrapping per-video 256-bit DEKs, seekable AES-256-CTR on-disk ciphertext, streaming SHA-256 integrity verification, native Media3 ExoPlayer (`EncryptedOfflineDataSource` with internal `lms-offline://` URI), zero external player intents, `FLAG_SECURE`, Android 15 `addScreenRecordingCallback()`, DisplayManager external-display guard, dynamic student watermark, and automatic encrypted file wipe on logout.
- **Honest Limitations:** No software-only scheme provides mathematically absolute protection on a **rooted Android device** with unlocked bootloader and runtime memory-dumping/hooking tools (e.g., Frida/Magisk) or against external physical camera filming. For forensic accountability, dynamic student identity watermarks remain visible throughout offline playback.

---

## 7. Production Testing Checklist

- [ ] **Scenario 1 & 2:** Open a lesson for the first time -> verify thumbnail, title, chapter, duration, **ONLY `Download Video`** visible (`Watch Now` hidden), and zero YouTube/storage URLs in API response or UI.
- [ ] **Scenario 3 & 4:** Tap `Download Video` -> verify live progress %, downloaded MB, and automatic switch `Download Video` -> `Watch Now` after SHA-256 verification.
- [ ] **Scenario 5:** Enable Airplane Mode (Wi-Fi + mobile data OFF) -> tap `Watch Now` -> verify native Android Media3 playback (play/pause, seek, ±10s, speed, volume, fullscreen, watermark, `FLAG_SECURE`, Android 15 screen recording pause, last-position resume).
- [ ] **Scenario 6:** Force-close app while offline and relaunch -> confirm student remains signed in offline, `My Downloads` lists saved lessons, and `Watch Now` works immediately.
- [ ] **Scenario 7 & 8:** Toggle network OFF mid-download -> verify `Retry Download` resumes via HTTP `206 Range`; test `Cancel` mid-download and confirm partial `.enc.part` file is removed.
- [ ] **Scenario 9 & 10:** Verify corrupted checksum is rejected (`DOWNLOAD_FAILED`, never `Watch Now`) and low device storage displays `Not Enough Device Storage`.
- [ ] **Scenario 11 & 12:** Verify unpaid student receives `403` on premium lessons; verify student `Logout` wipes encrypted `.enc` files and wrapped DEKs.
- [ ] **Scenario 13 & 14:** Verify deleting a local encrypted file restores `Download Video` (`FILE_MISSING`), and verify 2 concurrent downloads complete independently.
- [ ] **Privacy Check:** Open Android **Files**, **Downloads**, and **Google Photos / Gallery** -> verify zero downloaded LMS `.mp4` or `.enc` videos appear anywhere.

