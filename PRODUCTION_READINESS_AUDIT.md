# Class 10 SSC LMS — Comprehensive Production Readiness Audit

**Document:** `PRODUCTION_READINESS_AUDIT.md`  
**Application Target:** Class 10 SSC LMS (`in.class10lms.ssc`)  
**Backend Target:** Node.js 20+ Express API on Render (`srv-dc41v1vf3r2c73a29agg`)  
**Production API Hostname:** `https://api.class10lms.in/api/v1`  
**Audit Type:** Strict READ-ONLY Infrastructure & Code Readiness Inspection  
**Audit Date:** November 26, 2026 (Local: 19:35 IST)  
**Auditor:** Senior Software Architect, Security Auditor & DevSecOps Specialist  

---

## 1. Executive Summary & Audit Matrix

This read-only audit evaluates the current operational, cryptographic, cloud hosting, and database readiness of the Class 10 LMS backend for production launch.

| Audit Phase | Evaluation Scope | Method | Status | Core Technical Finding |
| :--- | :--- | :--- | :---: | :--- |
| **Phase 1: Backend Configuration** | Codebase, bindings, CORS & auth | Code inspection & `npm test` | **PASS (Code)** / **BLOCKED (Startup)** | 26/26 backend tests passed. Server binds to `0.0.0.0` on `process.env.PORT`. Express crashes on boot solely due to missing required database/JWT secrets. |
| **Phase 2: Supabase Readiness** | Database schema, RLS & client | Schema migrations audit | **PARTIAL** | Schemas 001–008 define robust PostgreSQL tables with RLS enabled. Production database credentials (`SUPABASE_URL`, keys) have not yet been provided to Render. |
| **Phase 3: Video Storage Architecture** | Storage providers & encryption | Source code & pipeline check | **VERIFIED** | Code supports `persistent_disk`, `supabase_storage`, `cloudflare_r2`, and `pikpak_local`. Render's container disk is **ephemeral**. Encrypted chunking happens client-side. |
| **Phase 4: Payment Gateway** | Razorpay checkout & webhooks | `paymentService.js` audit | **PASS** | HMAC-SHA256 signature verification with timing-safe comparisons implemented. Idempotent webhook handling verifies `payment.captured` state. |
| **Phase 5: Security & Git History** | Git tracked files & credential leaks | Git log & grep audit | **PASS (Secrets)** / **CAUTION (Visibility)** | Zero `.env` files, keystores, or private tokens are tracked in Git. The GitHub repository is currently **Public**; intellectual property should be made Private. |
| **Phase 6: Domain & HTTPS** | DNS resolution & TLS status | `Resolve-DnsName` & Render API | **BLOCKED** | `api.class10lms.in` returns `NXDOMAIN`. Render custom domain is `unverified`. TLS issuance is paused until CNAME record is created. |

---

## 2. Phase 1 — Backend Configuration & Server Bindings

### 2.1 Server Binding & Process Port Handling
- **Source Inspection:** `backend/src/server.js` and `backend/src/config/env.js`.
- **Binding Logic:**
  ```javascript
  const server = app.listen(config.PORT, () => {
    console.log(`[class10-lms-backend] Running on port ${config.PORT} (${config.NODE_ENV})`);
  });
  ```
  `app.listen(port)` without host parameter binds to `0.0.0.0` / `::` across all network interfaces, satisfying containerized deployment on Render.
- **Port Resolution:** `PORT: z.coerce.number().int().min(1).max(65535).default(4000)`. Render injects its assigned runtime port dynamically via `process.env.PORT`.

### 2.2 Health Endpoint & API Route Structure
- **Endpoint:** `GET /api/v1/health`
- **Controller:** `backend/src/routes/health.routes.js`
- **Response Format:**
  ```json
  {
    "success": true,
    "status": "ok",
    "service": "class10-lms-backend",
    "timestamp": "2026-11-26T14:00:00.000Z"
  }
  ```
- **Routing Namespace:** All student, playback, curriculum, admin, and download routes are mounted under `/api/v1/`.

### 2.3 CORS & Allowed Origins
- **Middleware:** `backend/src/middleware/security.js`
- **Configured Origins:** `ALLOWED_ORIGINS=https://localhost,https://app.class10lms.in,http://localhost:5173`
- **Mobile Native Handling:** Requests without an `Origin` header (such as native Capacitor Android requests or server webhooks) are automatically permitted (`if (!origin) return callback(null, true);`).
- **Exposed Streaming Headers:** Exposes `Content-Range`, `Accept-Ranges`, `Content-Length`, `X-Content-SHA256` for resumable download support.

### 2.4 Authentication, Session Revocation & Device Limits
- **Implementation:** `backend/src/services/authService.js` and `backend/src/services/deviceService.js`.
- **JWT TTLs:** Access token TTL: `15m`; Refresh token TTL: `7 days`.
- **Device Binding:** Device identifier HMAC computed using `DEVICE_HASH_SECRET`.
- **Concurrent Session Enforcement:** Limits student sessions to `MAX_DEVICES_PER_STUDENT=1` with automatic session revocation on new logins (`CONCURRENT_SESSION_WINDOW_MINUTES=10`).

