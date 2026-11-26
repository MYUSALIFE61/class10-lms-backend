import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError, NotFoundError } from '../utils/errors.js';
import { sanitizeMediaFileName } from './ffmpegProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_PERSISTENT_OFFLINE_DIR = path.resolve(__dirname, '../../storage/offline_videos');
export const DEFAULT_OFFLINE_TEMP_DIR = path.resolve(__dirname, '../../tmp/offline_jobs');

/**
 * Parses a single HTTP Range header (`bytes=start-end`, `bytes=start-`, or `bytes=-suffix`).
 */
export function parseByteRange(rangeHeader, totalSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string') return null;
  const trimmed = rangeHeader.trim();
  const match = /^bytes=(\d*)-(\d*)$/i.exec(trimmed);
  if (!match) {
    return { invalid: true };
  }

  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') {
    return { invalid: true };
  }

  let start;
  let end;
  if (rawStart === '') {
    // Suffix range: bytes=-500
    const suffixLen = Number(rawEnd);
    if (!Number.isFinite(suffixLen) || suffixLen <= 0) return { unsatisfiable: true };
    start = Math.max(0, totalSize - suffixLen);
    end = totalSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? totalSize - 1 : Math.min(Number(rawEnd), totalSize - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= totalSize || end < start) {
    return { unsatisfiable: true };
  }
  return { start, end };
}

/**
 * Pluggable Zero-Buffer Streaming Storage Service for Authorized Offline MP4 Assets.
 *
 * Supports:
 * - persistent_disk: Persistent attached volume / VPS private directory (zero extra subscription)
 * - cloudflare_r2: Private Cloudflare R2 bucket via existing CloudflareR2Adapter ($0 egress)
 * - supabase_storage: Private Supabase Storage bucket via existing service-role client
 * - pikpak_local: Existing local personal testing adapter
 *
 * NEVER buffers full MP4 files into Node.js memory and NEVER exposes raw bucket credentials.
 */
export class OfflineStorageService {
  constructor({ config = {}, videoProvider = null, supabaseAdmin = null, logger = console } = {}) {
    this.config = config;
    this.videoProvider = videoProvider;
    this.supabaseAdmin = supabaseAdmin;
    this.logger = logger;
    this.provider = config.OFFLINE_VIDEO_STORAGE_PROVIDER || 'persistent_disk';
    this.persistentDir = config.OFFLINE_VIDEO_STORAGE_DIR
      ? path.resolve(config.OFFLINE_VIDEO_STORAGE_DIR)
      : DEFAULT_PERSISTENT_OFFLINE_DIR;
    this.supabaseBucket = config.SUPABASE_OFFLINE_BUCKET || 'lesson-offline-videos';
  }

  getStorageSummary() {
    return {
      provider: this.provider,
      supportsRangeResume: true,
      persistentDirConfigured: Boolean(this.config.OFFLINE_VIDEO_STORAGE_DIR),
      isCommercialSafe: this.provider !== 'pikpak_local',
    };
  }

  resolvePersistentDiskPath(storageKey) {
    if (
      !storageKey ||
      typeof storageKey !== 'string' ||
      storageKey.includes('..') ||
      path.isAbsolute(storageKey)
    ) {
      return null;
    }
    const normalized = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
    const fullPath = path.resolve(this.persistentDir, normalized);
    const rootWithSep = this.persistentDir.endsWith(path.sep)
      ? this.persistentDir
      : `${this.persistentDir}${path.sep}`;
    if (!fullPath.startsWith(rootWithSep)) {
      return null;
    }
    return fullPath;
  }

