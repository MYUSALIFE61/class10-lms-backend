-- Phase 5/6 Additive Migration: Support Swappable Own-Player Video Providers
-- Supports local personal testing (pikpak_local) and commercial production (cloudflare_r2)
-- without changing the Student Dashboard or Android Media3 ExoPlayer.

ALTER TABLE public.lesson_video_sources
  ADD COLUMN IF NOT EXISTS provider_file_id TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT DEFAULT 'video/mp4';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lesson_video_sources_provider_check'
  ) THEN
    ALTER TABLE public.lesson_video_sources
      DROP CONSTRAINT lesson_video_sources_provider_check;
  END IF;
END $$;

ALTER TABLE public.lesson_video_sources
  ADD CONSTRAINT lesson_video_sources_provider_check
  CHECK (provider IN ('youtube_unlisted', 'private_stream', 'pikpak_local', 'cloudflare_r2', 'mux', 'cloudflare_stream', 'drm_hls'));
