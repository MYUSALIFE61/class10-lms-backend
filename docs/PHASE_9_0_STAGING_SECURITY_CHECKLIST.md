# PHASE 9.0 — STAGING SECURITY & HARDENING CHECKLIST

**Classification Key:**
- **Implemented & Verified Locally:** Covered by local automated unit/integration/device tests.
- **Implemented — Pending Hosted Staging Verification:** Code exists in repository; must be re-verified once Render + Supabase + HTTPS staging is live.
- **Missing / Requires Remediation:** Gap identified during Phase 9.0 preparation.

---

## 1. Security Control Matrix

| Control Area | Implementation Evidence | Current Verification Status | Hosted Staging Action |
| :--- | :--- | :---: | :--- |
| **HTTPS Enforcement** | `frontend/src/config/env.js` (`IS_STRICT_PROD`), `network_security_config.xml` (`cleartextTrafficPermitted="false"`), Render TLS | **Implemented — Pending Hosted Staging Verification** | Confirm Let's Encrypt cert on `staging-api.class10lms.in` and verify `http://` rejection |
| **CORS Allowlist** | `backend/src/middleware/security.js` (`config.allowedOrigins` check, `403 CORS_FORBIDDEN` in `errorHandler.js`) | **Implemented & Verified Locally** | Re-test `OPTIONS` from `https://app.class10lms.in`, staging Admin origin, and reject rogue origin |
| **JWT Signing & Expiry** | `authService.js` (`JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET`), `adminAuthService.js` (12h admin JWT) | **Implemented & Verified Locally** | Generate fresh staging-only 64-char hex secrets (`openssl rand -hex 32`) |
| **Refresh-Token Revocation** | Token rotation + reuse detection in `authService.js` + `user_sessions` | **Implemented & Verified Locally** | Verify revocation against real staging `public.user_sessions` |
| **Device Limit Enforcement** | `deviceService.js` (`DEVICE_HASH_SECRET`, `MAX_DEVICES_PER_STUDENT=1`) | **Implemented & Verified Locally** | Test 2nd Android device login denial + device revoke flow on staging |
| **Admin Authorization (RBAC)** | `adminAuthMiddleware.js` + `adminRbac.js` (`requireAdmin`, `requirePermission`) | **Implemented & Verified Locally** | Confirm student JWT receives `401`/`403` on `/api/v1/admin/*` |
| **Rate Limiting** | `rateLimiters.js` (`generalLimiter` 120/m, `authLimiter` 20/15m, `playbackLimiter` 30/m, `paymentLimiter` 15/15m; exempts binary stream routes) | **Implemented & Verified Locally** | Verify IP tracking uses real client IP via `TRUST_PROXY=1` on Render |
| **Upload Validation** | Video: ISO `ftyp` check (`ffmpegProcessor.js:31`) + `OFFLINE_MAX_UPLOAD_MB`; PDF: MIME allowlist + 15 MB limit (`adminCmsService.js:8-16`) | **Implemented & Verified Locally** | Upload spoofed `.mp4` / disallowed MIME on staging and verify `400`/`422` |
| **Path Traversal Protection** | `offlineStorageService.js:90` + `adminStoreExtension.js:118` (`resolved.startsWith(base + path.sep)`) | **Implemented & Verified Locally** | Attempt `../` traversal in `downloadId`/resource lookup on staging |
| **SQL Injection Protection** | Zod validation (`validate.js`) + `@supabase/supabase-js` parameterized PostgREST queries | **Implemented & Verified Locally** | Verify parameterized handling on live PostgREST |
| **HTTP Range Authorization** | Short-lived HMAC `downloadToken` + active device/subscription checks; uncompressed `206` (`security.js:48`) | **Implemented & Verified Locally** | Verify unauthenticated `GET /downloads/:id/stream` returns `401`/`403` |
| **Private Video Access** | Zero raw `storage_key`/URL leaked; cloud adapters throw `CLOUD_STORAGE_DISABLED` | **Implemented & Verified Locally** | Confirm `/var/data/class10lms` has zero public static route |
| **Offline Lease Expiry** | Signed `offlineLease` (`OFFLINE_LEASE_DAYS=7`, capped by subscription expiry) + Media3 native guard | **Implemented & Verified Locally** | Verify expired lease blocks playback on staging iQOO device |
| **Logging Without Secrets** | `errorHandler.js` suppresses stack/internal errors when `NODE_ENV=production`; reports free of secrets | **Implemented — Pending Hosted Staging Verification** | Inspect live Render deploy/runtime logs after staging login/payment |
| **Cloud Storage Rejection** | Env Zod allowlist (`persistent_disk`, `pikpak_local`) + `OfflineStorageService` constructor check | **Implemented & Verified Locally** | Verify `storage.cloudObjectStorageDisabled === true` on staging `/admin/.../offline-assets` |
| **Admin Bootstrap & Hygiene** | `006` creates empty `admin_users` on Supabase; `SUBSCRIPTION_PLAN_CODE` defaults to inactive `CLASS10_ANNUAL_499` in `env.js:23`; no `admin-portal/.env.example` | **Missing / Requires Action** | Seed staging `super_admin` in `public.admin_users`; explicitly set `SUBSCRIPTION_PLAN_CODE=CLASS10_ANNUAL_799`; optionally add `admin-portal/.env.example` in future cleanup |
| **Backup & Disk Monitoring** | Render Persistent Disk snapshots & `df -h /var/data/class10lms` checks | **Missing / Manual in Render** | Enable Render Disk snapshots and monitor free space before large staging uploads |
