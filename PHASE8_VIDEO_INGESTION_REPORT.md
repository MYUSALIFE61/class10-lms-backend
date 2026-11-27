# Phase 8 — First Production Video Ingestion & Android Offline Playback Report

**Document ID:** `PHASE8-VIDEO-INGESTION-2026-11`  
**Audit / Execution Timestamp:** November 26, 2026 (21:20 IST)  
**Target File:** `D:\Downloads\10thclass Maths videos\ap 10th class Maths chapter-4\AP_SSC_Class10_Ch4_L1_Pair_of_Linear_Equations_Intro.mp4`  
**Target Curriculum Path:** AP SSC → Class 10 → Mathematics → Chapter 4 (*Pair of Linear Equations in Two Variables*) → Lesson 1  
**Overall Execution Status:** **STOPPED AT STAGE 1 (BLOCKED — Persistent Storage & Preconditions Not Verified)**

---

## Executive Summary

Per Phase 8 instructions (*"Do not upload until all checks pass"* and *"Stop immediately if persistent storage or video authorization cannot be verified"*), execution **halted cleanly at Stage 1** prior to any file upload, lesson creation, or production infrastructure modification.

No production data, database rows, Render configuration, DNS records, encryption logic, or payment settings were altered.

| Stage | Scope | Status | Blocking / Verified Finding |
| :--- | :--- | :---: | :--- |
| **Stage 1: Storage Readiness** | Configured provider, persistence, buckets, max size | **BLOCKED (FAIL)** | Render is on **`free`** plan with **0 attached disks (`[]`)**, making `OFFLINE_VIDEO_STORAGE_PROVIDER=persistent_disk` **ephemeral**. Fallback `supabase_storage` has **0 buckets (`[]`)** and a **50 MB (`52,428,800` B)** upload limit vs the **123.82 MB (`129,836,243` B)** MP4. |
| **Stage 2: Lesson Metadata** | Chapter 4 identification & Lesson 1 state | **READ-ONLY CHECKED** | Mathematics Chapter 4 exists (`id: e69d3f6f-193b-4e65-a445-16d049fcd4cd`). `public.lessons` has **0 rows**. Lesson 1 creation deferred until Stage 1 storage is unblocked and admin auth is seeded. |
| **Stage 3: Video Ingestion** | MP4 upload & SHA-256 verification | **NOT EXECUTED (STOPPED)** | Stopped by Stage 1 gate. Local MP4 validated read-only: **`129,836,243` bytes (123.82 MB)**, valid ISO `ftypisom` header, SHA-256: `601d5670939b055cc14183d350a56495b4d985a0524cf69f141c790cd11d035a`. |
| **Stage 4: Student Authorization** | Admin upload auth & student entitlement | **BLOCKED / NOT EXECUTED** | `public.admin_users` has **0 rows** (no admin account to perform upload). `public.subscriptions` has **0 active paid subscriptions**. |
| **Stage 5: Android Online Playback** | Physical device online streaming (`playbackService`) | **BLOCKED / NOT EXECUTED** | Physical device **disconnected** (`adb devices` empty); `api.class10lms.in` returns **NXDOMAIN**; `PlaybackService` requires `lesson_video_sources` (`youtube_unlisted` / `private_stream` / `cloudflare_r2`), not `lesson_video_assets` alone. |
| **Stage 6: Android Offline Download** | AES-256-GCM download & Airplane Mode playback | **BLOCKED / NOT EXECUTED** | Blocked by Stages 1, 3, 4, and disconnected physical Android device. |

---

## Stage 1 — Storage Readiness Inspection (Actual Evidence)

### 1.1 Configured Storage Provider & Render Infrastructure
* **Render Service ID:** `srv-dc41v1vf3r2c73a29agg` (`class10-lms-backend`)
* **Render Service Plan:** `free` (Region: `singapore`)
* **Attached Persistent Disks (`GET /v1/disks?serviceId=srv-dc41v1vf3r2c73a29agg`):** `[]` (`serviceDetails.disk = None`)
* **Environment Variables on Render:**
  * `OFFLINE_VIDEO_STORAGE_PROVIDER = persistent_disk`
  * `OFFLINE_VIDEO_STORAGE_DIR` = *(unset — defaults to `DEFAULT_PERSISTENT_OFFLINE_DIR`: `/opt/render/project/src/backend/storage/offline_videos`)*
  * `OFFLINE_MAX_UPLOAD_MB = 1024`
  * `OFFLINE_RETENTION_POLICY = wipe_on_logout`
