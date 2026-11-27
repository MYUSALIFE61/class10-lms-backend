# PHASE 7 — Database Staging Dry-Run Report

**Overall Status:** **BLOCKED (Hosted Staging DB Not Provisioned)** / **COMPLETED AND TESTED (Local Harness & Static SQL Audit)**  
**Production Safety Confirmation:** Live Supabase (`hxllgasepsxrpsonljct`) was **NOT** touched or migrated.

---

## 1. Hosted Staging Database Availability

- **Check Performed:** Inspected workspace `.env` files and deployment configuration — only the production Supabase project reference (`hxllgasepsxrpsonljct`) exists; no separate staging Supabase project URL or credentials are configured.
- **Action Taken:** Per Phase 7 Safety Rules ("Never point the staging migration script at production" / "If staging is unavailable, produce a dry-run plan without executing against the live database"), Migrations `009` and `010` were NOT executed against any live Supabase instance.

---

## 2. Reviewed Migration Artifacts

1. [009_phase2_registration_and_plans.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/009_phase2_registration_and_plans.sql) & [009 rollback](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/009_phase2_registration_and_plans.rollback.sql)
2. [010_phase4_learning_experience.sql](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/010_phase4_learning_experience.sql) & [010 rollback](file:///d:/Downloads/Android%20apk%20file/supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql)

---

## 3. 12-Point Functional Dry-Run Verification Matrix

| # | Scenario | Local Automated Harness Status | Hosted Staging Postgres Status |
|---|---|---|---|
| 1 | New student registration | **COMPLETED AND TESTED** (`phase2_onboarding_and_plans.test.js`) | **BLOCKED** (Needs staging Supabase project) |
| 2 | Username uniqueness | **COMPLETED AND TESTED** (`phase2_onboarding_and_plans.test.js`) | **BLOCKED** |
| 3 | Plan selection (₹200 / ₹500 / ₹799) | **COMPLETED AND TESTED** (`phase2_onboarding_and_plans.test.js`) | **BLOCKED** |
| 4 | Pending subscription state | **COMPLETED AND TESTED** (`phase3_razorpay_payments.test.js`) | **BLOCKED** |
| 5 | Payment verification (Test Mode) | **COMPLETED AND TESTED** (`phase3_razorpay_payments.test.js`) | **BLOCKED** |
| 6 | Subscription activation | **COMPLETED AND TESTED** (`phase5_e2e_integration.test.js`) | **BLOCKED** |
| 7 | Lesson metadata (`lesson_number`, `teacher_name`, `learning_objectives`) | **COMPLETED AND TESTED** (`phase4_learning_experience.test.js`) | **BLOCKED** |
| 8 | Important concepts (`lesson_concepts`) | **COMPLETED AND TESTED** (`phase4_learning_experience.test.js`) | **BLOCKED** |
| 9 | Quick revision (`lesson_revision_points`) | **COMPLETED AND TESTED** (`phase4_learning_experience.test.js`) | **BLOCKED** |
| 10 | Lesson-scoped PYQs (`previous_exam_questions.lesson_id`) | **COMPLETED AND TESTED** (`phase4_learning_experience.test.js`) | **BLOCKED** |
| 11 | Video asset lookup (`lesson_video_assets` unified bridge) | **COMPLETED AND TESTED** (`phase6_storage_and_playback_bridge.test.js`) | **BLOCKED** |
| 12 | Student authorization & RLS enforcement | **COMPLETED AND TESTED** (Backend integration + static RLS policy review) | **BLOCKED** |

---

## 4. Staging Dry-Run Execution Runbook (Once Staging Supabase Project Exists)

1. Provision a free-tier Staging Supabase project and apply baseline Migrations `001`–`008`.
2. Apply `009_phase2_registration_and_plans.sql` → verify 3 active plans (`20000`, `50000`, `79900`) + `CLASS10_ANNUAL_499` inactive + `uq_profiles_username_lower`.
3. Apply `010_phase4_learning_experience.sql` → verify `lesson_concepts` & `lesson_revision_points` RLS enabled (`relrowsecurity = true`) and all FK/indexes created.
4. Execute rollback rehearsal (`010` rollback → `009` rollback) on the staging DB, verify clean schema restoration, then re-apply `009` and `010` to prove idempotency.
