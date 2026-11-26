import { PikPakLocalAdapter } from './pikpakLocalAdapter.js';
import { CloudflareR2Adapter } from './cloudflareR2Adapter.js';

export function createVideoProvider({ config = {}, logger = console } = {}) {
  const mode = config.VIDEO_STORAGE_PROVIDER || 'none';

  if (mode === 'pikpak_local') {
    if (config.NODE_ENV === 'production') {
      logger.warn(
        '[video-provider] WARNING: pikpak_local is for personal local testing ONLY. Switch VIDEO_STORAGE_PROVIDER=cloudflare_r2 for commercial production!'
      );
    }
    return new PikPakLocalAdapter({
      cliPath: config.PIKPAK_CLI_PATH || '',
      logger,
    });
  }

  if (mode === 'cloudflare_r2') {
    return new CloudflareR2Adapter({
      customDomain: config.R2_CUSTOM_DOMAIN || '',
      signingSecret: config.R2_SIGNING_SECRET || '',
      defaultTtlSeconds: config.STREAM_TOKEN_TTL_SECONDS || 900,
    });
  }

  return null;
}

export { PikPakLocalAdapter, CloudflareR2Adapter };
