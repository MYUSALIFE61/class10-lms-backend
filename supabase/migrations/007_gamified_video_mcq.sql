-- ============================================================================
-- Migration 007: Gamified Video-Based MCQ System (Additive, Non-Destructive)
-- Extends existing lessons, question_bank, quizzes, quiz_attempts tables and
-- adds normalized gamification profiles & achievements tables.
-- ============================================================================

-- 1. Extend lessons with Video Transcript & Concept Metadata
ALTER TABLE public.lessons
    ADD COLUMN IF NOT EXISTS transcript_text TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS key_concepts_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Extend question_bank with 4-Round Gamification, Concept Tag & AI Approval Workflow
ALTER TABLE public.question_bank
    ADD COLUMN IF NOT EXISTS round_type TEXT NOT NULL DEFAULT 'quick_challenge'
        CHECK (round_type IN ('quick_challenge', 'brain_battle', 'master_challenge', 'victory_round')),
    ADD COLUMN IF NOT EXISTS concept_tag TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS source_origin TEXT NOT NULL DEFAULT 'manual'
        CHECK (source_origin IN ('manual', 'ai_transcript', 'bulk_import')),
    ADD COLUMN IF NOT EXISTS ai_approval_status TEXT NOT NULL DEFAULT 'approved'
        CHECK (ai_approval_status IN ('pending_review', 'approved', 'rejected')),
    ADD COLUMN IF NOT EXISTS transcript_excerpt TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reference_note TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_question_bank_lesson_round
    ON public.question_bank(lesson_id, round_type, ai_approval_status, status);

-- 3. Extend quizzes with Video-Lesson Linkage & Dynamic Gamification Controls
ALTER TABLE public.quizzes
    ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS is_gamified BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS timer_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS allow_skip BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS allow_review BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS leaderboard_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS xp_per_correct INTEGER NOT NULL DEFAULT 20 CHECK (xp_per_correct >= 0),
    ADD COLUMN IF NOT EXISTS streak_bonus_xp INTEGER NOT NULL DEFAULT 10 CHECK (streak_bonus_xp >= 0),
    ADD COLUMN IF NOT EXISTS understanding_bonus_xp INTEGER NOT NULL DEFAULT 25 CHECK (understanding_bonus_xp >= 0),
    ADD COLUMN IF NOT EXISTS victory_bonus_xp INTEGER NOT NULL DEFAULT 50 CHECK (victory_bonus_xp >= 0),
    ADD COLUMN IF NOT EXISTS rounds_config_json JSONB NOT NULL DEFAULT '{"quick_challenge":3,"brain_battle":3,"master_challenge":2,"victory_round":2}'::jsonb,
    ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_quizzes_lesson_status ON public.quizzes(lesson_id, status);

-- 4. Extend quiz_attempts with XP, Streaks & Per-Question Server-Validated Answers
ALTER TABLE public.quiz_attempts
    ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS xp_earned INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bonus_xp INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_streak INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS answered_map_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 5. Student Gamification Profiles (XP, Levels, Daily Streaks, Personal Best)
CREATE TABLE IF NOT EXISTS public.student_gamification_profiles (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    total_xp INTEGER NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
    current_daily_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_daily_streak >= 0),
    longest_daily_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_daily_streak >= 0),
    last_activity_date DATE,
    personal_best_score_pct SMALLINT NOT NULL DEFAULT 0 CHECK (personal_best_score_pct BETWEEN 0 AND 100),
    total_quizzes_completed INTEGER NOT NULL DEFAULT 0,
    total_correct_answers INTEGER NOT NULL DEFAULT 0,
    total_answered INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Student Badges & Chapter / Subject Achievements
CREATE TABLE IF NOT EXISTS public.student_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_code TEXT NOT NULL,
    badge_title TEXT NOT NULL,
    badge_description TEXT NOT NULL DEFAULT '',
    badge_category TEXT NOT NULL DEFAULT 'mastery'
        CHECK (badge_category IN ('streak', 'mastery', 'chapter', 'subject', 'victory', 'consistency')),
    entity_id TEXT NOT NULL DEFAULT 'global',
    xp_reward INTEGER NOT NULL DEFAULT 25,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, badge_code, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_student_achievements_user
    ON public.student_achievements(user_id, awarded_at DESC);

ALTER TABLE public.student_gamification_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gamification_select_own" ON public.student_gamification_profiles;
CREATE POLICY "gamification_select_own" ON public.student_gamification_profiles
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "achievements_select_own" ON public.student_achievements;
CREATE POLICY "achievements_select_own" ON public.student_achievements
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
