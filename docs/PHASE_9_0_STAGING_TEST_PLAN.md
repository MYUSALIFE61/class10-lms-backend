# PHASE 9.0 — HOSTED STAGING TEST PLAN & RAZORPAY TEST MODE MATRIX

**Status:** Preparation Only — **Zero** hosted tests, real video uploads, or load tests executed yet.

---

## 1. Razorpay Test Mode Safeguards

- **Required Env:** `RAZORPAY_MODE=test`, `RAZORPAY_KEY_ID=rzp_test_<id>`, `RAZORPAY_KEY_SECRET=<test_secret>`, `RAZORPAY_WEBHOOK_SECRET=<test_webhook_secret>`.
- **Built-in Gateway Guard ([paymentService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/paymentService.js#L254-L263)):** Backend throws `403` if `RAZORPAY_MODE !== 'live'` while `RAZORPAY_KEY_ID` does not start with `rzp_test_`.
- **Webhook Verification ([paymentService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/paymentService.js#L606-L650)):** Raw body (`req.rawBody`) HMAC-SHA256 verified against `X-Razorpay-Signature`, duplicate `X-Razorpay-Event-Id` / `processedEventIds` ignored idempotently, status polling via `/api/v1/payments/orders/:orderId/status`, subscription activated **only** on captured payment (`payment.status === 'captured'`).

---

## 2. Private Persistent-Disk Video Validation Plan

Target staging directories on `/var/data/class10lms`: `offline_videos/`, `tmp_jobs/`, `resources/`.
1. **Rejection Check:** Confirm `CLOUD_STORAGE_DISABLED` on any `cloudflare_r2`, `s3`, `aws_s3`, `supabase_storage`, or `firebase_storage` reference.
2. **MP4 Upload & Persistence:** Admin uploads a representative synthetic/sample MP4 (`Content-Type: video/mp4`) -> verify `ftyp` check, size `<= OFFLINE_MAX_UPLOAD_MB`, saved under `/var/data/class10lms/offline_videos` -> restart Render staging service -> confirm MP4 & admin PDF (`/var/data/class10lms/resources`) survive restart.
3. **Range Streaming & Access Control:**
   - Unauthenticated/unsubscribed `/api/v1/downloads/:id/stream` or `/api/v1/playback/...` returns `401` or `403`.
   - Authorized `HEAD` / `GET` without `Range` returns `200`; `Range: bytes=0-65535` returns `206 Partial Content` + `Content-Range` + `X-Content-SHA256`.
   - Verify seeking mid-file (`Range: bytes=524288-`) succeeds and no server disk paths or raw `storage_key` appear in JSON responses.
   - Verify disk capacity (`df -h /var/data/class10lms`) stays well under `10 GB` ceiling.

---

## 3. Master Staging Verification Matrix

| Area | Test Case | Expected Hosted Outcome |
| :--- | :--- | :--- |
| **A. Backend** | `GET /health` & `GET /api/v1/health` | HTTP `200`, `{"success":true,"status":"ok"}` |
| **A. Backend** | `GET /auth/check-username`, `POST /auth/register`, `POST /auth/login` (email & username), `/me` | Valid JWT tokens + single active device enforced (`MAX_DEVICES_PER_STUDENT=1`) |
| **A. Backend** | Student lessons (`notes`, `concepts`, `revision`, `pyqs`, `recent-lessons`), `/subscriptions/plans` | Unpaid blocked on premium lessons (`403`); paid unlocked; 3 plans (₹200/₹500/₹799) |
| **A. Backend** | Admin MP4 upload + stream + PDF upload/download + offline lease (`/downloads/lease/refresh`, `/manifest`) | HTTP `200`/`206`, SHA-256 verified, signed lease matches `OFFLINE_LEASE_DAYS` |
| **B. Database** | Run `001`–`010` cleanly on `class10-lms-staging`; test student/subscription/`lesson_progress` rows + GoTrue/PostgREST + RLS JWT deny test | All migrations pass; unsubscribed JWT gets `0` premium rows via RLS; rollback drill verified on empty staging DB before QA seed |
| **C. Payments** | Create Razorpay Test order (`/payments/create-order`), UPI/Card Test success (`/payments/verify`), declined card (`/failure`), duplicate webhook, tampered `X-Razorpay-Signature` | Captured payment activates exact plan duration (`30d`/`180d`/`365d`); duplicate webhook returns `idempotent: true`; forged signature returns `403` |
| **D. Android** | Staging APK (`https://staging-api.class10lms.in/api/v1`) on physical iQOO `I2223` (Android 15): Login -> Dashboard -> Lesson playback -> Encrypted Download -> Airplane Mode playback -> Pause/Resume/Cancel/Retry -> Expired lease block -> 2nd device block -> Logout wipe | Playback & download succeed cleanly; Airplane Mode works off `noBackupFilesDir/offline_lessons/`; logout wipes vault; expired lease blocks offline playback |
| **E. Admin** | Staging Admin login -> Upload MP4 -> Create Lesson -> Assign Video -> Upload PDF -> Create/View Student & Subscription | All CMS changes reflect in Staging Android app; zero impact on production |
| **F. Load Testing** | Execute controlled load script (after explicit go-ahead) at **50**, **100**, and **200** concurrent virtual students hitting `/student/home`, `/lessons/:id`, `/playback/authorize` *(metadata/auth concurrency, not 200 simultaneous 100 MB downloads over 512 MB starter link)* | 100% `2xx` within rate-limit budget (or documented `429` thresholds if single-IP runner) & Render CPU/RAM telemetry observed without OOM |
