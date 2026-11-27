# PHASE 9.0 — TARGET HOSTED STAGING ARCHITECTURE

**Project:** Class 10 LMS — AP & Telangana SSC
**Status:** Preparation Only (Zero resources created or deployed)
**Verified Staging Commit:** `1995379fd8f7ffdfd1130657d2ec0d793356478a` (`staging` / `origin/staging`)
**Production Baseline (`main` / `origin/main`):** `ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579` (Untouched)

---

## 1. End-to-End Staging Topology

```text
+------------------------------------------+        +------------------------------------------+
|     Android Staging APK (Capacitor)      |        |     Admin Portal (Staging Static UI)     |
| - appId: in.class10lms.ssc               |        | - Vite build (admin-portal/dist)         |
| - VITE_API_BASE_URL=                     |        | - VITE_API_BASE_URL=                     |
|   https://staging-api.class10lms.in      |        |   https://staging-api.class10lms.in      |
|   /api/v1                                |        |   /api/v1/admin                          |
| - Offline Vault:                         |        +--------------------+---------------------+
|   context.noBackupFilesDir/offline_lessons|                            |
+--------------------+---------------------+                             |
                     | HTTPS (TLS 1.2+, cleartextTrafficPermitted=false) | HTTPS + CORS Allowlist
                     +------------------------+--------------------------+
                                              |
                                              v
                              +-------------------------------+
                              |  staging-api.class10lms.in    |
                              |  (DNS CNAME -> Render Host)   |
                              +---------------+---------------+
                                              |
                                              v
+------------------------------------------------------------------------------------------------+
|                         Render Starter Web Service (Node.js 22.14.0)                           |
| - Branch: staging  |  Bind: 0.0.0.0:$PORT  |  TRUST_PROXY=1                                    |
| - Health: GET /health & GET /api/v1/health                                                     |
| - Auth/JWT, Device Limits, PaymentService (RAZORPAY_MODE=test), Admin CMS, Offline Leases      |
+-------------------------------+----------------------------------------+-----------------------+
                                |                                        |
         HTTPS (Service Role + Anon Auth)                       Local POSIX Filesystem I/O
                                |                                        |
                                v                                        v
+-----------------------------------------------+     +------------------------------------------+
|     Separate Supabase Staging Project         |     | Render Persistent Disk (10 GB SSD)       |
| - Suggested Name: class10-lms-staging         |     | Mount: /var/data/class10lms              |
| - Migrations 001..010 + RLS                   |     |  +-- /offline_videos (MP4 Byte-Range)    |
| - GoTrue Auth + PostgREST                     |     |  +-- /tmp_jobs       (Temp uploads/jobs) |
| - NEVER connected to hxllgasepsxrpsonljct     |     |  +-- /resources      (Admin PDFs/notes)  |
+-----------------------------------------------+     +------------------------------------------+
                                |
                                | Server-to-Server HTTPS + HMAC Webhook
                                v
                      +-------------------+
                      | Razorpay Test Mode|
                      | (rzp_test_* only) |
                      +-------------------+
```

---

## 2. Strict Staging vs Production Isolation

| Domain / Layer | Hosted Staging Target | Existing Production (Untouched) |
| :--- | :--- | :--- |
| **Git Branch** | `staging` (`1995379fd8f7ffdfd1130657d2ec0d793356478a`) | `main` (`ee720cfd0a3cf2a4ced9114ca0cb337aea7d4579`) |
| **Backend Host** | New Render Starter service (`staging-api.class10lms.in`) | `srv-dc41v1vf3r2c73a29agg` (`api.class10lms.in`) |
| **PostgreSQL / Auth** | New `class10-lms-staging` project | `hxllgasepsxrpsonljct` |
| **Disk Storage** | New 10 GB Render Persistent Disk `/var/data/class10lms` | Independent (not shared) |
| **Cloud Object Storage** | **Prohibited / Disabled** (`CLOUD_STORAGE_DISABLED`) | Prohibited (`persistent_disk` policy) |
| **Payment Gateway** | `RAZORPAY_MODE=test` (`rzp_test_*`) | Untouched |
| **Admin Portal** | Separate staging build pointing to `staging-api.class10lms.in/api/v1/admin` | Separate |
| **Android APK** | Built with staging `VITE_API_BASE_URL` (local QA build only) | Production `DEFAULT_PROD_API_BASE_URL` preserved |

---

## 3. Code-Verified Backend Route & Data Flow Summary

- **Entrypoint & Health:** [backend/src/server.js](file:///d:/Downloads/Android%20apk%20file/backend/src/server.js) binds `0.0.0.0` on `config.PORT`; [backend/src/app.js](file:///d:/Downloads/Android%20apk%20file/backend/src/app.js#L65-L72) and [health.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/health.routes.js) serve `GET /health` and `GET /api/v1/health`.
- **Database Clients:** [backend/src/config/supabase.js](file:///d:/Downloads/Android%20apk%20file/backend/src/config/supabase.js) initializes `supabaseAdmin` (`SUPABASE_SERVICE_ROLE_KEY`) and `supabaseAuth` (`SUPABASE_ANON_KEY`) with `persistSession: false`.
- **Auth & Device Binding:** [auth.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/auth.routes.js) + [devices.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/devices.routes.js) + [deviceService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/deviceService.js) enforce HMAC-SHA256 `DEVICE_HASH_SECRET` hashing and `MAX_DEVICES_PER_STUDENT`.
- **Online Video Playback & Leases:** [playback.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/playback.routes.js) (`POST /authorize`, `GET/HEAD /stream/:streamToken`, `POST /progress`) and [offlineDownloads.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/offlineDownloads.routes.js) (`/lessons/:lessonId/download`, `/downloads/:downloadId/manifest`, `GET/HEAD /downloads/:downloadId/stream`, `POST /downloads/lease/refresh`).
- **Admin CMS & Persistent Uploads:** [admin.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/admin.routes.js) (`POST /resources`, `GET /resources/:id/file`) + [offlineDownloads.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/offlineDownloads.routes.js#L277-L376) (`POST /admin/lessons/:lessonId/offline-assets/upload`).
- **Payments:** [payments.routes.js](file:///d:/Downloads/Android%20apk%20file/backend/src/routes/payments.routes.js) (`/create-order`, `/verify`, `/failure`, `/orders/:orderId/status`, `/history`, `/webhook`) + [paymentService.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/paymentService.js).
