# PHASE 7 — Repository, Environment Audit & Staging Matrix

**Date:** 2026-11-27  
**Branch:** `main` (local working tree contains Phases 2–7 changes; zero user files discarded; production untouched)  

---

## 1. Repository & Phase 6 Fix Confirmation (Part A)

- **Git Branch:** `main` with tracked modifications across `backend/`, `frontend/`, `admin-portal/`, and `frontend/android/`, plus untracked Phase 1–6 reports, test suites, and reversible Migrations `009` & `010`.
- **Phase 6 Fixes Confirmed Present:**
  1. `PlaybackService` ↔ `lesson_video_assets` bridge (`backend/src/services/playbackService.js` + `backend/src/app.js`).
  2. Username-to-email login resolution (`backend/src/services/authService.js` + `backend/src/routes/auth.routes.js`).
- **Pre-Edit Backups Confirmed Preserved:** `scratch/phase6_backups/{app,auth.routes,authService,playbackService}.js.bak`.
- **Capacitor Configuration (`frontend/capacitor.config.json`):** `appId: "in.class10lms.ssc"`, `androidScheme: "https"`, `cleartext: false`, `allowMixedContent: false`, `webContentsDebuggingEnabled: false`.
- **Runtime API Config (`frontend/src/config/env.js`):** Strictly enforces HTTPS + non-loopback in production/staging builds; Phase 7 synced staging frontend assets with `VITE_API_BASE_URL=https://staging-api.class10lms.in/api/v1` (`ANDROID_ASSETS_SECRET_SCAN: CLEAN`).

---

## 2. Staging vs. Production Environment Separation Matrix (Part C)

| Configuration | Staging (Target / Local Rehearsal) | Production (Untouched) |
|---|---|---|
| **Frontend URL** | `https://staging-app.class10lms.in` (Local preview: `http://localhost:5173`) | Existing production domain (unchanged) |
| **Backend URL** | `https://staging-api.class10lms.in/api/v1` (Embedded in Phase 7 staging build) | Existing Render service `srv-dc41v1vf3r2c73a29agg` (unchanged) |
| **Database** | Separate Staging Supabase project (**NOT YET PROVISIONED** — awaiting approval) | Live Supabase `hxllgasepsxrpsonljct` (untouched) |
| **Storage** | Separate `persistent_disk` mount / staging bucket (Local rehearsal verified) | Existing production storage (unchanged) |
| **Payment Mode** | **Razorpay Test Mode (`RAZORPAY_MODE=test`)** | Existing (unchanged) |
| **JWT & Device Secrets** | Separate staging-only 32+ char secrets (not configured on cloud yet) | Existing (unchanged) |
| **Video Bucket / Dir** | Separate staging directory `lesson-offline-videos-staging` | Existing (unchanged) |

---

## 3. Cloud Staging Infrastructure Requirements & Estimated Cost (Requires Approval Before Provisioning)

No separate hosted staging Supabase project or staging Render service currently exists. Per Phase 7 Safety Rules, no paid infrastructure was provisioned automatically.

| Service | Proposed Staging Tier | Estimated Monthly Cost |
|---|---|---|
| **Supabase Staging Project** | Free Tier (500 MB DB, 1 GB storage) | **$0 / month** |
| **Render Staging Web Service** | Starter Web Service (512 MB RAM, always-on for webhook tests) | **~$7 / month** (or $0 Free Tier with cold starts) |
| **Render Staging Persistent Disk** | 10 GB Persistent Disk mounted at `/var/data/offline_videos` | **~$2.50 / month** |
| **Razorpay Test Mode** | Built-in Test Mode | **$0 / month** |
| **Total Staging Estimate** | | **$0–$9.50 / month** |
