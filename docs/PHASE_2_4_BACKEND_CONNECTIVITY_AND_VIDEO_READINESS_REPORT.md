# PHASE 2.4 — PRODUCTION BACKEND CONNECTIVITY & OFFLINE VIDEO READINESS REPORT

**Document ID:** `AUDIT-CLASS10-LMS-PHASE-2-4`  
**Application Target:** Class 10 SSC LMS (`in.class10lms.ssc`)  
**Hardware Verified:** vivo / iQOO Z7s 5G (`10BD750FUC0006P`), Android 15 / API 35  
**Target API Endpoint:** `https://api.class10lms.in/api/v1`  
**Render Workspace:** `tea-dbntr4u417fc73eo1spg` (Ranjith's workspace / `rk5759706@gmail.com`)  
**Execution Timestamp:** November 26, 2026 (Local: 17:22 IST)  
**Auditor:** Senior Software Architect, DevSecOps Engineer & Android QA Specialist  

---

## 1. Executive Summary & Verification Matrix

In Phase 2.4, the production backend deployment infrastructure was audited using live Render REST API credentials provided by the system administrator, DNS resolution was verified on public DNS and on physical mobile hardware, and authorized educational MP4 video assets were discovered and validated.

| Target Item | Evaluation Scope | Method | Classification | Technical Finding |
| :--- | :--- | :--- | :---: | :--- |
| **1. Render Account Audit** | Account ID & Services | Render REST API query | **PASS** | Account verified (`tea-dbntr4u417fc73eo1spg`). Confirmed that `class10-lms-backend` has **not yet been created/deployed on Render**. |
| **2. Production API Hostname** | Configured API base URL | Codebase audit | **PASS** | Hardcoded to `https://api.class10lms.in/api/v1` in `frontend/src/config/env.js`. Release builds forbid loopback. |
| **3. Authoritative DNS Resolution** | `class10lms.in` & `api.class10lms.in` | `Resolve-DnsName` & Google 8.8.8.8 | **BLOCKED** | Returned `DNS_ERROR_RCODE_NAME_ERROR` (`NXDOMAIN`). Root domain has no active DNS zone or CNAME record. |
| **4. On-Device DNS Resolution** | Hardware network query | `adb shell ping api.class10lms.in` | **BLOCKED** | Physical phone returned `ping: unknown host api.class10lms.in`. Device network stack cannot resolve hostname. |
| **5. HTTPS & TLS Architecture** | Port, proxy & certificates | Source & Android config | **PASS (Design)** / **BLOCKED (Runtime)** | App enforces strict `cleartextTrafficPermitted="false"`. Render automated TLS edge will terminate HTTPS for `api.class10lms.in`. |
| **6. CORS Policy & Streaming Headers** | Cross-origin & byte ranges | `applySecurityMiddleware` | **PASS** | Fully configured. Exposes `Content-Range`, `Accept-Ranges`, `Content-Length`, `X-Content-SHA256`. Allows mobile app requests (`!origin`). |
| **7. Authorized MP4 Video Ingestion** | Local storage discovery & validation | Hex analysis & ISO check | **PASS** | Discovered genuine AP SSC Class 10 curriculum videos in `D:\Downloads\10thclass Maths videos\`. Validated ISO `ftyp` box header. |
| **8. Real Device Playback Readiness** | End-to-end device workflow | Physical integration check | **BLOCKED** | Blocked pending Render Web Service creation, DNS CNAME mapping, and asset upload to backend. |

---

## 2. Render Hosting Infrastructure Audit

Using the administrator's Render API key, direct live queries were performed against the Render API (`https://api.render.com/v1`):

### 2.1 Render Account Identity
- **Owner ID:** `tea-dbntr4u417fc73eo1spg`
- **Owner Name:** `Ranjith's workspace`
- **Owner Email:** `rk5759706@gmail.com`
- **Owner Type:** `team`

### 2.2 Existing Render Services
```
1. ID: srv-dbo3d1brjlhs73aahe0g
   Name: myusa-wildfire-web (static_site, suspended)
2. ID: srv-dbo3cs3rjlhs73aah4v0
   Name: myusa-wildfire-api (web_service, suspended)
```

### 2.3 Diagnostic Finding
The Class 10 LMS Backend (`class10-lms-backend`) **does not yet exist as an active service in the Render account**. This explains why `api.class10lms.in` does not resolve: no target URL (e.g. `https://class10-lms-backend.onrender.com`) exists yet for the CNAME record to point to.

---

## 3. Render Deployment & DNS Provisioning Plan

To establish production connectivity and secure HTTPS:

```mermaid
flowchart TD
    A["1. Create Web Service on Render (class10-lms-backend)"] --> B["2. Deploy backend (npm start on port 4000)"]
    B --> C["3. Add Custom Domain on Render (api.class10lms.in)"]
    C --> D["4. Add CNAME Record at Domain Registrar: api -> class10-lms-backend.onrender.com"]
    D --> E["5. Render Issues Automated TLS Certificate"]
    E --> F["6. iQOO Z7s 5G Resolves https://api.class10lms.in/api/v1"]
```

### 3.1 Step 1: Create Render Web Service
- **Name:** `class10-lms-backend`
- **Environment:** `Node` (Node.js 18+)
- **Region:** `Singapore` (closest to AP & Telangana students)
- **Branch:** `main`
- **Build Command:** `cd backend && npm install`
- **Start Command:** `cd backend && npm start`
- **Environment Variables:** Populate from [backend/.env.example](file:///d:/Downloads/Android%20apk%20file/backend/.env.example) (Supabase URL/keys, JWT secrets).

### 3.2 Step 2: Add Custom Domain on Render
- In Render Dashboard > `class10-lms-backend` > **Settings > Custom Domains**:
  - Add: `api.class10lms.in`
- Render assigns the CNAME target: `class10-lms-backend.onrender.com`.

### 3.3 Step 3: Configure DNS at Domain Registrar
In the DNS manager for `class10lms.in` (GoDaddy / Hostinger / Cloudflare / Namecheap):
- **Record Type:** `CNAME`
- **Name / Host:** `api`
- **Target Value:** `class10-lms-backend.onrender.com`
- **TTL:** `300` (or Automatic)

---

## 4. HTTPS, Reverse Proxy & Security Architecture

1. **Port & Process:** The Express backend runs on port `4000` (`TRUST_PROXY=1`). Render's ingress proxy terminates TLS on port 443 and forwards traffic to the application.
2. **TLS Certificate:** Render automatically provisions and auto-renews a free Let's Encrypt certificate for `api.class10lms.in` once the CNAME verifies.
3. **Android Compliance:**
   `frontend/android/app/src/main/res/xml/network_security_config.xml` strictly forbids cleartext traffic:
   ```xml
   <network-security-config>
       <base-config cleartextTrafficPermitted="false">
           <trust-anchors>
               <certificates src="system" />
           </trust-anchors>
       </base-config>
   </network-security-config>
   ```
   Render's Let's Encrypt certificates are trusted natively by Android 15.

---

## 5. Authorized MP4 Curriculum Video Validation

### 5.1 Local Curriculum Video Discovery
Inspection of local storage located the authentic Andhra Pradesh Class 10 SSC curriculum video assets:
- **Location:** `D:\Downloads\10thclass Maths videos\ap 10th class Maths chapter-4\`
- **Sample File:** `AP_SSC_Class10_Ch4_L1_Pair_of_Linear_Equations_Intro.mp4`
- **File Size:** `129,836,243 bytes` (123.8 MB)
- **Header Analysis:** Reads bytes 4..7 as `ftyp` (Valid ISO Base Media MP4).
- **Validation:** Confirmed compatibility with `validateMp4FileHeader()` in `backend/src/services/ffmpegProcessor.js`.

### 5.2 Upload Ready Checklist
Once the backend on Render is live:
1. Log into the Admin Portal (`/admin/login`).
2. Go to **Curriculum > Mathematics > Chapter 4 > Lesson 1**.
3. Upload `AP_SSC_Class10_Ch4_L1_Pair_of_Linear_Equations_Intro.mp4`.
4. The backend streams the file, validates the `ftyp` box, calculates SHA-256, and marks it ready.
5. On the iQOO Z7s 5G, student `paid@ap10.in` can download the 123.8 MB lesson and verify Chunked AES-256-GCM encryption and Airplane Mode Media3 playback.

---

## 6. Classification & Final Status

| Phase Area | Status | Next Unblocking Step |
| :--- | :---: | :--- |
| **Render API Identification** | **PASS** | Account identified (`tea-dbntr4u417fc73eo1spg`). |
| **Backend Code Readiness** | **PASS** | 26/26 backend tests passed; streaming & AES-GCM integrated. |
| **Curriculum Video Asset** | **PASS** | Authentic 123.8 MB Class 10 MP4 validated locally. |
| **Render Web Service Deployment** | **BLOCKED** | Requires deploying `class10-lms-backend` on Render. |
| **Public DNS Record** | **BLOCKED** | Requires setting CNAME `api` -> `class10-lms-backend.onrender.com`. |
| **Physical Device Playback** | **BLOCKED** | Unblocks immediately once DNS & video upload are complete. |
