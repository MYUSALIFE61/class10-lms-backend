# PHASE 9.0 — RENDER CONFIGURATION SPECIFICATION

**Platform Target:** Render Web Service (Preparation Only — Do Not Provision Yet)
**Target Service Name:** `class10-lms-backend-staging`
**Git Repository & Branch:** `https://github.com/MYUSALIFE61/class10-lms-backend.git` -> **`staging`** (`1995379fd8f7ffdfd1130657d2ec0d793356478a`)

---

## 1. Service & Persistent Disk Settings

| Setting | Configured Value | Code Verification Source |
| :--- | :--- | :--- |
| **Plan / Tier** | `Starter` (~`$7/month`, 512 MB RAM / 0.5 CPU, always-on) | Persistent Disk unavailable on Free plan |
| **Runtime** | `Node` (`.node-version` = `22.14.0`) | [backend/package.json](file:///d:/Downloads/Android%20apk%20file/backend/package.json) (`"node": ">=20.0.0"`), [.node-version](file:///d:/Downloads/Android%20apk%20file/.node-version) |
| **Root Directory** | Repository root (commands prefix `cd backend`) OR `backend` | `cd backend && npm ci --omit=dev` or `cd backend && npm install` |
| **Build Command** | `cd backend && npm ci --omit=dev` | Avoids devDependencies (`@electric-sql/pglite`, `vitest`) in runtime container |
| **Start Command** | `cd backend && npm start` (`node src/server.js`) | [backend/package.json](file:///d:/Downloads/Android%20apk%20file/backend/package.json#L8), [backend/src/server.js](file:///d:/Downloads/Android%20apk%20file/backend/src/server.js) |
| **Health Check Path** | `/health` *(or `/api/v1/health`)* | [backend/src/app.js](file:///d:/Downloads/Android%20apk%20file/backend/src/app.js#L65), [health.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/health.routes.js#L5) |
| **Persistent Disk Size** | `10 GB` (~`$2.50/month`) | Minimum capacity for staging MP4 assets, temp jobs, and PDFs |
| **Persistent Disk Mount Path** | `/var/data/class10lms` | Directory subpaths configured below |

### Persistent Disk Subdirectories (Verified Against Source)
- **`OFFLINE_VIDEO_STORAGE_DIR=/var/data/class10lms/offline_videos`** -> Read in [offlineStorageService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/offlineStorageService.js#L74-L76); fallback `backend/storage/offline_videos`.
- **`OFFLINE_VIDEO_TEMP_DIR=/var/data/class10lms/tmp_jobs`** -> Read in [app.js](file:///d:/Downloads/Android%20apk%20file/backend/src/app.js) -> passed to `FfmpegProcessor` (`tempDir`); cross-device `EXDEV` fallback supported in `offlineStorageService.js:128`.
- **`RESOURCES_UPLOAD_DIR=/var/data/class10lms/resources`** -> Read in [env.js](file:///d:/Downloads/Android%20apk%20file/backend/src/config/env.js#L58), [adminCmsService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/adminCmsService.js#L60-L64), and [adminStoreExtension.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/adminStoreExtension.js#L13-L20).

---

## 2. Complete Source-Derived Environment Variable Table

All variable names are derived directly from [backend/src/config/env.js](file:///d:/Downloads/Android%20apk%20file/backend/src/config/env.js), [server.js](file:///d:/Downloads/Android%20apk%20file/backend/src/server.js), [adminStoreExtension.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/adminStoreExtension.js#L219-L220), and [gamifiedQuizService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/gamifiedQuizService.js#L65-L79). Changing any env var on Render triggers a redeploy/restart.

| Variable Name | Purpose | Req / Opt | Safe Example Format | Source | Restart Req |
| :--- | :--- | :---: | :--- | :--- | :---: |
| `NODE_ENV` | Runtime mode (`production` enforces non-verbose errorHandler) | Required | `production` | Static staging config | Yes |
| `PORT` | HTTP listen port | Optional (Render auto-sets) | `10000` (Render default) | Render platform | Yes |
| `HOST` | Interface bind address | Optional (defaults `0.0.0.0`) | `0.0.0.0` | Static (`server.js`) | Yes |
| `TRUST_PROXY` | Reverse-proxy hop count for `req.ip` & HTTPS `req.protocol` | Required | `1` | Static (`security.js`) | Yes |
| `ALLOWED_ORIGINS` | Comma-separated CORS origin allowlist | Required | `https://app.class10lms.in,https://localhost,https://<staging-admin-host>` | Staging domains | Yes |
| `SUPABASE_URL` | Staging Supabase project HTTPS URL | **Required** | `https://<staging-ref>.supabase.co` | Supabase `class10-lms-staging` | Yes |
| `SUPABASE_ANON_KEY` | Staging Supabase anon public JWT | **Required** | `eyJ...` *(staging anon key)* | Supabase API settings | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging Supabase elevated server JWT | **Required** | `eyJ...` *(staging service role)* | Supabase API settings | Yes |
| `JWT_ACCESS_SECRET` | Student access token & admin token signing (`>=32` chars) | **Required** | `<64-char-random-hex>` | `openssl rand -hex 32` | Yes |
| `JWT_REFRESH_SECRET` | Student refresh token signing (`>=32` chars) | **Required** | `<64-char-random-hex>` | `openssl rand -hex 32` | Yes |
| `DEVICE_HASH_SECRET` | HMAC-SHA256 hardware device hashing (`>=32` chars) | **Required** | `<64-char-random-hex>` | `openssl rand -hex 32` | Yes |
| `JWT_ACCESS_TTL` | Access token TTL | Optional (`15m`) | `15m` | Policy | Yes |
| `JWT_REFRESH_TTL_DAYS` | Refresh token expiry days (`1..30`) | Optional (`7`) | `7` | Policy | Yes |
| `SUBSCRIPTION_PLAN_CODE` | Fallback plan code (default in `env.js` is legacy `CLASS10_ANNUAL_499`) | Recommended | `CLASS10_ANNUAL_799` | Migration 009 active plan | Yes |
| `MAX_DEVICES_PER_STUDENT` | Concurrent active device cap (`1..5`) | Optional (`1`) | `1` | Device policy | Yes |
| `CONCURRENT_SESSION_WINDOW_MINUTES` | Concurrent login alert window (`1..120`) | Optional (`10`) | `10` | Security policy | Yes |
| `RAZORPAY_MODE` | Payment gateway mode (`test` or `live`) | **Required** | `test` | Strict staging safeguard | Yes |
| `RAZORPAY_KEY_ID` | Razorpay Test Key ID (`rzp_test_*`) | **Required** | `rzp_test_<id>` | Razorpay Test Dashboard | Yes |
| `RAZORPAY_KEY_SECRET` | Razorpay Test Key Secret (`>=8` chars) | **Required** | `<razorpay-test-secret>` | Razorpay Test Dashboard | Yes |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay Test Webhook HMAC secret (`>=8` chars) | **Required** | `<32-char-webhook-secret>` | Razorpay Webhook settings | Yes |
| `VIDEO_STORAGE_PROVIDER` | Own-player legacy stream (`none` or `pikpak_local`) | Required | `none` | Phase 7.2 local-only rule | Yes |
| `PIKPAK_CLI_PATH` | Optional PikPak CLI path (`''` when unused) | Optional (`''`) | `""` | Leave empty | Yes |
| `PUBLIC_API_BASE_URL` | Optional public base URL | Optional (`''`) | `https://staging-api.class10lms.in` | Staging custom domain | Yes |
| `STREAM_TOKEN_TTL_SECONDS` | Own-player signed URL TTL (`60..7200`) | Optional (`900`) | `900` | Config default | Yes |
| `OFFLINE_VIDEO_STORAGE_PROVIDER` | Server MP4 store (`persistent_disk` or `pikpak_local`) | **Required** | `persistent_disk` | Phase 7.2 local-only rule | Yes |
| `OFFLINE_VIDEO_STORAGE_DIR` | Persistent directory for master MP4 files | **Required** | `/var/data/class10lms/offline_videos` | Render disk mount | Yes |
| `OFFLINE_VIDEO_TEMP_DIR` | Temp directory for MP4 ingestion/FFmpeg jobs | **Required** | `/var/data/class10lms/tmp_jobs` | Render disk mount | Yes |
| `RESOURCES_UPLOAD_DIR` | Persistent directory for Admin PDFs/notes | **Required** | `/var/data/class10lms/resources` | Render disk mount | Yes |
| `OFFLINE_DOWNLOAD_TOKEN_TTL_SECONDS` | Signed MP4 chunk stream URL TTL (`120..14400`) | Optional (`1800`) | `1800` | Config default | Yes |
| `OFFLINE_LEASE_DAYS` | Maximum offline lease days (`1..30`) | Optional (`7`) | `7` | Lease policy | Yes |
| `OFFLINE_MAX_UPLOAD_MB` | Max MP4 upload size MB (`10..4096`) | Optional (`1024`) | `1024` | Disk & memory limit | Yes |
| `OFFLINE_RETENTION_POLICY` | Offline logout retention (`wipe_on_logout` / `keep_encrypted_bound_to_student`) | Optional | `wipe_on_logout` | Student vault policy | Yes |
| `FFMPEG_PATH` / `FFPROBE_PATH` | Optional binary overrides | Optional (`''`) | `/usr/bin/ffmpeg` or `""` | Render runtime / Docker | Yes |
| `GOOGLE_PLAY_PACKAGE_NAME` | Play Integrity package ID | Optional | `in.class10lms.ssc` | Android `applicationId` | Yes |
| `GOOGLE_CLOUD_PROJECT_NUMBER` | GCP project for Play Integrity | Optional (`''`) | `""` | Google Play Console | Yes |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account JSON string for Play Integrity | Optional (`''`) | `""` | Google Cloud IAM | Yes |
| `INTEGRITY_DISTRIBUTION_MODE` | `sideload` or `play_store` | Optional | `sideload` | Staging APK distribution | Yes |
| `INTEGRITY_ENFORCEMENT_MODE` | `monitor` or `enforce` | Optional | `monitor` | Safe staging rollout | Yes |
| `PRIVATE_STREAM_TOKEN_KEY` / `PRIVATE_STREAM_TOKEN_TTL_SECONDS` | Optional private stream signing (`''` / `1800`) | Optional | `""` / `1800` | Config default | Yes |
| `GEMINI_API_KEY` | Optional AI transcript MCQ generation key (`gamifiedQuizService.js`) | Optional | `""` (omit unless testing AI MCQs) | Google AI Studio | Yes |
| `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` | In-memory preview admin defaults only (`adminStoreExtension.js`) | Unused on Supabase | Omit (use staging DB `admin_users` seed) | Local preview only | No |

*(Note: Backend logs via `console.log`/`console.error`; Render captures `stdout`/`stderr` natively with no `LOG_LEVEL` env var needed.)*

---

## 3. FFmpeg, FFprobe & System Package Readiness

1. **Non-Blocking Fallback Verified ([ffmpegProcessor.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/ffmpegProcessor.js#L205-L260)):**
   - `ffmpeg-static` is **not** in `backend/package.json`.
   - When `ffmpeg`/`ffprobe` binaries are absent on Render's native Node environment, `prepareOfflineMp4()` validates the ISO `ftyp` MP4 header and gracefully copies the uploaded MP4 verbatim onto `OFFLINE_VIDEO_STORAGE_DIR`. Deployment will **not** fail if `ffmpeg` is missing.
2. **When `ffmpeg`/`ffprobe` Are Needed:** Resolution transcoding (`targetHeight`), automatic `ffprobe` duration/quality detection, and `-movflags +faststart` moov-atom relocation require `ffmpeg`/`ffprobe` binaries.
   - **Recommended Staging Approach:** Verify `which ffmpeg` on Render Node build/shell first; if missing and transcoding is desired, either pre-encode staging MP4s locally with `+faststart` or migrate the Render service runtime to a minimal `Dockerfile` installing `ffmpeg` (`apt-get install -y ffmpeg`).

---

## 4. Non-Blocking Configuration Note (Code Observation)

- `backend/src/config/env.js:23` still defaults `SUBSCRIPTION_PLAN_CODE` to `'CLASS10_ANNUAL_499'`, which Migration `009` sets `is_active = FALSE`. Setting `SUBSCRIPTION_PLAN_CODE=CLASS10_ANNUAL_799` explicitly in Render staging env avoids falling back to an inactive plan.
