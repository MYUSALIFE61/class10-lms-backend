import { PikPakLocalAdapter } from './pikpakLocalAdapter.js';

const BLOCKED_CLOUD_PROVIDERS = new Set([
  'cloudflare_r2',
  'aws_s3',
  's3',
  'supabase_storage',
  'firebase_storage',
]);

export function createVideoProvider({ config = {}, logger = console } = {}) {
  const mode = config.VIDEO_STORAGE_PROVIDER || 'none';

  if (BLOCKED_CLOUD_PROVIDERS.has(mode)) {
    throw new Error(
      `Cloud object storage provider "${mode}" is prohibited. Use persistent server disk and Android local private storage (context.noBackupFilesDir/offline_lessons/).`
    );
  }

  if (mode === 'pikpak_local') {
    if (config.NODE_ENV === 'production') {
      logger.warn(
        '[video-provider] WARNING: pikpak_local is for local testing ONLY. Use private persistent server disk assets (private_asset_stream) in production.'
      );
    }
    return new PikPakLocalAdapter({
      cliPath: config.PIKPAK_CLI_PATH || '',
      logger,
    });
  }

  return null;
}

export { PikPakLocalAdapter };