---

## 3. Phase 2 — Supabase Verification & Database Readiness

### 3.1 Schema & Migrations Audit
The repository contains 8 production migration files in `supabase/migrations/`:
- `001_initial_schema.sql`: Core users, subjects, chapters, topics, lessons, devices, subscriptions.
- `002_rls_policies.sql`: Row Level Security policies enforcing student data isolation.
- `003_seed_ap_ts_syllabus_template.sql`: Andhra Pradesh & Telangana SSC 6-subject curriculum structure.
- `004_private_stream_provider.sql`: Vault for private stream tokens and video providers.
- `005_video_provider_sync.sql`: Sync tables for cloud-hosted video metadata.
- `006_admin_portal_cms.sql`: Admin roles, permissions, audit logs, and question banks.
- `007_gamified_video_mcq.sql`: Gamified video quiz questions, student XP, badges, streaks.
- `008_offline_video_downloads.sql`: `lesson_video_assets` and `student_downloads` tables.

### 3.2 Service-Role Credential Isolation
- The `SUPABASE_SERVICE_ROLE_KEY` is exclusively consumed by Node.js backend processes (`backend/src/config/supabase.js`) to bypass RLS for administrative verification, transaction settlement, and offline download ticket issuance.
- The student mobile app bundle (`frontend/`) contains zero references to the service role key.

### 3.3 Database Status
- **Status:** **BLOCKED ON RENDER**
- **Reason:** The production Supabase URL and service keys have not yet been provided or configured in Render. The backend cannot establish a database connection until these secrets are set.

---

## 4. Phase 3 — Video Storage Architecture & Recommendation

### 4.1 Storage Provider Implementations in Code
Inspection of `backend/src/services/offlineStorageService.js` verified support for four distinct providers:

| Provider Key | Implementation Status | Range Resume (206)? | Commercial Safety | Render Filesystem Suitability |
| :--- | :---: | :---: | :---: | :--- |
| `persistent_disk` | **Fully Implemented** | Yes | Yes | **Ephemeral on Render Free** (wipes on deploy/restart). Requires paid Persistent Disk ($0.25/GB/mo). |
| `supabase_storage` | **Fully Implemented** | Yes (via signed URL) | Yes | **Safe for pilot** (persists indefinitely). Subject to Supabase bandwidth egress limits. |
| `cloudflare_r2` | **Fully Implemented** | Yes (via Worker) | Yes | **Best for commercial scale** ($0 egress, unlimited bandwidth). |
| `pikpak_local` | **Fully Implemented** | Yes | **NO (Personal Only)**| Strictly for local testing; forbidden for commercial production. |

### 4.2 Offline Encryption Architecture (Crucial Verification)
A common misconception is that source MP4 videos are encrypted on the server before storage. The audit verified the actual architecture:
1. **Server Storage:** The server stores the authorized, optimized MP4 asset in private storage (`backend/storage/offline_videos` or private Supabase/R2 bucket).
2. **Download Gate:** When an active paid student requests a download, the backend verifies device binding and subscription status, generating a short-lived (1800s) signed HMAC download token.
3. **Client-Side Hardware Encryption:** `Class10OfflineDownloadPlugin.kt` streams the HTTP response in 64 KB blocks on the Android device, encrypting each chunk using **AES-256-GCM** with a hardware TEE/StrongBox key from `AndroidKeyStore`.
4. **Playback Decryption:** `EncryptedOfflineDataSource.kt` decrypts chunks on-the-fly and validates the 16-byte GCM authentication tag before delivering bytes to Media3 ExoPlayer in memory.
5. **Security Verdict:** Server storage remains secure behind authenticated private endpoints, while the physical Android device stores strictly encrypted `.enc` files that cannot be copied or played on another device.

### 4.3 Recommended Storage Configuration
> [!TIP]
> **Production Recommendation:**
> - **Immediate Pilot / Launch:** Configure `OFFLINE_VIDEO_STORAGE_PROVIDER=supabase_storage` with bucket `lesson-offline-videos`. This eliminates the need for managing attached VPS/Render disks and ensures video files survive backend restarts with zero extra server configuration.
> - **Scale (>500 Paid Students):** Transition to `OFFLINE_VIDEO_STORAGE_PROVIDER=cloudflare_r2` to benefit from **$0 egress fees**.

---

## 5. Phase 4 — Payment Gateway & Webhook Idempotency

### 5.1 Razorpay Order Creation & Verification
- **Order Generation:** `createOrder()` in `backend/src/services/paymentService.js` creates orders with amount `49900` paise (₹499) bound to the student ID.
- **Signature Verification:** Uses timing-safe HMAC-SHA256 comparison:
  ```javascript
  const expectedSignature = hmacSha256Hex(
    this.config.RAZORPAY_KEY_SECRET,
    `${razorpayOrderId}|${razorpayPaymentId}`
  );
  if (!timingSafeEqualHex(expectedSignature, razorpaySignature)) {
    throw new ForbiddenError('Invalid Razorpay payment signature');
  }
  ```

