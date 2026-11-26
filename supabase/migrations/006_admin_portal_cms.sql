-- ============================================================================
-- Migration 006: Complete Dynamic Class 10 LMS Admin Portal & CMS Schema
-- Strictly additive & idempotent — preserves all 18 existing tables & records
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Academic Hierarchy: Boards, Academic Years, Topics & Board Mappings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE CHECK (code IN ('AP', 'TS') OR char_length(code) BETWEEN 2 AND 16),
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    syllabus_version TEXT NOT NULL DEFAULT 'SSC-2026',
    description TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    syllabus_version TEXT NOT NULL DEFAULT 'SSC-2026',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

-- Extend existing profiles with Student Management fields (non-destructive)
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS school TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS district TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS medium TEXT NOT NULL DEFAULT 'EN' CHECK (medium IN ('EN', 'TE')),
    ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS class_name TEXT NOT NULL DEFAULT 'Class 10',
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
        CHECK (account_status IN ('active', 'inactive', 'suspended')),
    ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_profiles_status_board ON public.profiles(account_status, board);

-- Extend existing subjects, chapters, lessons, lesson_video_sources
ALTER TABLE public.subjects
    ADD COLUMN IF NOT EXISTS board_codes JSONB NOT NULL DEFAULT '["AP","TS"]'::jsonb,
    ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS language_category TEXT NOT NULL DEFAULT 'core'
        CHECK (language_category IN ('core', 'first_language', 'second_language', 'third_language')),
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'under_review', 'approved', 'scheduled', 'published', 'archived')),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.chapters
    ADD COLUMN IF NOT EXISTS board_codes JSONB NOT NULL DEFAULT '["AP","TS"]'::jsonb,
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'under_review', 'approved', 'scheduled', 'published', 'archived')),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    learning_objectives TEXT NOT NULL DEFAULT '',
    display_order INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'under_review', 'approved', 'scheduled', 'published', 'archived')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topics_chapter_order ON public.topics(chapter_id, display_order);

ALTER TABLE public.lessons
    ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS lesson_type TEXT NOT NULL DEFAULT 'concept'
        CHECK (lesson_type IN ('concept', 'examples', 'exercise', 'revision', 'important_questions', 'practical')),
    ADD COLUMN IF NOT EXISTS board_codes JSONB NOT NULL DEFAULT '["AP","TS"]'::jsonb,
    ADD COLUMN IF NOT EXISTS video_language TEXT NOT NULL DEFAULT 'TE_EN_MIX',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'under_review', 'approved', 'scheduled', 'published', 'archived')),
    ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_lessons_status_chapter ON public.lessons(status, chapter_id, display_order);

ALTER TABLE public.lesson_video_sources
    ADD COLUMN IF NOT EXISTS display_title TEXT,
    ADD COLUMN IF NOT EXISTS original_file_name TEXT,
    ADD COLUMN IF NOT EXISTS language_code TEXT NOT NULL DEFAULT 'TE_EN_MIX',
    ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quality TEXT DEFAULT '720p',
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'under_review', 'approved', 'scheduled', 'published', 'archived'));

ALTER TABLE public.lesson_progress
    ADD COLUMN IF NOT EXISTS watch_time_seconds INTEGER NOT NULL DEFAULT 0 CHECK (watch_time_seconds >= 0);

