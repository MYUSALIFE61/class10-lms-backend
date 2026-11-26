-- ============================================================================
-- Migration 004: Add Private Stream Provider (Bunny Stream / Cloudflare R2 / HLS)
-- Enables zero-YouTube-branding, zero-redirect private video streaming alongside
-- YouTube Unlisted and future Widevine/FairPlay DRM providers.
-- ============================================================================

ALTER TABLE public.lesson_video_sources
    DROP CONSTRAINT IF EXISTS lesson_video_sources_provider_check;

ALTER TABLE public.lesson_video_sources
    ADD CONSTRAINT lesson_video_sources_provider_check
    CHECK (provider IN ('youtube_unlisted', 'private_stream', 'drm_widevine', 'drm_fairplay'));

ALTER TABLE public.lesson_video_sources
    ADD COLUMN IF NOT EXISTS stream_url TEXT;

COMMENT ON COLUMN public.lesson_video_sources.stream_url IS
    'Private HTTPS HLS (.m3u8) or MP4 origin URL (e.g., Bunny Stream / Cloudflare R2 / CloudFront). Returned only after backend subscription authorization.';
