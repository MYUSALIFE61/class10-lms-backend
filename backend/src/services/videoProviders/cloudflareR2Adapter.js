/**
 * COMMERCIAL PRODUCTION ADAPTER — Cloudflare R2 + Signed Edge Delivery
 *
 * Swappable drop-in replacement for PikPakLocalAdapter:
 * Set VIDEO_STORAGE_PROVIDER=cloudflare_r2 + R2_CUSTOM_DOMAIN + R2_SIGNING_SECRET in `.env`.
 * Video bytes flow directly from Cloudflare edge PoPs to Android Media3 ExoPlayer (zero Node.js proxying, $0 egress).
 */
import crypto from 'node:crypto';

export class CloudflareR2Adapter {
  constructor({ customDomain = '', signingSecret = '', defaultTtlSeconds = 900 } = {}) {
    this.name = 'cloudflare_r2';
    this.isCommercialSafe = true;
    this.customDomain = customDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    this.signingSecret = signingSecret;
    this.defaultTtlSeconds = defaultTtlSeconds;
  }

  /**
   * Generates a short-lived HMAC-SHA256 signed playback URL verified by a Cloudflare Worker
   * sitting in front of a private R2 bucket.
   */
  createSignedPlaybackUrl({ objectKey, userId, deviceId, ttlSeconds = this.defaultTtlSeconds }) {
    if (!this.customDomain || !this.signingSecret) {
      throw new Error('Cloudflare R2 adapter requires R2_CUSTOM_DOMAIN and R2_SIGNING_SECRET');
    }
    const cleanKey = String(objectKey || '').replace(/^\/+/, '');
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `${cleanKey}|${userId}|${deviceId || ''}|${exp}`;
    const sig = crypto
      .createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('base64url');

    const url = new URL(`https://${this.customDomain}/${cleanKey}`);
    url.searchParams.set('exp', String(exp));
    url.searchParams.set('uid', userId);
    if (deviceId) url.searchParams.set('dev', deviceId);
    url.searchParams.set('sig', sig);
    return url.toString();
  }

  async listVideos() {
    // When using Cloudflare R2 in production, videos are mapped via S3 ListObjectsV2 or Admin upload API
    return [];
  }
}
