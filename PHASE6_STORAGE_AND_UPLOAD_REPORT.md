# PHASE 6 — Private Video Storage & >100 MB Upload Validation Report

**Overall Status:** **COMPLETED AND TESTED** (Local persistent_disk verified with real 105 MB MP4; Cloudflare R2 upload adapter remains **PARTIALLY IMPLEMENTED**)

---

## 1. Critical Mismatch Resolution (`lesson_video_sources` vs `lesson_video_assets`)

- **Finding:** During Part E audit, `PlaybackService.authorizePlayback()` only queried `lesson_video_sources`. Lessons whose MP4 was uploaded via Admin Portal (`lesson_video_assets`) returned `404 VIDEO_UNAVAILABLE` for online streaming.
- **Fix Applied (Local Only, Backed Up First):**
  - Wired `offlineStorageService` into `PlaybackService` (`backend/src/app.js`).
  - Updated `PlaybackService.authorizePlayback()` to fall back to `store.getDefaultDownloadableAssetForLesson(lesson.id)` when no `lesson_video_sources` row exists, returning `provider: 'private_asset_stream'` and a short-lived HMAC-signed stream URL (`/api/v1/playback/stream/:token`).
  - Updated `PlaybackService.streamAuthorizedToken()` to stream `claims.aid` directly through `offlineStorageService.streamAssetToResponse()` with HTTP 200/206 Range support.
- **Result:** Single source of truth achieved — an Admin-uploaded private MP4 now powers **both** online playback AND encrypted offline download without ever leaking raw storage paths, bucket keys, or YouTube URLs.

---

## 2. Real >100 MB MP4 Upload, Interrupt, Retry & SHA-256 Evidence

Executed via `backend/tests/phase6_storage_and_playback_bridge.test.js`:
- **Fixture Generated:** `AP_SSC_Class10_Ch4_L1_105MB.mp4` (`110,100,480` bytes / **105.0 MB** valid `ftypmp42` MP4).
- **Interrupted Upload:** Client aborted mid-stream after `256 KB` → server aborted stream and cleaned up temp job directory cleanly without corrupting storage.
- **Retried Full 105 MB Streaming Upload:**
  - Observed log: `[PHASE 6 >100MB UPLOAD] 105 MB MP4 uploaded & SHA-256 verified in 16239ms (6d3f004b96474ac9...)`
  - **Source vs. Stored SHA-256:** Exact 64-character hex match (`100%` bit-for-bit integrity).
  - **Peak Memory:** Zero full-file memory buffering (streamed directly to disk in `256 KB` chunks).
- **Student Online Playback Bridge:** `POST /api/v1/playback/authorize` returned `200` (`provider: 'private_asset_stream'`), zero storage path/filename leaked, and `GET /api/v1/playback/stream/:token` with `Range: bytes=0-65535` returned `206 Partial Content` (`Content-Range: bytes 0-65535/110100480`).
- **Student Offline Download Authorization:** `POST /api/v1/lessons/:id/download` + `GET /api/v1/downloads/:id/manifest` returned matching `fileSize: 110100480`, matching `sha256Checksum`, and a signed 7-day `offlineLease`.

---

## 3. Storage Provider Architecture Comparison & Recommendation

| Criteria | Render Persistent Disk (`persistent_disk`) | Supabase Storage (`supabase_storage`) | Cloudflare R2 (`cloudflare_r2`) |
|---|---|---|---|
| **Current Implementation** | **COMPLETED AND TESTED** | **COMPLETED AND TESTED** | **PARTIALLY IMPLEMENTED** (Playback signing only; upload pending) |
| **>100 MB File Support** | Yes (up to `OFFLINE_MAX_UPLOAD_MB`, default 1024 MB) | Free tier 50 MB cap; Pro requires TUS resumable | Yes (S3 multipart up to 5 TB) |
| **Egress Cost** | Included in Render service bandwidth | Expensive at scale ($0.09/GB after Pro quota) | **$0 egress** |
| **Private Access & Signed URLs** | Backend HMAC-signed stream proxy (zero public URL) | 900s signed URL proxied through backend | Signed Edge Worker / Presigned S3 URLs |
| **Backup & Operational Complexity** | Simple; requires Render disk snapshot policy | Managed by Supabase | Low cost; requires `@aws-sdk/client-s3` multipart upload |

**First Production Release Recommendation:**
- Use **Render Persistent Disk (`persistent_disk`)** for the **initial pilot release (up to ~300–500 students)** because it is 100% implemented, verified with 105 MB streaming uploads, supports HTTP 206 Range resume, incurs zero egress fees, and requires zero new vendor credentials.
- Before scaling past 500 concurrent students or 100+ GB of lectures, implement S3 multipart upload in `OfflineStorageService.commitPreparedFile()` for **Cloudflare R2** ($0 egress, global edge PoPs).
- **YouTube Policy:** Original MP4s are NEVER ripped or downloaded from YouTube.
