# PHASE 9.0 — STAGING COST, RESOURCE & CAPACITY PLAN

**Status:** Preparation Only — Zero purchases or resources provisioned.

---

## 1. Estimated Monthly Cost Table (Targets Subject to Provider Taxes/Usage)

| Component | Provider & Tier | Specifications | Estimated Monthly Cost |
| :--- | :--- | :--- | :---: |
| **Staging Backend API** | Render Web Service (`Starter`, Singapore) | 512 MB RAM / 0.5 vCPU, always-on, supports Persistent Disk | **~\$7.00 / mo** |
| **Persistent Disk Volume** | Render Persistent Disk (`/var/data/class10lms`) | 10 GB SSD (`$0.25/GB/month`) | **~\$2.50 / mo** |
| **Staging Database & Auth** | Supabase (`Free` Tier — `class10-lms-staging`) | 500 MB PostgreSQL, 50,000 MAU, 5 GB Supabase egress | **\$0.00 / mo** |
| **Staging Admin Portal** | Render Static Site (Free Tier) or local static preview | Builds `admin-portal/dist` (100 GB static bandwidth/mo) | **\$0.00 / mo** |
| **DNS & TLS** | Existing `class10lms.in` zone (`CNAME staging-api`) + Render TLS | Automated Let's Encrypt certificate | **\$0.00 / mo** |
| **Razorpay Test Mode** | Razorpay Sandbox (`rzp_test_*`) | Test transactions only | **\$0.00 / mo** |
| **Total Baseline Staging Target** | | | **~\$9.50 / month** *(excl. applicable taxes)* |

---

## 2. Resource Limits, Bottlenecks & Unexpected Cost Risks

1. **Persistent Disk Capacity (`10 GB` Ceiling):**
   - Must hold `offline_videos/` + `tmp_jobs/` (temp ingest buffers) + `resources/` PDFs simultaneously.
   - Keeping staging QA library under ~4–5 GB of sample MP4s leaves headroom for `1 GB` (`OFFLINE_MAX_UPLOAD_MB=1024`) temp uploads & FFmpeg remux copies. Exceeding 10 GB causes `ENOSPC` upload failures.
2. **Backend Memory Limit (`512 MB` RAM on Render Starter):**
   - `offlineStorageService.js` streams with `64 KB` chunks (`highWaterMark: 65536`) and raw binary upload streams directly to disk (`tmp_jobs/`), keeping Node RSS low.
   - **Risk:** Invoking software `ffmpeg` H.264 re-encoding (`targetHeight`) on high-bitrate 1080p MP4s inside 512 MB RAM can trigger Linux OOM-kill (`SIGKILL`). **Mitigation:** Pre-encode staging MP4s to 720p H.264 `+faststart` locally so Render uses pass-through/remux instead of heavy transcoding.
3. **Database Connection & Free-Tier Limits (`class10-lms-staging`):**
   - Supabase Free projects pause after 7 days of zero traffic and cap DB size at 500 MB. Because backend uses PostgREST HTTPS (`@supabase/supabase-js`), connection exhaustion on PgBouncer is minimal, but load tests (`200` virtual students) should monitor HTTP latency.
4. **Render Outbound Video Bandwidth:**
   - Render Starter includes 100 GB/month outbound bandwidth; overages typically incur per-GB bandwidth charges (e.g., `$0.10/GB` if exceeded). Avoid running 200 concurrent full-MP4 binary downloads during load testing—run load tests against metadata/auth/lease endpoints and test full MP4 Range downloads on 1–5 QA devices (`< 2 GB` total).
