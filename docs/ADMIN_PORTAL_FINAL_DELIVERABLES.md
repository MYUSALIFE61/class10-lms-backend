# Class 10 LMS Admin Portal — Final Deliverables, API Reference, DB Documentation & Deployment Guide

## 1. Unified Ecosystem Overview

```text
Admin Portal (admin-portal/, React 18 + Vite 6 + Tailwind CSS, :5174)
        │  JWT Admin Auth (typ: admin_access) + Backend RBAC
        ▼
Existing Express Backend (backend/, Express 4 + Zod, :4000)
        ├── /api/v1/admin/*       (Admin Portal CMS, RBAC, Analytics, Operations)
        ├── /api/v1/student/*     (Dynamic Student App APIs — board & publish filtered)
        ├── /api/v1/auth/*        (Existing Student Auth & Device Binding — preserved)
        ├── /api/v1/playback/*    (Existing 7-Step Video Gate & Signed PikPak/R2 Range Stream — preserved)
        ├── /api/v1/curriculum/*  (Existing Student Curriculum APIs — preserved)
        └── /api/v1/subscriptions/* & /payments/* (Existing Razorpay Verification — preserved)
        │
        ▼
Single PostgreSQL / Supabase Database (Migrations 001–006)
        ▲
        │
Existing Student Web & Android APK (frontend/, Capacitor 7 + Media3 ExoPlayer, :5173 / in.class10lms.ssc)
```

---

## 2. Database Schema & Relationships (Migration 006)

Migration file: [006_admin_portal_cms.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/006_admin_portal_cms.sql) (100% additive; preserves all 18 existing tables from `001`–`005`).

- **Academic Hierarchy:** `boards` (`AP`, `TS`) -> `academic_years` -> `subjects` (`board_codes`, `language_category`, `status`) -> `chapters` (`board_codes`, `status`) -> `topics` -> `lessons` (`topic_id`, `board_codes`, `video_language='TE_EN_MIX'`, `status` 6-stage lifecycle) -> `lesson_video_sources` (`original_file_name`, `display_title`, `language_code='TE_EN_MIX'`, `provider_file_id`).
- **Study Materials:** `study_resources` (`resource_type`, `medium IN ('EN','TE','BOTH')` kept separate from video `TE_EN_MIX`, `storage_path`, `mime_type`, `file_size_bytes`, `is_premium`, `status`).
- **Assessments:** `question_bank` (10 categories, duplicate/option validation) -> `quizzes` -> `quiz_attempts` (server `started_at`/`expires_at` timer enforcement); `exams` -> `exam_attempts` (objective auto-grading + descriptive manual marks entry).
- **Notifications:** `notifications` -> `notification_recipients` (`delivery_status`, `is_read`, `read_at`).
- **Administration & Dynamic Config:** `roles` (8 seeded roles) -> `admin_users` (`assigned_subject_ids`, scrypt password hash) -> `admin_sessions`; `admin_audit_logs`; `app_configurations`.

---

## 3. REST API Reference (`/api/v1/`)

