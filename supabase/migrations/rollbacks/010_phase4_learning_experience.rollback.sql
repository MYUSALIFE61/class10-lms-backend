-- ============================================================================
-- Rollback for Migration 010: Phase 4 Complete Student Learning Experience
-- Safely reverses additive Phase 4 schema changes without deleting legacy data.
-- ============================================================================

DROP POLICY IF EXISTS lesson_concepts_select_entitled ON public.lesson_concepts;
DROP POLICY IF EXISTS lesson_revision_select_entitled ON public.lesson_revision_points;

DROP TABLE IF EXISTS public.lesson_revision_points;
DROP TABLE IF EXISTS public.lesson_concepts;

DROP INDEX IF EXISTS public.idx_pyq_lesson_order;
ALTER TABLE public.previous_exam_questions
    DROP COLUMN IF EXISTS lesson_id,
    DROP COLUMN IF EXISTS question_type,
    DROP COLUMN IF EXISTS question_image_url,
    DROP COLUMN IF EXISTS options_json,
    DROP COLUMN IF EXISTS explanation;

DROP INDEX IF EXISTS public.idx_lesson_progress_user_accessed;
DROP INDEX IF EXISTS public.idx_student_progress_user_accessed;
ALTER TABLE public.lesson_progress
    DROP COLUMN IF EXISTS last_accessed_at;

ALTER TABLE public.lessons
    DROP COLUMN IF EXISTS lesson_number,
    DROP COLUMN IF EXISTS teacher_name,
    DROP COLUMN IF EXISTS learning_objectives;