  /**
   * Moves a prepared MP4 file from temporary workspace into permanent private storage.
   */
  async commitPreparedFile({ lessonId, qualityLabel = '720p', originalFileName = 'lesson.mp4', sourceFilePath }) {
    const safeName = sanitizeMediaFileName(originalFileName, 'lesson.mp4');
    const uniqueKey = `${lessonId}/${qualityLabel}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}_${safeName}`;

    if (this.provider === 'supabase_storage' && this.supabaseAdmin?.storage) {
      const fileStream = fs.createReadStream(sourceFilePath);
      const { error } = await this.supabaseAdmin.storage
        .from(this.supabaseBucket)
        .upload(uniqueKey, fileStream, {
          contentType: 'video/mp4',
          duplex: 'half',
          upsert: true,
        });
      if (error) {
        throw new AppError(`Supabase offline video upload failed: ${error.message}`, 502, 'STORAGE_UPLOAD_FAILED');
      }
      return { storageProvider: 'supabase_storage', storageKey: uniqueKey };
    }

    // Default: persistent_disk (works locally & on VPS/mounted persistent disk with zero extra subscription)
    const targetPath = this.resolvePersistentDiskPath(uniqueKey);
    if (!targetPath) {
      throw new AppError('Invalid offline storage destination path', 500, 'STORAGE_PATH_INVALID');
    }
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    try {
      await fs.promises.rename(sourceFilePath, targetPath);
    } catch (err) {
      // Cross-device rename fallback (e.g. /tmp -> mounted persistent volume)
      if (err.code === 'EXDEV') {
        await fs.promises.copyFile(sourceFilePath, targetPath);
        await fs.promises.unlink(sourceFilePath).catch(() => {});
      } else {
        throw err;
      }
    }
    return { storageProvider: 'persistent_disk', storageKey: uniqueKey };
  }

