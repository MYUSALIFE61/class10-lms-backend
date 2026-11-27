-- ============================================================================
-- Migration 009: Phase 2 Student Registration Fields & 3 Subscription Plans
-- Reversible, strictly additive / non-destructive migration.
-- Preserves legacy CLASS10_ANNUAL_499 plan row and all historical records.
-- Rollback script: supabase/migrations/rollbacks/009_phase2_registration_and_plans.rollback.sql
-- ============================================================================

-- 1. Extend public.profiles for full student registration
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS username TEXT,
    ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'Andhra Pradesh';

-- Case-insensitive uniqueness for non-null usernames (preserves legacy accounts with NULL username)
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username_lower
    ON public.profiles (lower(username))
    WHERE username IS NOT NULL AND btrim(username) <> '';

-- Lookup index for non-empty mobile numbers (allows siblings/family phones while keeping username & email unique)
CREATE INDEX IF NOT EXISTS idx_profiles_phone_nonempty
    ON public.profiles (phone)
    WHERE phone IS NOT NULL AND btrim(phone) <> '';

-- 2. Extend public.subscriptions status constraint to support cancelled & failed states
DO $$
DECLARE
    v_constraint_name TEXT;
BEGIN
    FOR v_constraint_name IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND t.relname = 'subscriptions'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
    END LOOP;
END $$;

ALTER TABLE public.subscriptions
    ADD CONSTRAINT chk_subscriptions_status
    CHECK (status IN ('pending', 'active', 'expired', 'revoked', 'cancelled', 'failed'));

-- 3. Extend public.subscription_plans metadata without breaking existing FKs
ALTER TABLE public.subscription_plans
    ADD COLUMN IF NOT EXISTS duration_label TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS features_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN NOT NULL DEFAULT FALSE;

-- Retain legacy ₹499 plan row for historical subscription/payment FKs, mark inactive for new checkouts
UPDATE public.subscription_plans
SET is_active = FALSE
WHERE code = 'CLASS10_ANNUAL_499';

-- 4. Upsert the three backend-controlled Class 10 SSC subscription plans
INSERT INTO public.subscription_plans (
    code,
    name,
    description,
    price_paise,
    currency,
    duration_days,
    duration_label,
    features_json,
    display_order,
    is_recommended,
    is_active
)
VALUES
    (
        'CLASS10_MONTHLY_200',
        'Monthly Plan',
        'Flexible 30-day full access to Class 10 AP & Telangana SSC video lessons, chapter tests, notes & encrypted offline downloads.',
        20000,
        'INR',
        30,
        '1 Month',
        '["All 6 Class 10 SSC Subjects", "Topic-wise Video Lessons & Offline Downloads", "Chapter MCQs, Notes, PYQs & Formula Sheets", "30 Days Full Validity"]'::jsonb,
        1,
        FALSE,
        TRUE
    ),
    (
        'CLASS10_HALFYEAR_500',
        'Half-Yearly Plan',
        'Best for term & pre-final board preparation with 180 days of uninterrupted Class 10 AP & TS SSC learning.',
        50000,
        'INR',
        180,
        '6 Months',
        '["All 6 Class 10 SSC Subjects", "Topic-wise Video Lessons & Offline Downloads", "Pre-Final & SA Revision Tests + PYQs", "180 Days Validity (Save ₹700 vs Monthly)"]'::jsonb,
        2,
        FALSE,
        TRUE
    ),
    (
        'CLASS10_ANNUAL_799',
        'Annual Plan',
        'Complete 365-day Class 10 AP & TS SSC Board Master Pass covering full syllabus, board mock tests, notes & offline library.',
        79900,
        'INR',
        365,
        '12 Months',
        '["All 6 Class 10 SSC Subjects", "Unlimited Encrypted Offline Lesson Downloads", "Board Exam PYQs, Notes & Gamified Video Quizzes", "Full 365 Days Academic Year Validity"]'::jsonb,
        3,
        TRUE,
        TRUE
    )
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_paise = EXCLUDED.price_paise,
    currency = EXCLUDED.currency,
    duration_days = EXCLUDED.duration_days,
    duration_label = EXCLUDED.duration_label,
    features_json = EXCLUDED.features_json,
    display_order = EXCLUDED.display_order,
    is_recommended = EXCLUDED.is_recommended,
    is_active = EXCLUDED.is_active;
