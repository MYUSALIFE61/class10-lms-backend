# CLASS 10 LMS — RENDER PRODUCTION DEPLOYMENT REPORT

**Document ID:** `RENDER-DEPLOY-CLASS10-LMS-2026-11`  
**Application Target:** Class 10 SSC LMS Backend API  
**Render Service ID:** `srv-dc41v1vf3r2c73a29agg`  
**Render Service Name:** `class10-lms-backend`  
**Actual Assigned Render Hostname:** `https://class10-lms-backend.onrender.com`  
**Production Custom Domain:** `api.class10lms.in`  
**Render Domain ID:** `cdm-dc4216p5efls73cr9l30`  
**Execution Timestamp:** November 26, 2026 (Local: 17:36 IST)  
**Auditor:** Senior DevSecOps Engineer, Backend Architect & Security Specialist  

---

## 1. Executive Summary & Status Matrix

The Class 10 LMS Node.js/Express backend has been prepared, committed to GitHub, connected to Render, and configured with build pipelines, custom domains, and baseline environment variables.

| Deployment Phase | Scope / Objective | Method | Status | Findings / Evidence |
| :--- | :--- | :--- | :---: | :--- |
| **Phase 1: Repository Verification** | Codebase, scripts & tests | Git & `npm test` | **PASS** | Repository initialized & pushed to GitHub. `npm start` binds to `process.env.PORT`. All 8 test suites (26 tests) passed with 100% success. |
| **Phase 2: Environment Audit** | Production variable contract | `backend/src/config/env.js` | **PARTIAL** | 9 non-sensitive variables configured via Render API. Sensitive production secrets (Supabase, Razorpay, JWT keys) pending input. |
| **Phase 3: Render Deployment** | Web Service creation & build | Render REST API | **PASS (Build)** / **PENDING (Live)** | Service `srv-dc41v1vf3r2c73a29agg` created in Singapore. Build succeeded (`bld-dc4208cs6fmc73didm90`). Server start paused awaiting database credentials. |
| **Phase 4: Backend Validation** | API health, CORS & routing | Architecture audit | **PENDING** | Pre-configured: `/api/v1/health` and CORS allowing `https://localhost` and `https://app.class10lms.in`. Live verification resumes upon secret injection. |
| **Phase 5: Custom Domain Setup** | `api.class10lms.in` registration | Render Custom Domain API | **PASS** | Registered `cdm-dc4216p5efls73cr9l30` on Render. Exact CNAME instructions generated. |
| **Phase 6: Storage Persistence** | Video file retention audit | Filesystem review | **CAUTION** | Render free/default container filesystem is **ephemeral**. Local disk resets on redeploy. Requires Supabase Storage bucket or Render Persistent Disk. |

---

## 2. Phase 1 — Repository & Backend Verification

### 2.1 Git Repository Details
- **Remote URL:** `https://github.com/MYUSALIFE61/class10-lms-backend.git`
- **Tracked Branch:** `main`
- **Initial Commit Hash:** `a826e1bbb906e4b65c88f7e95e9726e9dff13df3`
- **Deployment Config Commit:** `5ab60c547bbb7ecac22b021fba447f0aaf8863e4`
- **Included Artifacts:**
  - `backend/` (Full Node.js Express source code, migrations, tests)
  - `frontend/` (Capacitor 7 + React 18 student app with AES-256-GCM Kotlin native plugin)
  - `admin-portal/` (React admin management portal)
  - `docs/` (Architectural reports, test results, security audit logs)
  - `supabase/migrations/` (SQL schemas 001 through 008)
- **Security Exclusion (`.gitignore`):**
  - Confirmed exclusion of `.env`, `keystore.properties`, `*.jks`, `*.keystore`, `build/`, `node_modules/`, and crash logs.

### 2.2 Backend Node.js Compatibility & Scripts
- **Engine Constraint:** `node >= 20.0.0` (specified in `backend/package.json`).
- **Render Node Engine Pin:** `.node-version` created with value `20.18.0`.
- **Production Start Script:** `npm start` -> `node src/server.js`.
- **Server Interface Binding:**
  ```javascript
  const server = app.listen(config.PORT, () => {
    console.log(`[class10-lms-backend] Running on port ${config.PORT} (${config.NODE_ENV})`);
  });
  ```
  *Binds to all IPv4/IPv6 interfaces (`0.0.0.0` / `::`), fully compatible with Render's ingress router.*

### 2.3 Automated Backend Test Execution
Command executed: `npm test` inside `backend/`:
```
 RUN  v3.2.7 D:/Downloads/Android apk file/backend

 ✓ tests/phase8_admin_portal_e2e.test.js (2 tests)
 ✓ tests/phase12_offline_video_downloads.test.js (3 tests)
 ✓ tests/phase1.auth_devices.test.js (7 tests)
 ✓ tests/phase2.subscription_playback.test.js (6 tests)
 ✓ tests/phase10_video_security.test.js (3 tests)
 ✓ tests/phase9_gamified_video_mcq.test.js (1 test)
 ✓ tests/phase6.performance_load.test.js (1 test)
   [LOAD BENCHMARK] 200 simultaneous active students: 100% succeeded in 5970ms
 ✓ tests/phase7_video_sync_and_stream.test.js (3 tests)

 Test Files  8 passed (8)
      Tests  26 passed (26)
   Duration  22.94s
```
Zero test failures; 100% test integrity maintained.

---

## 3. Phase 2 — Environment Variable Contract

The Zod schema in `backend/src/config/env.js` enforces strict startup validation in `production`.