### 5.2 Webhook Idempotency & Replay Protection
- `handleWebhook()` validates the `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET` on `rawBody`.
- **Idempotency Guard:**
  ```javascript
  if (event === 'payment.captured') {
    if (tx.status === 'captured') {
      return { handled: true, idempotent: true };
    }
  }
  ```
  Repeated or delayed webhook deliveries will not double-credit subscriptions or cause duplicate transactions.

---

## 6. Phase 5 — Security & Credential Leak Audit

### 6.1 Git Repository & History Inspection
- **Repository:** `https://github.com/MYUSALIFE61/class10-lms-backend`
- **Visibility:** **Public**
- **Tracked Files Audit:**
  - `git ls-files` confirmed that zero `.env`, `keystore.properties`, `*.jks`, or credentials are committed.
  - `.gitignore` rigorously excludes all keys, secrets, build outputs, and crash logs.
- **History Content Scan:** `git grep` confirmed no live JWT secrets, Supabase service-role keys, or Razorpay live secrets exist in any commit.

### 6.2 Security Risk & Recommendation
- **Risk:** Because the GitHub repository is public, proprietary curriculum structure and custom backend logic are open to public view.
- **Remediation:** In GitHub Repository Settings > Danger Zone, change visibility from **Public to Private**. Render's connected GitHub integration will continue to deploy without interruption.

---

## 7. Phase 6 — Domain, DNS & HTTPS Status

### 7.1 DNS Resolution
Command: `Resolve-DnsName -Name "api.class10lms.in" -Server 8.8.8.8`
- **Result:** `DNS_ERROR_RCODE_NAME_ERROR` (`NXDOMAIN`).
- **Status:** **BLOCKED**. No CNAME record has been created at the domain registrar.

### 7.2 Render Custom Domain & TLS
Query: Render API `custom-domains/cdm-dc4216p5efls73cr9l30`
- **Domain Name:** `api.class10lms.in`
- **Verification Status:** `unverified`
- **TLS Certificate:** Not yet issued. Render will automatically issue a Let's Encrypt certificate once the CNAME resolves.

---

## 8. Missing Configuration Breakdown

To transition the Render Web Service (`srv-dc41v1vf3r2c73a29agg`) from `build_succeeded / deploy_failed` to `Live`:

| Environment Variable | Status on Render | Action Required |
| :--- | :---: | :--- |
| `NODE_ENV` | **Configured** (`production`) | None |
| `TRUST_PROXY` | **Configured** (`1`) | None |
| `ALLOWED_ORIGINS` | **Configured** (`https://localhost,https://app.class10lms.in,http://localhost:5173`) | None |
| `SUBSCRIPTION_PLAN_CODE` | **Configured** (`CLASS10_ANNUAL_499`) | None |
| `MAX_DEVICES_PER_STUDENT` | **Configured** (`1`) | None |
| `CONCURRENT_SESSION_WINDOW_MINUTES` | **Configured** (`10`) | None |
| `OFFLINE_VIDEO_STORAGE_PROVIDER` | **Configured** (`persistent_disk`) | Recommend switching to `supabase_storage` |
| `OFFLINE_MAX_UPLOAD_MB` | **Configured** (`1024`) | None |
| `OFFLINE_RETENTION_POLICY` | **Configured** (`wipe_on_logout`) | None |
| `SUPABASE_URL` | **MISSING** | User must provide valid `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | **MISSING** | User must provide Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **MISSING** | User must provide Supabase service role key |
| `JWT_ACCESS_SECRET` | **MISSING** | Requires 32+ character random hex secret |
| `JWT_REFRESH_SECRET` | **MISSING** | Requires 32+ character random hex secret |
| `DEVICE_HASH_SECRET` | **MISSING** | Requires 32+ character random hex secret |
| `RAZORPAY_KEY_ID` | **MISSING** | User must provide Razorpay Key ID (`rzp_...`) |
| `RAZORPAY_KEY_SECRET` | **MISSING** | User must provide Razorpay Secret |
| `RAZORPAY_WEBHOOK_SECRET` | **MISSING** | User must provide Razorpay Webhook Secret |

---

## 9. Exact Remaining Manual Actions

```
[ACTION 1: DOMAIN REGISTRAR (GoDaddy / Hostinger / Cloudflare)]
  Create CNAME record:
    Type:   CNAME
    Name:   api
    Target: class10-lms-backend.onrender.com
    TTL:    300 (or Automatic)

[ACTION 2: GITHUB PRIVACY]
  Open https://github.com/MYUSALIFE61/class10-lms-backend/settings
  Under "Change repository visibility", switch repository to Private.

[ACTION 3: PRODUCTION CREDENTIALS]
  Supply the 9 missing secrets listed in Section 8 so they can be injected 
  into Render via the Render REST API, immediately bringing the service to Live status.

[ACTION 4: PHYSICAL DEVICE TEST]
  Once Live, launch the app on your iQOO Z7s 5G, download the 123.8 MB curriculum 
  video using Chunked AES-256-GCM, enable Airplane Mode, and verify offline playback.
```