### Admin Endpoints (`/api/v1/admin/*` — Requires `requireAdmin` + `requirePermission`)
- **Auth:** `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- **Dashboard:** `GET /dashboard?board=&subjectId=&fromDate=&toDate=` (16 live KPIs + 10 real charts)
- **Students:** `GET /students`, `GET /students/:id` (13-section 360° profile), `PATCH /students/:id`, `POST /students/:id/reset-password`
- **Academic:** `GET/POST/PATCH /boards`, `/academic-years`, `GET/POST/PATCH/DELETE /subjects`, `GET/POST/PATCH /chapters`, `/topics`
- **Content & Publishing:** `GET/POST/PATCH /lessons`, `POST /lessons/reorder` (drag-and-drop sequence)
- **Videos (PikPak / R2):** `GET /videos`, `POST /videos/sync`, `PATCH /videos/:lessonId/map` (non-destructive display rename & syllabus mapping), `POST /videos/:lessonId/preview`
- **Study Materials:** `GET/POST/PATCH /resources`, `GET /resources/:id/file`
- **Question Bank:** `GET/POST/PATCH /questions`, `POST /questions/bulk-import`, `GET /questions/export` (CSV)
- **Quizzes & Exams:** `GET/POST/PATCH /quizzes`, `GET/POST/PATCH /exams`, `GET /exams/:id/attempts`, `POST /exams/attempts/:attemptId/evaluate`
- **Operations & Governance:** `GET /reports`, `GET/POST /notifications`, `GET /subscriptions`, `POST/PATCH /subscriptions/plans`, `POST /subscriptions/assign`, `GET/PATCH /settings`, `GET/POST/PATCH /admins`, `GET /audit-logs`

### Dynamic Student Endpoints (`/api/v1/student/*` — Requires Student JWT `requireAuth`)
- `GET /home` (dynamic app config, board-filtered subjects with live DB completion %, upcoming DB exams, unread notifications, dynamic plan price)
- `GET /subjects`, `GET /subjects/:subjectId/chapters`, `GET /chapters/:chapterId/lessons`
- `GET /resources`, `GET /resources/:id/download` (protected PDF/document serving)
- `GET /quizzes`, `POST /quizzes/:quizId/start`, `POST /quizzes/:quizId/submit` (server-enforced timer & grading)
- `GET /exams`, `POST /exams/:examId/start`, `POST /exams/:examId/submit`
- `GET /progress` (live DB subject breakdown, watch minutes, quiz & exam history)
- `GET /notifications`, `POST /notifications/:id/read`

---

## 4. Environment Variables

| Variable | Component | Purpose |
|---|---|---|
| `PORT` | Backend | Express API port (`4000`) |
| `ALLOWED_ORIGINS` | Backend | Comma-separated CORS origins (includes Student App `:5173` and Admin Portal `:5174`) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Backend | Production Supabase PostgreSQL connection |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DEVICE_HASH_SECRET` | Backend | Cryptographic signing keys (32+ chars); admin tokens derive isolated key domain |
| `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` | Backend (Dev/Seed) | Initial Super Admin account for local dev preview |
| `VIDEO_STORAGE_PROVIDER` | Backend | `pikpak_local` (personal testing) or `cloudflare_r2` (commercial production) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Backend | Server-verified subscription payments |
| `VITE_API_BASE_URL` | Admin Portal / Frontend | Optional override for production HTTPS backend URL (defaults to `/api/v1/...` via Vite proxy in dev) |

---

## 5. Deployment Instructions

1. **Apply Database Migrations (`001` through `006`)** in Supabase SQL Editor or CLI (`supabase db push`).
2. **Seed Production Super Admin** into `public.admin_users` with an `scrypt:` password hash generated by `hashPassword()` in `backend/src/services/adminRbac.js`.
3. **Start Production Backend:** `cd backend && npm ci && npm start` behind HTTPS reverse proxy (Nginx / Railway / Render / Fly.io) with `ALLOWED_ORIGINS` set to your production Student App & Admin Portal origins.
4. **Deploy Admin Portal Static Bundle:** `cd admin-portal && npm ci && VITE_API_BASE_URL=https://api.yourdomain.com/api/v1/admin npm run build` -> serve `admin-portal/dist` on Cloudflare Pages / Vercel / Nginx.
5. **Sync & Build Android APK (One-time for Dynamic Integration):** `cd frontend && npm run build && npx cap sync android` -> build APK. All future subjects, chapters, topics, lessons, videos, PDFs, MCQs, quizzes, exams, banners, notifications, and pricing changes publish live from the Admin Portal with **zero APK rebuilds**.

---

## 6. Remaining Production Considerations (Honest Checklist)
- **Push Notifications (FCM):** In-app notification delivery, targeting (`All` / `AP` / `TS` / `Selected Students`), history, and read tracking are fully live; native background Android push via Firebase Cloud Messaging (`google-services.json` + FCM server key) can be plugged into `AdminOperationsService.sendNotification()` once Firebase project credentials are provisioned.
- **Commercial Video Storage:** `pikpak_local` remains strictly for local personal testing; switch `VIDEO_STORAGE_PROVIDER=cloudflare_r2` before commercial student launch.
- **File Uploads at Scale:** Study material PDFs/images currently store securely on local server disk (`backend/uploads/resources/`) behind authenticated endpoints; for multi-instance cloud hosting, swap `saveUploadedFile()` to Supabase Storage or Cloudflare R2 bucket storage.
- **Android APK Rebuild:** The Student frontend web app (`frontend/`) is already updated and live; run `npx cap sync android` + Gradle assemble to bundle the Phase 5 dynamic student screens into `app-debug.apk`.
