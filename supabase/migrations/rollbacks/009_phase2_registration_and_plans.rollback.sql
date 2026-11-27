-- ============================================================================
-- Rollback for Migration 009: Phase 2 Student Registration & 3 Subscription Plans
-- Safe reversible rollback that preserves historical subscription/payment FKs.
-- ============================================================================

-- 1. Deactivate Phase 2 plans and restore legacy ₹499 plan active status
UPDATE public.subscription_plans
SET is_active = FALSE
WHERE code IN ('CLASS10_MONTHLY_200', 'CLASS10_HALFYEAR_500', 'CLASS10_ANNUAL_799');

UPDATE public.subscription_plans
SET is_active = TRUE
WHERE code = 'CLASS10_ANNUAL_499';

-- 2. Restore original subscriptions status constraint (normalize any cancelled/failed rows safely first)
UPDATE public.subscriptions
SET status = 'revoked',
    revoked_reason = COALESCE(revoked_reason, 'migration_009_rollback')
WHERE status IN ('cancelled', 'failed');

ALTER TABLE public.subscriptions
    DROP CONSTRAINT IF EXISTS chk_subscriptions_status;

ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('pending', 'active', 'expired', 'revoked'));

-- 3. Drop Phase 2 indexes & columns added to profiles and subscription_plans
DROP INDEX IF EXISTS public.uq_profiles_username_lower;
DROP INDEX IF EXISTS public.idx_profiles_phone_nonempty;

ALTER TABLE public.profiles
    DROP COLUMN IF EXISTS username,
    DROP COLUMN IF EXISTS state;

ALTER TABLE public.subscription_plans
    DROP COLUMN IF EXISTS duration_label,
    DROP COLUMN IF EXISTS features_json,
    DROP COLUMN IF EXISTS display_order,
    DROP COLUMN IF EXISTS is_recommended;