* **Source Code Verification:**
  * `backend/src/services/offlineStorageService.js` (`OfflineStorageService.commitPreparedFile`, lines 125–142) writes uploaded files to `this.resolvePersistentDiskPath(uniqueKey)`.
* **Verdict — FAIL (Ephemeral Filesystem):**
  Because the Render Web Service is running on the **`free`** tier with no attached persistent disk, `/opt/render/project/src/backend/storage/offline_videos` is **ephemeral container storage**. Any uploaded MP4 is permanently lost whenever the Render free instance spins down after ~15 minutes of inactivity, restarts, or redeploys.

### 1.2 Alternative Provider Verification: `supabase_storage`
* **Storage Buckets (`GET https://hxllgasepsxrpsonljct.supabase.co/storage/v1/bucket` & SQL `SELECT * FROM storage.buckets;`):** `[]` (no bucket configured; `lesson-offline-videos` does **not** exist).
* **Storage RLS Policies (`SELECT * FROM pg_policies WHERE schemaname = 'storage';`):** `[]` (no policies).
* **Project Storage Global Limit (`GET https://api.supabase.com/v1/projects/hxllgasepsxrpsonljct/config/storage`):**
  * `fileSizeLimit`: **`52428800` bytes (50 MB)**
  * `s3Protocol.enabled`: `true`
  * `migrationVersion`: `s3-multipart-uploads-parts-index`
* **Source Code Implementation (`backend/src/services/offlineStorageService.js`, lines 110–123):**
  * Uses `supabaseAdmin.storage.from(this.supabaseBucket).upload(uniqueKey, fileStream, { contentType: 'video/mp4', duplex: 'half', upsert: true })` (single-PUT upload) and serves files privately via `createSignedUrl(..., 900)` proxied through Node.js `_proxyHttpsRangeStream()`.
* **Verdict — FAIL (Bucket Missing & File Exceeds Limit):**
  Even if switched to `supabase_storage`, no private bucket exists and the **123.82 MB** (`129,836,243` bytes) target MP4 exceeds the configured **50 MB** (`52,428,800` bytes) project upload limit by **2.48×**.

### 1.3 Alternative Provider Verification: `cloudflare_r2`
* **Environment Variables on Render:** `VIDEO_STORAGE_PROVIDER` unset (`none`), `R2_CUSTOM_DOMAIN` unset, `R2_SIGNING_SECRET` unset.
* **Source Code Gap:** `OfflineStorageService.commitPreparedFile()` (`backend/src/services/offlineStorageService.js`, lines 106–143) does **not** implement uploading to Cloudflare R2 — it only supports `supabase_storage` and `persistent_disk` for binary upload. `cloudflare_r2` only supports external pre-uploaded object registration (`POST /api/v1/admin/lessons/:lessonId/offline-assets`) and signed custom-domain edge proxying (`CloudflareR2Adapter`).

### 1.4 Upload Limits & Request Pipeline Audit
* **Application Streaming Upload Limit:** `OFFLINE_MAX_UPLOAD_MB = 1024` (1,024 MB) enforced incrementally on stream chunks in `OfflineDownloadService.uploadAuthorizedMp4Asset()` (`backend/src/services/offlineDownloadService.js`, line 705).
* **Express Buffer Isolation:** `POST /api/v1/admin/lessons/:lessonId/offline-assets/upload` streams the raw `video/mp4` body straight to disk (`DEFAULT_OFFLINE_TEMP_DIR`), bypassing `express.json({ limit: '20mb' })`.
* **Security & Public Access:** Source files are never exposed via public URLs; both `persistent_disk` and `supabase_storage` proxy bytes exclusively behind HMAC-signed short-lived download tokens (`GET /api/v1/downloads/:downloadId/stream?token=...`).

---

## Stage 2 & Local MP4 Read-Only Verification

