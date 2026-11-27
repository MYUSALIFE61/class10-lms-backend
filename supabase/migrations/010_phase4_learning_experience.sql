-- ============================================================================
-- Migration 010: Phase 4 Complete Student Learning Experience
-- Purpose: Strictly additive, reversible schema extensions for lesson teacher
-- metadata, learning objectives, lesson-specific concepts, quick revision
-- points, lesson-scoped PYQ metadata, and last_accessed_at progress tracking.
-- Reuses existing tables: subjects, chapters, lessons, lesson_notes,
-- study_resources, previous_exam_questions, important_formulas,
-- lesson_progress, lesson_video_sources, lesson_video_assets.
-- Rollback: supabase/migrations/rollbacks/010_phase4_learning_experience.rollback.sql
-- ============================================================================

-- 1. Extend public.lessons with teacher metadata, lesson number & learning objectives
ALTER TABLE public.lessons
    ADD COLUMN IF NOT EXISTS lesson_number INTEGER,
    ADD COLUMN IF NOT EXISTS teacher_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS learning_objectives TEXT NOT NULL DEFAULT '';

-- 2. Extend public.lesson_progress with explicit last_accessed_at timestamp
ALTER TABLE public.lesson_progress
    ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_accessed
    ON public.lesson_progress(user_id, last_accessed_at DESC);

-- 3. Lesson-Specific Important Concepts
CREATE TABLE IF NOT EXISTS public.lesson_concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    explanation_markdown TEXT NOT NULL DEFAULT '',
    formula_expression TEXT NOT NULL DEFAULT '',
    diagram_url TEXT,
    examples_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    definitions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    display_order INTEGER NOT NULL DEFAULT 1,
    is_premium BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_concepts_lesson_order
    ON public.lesson_concepts(lesson_id, is_active, display_order);

-- 4. Lesson-Specific Quick Revision Points (Key Points, Formulas, Definitions, Checklists)
CREATE TABLE IF NOT EXISTS public.lesson_revision_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    point_type TEXT NOT NULL DEFAULT 'key_point'
        CHECK (point_type IN ('key_point', 'formula', 'definition', 'explanation', 'fact', 'checklist')),
    title TEXT NOT NULL,
    content_markdown TEXT NOT NULL DEFAULT '',
    formula_expression TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 1,
    is_premium BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_revision_lesson_order
    ON public.lesson_revision_points(lesson_id, is_active, display_order);

-- 5. Extend public.previous_exam_questions for lesson-scoped multi-type PYQs
ALTER TABLE public.previous_exam_questions
    ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS question_type TEXT NOT NULL DEFAULT 'short_answer'
        CHECK (question_type IN ('mcq', 'short_answer', 'long_answer', 'numerical')),
    ADD COLUMN IF NOT EXISTS question_image_url TEXT,
    ADD COLUMN IF NOT EXISTS options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS explanation TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_pyq_lesson_order
    ON public.previous_exam_questions(lesson_id, is_active, display_order)
    WHERE lesson_id IS NOT NULL;

-- 6. Row-Level Security (RLS) for new learning tables
ALTER TABLE public.lesson_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_revision_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_concepts_select_entitled ON public.lesson_concepts;
CREATE POLICY lesson_concepts_select_entitled
    ON public.lesson_concepts
    FOR SELECT
    TO authenticated
    USING (
        is_active = TRUE
        AND (is_premium = FALSE OR public.has_active_subscription(auth.uid()))
    );

DROP POLICY IF EXISTS lesson_revision_select_entitled ON public.lesson_revision_points;
CREATE POLICY lesson_revision_select_entitled
    ON public.lesson_revision_points
    FOR SELECT
    TO authenticated
    USING (
        is_active = TRUE
        AND (is_premium = FALSE OR public.has_active_subscription(auth.uid()))
    );
