import crypto from 'node:crypto';
import fs from 'node:fs';
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
 * Zero-Buffer Streaming Storage Service for Authorized Server Video Assets.
 *
 * Strictly enforces Local Server Persistent Disk + Android Private Vault Architecture:
 * - persistent_disk: Private persistent attached volume / VPS directory controlled by our backend
 * - pikpak_local: Optional local development testing adapter ONLY
 *
 * Third-party cloud object storage (Cloudflare R2, AWS S3, Supabase Storage, Firebase Storage)
 * is intentionally prohibited and disabled by architecture policy.
 *
 * NEVER buffers full MP4 files into Node.js memory and NEVER exposes raw filesystem paths.
 */
export class OfflineStorageService {
  constructor({ config = {}, videoProvider = null, logger = console } = {}) {
    this.config = config;
    this.videoProvider = videoProvider;
    this.logger = logger;
    this.provider = config.OFFLINE_VIDEO_STORAGE_PROVIDER || 'persistent_disk';
    if (!['persistent_disk', 'pikpak_local'].includes(this.provider)) {
      throw new AppError(
        `Third-party cloud object storage "${this.provider}" is prohibited by local-only storage policy.`,
        500,
        'CLOUD_STORAGE_DISABLED'
      );
    }
    this.persistentDir = config.OFFLINE_VIDEO_STORAGE_DIR
      ? path.resolve(config.OFFLINE_VIDEO_STORAGE_DIR)
      : DEFAULT_PERSISTENT_OFFLINE_DIR;
  }

  getStorageSummary() {
    return {
      provider: this.provider,
      supportsRangeResume: true,
      persistentDirConfigured: Boolean(this.config.OFFLINE_VIDEO_STORAGE_DIR),
      isCommercialSafe: this.provider !== 'pikpak_local',
      cloudObjectStorageDisabled: true,
      androidOfflineDirectory: 'context.noBackupFilesDir/offline_lessons/',
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
   * Moves a prepared MP4 file from temporary workspace into private persistent server disk.
   */
  async commitPreparedFile({ lessonId, qualityLabel = '720p', originalFileName = 'lesson.mp4', sourceFilePath }) {
    const safeName = sanitizeMediaFileName(originalFileName, 'lesson.mp4');
    const uniqueKey = `${lessonId}/${qualityLabel}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}_${safeName}`;

    // Strictly local server disk (zero third-party cloud object storage)
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
        await fs.promises.unlink(sourceFilePath).catch(() => { });
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
        await fs.promises.unlink(fullPath).catch(() => { });
      }
    }
  }

  /**
   * Streams an authorized server MP4 asset directly to Express response with HTTP 200/206/416
   * byte-range support and zero full-file memory buffering.
   */
  async streamAssetToResponse({ asset, req, res }) {
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

    if (['cloudflare_r2', 'supabase_storage', 'aws_s3', 's3', 'firebase_storage'].includes(provider)) {
      throw new AppError(
        `Third-party cloud object storage (${provider}) is disabled. Store and stream lesson MP4s via private server persistent disk + Android local private storage.`,
        410,
        'CLOUD_STORAGE_DISABLED'
      );
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
}