  async deleteStoredAsset(asset) {
    if (!asset?.storage_key) return;
    if (asset.storage_provider === 'persistent_disk') {
      const fullPath = this.resolvePersistentDiskPath(asset.storage_key);
      if (fullPath && fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath).catch(() => {});
      }
    } else if (asset.storage_provider === 'supabase_storage' && this.supabaseAdmin?.storage) {
      await this.supabaseAdmin.storage.from(this.supabaseBucket).remove([asset.storage_key]).catch(() => {});
    }
  }

  /**
   * Streams an authorized offline MP4 asset directly to Express response with HTTP 200/206/416
   * byte-range support and zero full-file memory buffering.
   */
  async streamAssetToResponse({ asset, userId, deviceId, req, res }) {
    const provider = asset.storage_provider || 'persistent_disk';

    if (provider === 'persistent_disk') {
      return this._streamPersistentDiskFile({ asset, req, res });
    }

    if (provider === 'pikpak_local') {
      if (!this.videoProvider || typeof this.videoProvider.streamVideoToResponse !== 'function') {
        throw new AppError('PikPak local video provider is not enabled.', 503, 'VIDEO_PROVIDER_UNAVAILABLE');
      }
      return this.videoProvider.streamVideoToResponse({
        fileId: asset.storage_key,
        mimeType: asset.mime_type || 'video/mp4',
        req,
        res,
      });
    }

    if (provider === 'cloudflare_r2') {
      if (!this.videoProvider || typeof this.videoProvider.createSignedPlaybackUrl !== 'function') {
        throw new AppError('Cloudflare R2 storage adapter is not configured.', 503, 'VIDEO_PROVIDER_UNAVAILABLE');
      }
      const signedUrl = this.videoProvider.createSignedPlaybackUrl({
        objectKey: asset.storage_key,
        userId,
        deviceId,
      });
      return this._proxyHttpsRangeStream({ upstreamUrl: signedUrl, asset, req, res });
    }

    if (provider === 'supabase_storage') {
      if (!this.supabaseAdmin?.storage) {
        throw new AppError('Supabase storage client is not configured.', 503, 'VIDEO_PROVIDER_UNAVAILABLE');
      }
      const { data, error } = await this.supabaseAdmin.storage
        .from(this.supabaseBucket)
        .createSignedUrl(asset.storage_key, 900);
      if (error || !data?.signedUrl) {
        throw new AppError('Unable to create signed storage download stream.', 502, 'STORAGE_SIGN_FAILED');
      }
      return this._proxyHttpsRangeStream({ upstreamUrl: data.signedUrl, asset, req, res });
    }

    throw new AppError(`Unsupported offline storage provider: ${provider}`, 500, 'UNSUPPORTED_STORAGE_PROVIDER');
  }

  async _streamPersistentDiskFile({ asset, req, res }) {
    const fullPath = this.resolvePersistentDiskPath(asset.storage_key);
    if (!fullPath || !fs.existsSync(fullPath)) {
      throw new NotFoundError('Offline video asset file is missing from storage.', 'ASSET_FILE_MISSING');
    }

    const stat = await fs.promises.stat(fullPath);
    const totalSize = stat.size;
    const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
    const rangeHeader = req.headers.range;

    const baseHeaders = {
      'Content-Type': asset.mime_type || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Content-SHA256': asset.sha256_checksum,
    };

    if (rangeHeader) {
      const parsed = parseByteRange(rangeHeader, totalSize);
      if (parsed?.invalid) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_RANGE', message: 'Malformed HTTP Range header.' },
        });
      }
      if (parsed?.unsatisfiable) {
        res.writeHead(416, {
          ...baseHeaders,
          'Content-Range': `bytes */${totalSize}`,
        });
        return res.end();
      }

      const { start, end } = parsed;
      const chunkLength = end - start + 1;
      res.writeHead(206, {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Content-Length': String(chunkLength),
      });
      if (method === 'HEAD') return res.end();

      const stream = fs.createReadStream(fullPath, { start, end, highWaterMark: 64 * 1024 });
      req.on('close', () => {
        if (!res.writableEnded) stream.destroy();
      });
      stream.on('error', () => {
        if (!res.writableEnded) res.destroy();
      });
      stream.pipe(res);
      return;
    }

    res.writeHead(200, {
      ...baseHeaders,
      'Content-Length': String(totalSize),
    });
    if (method === 'HEAD') return res.end();

    const stream = fs.createReadStream(fullPath, { highWaterMark: 64 * 1024 });
    req.on('close', () => {
      if (!res.writableEnded) stream.destroy();
    });
    stream.on('error', () => {
      if (!res.writableEnded) res.destroy();
    });
    stream.pipe(res);
  }

  _proxyHttpsRangeStream({ upstreamUrl, asset, req, res }) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(upstreamUrl);
      } catch {
        return reject(new AppError('Invalid upstream object storage URL.', 502, 'UPSTREAM_INVALID'));
      }
      if (parsed.protocol !== 'https:') {
        return reject(new AppError('Upstream object storage must use HTTPS.', 502, 'UPSTREAM_INSECURE'));
      }

      const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
      const headers = { 'User-Agent': 'Class10LMS-OfflineStream/1.0' };
      if (req.headers.range) headers.Range = req.headers.range;

      const upstreamReq = https.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: `${parsed.pathname}${parsed.search}`,
          method,
          headers,
          timeout: 30_000,
        },
        (upstreamRes) => {
          const status = upstreamRes.statusCode || 502;
          if (![200, 206, 416].includes(status)) {
            upstreamRes.resume();
            return reject(
              new AppError(`Upstream storage returned HTTP ${status}.`, 502, 'UPSTREAM_STREAM_ERROR')
            );
          }

          const outHeaders = {
            'Content-Type': asset.mime_type || 'video/mp4',
            'Accept-Ranges': upstreamRes.headers['accept-ranges'] || 'bytes',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'X-Content-SHA256': asset.sha256_checksum,
          };
          if (upstreamRes.headers['content-range']) outHeaders['Content-Range'] = upstreamRes.headers['content-range'];
          if (upstreamRes.headers['content-length']) outHeaders['Content-Length'] = upstreamRes.headers['content-length'];

          res.writeHead(status, outHeaders);
          if (method === 'HEAD' || status === 416) {
            upstreamRes.resume();
            res.end();
            return resolve();
          }

          req.on('close', () => {
            if (!res.writableEnded) {
              upstreamRes.destroy();
              upstreamReq.destroy();
            }
          });
          upstreamRes.on('error', (err) => {
            if (!res.writableEnded) res.destroy();
            reject(err);
          });
          upstreamRes.on('end', resolve);
          upstreamRes.pipe(res);
        }
      );

      upstreamReq.on('timeout', () => {
        upstreamReq.destroy(new Error('Upstream storage stream timed out'));
      });
      upstreamReq.on('error', reject);
      upstreamReq.end();
    });
  }
}