-- ---------------------------------------------------------------------------
-- 2. Study Materials & Protected Resources (Separate Textbook Medium: EN / TE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.study_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
    resource_type TEXT NOT NULL DEFAULT 'chapter_notes'
        CHECK (resource_type IN (
            'chapter_notes', 'lesson_notes', 'pdf_document', 'textbook',
            'formula_sheet', 'important_questions', 'worksheet', 'diagram',
            'revision_notes', 'practical_sheet', 'model_paper', 'previous_paper'
        )),
    board_codes JSONB NOT NULL DEFAULT '["AP","TS"]'::jsonb,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
    medium TEXT NOT NULL DEFAULT 'EN' CHECK (medium IN ('EN', 'TE', 'BOTH')),
    file_name TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    storage_path TEXT,
    content_markdown TEXT DEFAULT '',
    is_downloadable BOOLEAN NOT NULL DEFAULT TRUE,
    is_premium BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'under_review', 'approved', 'scheduled', 'published', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_resources_lookup
    ON public.study_resources(subject_id, chapter_id, status, medium);

-- ---------------------------------------------------------------------------
-- 3. Dynamic Question Bank, Quizzes & Server-Timed Exams
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.question_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_text TEXT NOT NULL,
    question_image_url TEXT,
    question_type TEXT NOT NULL DEFAULT 'mcq'
        CHECK (question_type IN (
            'mcq', 'true_false', 'fill_blank', 'match', 'short_answer',
            'long_answer', 'numerical', 'diagram', 'assertion_reason', 'previous_board'
        )),
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
    difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    correct_option_index INTEGER,
    correct_answer_text TEXT DEFAULT '',
    explanation TEXT NOT NULL DEFAULT '',
    marks NUMERIC(5,2) NOT NULL DEFAULT 1,
    negative_marks NUMERIC(5,2) NOT NULL DEFAULT 0,
    board_codes JSONB NOT NULL DEFAULT '["AP","TS"]'::jsonb,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
    language TEXT NOT NULL DEFAULT 'EN',
    status TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'under_review', 'approved', 'scheduled', 'published', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_bank_filter
    ON public.question_bank(subject_id, chapter_id, difficulty, status);

CREATE TABLE IF NOT EXISTS public.quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    quiz_type TEXT NOT NULL DEFAULT 'chapter_test'
        CHECK (quiz_type IN ('topic_practice', 'lesson_practice', 'chapter_test', 'subject_test', 'weekly_test', 'monthly_test', 'revision_test', 'model_test')),
    board_codes JSONB NOT NULL DEFAULT '["AP","TS"]'::jsonb,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    question_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_marks NUMERIC(6,2) NOT NULL DEFAULT 15,
    passing_marks NUMERIC(6,2) NOT NULL DEFAULT 6,
    duration_minutes INTEGER NOT NULL DEFAULT 15 CHECK (duration_minutes > 0),
    attempts_allowed INTEGER NOT NULL DEFAULT 3 CHECK (attempts_allowed >= 1),
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    shuffle_questions BOOLEAN NOT NULL DEFAULT FALSE,
    shuffle_options BOOLEAN NOT NULL DEFAULT FALSE,
    show_results BOOLEAN NOT NULL DEFAULT TRUE,
    show_explanations BOOLEAN NOT NULL DEFAULT TRUE,
    negative_marking BOOLEAN NOT NULL DEFAULT FALSE,
    is_premium BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'under_review', 'approved', 'scheduled', 'published', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired')),
    score NUMERIC(6,2) NOT NULL DEFAULT 0,
    total_marks NUMERIC(6,2) NOT NULL DEFAULT 0,
    percentage SMALLINT NOT NULL DEFAULT 0,
    passed BOOLEAN NOT NULL DEFAULT FALSE,
    answers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON public.quiz_attempts(user_id, quiz_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    exam_type TEXT NOT NULL DEFAULT 'monthly'
        CHECK (exam_type IN ('monthly', 'chapter', 'subject', 'mock', 'full_model', 'board_practice')),
    board_codes JSONB NOT NULL DEFAULT '["AP","TS"]'::jsonb,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    exam_date TIMESTAMPTZ NOT NULL,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
    total_marks NUMERIC(6,2) NOT NULL DEFAULT 50,
    passing_marks NUMERIC(6,2) NOT NULL DEFAULT 18,
    sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    question_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    instructions TEXT NOT NULL DEFAULT '',
    attempts_allowed INTEGER NOT NULL DEFAULT 1,
    results_published BOOLEAN NOT NULL DEFAULT FALSE,
    result_publish_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'under_review', 'approved', 'scheduled', 'published', 'cancelled', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.exam_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'evaluated', 'expired')),
    objective_score NUMERIC(6,2) NOT NULL DEFAULT 0,
    descriptive_score NUMERIC(6,2) NOT NULL DEFAULT 0,
    total_score NUMERIC(6,2) NOT NULL DEFAULT 0,
    total_marks NUMERIC(6,2) NOT NULL DEFAULT 0,
    answers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    evaluator_notes TEXT DEFAULT '',
    evaluated_by UUID,
    evaluated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4. Targeted Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    notification_type TEXT NOT NULL DEFAULT 'general'
        CHECK (notification_type IN (
            'new_video', 'new_notes', 'new_chapter', 'new_quiz',
            'upcoming_exam', 'exam_reminder', 'result_published',
            'announcement', 'subscription_expiry', 'general'
        )),
    audience_type TEXT NOT NULL DEFAULT 'all'
        CHECK (audience_type IN ('all', 'board_ap', 'board_ts', 'subject', 'chapter', 'selected_students')),
    audience_filter_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    deep_link TEXT DEFAULT '/dashboard',
    sent_by UUID,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notification_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    delivery_status TEXT NOT NULL DEFAULT 'delivered' CHECK (delivery_status IN ('pending', 'delivered', 'failed')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_recipients_user ON public.notification_recipients(user_id, is_read, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Admin RBAC, Sessions, Audit Logs & Dynamic App Configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    permissions_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role_code TEXT NOT NULL REFERENCES public.roles(code),
    assigned_subject_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    token_jti TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    user_agent TEXT,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    admin_email TEXT,
    admin_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    summary TEXT NOT NULL DEFAULT '',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS public.app_configurations (
    key TEXT PRIMARY KEY,
    value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS & Revoke direct client access on admin/vault tables
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_configurations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.question_bank FROM anon, authenticated;
REVOKE ALL ON public.roles FROM anon, authenticated;
REVOKE ALL ON public.admin_users FROM anon, authenticated;
REVOKE ALL ON public.admin_sessions FROM anon, authenticated;
REVOKE ALL ON public.admin_audit_logs FROM anon, authenticated;

-- Seed initial AP & Telangana boards, 2026-2027 academic year, and 8 RBAC roles
INSERT INTO public.boards (code, name, short_name, syllabus_version, description)
VALUES
    ('AP', 'Andhra Pradesh SSC', 'AP SSC', 'AP-SSC-2026', 'Board of Secondary Education, Andhra Pradesh Class 10'),
    ('TS', 'Telangana SSC', 'TS SSC', 'TS-SSC-2026', 'Board of Secondary Education, Telangana Class 10')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.academic_years (name, start_date, end_date, syllabus_version, is_active)
VALUES ('2026-2027', '2026-06-01', '2027-04-30', 'SSC-2026', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.roles (code, name, description, permissions_json)
VALUES
    ('super_admin', 'Super Admin', 'Complete unrestricted system access', '["*"]'::jsonb),
    ('admin', 'Admin', 'Students, content, reports, notifications and subscriptions', '["dashboard:view","students:read","students:write","academic:read","academic:write","content:read","content:write","content:publish","videos:manage","resources:manage","questions:read","questions:write","quizzes:manage","exams:manage","exams:grade","progress:read","notifications:manage","subscriptions:manage","config:manage","audit:read"]'::jsonb),
    ('content_manager', 'Content Manager', 'Subjects, chapters, topics, lessons, videos and study materials', '["dashboard:view","academic:read","academic:write","content:read","content:write","content:publish","videos:manage","resources:manage"]'::jsonb),
    ('subject_manager', 'Subject Manager', 'Manage content for assigned subjects only', '["dashboard:view","academic:read","academic:write","content:read","content:write","videos:manage","resources:manage"]'::jsonb),
    ('teacher', 'Teacher', 'Assigned lessons, questions, practice and student progress', '["dashboard:view","academic:read","content:read","content:write","questions:read","questions:write","quizzes:manage","progress:read"]'::jsonb),
    ('question_bank_manager', 'Question Bank Manager', 'Create, import and curate MCQ and descriptive questions', '["dashboard:view","academic:read","questions:read","questions:write","quizzes:manage"]'::jsonb),
    ('exam_controller', 'Exam Controller', 'Schedule, monitor, evaluate exams and publish results', '["dashboard:view","academic:read","questions:read","quizzes:manage","exams:manage","exams:grade","progress:read","notifications:manage"]'::jsonb),
    ('student_support', 'Student Support', 'View student profiles, subscriptions and assist accounts', '["dashboard:view","students:read","students:write","progress:read","notifications:manage"]'::jsonb)
ON CONFLICT (code) DO NOTHING;