### 3.1 Successfully Configured on Render (Non-Sensitive Baseline)
Injected via Render REST API (`PUT /v1/services/srv-dc41v1vf3r2c73a29agg/env-vars`):
1. `NODE_ENV` = `production`
2. `TRUST_PROXY` = `1`
3. `ALLOWED_ORIGINS` = `https://localhost,https://app.class10lms.in,http://localhost:5173`
4. `SUBSCRIPTION_PLAN_CODE` = `CLASS10_ANNUAL_499`
5. `MAX_DEVICES_PER_STUDENT` = `1`
6. `CONCURRENT_SESSION_WINDOW_MINUTES` = `10`
7. `OFFLINE_VIDEO_STORAGE_PROVIDER` = `persistent_disk`
8. `OFFLINE_MAX_UPLOAD_MB` = `1024`
9. `OFFLINE_RETENTION_POLICY` = `wipe_on_logout`

### 3.2 Required Production Secrets (Pending Configuration)
To bring the service to `Live` status, the following secrets must be supplied:

| Variable Name | Purpose | Validation Rule |
| :--- | :--- | :--- |
| `SUPABASE_URL` | Production Supabase project URL | Valid `https://*.supabase.co` URL |
| `SUPABASE_ANON_KEY` | Public Supabase client key | Valid JWT (min 20 chars) |
| `SUPABASE_SERVICE_ROLE_KEY` | Elevated database access | Valid Service-Role JWT (min 20 chars) |
| `JWT_ACCESS_SECRET` | Student session token signing | High-entropy random hex (min 32 chars) |
| `JWT_REFRESH_SECRET` | Refresh token signing | High-entropy random hex (min 32 chars) |
| `DEVICE_HASH_SECRET` | Hardware HMAC device binding | High-entropy random hex (min 32 chars) |
| `RAZORPAY_KEY_ID` | ₹499 payment processing | Valid Razorpay key ID (`rzp_...`) |
| `RAZORPAY_KEY_SECRET` | Razorpay checkout signature | Razorpay secret (min 8 chars) |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook tamper verification | Webhook secret (min 8 chars) |

*(Note: In accordance with security policy, secret values are never printed in logs or reports).*

---

## 4. Phase 3 — Render Service Specifications

- **Account / Owner:** `tea-dbntr4u417fc73eo1spg` (Ranjith's workspace)
- **Service Name:** `class10-lms-backend`
- **Service ID:** `srv-dc41v1vf3r2c73a29agg`
- **Region:** `singapore`
- **Plan:** `free`
- **Assigned Render URL:** `https://class10-lms-backend.onrender.com`
- **Build Command:** `cd backend && npm install`
- **Start Command:** `cd backend && npm start`
- **Build Status:** **SUCCEEDED** (`bld-dc4208cs6fmc73didm90`).

---

## 5. Phase 5 — Custom Domain & DNS Instructions

The custom domain `api.class10lms.in` has been registered with the Render Web Service:
- **Render Custom Domain ID:** `cdm-dc4216p5efls73cr9l30`
- **Domain Name:** `api.class10lms.in`
- **Verification Status:** `unverified` (awaiting DNS record propagation)

### Exact DNS Record Configuration
At your domain registrar (GoDaddy / Hostinger / Cloudflare / Namecheap):

```dns
Type:   CNAME
Name:   api
Target: class10-lms-backend.onrender.com
TTL:    300 (or Automatic)
```

> [!NOTE]
> Once this CNAME record is added, Render will automatically verify domain ownership and provision an automated, auto-renewing Let's Encrypt TLS certificate covering `api.class10lms.in`.

---

## 6. Storage Persistence & Video Upload Strategy

### 6.1 Ephemeral Filesystem Finding
Render Web Services run inside containerized environments where the root filesystem is **ephemeral**:
- Any video uploaded to `backend/storage/offline_videos` on the default filesystem will be **permanently wiped** if the container restarts or redeploys.

### 6.2 Recommended Production Options:
1. **Option 1: Supabase Storage Bucket (Zero Server Configuration)**
   - Set `OFFLINE_VIDEO_STORAGE_PROVIDER=supabase_storage`
   - Set `SUPABASE_OFFLINE_BUCKET=lesson-offline-videos`
   - Files are stored directly in your Supabase private bucket and persist indefinitely across backend restarts.
2. **Option 2: Render Persistent Disk (VPS Model)**
   - Attach a persistent block volume in Render (e.g. 10 GB mounted at `/var/data/class10lms/offline_videos`).
   - Set `OFFLINE_VIDEO_STORAGE_DIR=/var/data/class10lms/offline_videos`.
3. **Safety Gate:**
   Per instructions, the verified 123.8 MB curriculum video (`AP_SSC_Class10_Ch4_L1_Pair_of_Linear_Equations_Intro.mp4`) will **NOT** be uploaded until the storage persistence choice is finalized.

---

## 7. Next Actions to Complete Live Deployment

1. **Supply Production Credentials:**
   Provide your Supabase URL, Supabase keys, Razorpay keys, and authorize generating 32-character random hex tokens for JWT/device secrets.
2. **Inject Secrets:**
   Secrets will be injected directly into Render via the Render REST API, which will automatically trigger the final deployment to `Live` status.
3. **Add CNAME Record in DNS:**
   Add `CNAME api -> class10-lms-backend.onrender.com` at your domain registrar.
4. **On-Device Acceptance Test:**
   Once live, test physical device authentication, video download, Airplane Mode playback, and seeking on your iQOO Z7s 5G.
