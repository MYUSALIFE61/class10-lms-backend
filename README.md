# Class 10 SSC LMS — Secure Android APK (AP & Telangana)

Production-ready subscription-based Class 10 Learning Management System Android application built for Andhra Pradesh (AP SSC) and Telangana (TS SSC) students.

## Architecture Overview

- **Android App (`frontend/` + `frontend/android/`):** React 18, Vite 6, Capacitor 7, and native Kotlin security plugins (`FLAG_SECURE`, Android Keystore `EncryptedSharedPreferences`, Google Play Integrity API, HTML5 Fullscreen WebChromeClient, Android hardware back-button & background/foreground lifecycle handling).
- **Video Player (`frontend/src/components/video/LMSVideoPlayer.jsx`):** Uses the **official YouTube IFrame Player API** for Unlisted videos with custom LMS controls (play/pause, 0.75x–2x speed, seek/progress, fullscreen, prev/next lesson, resume sync, error code mapping, network recovery, and dynamic student watermark) while preserving mandatory YouTube branding & controls.
- **Backend API (`backend/`):** Node.js + Express with strict Zod request validation, Helmet, CORS allowlist, per-route rate limiting, short-lived JWT access tokens + rotating refresh tokens with reuse detection, device-limit enforcement, concurrent-login detection, Razorpay ₹499 checkout & signed webhook verification, Play Integrity server verifier, and 7-step backend playback authorization.
- **Database (`supabase/migrations/`):** PostgreSQL schema + strict Row Level Security (RLS) keeping `lesson_video_sources` (YouTube Video IDs), `payment_transactions`, `lesson_mcqs` answer keys, and `user_sessions` strictly inaccessible to client keys.

## Quick Start

1. **Database Migrations:** Apply [001_initial_schema.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/001_initial_schema.sql), [002_rls_policies.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/002_rls_policies.sql), and [003_seed_ap_ts_syllabus_template.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/003_seed_ap_ts_syllabus_template.sql) in Supabase SQL Editor.
2. **Backend Setup:** Copy `backend/.env.example` to `backend/.env`, populate real credentials, and run `cd backend && npm install && npm start`.
3. **Frontend & Android APK:** See [ANDROID_BUILD_AND_SIGNING.md](file:///d:/Downloads/Android%20apk%20file/docs/ANDROID_BUILD_AND_SIGNING.md).

## Documentation

- [Environment Variables](file:///d:/Downloads/Android%20apk%20file/docs/ENVIRONMENT_VARIABLES.md)
- [Android Build & Signing Guide](file:///d:/Downloads/Android%20apk%20file/docs/ANDROID_BUILD_AND_SIGNING.md)
- [Testing Report](file:///d:/Downloads/Android%20apk%20file/docs/TESTING_REPORT.md)
- [Known Limitations](file:///d:/Downloads/Android%20apk%20file/docs/KNOWN_LIMITATIONS.md)
- [Future DRM Migration Plan](file:///d:/Downloads/Android%20apk%20file/docs/FUTURE_DRM_MIGRATION_PLAN.md)
