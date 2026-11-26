-- ============================================================================
-- Migration 002: Strict Supabase Row Level Security (RLS) Policies
-- Defense-in-depth: even with an extracted Supabase anon key, clients CANNOT
-- read YouTube Video IDs, premium content, MCQ answers, or tamper subscriptions.
-- ============================================================================

-- Enable RLS across ALL tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_video_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_mcqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcq_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.previous_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.important_formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playback_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Security-definer helper checking active subscription for direct RLS queries
CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.subscriptions s
        WHERE s.user_id = p_user_id
          AND s.status = 'active'
          AND s.expires_at > NOW()
    );
$$;

-- ---------------------------------------------------------------------------
-- 1. BACKEND-ONLY VAULT TABLES (Zero anon/authenticated policies!)
--    Express backend accesses these exclusively with SUPABASE_SERVICE_ROLE_KEY
-- ---------------------------------------------------------------------------
-- public.lesson_video_sources  -> NO client policies (video IDs strictly server-gated)
-- public.payment_transactions  -> NO client policies (Razorpay audit ledger)
-- public.user_sessions         -> NO client policies (session/refresh hashes)
-- public.lesson_mcqs           -> NO client policies (prevents reading correct_option_index)
-- public.playback_audit_logs   -> NO client policies
-- public.security_events       -> NO client policies

REVOKE ALL ON public.lesson_video_sources FROM anon, authenticated;
REVOKE ALL ON public.payment_transactions FROM anon, authenticated;
REVOKE ALL ON public.user_sessions FROM anon, authenticated;
REVOKE ALL ON public.lesson_mcqs FROM anon, authenticated;
REVOKE ALL ON public.playback_audit_logs FROM anon, authenticated;
REVOKE ALL ON public.security_events FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. STUDENT-OWNED TABLES (Read-Only Self Access; Mutations via Express API)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_devices_select_own" ON public.user_devices;
CREATE POLICY "user_devices_select_own" ON public.user_devices
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "lesson_progress_select_own" ON public.lesson_progress;
CREATE POLICY "lesson_progress_select_own" ON public.lesson_progress
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "mcq_attempts_select_own" ON public.mcq_attempts;
CREATE POLICY "mcq_attempts_select_own" ON public.mcq_attempts
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. PUBLIC / CATALOG TABLES (Safe Metadata Only — No Video IDs)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "plans_select_active" ON public.subscription_plans;
CREATE POLICY "plans_select_active" ON public.subscription_plans
    FOR SELECT TO authenticated
    USING (is_active = TRUE);

DROP POLICY IF EXISTS "subjects_select_active" ON public.subjects;
CREATE POLICY "subjects_select_active" ON public.subjects
    FOR SELECT TO authenticated
    USING (is_active = TRUE);

DROP POLICY IF EXISTS "chapters_select_active" ON public.chapters;
CREATE POLICY "chapters_select_active" ON public.chapters
    FOR SELECT TO authenticated
    USING (is_active = TRUE);

DROP POLICY IF EXISTS "lessons_select_active" ON public.lessons;
CREATE POLICY "lessons_select_active" ON public.lessons
    FOR SELECT TO authenticated
    USING (is_active = TRUE);

-- ---------------------------------------------------------------------------
-- 4. PREMIUM LEARNING RESOURCES (Free OR Active Subscription Only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "notes_select_authorized" ON public.lesson_notes;
CREATE POLICY "notes_select_authorized" ON public.lesson_notes
    FOR SELECT TO authenticated
    USING (
        is_active = TRUE
        AND (is_premium = FALSE OR public.has_active_subscription(auth.uid()))
    );

DROP POLICY IF EXISTS "pyq_select_authorized" ON public.previous_exam_questions;
CREATE POLICY "pyq_select_authorized" ON public.previous_exam_questions
    FOR SELECT TO authenticated
    USING (
        is_active = TRUE
        AND (is_premium = FALSE OR public.has_active_subscription(auth.uid()))
    );

DROP POLICY IF EXISTS "formulas_select_authorized" ON public.important_formulas;
CREATE POLICY "formulas_select_authorized" ON public.important_formulas
    FOR SELECT TO authenticated
    USING (
        is_active = TRUE
        AND (is_premium = FALSE OR public.has_active_subscription(auth.uid()))
    );
