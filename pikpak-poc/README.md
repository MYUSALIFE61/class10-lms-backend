# Safe PikPak One-Video Proof of Concept (`pikpak-poc/`)

Isolated personal one-video technical experiment to test whether the official PikPak CLI (`pikpak v0.6.0`) returns a playback URL playable by Android Media3 ExoPlayer, without modifying production LMS files or sharing credentials.

## Isolation Guarantee
- All PoC backend, Android test app, and report files live strictly under `pikpak-poc/`.
- Production LMS files (`backend/`, `frontend/`, `supabase/`) are **not modified**.
- No PikPak passwords, tokens, cookies, or full playback URLs are stored in code, logs, or reports.
