# PHASE 9.0 — SUPABASE STAGING DATABASE & MIGRATION CHECKLIST

**Target Project Name:** `class10-lms-staging` (Separate Free-Tier Supabase Project)
**Production Project (DO NOT TOUCH):** `hxllgasepsxrpsonljct`
**Status:** Preparation Checklist Only — **Zero** Supabase projects created; **zero** SQL migrations executed.

---

## 1. Strict Isolation & Supabase Compatibility Rules

- Provision a brand-new Supabase project (`class10-lms-staging`) in Singapore (`ap-southeast-1`) matching Render Singapore latency.
- **Never** copy production `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` from `hxllgasepsxrpsonljct`.
- **Supabase Storage (`storage.buckets`):** Unused and disabled per Phase 7.2 local-only storage architecture.
- **Connection Compatibility:** Backend uses `@supabase/supabase-js` over HTTPS REST/PostgREST ([supabase.js](file:///d:/Downloads/Android%20apk%20file/backend/src/config/supabase.js)), which requires **only** HTTPS (`443`) to `*.supabase.co` — no raw PostgreSQL TCP pooling conflicts during normal API operation, and direct Postgres/SQL Editor TLS is used only for applying migrations `001`–`010`.

---

## 2. Ordered Migration Execution Checklist (`001` through `010`)

Apply in **exact sequential order** inside the `class10-lms-staging` Supabase SQL Editor:

| Order | Filename | Purpose | Dependencies | Empty Staging Safe? | Verification Query / Expected Result |
| :---: | :--- | :--- | :--- | :---: | :--- |
| 1 | `001_initial_schema.sql` | Enables `pgcrypto`, creates 18 core tables (`profiles`, `subscription_plans`, `subscriptions`, `payment_transactions`, `user_devices`, `user_sessions`, `subjects`, `chapters`, `lessons`, `lesson_video_sources`, `lesson_mcqs`, `mcq_attempts`, `lesson_notes`, `previous_exam_questions`, `important_formulas`, `lesson_progress`, `playback_audit_logs`, `security_events`), triggers | Supabase `auth.users` | Yes | `SELECT count(*) FROM information_schema.tables WHERE table_schema='public';` -> `18` |
| 2 | `002_rls_policies.sql` | Enables RLS across all 18 tables, creates `public.has_active_subscription(UUID)` (`SECURITY DEFINER`), adds student/entitled `SELECT` policies, revokes `anon`/`authenticated` writes to vault/security tables | `001` | Yes | `SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relrowsecurity=false;` -> `0` tables |
| 3 | `003_seed_ap_ts_syllabus_template.sql` | Seeds `CLASS10_ANNUAL_499` plan, 6 SSC subjects (`mathematics`, `physical-science`, `biological-science`, `social-studies`, `english`, `telugu`), and initial Maths chapters | `001`, `002` | Yes | `SELECT slug FROM public.subjects ORDER BY display_order;` -> `6` subjects |
| 4 | `004_private_stream_provider.sql` | Extends `lesson_video_sources.provider` CHECK (`private_stream`) and adds `stream_url` | `001` | Yes | `SELECT column_name FROM information_schema.columns WHERE table_name='lesson_video_sources' AND column_name='stream_url';` -> `1` row |
| 5 | `005_video_provider_sync.sql` | Adds `provider_file_id`, `file_name`, `mime_type` + extended `provider` CHECK on `lesson_video_sources` | `001`, `004` | Yes | `SELECT column_name FROM information_schema.columns WHERE table_name='lesson_video_sources' AND column_name='provider_file_id';` -> `1` row |
| 6 | `006_admin_portal_cms.sql` | Adds CMS workflow columns (`status`, `board_codes`), `watch_time_seconds` on `lesson_progress`, 13 admin/CMS/assessment/RBAC tables (`boards`, `academic_years`, `topics`, `study_resources`, `question_bank`, `quizzes`, `quiz_attempts`, `exams`, `exam_attempts`, `notifications`, `notification_recipients`, `roles`, `admin_users`, `admin_sessions`, `admin_audit_logs`, `app_configurations`), RLS + seeds 8 RBAC roles | `001`–`005` | Yes | `SELECT code FROM public.roles ORDER BY code;` -> `8` roles |
| 7 | `007_gamified_video_mcq.sql` | Extends `lessons`, `question_bank`, `quizzes`, `quiz_attempts`; creates `student_gamification_profiles`, `student_achievements` + RLS | `001`, `006` | Yes | `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'student_%';` includes gamification/achievements |
| 8 | `008_offline_video_downloads.sql` | Creates `lesson_video_assets` (with `uq_lesson_video_assets_default_quality` & SHA-256 regex) and `student_video_downloads` + RLS | `001`, `006` | Yes | Confirm `lesson_video_assets` & `student_video_downloads` exist with RLS enabled |
| 9 | [009_phase2_registration_and_plans.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/009_phase2_registration_and_plans.sql) | Adds `profiles.username`, `profiles.state`, `uq_profiles_username_lower`, `idx_profiles_phone_nonempty`, extends `subscriptions` CHECK (`cancelled`, `failed`), deactivates `CLASS10_ANNUAL_499`, upserts ₹200 / ₹500 / ₹799 plans | `001`, `003` | Yes | `SELECT code, price_paise, is_active FROM public.subscription_plans ORDER BY display_order;` -> 3 active (`20000`, `50000`, `79900`) + `CLASS10_ANNUAL_499` `false` |
| 10 | [010_phase4_learning_experience.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/010_phase4_learning_experience.sql) | Adds `lesson_number`, `teacher_name`, `learning_objectives` to `lessons`; adds `last_accessed_at` + `idx_lesson_progress_user_accessed` to `lesson_progress`; creates `lesson_concepts`, `lesson_revision_points` + RLS; extends `previous_exam_questions` (`lesson_id`, `question_type`, `question_image_url`, `options_json`, `explanation`) | `001`–`009` | Yes *(remediated)* | Verify `lesson_progress.last_accessed_at`, `lesson_concepts` (`relrowsecurity=true`), `lesson_revision_points` (`relrowsecurity=true`), and `idx_lesson_progress_user_accessed` |

---

## 3. Rollback Scripts & Staging Reversibility

- [010_phase4_learning_experience.rollback.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql): Reverses Migration `010` (`lesson_concepts`, `lesson_revision_points`, `lesson_progress.last_accessed_at`, `lessons`/`previous_exam_questions` columns) cleanly.
- [009_phase2_registration_and_plans.rollback.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/009_phase2_registration_and_plans.rollback.sql): Reactivates `CLASS10_ANNUAL_499`, normalizes `cancelled`/`failed` subscriptions to `revoked`, restores constraint, drops `username`/`state`/plan UI columns.
- *(Execute rollback verification on staging **before** seeding QA data to prevent loss of test rows.)*

---

## 4. Required Post-Migration Staging Verification & Admin Seed Note

> [!IMPORTANT]
> **Critical Preparation Finding:** `006_admin_portal_cms.sql` seeds `public.roles`, **but does NOT seed any row in `public.admin_users`** (the fallback seeder in [adminStoreExtension.js](file:///d:/Downloads/Android%20apk%20file/backend/src/repositories/adminStoreExtension.js#L127-L131) only runs for `InMemoryDataStore`). After applying `001`–`010` on `class10-lms-staging`, insert one staging `super_admin` record into `public.admin_users` using a password hash generated by `hashPassword()` from [adminRbac.js](file:///d:/Downloads/Android%20apk%20file/backend/src/services/adminRbac.js) before testing Admin Portal login.

Verify the following on hosted `class10-lms-staging` after deployment:
1. **GoTrue Auth:** Sign up a QA student (`POST /api/v1/auth/register`) and confirm `auth.users` + `public.profiles` rows appear cleanly.
2. **PostgREST & Service-Role Access:** Hit `GET /api/v1/subscriptions/plans` (`200`, 3 plans) and `GET /api/v1/student/home`.
3. **RLS Runtime Check:** With an unsubscribed `authenticated` JWT calling Supabase Data API directly against `lesson_concepts` / `lesson_revision_points` / `lesson_notes`, verify `is_premium = TRUE` rows are denied (`0` rows returned), while active subscribers receive entitled rows.
4. **TLS & Connection Compatibility:** Verify backend health and zero Supabase SSL/TLS or schema cache errors (`PGRST204`).