### Local MP4 Integrity (Verified Read-Only)
* **Path:** `D:\Downloads\10thclass Maths videos\ap 10th class Maths chapter-4\AP_SSC_Class10_Ch4_L1_Pair_of_Linear_Equations_Intro.mp4`
* **Size:** `129,836,243` bytes (**123.82 MB**)
* **Header Bytes (0..15):** `000000206674797069736f6d00000200` (Valid ISO Base Media MP4 container, `ftypisom`)
* **SHA-256 Digest:** `601d5670939b055cc14183d350a56495b4d985a0524cf69f141c790cd11d035a`

### Curriculum Database State (Read-Only)
* **Subject:** `mathematics` (`id: 1ef76ba8-f826-47dd-8f88-c5796c23e70e`, `board: BOTH`)
* **Chapter 4:** `Pair of Linear Equations in Two Variables` (`id: e69d3f6f-193b-4e65-a445-16d049fcd4cd`, `chapter_number: 4`)
* **Lessons (`public.lessons`):** `0` rows
* **Offline Video Assets (`public.lesson_video_assets`):** `0` rows
* **Online Video Sources (`public.lesson_video_sources`):** `0` rows
* **Admin Accounts (`public.admin_users`):** `0` rows

---

## Stage 5 & 6 Readiness Checks (Online & Offline Playback Dependencies)

1. **Online Playback Source Gap (`backend/src/services/playbackService.js` lines 200–273):**
   * `POST /api/v1/playback/authorize` requires a row in `public.lesson_video_sources` (`youtube_unlisted`, `private_stream`, `pikpak_local`, or `cloudflare_r2`).
   * Uploading solely via `/offline-assets/upload` populates `public.lesson_video_assets` (offline download only), not `public.lesson_video_sources`. Thus **Stage 5 (online playback)** requires either configuring a `private_stream` / `cloudflare_r2` source in `lesson_video_sources` or extending `PlaybackService` to stream from `lesson_video_assets` (with approval).
2. **Custom Domain DNS (`api.class10lms.in`):**
   * DNS resolution still fails (`getaddrinfo failed` / `NXDOMAIN`), while the Android app enforces `https://api.class10lms.in/api/v1` and `cleartextTrafficPermitted="false"`.
3. **Physical Device (`iQOO Z7s 5G` / `10BD750FUC0006P`):**
   * `adb devices -l` shows **0 devices attached** (USB connection disconnected).

---

## Required Approvals / Actions Before Proceeding

To unblock Stages 1–6 safely without violating production controls:

1. **Approve Durable Video Storage Configuration (Choose One):**
   * **Option A — Cloudflare R2 (Recommended Commercial Production, $0 Egress):** Provide an R2 bucket (`R2_ACCOUNT_ID`, S3 access key/secret or custom worker domain `R2_CUSTOM_DOMAIN` + `R2_SIGNING_SECRET`), and approve adding S3-compatible R2 upload support (or direct presigned R2 upload + external asset registration) and enabling R2 online streaming. *(Can also share the same R2 object for Stage 5 online playback + Stage 6 offline encrypted download.)*
   * **Option B — Render Paid Plan + Persistent Disk:** Approve upgrading Render service `srv-dc41v1vf3r2c73a29agg` from `free` to a paid Starter plan and attaching a Persistent Disk mounted at e.g. `/var/data/offline_videos` (`OFFLINE_VIDEO_STORAGE_DIR=/var/data/offline_videos`), plus decide whether `PlaybackService` should also stream from that disk for Stage 5.
   * **Option C — Supabase Pro Storage (`supabase_storage`):** Requires Supabase Pro (Free tier caps single-object uploads at 50 MB; target MP4 is 123.82 MB) and approval to create a private `lesson-offline-videos` bucket + switch `OFFLINE_VIDEO_STORAGE_PROVIDER=supabase_storage`.
2. **Approve Admin & Test Student Provisioning:**
   * Approve seeding the `super_admin` user in `public.admin_users` (e.g., `rk5759706@gmail.com`) and creating Chapter 4 Lesson 1 + a designated test student account with an active test/pilot entitlement (without initiating a real Razorpay charge).
3. **DNS & Physical Device:**
   * Add the `CNAME` record for `api.class10lms.in` → `class10-lms-backend.onrender.com` so the installed APK can reach the live server over HTTPS.
   * Reconnect the `iQOO Z7s 5G` via USB with USB Debugging authorized (`adb devices`).
