-- ============================================================================
-- Migration 008: Authorized Offline Video Assets & Student Download Metadata
-- Strictly additive & idempotent — reuses existing public.lessons, profiles,
-- user_devices, and lesson_progress tables (ZERO duplicate lesson tables).
-- ============================================================================

-- 1. Authorized Downloadable MP4 Video Assets (Backend-Only Vault Table)
--    Stores organization-owned MP4 assets & variants (e.g., 480p/720p) linked
--    to existing public.lessons(id). Raw storage_key is NEVER exposed to clients.
CREATE TABLE IF NOT EXISTS public.lesson_video_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    storage_provider TEXT NOT NULL DEFAULT 'persistent_disk'
        CHECK (storage_provider IN ('persistent_disk', 'cloudflare_r2', 'supabase_storage', 'pikpak_local')),
    storage_key TEXT NOT NULL,
    original_file_name TEXT NOT NULL DEFAULT '',
    quality_label TEXT NOT NULL DEFAULT '720p',
    mime_type TEXT NOT NULL DEFAULT 'video/mp4',
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    sha256_checksum TEXT NOT NULL CHECK (sha256_checksum ~ '^[a-f0-9]{64}$'),
    is_downloadable BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT TRUE,
    transcoding_status TEXT NOT NULL DEFAULT 'ready'
        CHECK (transcoding_status IN ('pending', 'processing', 'ready', 'failed')),
    uploaded_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_video_assets_lesson_ready
    ON public.lesson_video_assets(lesson_id, is_downloadable, transcoding_status, is_default DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_video_assets_default_quality
    ON public.lesson_video_assets(lesson_id, quality_label)
    WHERE is_downloadable = TRUE AND transcoding_status = 'ready';

-- 2. Student-Specific Offline Download Metadata
--    Tracks authorized per-student, per-lesson, per-device offline downloads,
--    integrity checksum verification, and synced offline playback position.
CREATE TABLE IF NOT EXISTS public.student_video_downloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    video_asset_id UUID NOT NULL REFERENCES public.lesson_video_assets(id) ON DELETE CASCADE,
    device_id UUID REFERENCES public.user_devices(id) ON DELETE SET NULL,
    download_status TEXT NOT NULL DEFAULT 'queued'
        CHECK (download_status IN ('queued', 'downloading', 'completed', 'failed', 'cancelled', 'file_missing', 'deleted')),
    file_size BIGINT NOT NULL DEFAULT 0 CHECK (file_size >= 0),
    bytes_downloaded BIGINT NOT NULL DEFAULT 0 CHECK (bytes_downloaded >= 0),
    file_checksum TEXT NOT NULL DEFAULT '',
    downloaded_at TIMESTAMPTZ,
    last_played_position INTEGER NOT NULL DEFAULT 0 CHECK (last_played_position >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_video_downloads_student_status
    ON public.student_video_downloads(student_id, download_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_video_downloads_lesson_student
    ON public.student_video_downloads(lesson_id, student_id);

CREATE INDEX IF NOT EXISTS idx_student_video_downloads_asset
    ON public.student_video_downloads(video_asset_id);

-- Prevent duplicate non-deleted download records for the same (student, lesson, device)
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_video_downloads_active_device
    ON public.student_video_downloads(
        student_id,
        lesson_id,
        COALESCE(device_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE download_status <> 'deleted';

-- 3. Automatic updated_at Triggers (reuses public.set_updated_at from Migration 001)
DROP TRIGGER IF EXISTS trg_lesson_video_assets_updated_at ON public.lesson_video_assets;
CREATE TRIGGER trg_lesson_video_assets_updated_at
    BEFORE UPDATE ON public.lesson_video_assets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_student_video_downloads_updated_at ON public.student_video_downloads;
CREATE TRIGGER trg_student_video_downloads_updated_at
    BEFORE UPDATE ON public.student_video_downloads
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Strict Row Level Security (RLS)
ALTER TABLE public.lesson_video_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_video_downloads ENABLE ROW LEVEL SECURITY;

-- Backend-only vault: clients can NEVER query raw storage_key or asset vault directly
REVOKE ALL ON public.lesson_video_assets FROM anon, authenticated;

-- Student-owned download metadata: read-only self access; all mutations go through Express service-role API
REVOKE INSERT, UPDATE, DELETE ON public.student_video_downloads FROM anon, authenticated;
DROP POLICY IF EXISTS "student_video_downloads_select_own" ON public.student_video_downloads;
CREATE POLICY "student_video_downloads_select_own" ON public.student_video_downloads
    FOR SELECT TO authenticated
    USING (auth.uid() = student_id);

