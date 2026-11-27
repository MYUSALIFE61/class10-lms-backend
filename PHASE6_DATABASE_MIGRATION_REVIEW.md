# PHASE 6 — Database Migration Review & Execution Plan

**Status:** **IMPLEMENTED BUT NOT FULLY TESTED** (SQL, idempotency, FKs, indexes, RLS, and rollbacks reviewed; intentionally NOT applied to live Supabase `hxllgasepsxrpsonljct`)

---

## 1. Review of Migration 009 & Rollback

- **File:** [009_phase2_registration_and_plans.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/009_phase2_registration_and_plans.sql)
- **Idempotency:** Uses `ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`, and `INSERT ... ON CONFLICT (code) DO UPDATE`. Safe to re-run.
- **Backward Compatibility:** Preserves legacy `CLASS10_ANNUAL_499` row (marks `is_active = FALSE` so existing `subscriptions` and `payment_transactions` foreign keys remain 100% intact). Partial unique index `uq_profiles_username_lower` ignores `NULL` usernames so legacy accounts are unaffected.
- **Rollback Safety Warning ([009 rollback](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/009_phase2_registration_and_plans.rollback.sql)):**
  - Safely restores `CLASS10_ANNUAL_499` active status and normalizes `cancelled`/`failed` subscriptions to `revoked` before restoring the original CHECK constraint.
  - **DATA-LOSS WARNING:** Lines 32–34 (`DROP COLUMN IF EXISTS username, state`) and 36–40 (`DROP COLUMN IF EXISTS duration_label, ...`) will permanently drop any newly registered student `username`/`state` data written *after* Migration 009 was applied. Always take a table backup before executing rollback.

---

## 2. Review of Migration 010 & Rollback

- **File:** [010_phase4_learning_experience.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/010_phase4_learning_experience.sql)
- **Idempotency:** Uses `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `DROP POLICY IF EXISTS` before `CREATE POLICY`. Safe to re-run.
- **RLS & FKs:** Enables RLS on `public.lesson_concepts` and `public.lesson_revision_points` using existing `public.has_active_subscription(auth.uid())`. All FKs properly reference `subjects(id)`, `chapters(id)`, and `lessons(id)` (`ON DELETE CASCADE` for child concept/revision rows; `ON DELETE SET NULL` for `previous_exam_questions.lesson_id`).
- **Rollback Safety Warning ([010 rollback](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql)):**
  - Does NOT delete any legacy rows in `lessons`, `student_lesson_progress`, or `previous_exam_questions`.
  - **DATA-LOSS WARNING:** `DROP TABLE IF EXISTS lesson_concepts, lesson_revision_points` will drop any concepts/revision points authored *after* Migration 010. Export those tables before rolling back.

---

## 3. Production Migration Execution Plan (Execute Only After Explicit Approval)

1. **Pre-Migration Backup:** Trigger a manual Supabase backup / `pg_dump --schema=public` snapshot before running any DDL.
2. **Schema Snapshot:** Record current counts:
   ```sql
   SELECT 'profiles' AS tbl, count(*) FROM public.profiles
   UNION ALL SELECT 'subscription_plans', count(*) FROM public.subscription_plans
   UNION ALL SELECT 'subscriptions', count(*) FROM public.subscriptions
   UNION ALL SELECT 'lessons', count(*) FROM public.lessons
   UNION ALL SELECT 'lesson_video_assets', count(*) FROM public.lesson_video_assets;
   ```
3. **Migration Order:**
   1. Run `009_phase2_registration_and_plans.sql` in a single transaction.
   2. Run `010_phase4_learning_experience.sql` in a single transaction.
4. **Validation Queries:**
   - Confirm `subscription_plans` has 3 active plans (`20000`, `50000`, `79900` paise) and `CLASS10_ANNUAL_499` has `is_active = false`.
   - Confirm `lesson_concepts` and `lesson_revision_points` have `relrowsecurity = true`.
   - Confirm zero drop in row counts for `profiles`, `subscriptions`, `payment_transactions`, `lessons`, `lesson_video_assets`.
5. **Rollback Strategy:** If any smoke check fails immediately after cutover (before new user traffic writes), execute `010` rollback then `009` rollback. If user writes occurred, restore from Step 1 snapshot instead.
6. **Post-Migration Smoke Tests:** Hit `GET /health`, `GET /api/v1/subscriptions/plans`, `GET /api/v1/student/home`, and `GET /api/v1/student/lessons/:id/{notes,concepts,revision,pyqs}`.
