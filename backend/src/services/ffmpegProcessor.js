import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppError } from '../utils/errors.js';

const execFileAsync = promisify(execFile);

/**
 * Ported safe filename sanitizer concept (inspired by frenzine downly safe_title),
 * hardened for cross-platform storage keys.
 */
export function sanitizeMediaFileName(rawName, fallback = 'lesson-video.mp4') {
  const cleaned = String(rawName || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 120)
    .trim();

  if (!cleaned) return fallback;
  return cleaned.toLowerCase().endsWith('.mp4') ? cleaned : `${cleaned}.mp4`;
}

/**
 * Validates that a file starts with a valid ISO Base Media / MP4 `ftyp` box
 * (bytes 4..7 === 'ftyp') without loading the full file into memory.
 */
export async function validateMp4FileHeader(filePath) {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await fh.read(header, 0, 16, 0);
    if (bytesRead < 12) return false;
    const boxType = header.subarray(4, 8).toString('ascii');
    return boxType === 'ftyp';
  } finally {
    await fh.close();
  }
}

/**
 * Streams a file in 64 KB chunks to compute SHA-256 checksum & exact byte length.
 * Never buffers large MP4 files into Node.js memory.
 */
export function computeFileSha256AndSize(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let fileSizeBytes = 0;
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    stream.on('data', (chunk) => {
      fileSizeBytes += chunk.length;
      hash.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      resolve({
        sha256Checksum: hash.digest('hex'),
        fileSizeBytes,
      });
    });
  });
}

/**
 * Isolated per-job FFmpeg processor & temp-directory cleaner for organization-owned MP4 assets.
 * NEVER uses yt-dlp and NEVER extracts third-party/YouTube streams.
 */
export class FfmpegProcessor {
  constructor({
    tempDir,
    ffmpegPath = '',
    ffprobePath = '',
    tempMaxAgeMs = 30 * 60 * 1000,
    logger = console,
  }) {
    this.tempDir = tempDir;
    this.ffmpegBin = ffmpegPath || 'ffmpeg';
    this.ffprobeBin = ffprobePath || 'ffprobe';
    this.tempMaxAgeMs = tempMaxAgeMs;
    this.logger = logger;
    this._ffmpegAvailable = null;
    this._ffprobeAvailable = null;
    this._cleanupTimer = null;
  }

  ensureTempDir() {
    fs.mkdirSync(this.tempDir, { recursive: true });
  }

  createJobDir() {
    this.ensureTempDir();
    const jobDir = path.join(this.tempDir, `job_${crypto.randomUUID()}`);
    fs.mkdirSync(jobDir, { recursive: true });
    return jobDir;
  }

  async cleanupJobDir(jobDir) {
    if (!jobDir) return;
    try {
      await fs.promises.rm(jobDir, { recursive: true, force: true });
    } catch {
      // Ignore transient cleanup failure; sweep will retry
    }
  }

  /**
   * Ported from reference project's cleanup_old_files(): removes stale FFmpeg temp
   * job directories older than 30 minutes. NEVER touches permanent storage.
   */
  async sweepStaleTempJobs(nowMs = Date.now()) {
    if (!fs.existsSync(this.tempDir)) return 0;
    let removed = 0;
    try {
      const entries = await fs.promises.readdir(this.tempDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(this.tempDir, entry.name);
        try {
          const stat = await fs.promises.stat(fullPath);
          if (nowMs - stat.mtimeMs > this.tempMaxAgeMs) {
            await fs.promises.rm(fullPath, { recursive: true, force: true });
            removed += 1;
          }
        } catch {
          // Ignore individual stat/unlink races
        }
      }
    } catch {
      // Non-fatal
    }
    return removed;
  }

  startCleanupSchedule(intervalMs = 10 * 60 * 1000) {
    if (this._cleanupTimer) return;
    this._cleanupTimer = setInterval(() => {
      this.sweepStaleTempJobs().catch(() => { });
    }, intervalMs);
    if (typeof this._cleanupTimer.unref === 'function') {
      this._cleanupTimer.unref();
    }
  }

  stopCleanupSchedule() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  async isFfmpegAvailable() {
    if (this._ffmpegAvailable !== null) return this._ffmpegAvailable;
    try {
      await execFileAsync(this.ffmpegBin, ['-version'], { timeout: 5000, windowsHide: true });
      this._ffmpegAvailable = true;
    } catch {
      this._ffmpegAvailable = false;
    }
    return this._ffmpegAvailable;
  }

  async isFfprobeAvailable() {
    if (this._ffprobeAvailable !== null) return this._ffprobeAvailable;
    try {
      await execFileAsync(this.ffprobeBin, ['-version'], { timeout: 5000, windowsHide: true });
      this._ffprobeAvailable = true;
    } catch {
      this._ffprobeAvailable = false;
    }
    return this._ffprobeAvailable;
  }

  async probeVideo(filePath) {
    if (!(await this.isFfprobeAvailable())) {
      return { probed: false, durationSeconds: 0, width: 0, height: 0, qualityLabel: null };
    }
    try {
      const { stdout } = await execFileAsync(
        this.ffprobeBin,
        [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_format',
          '-show_streams',
          filePath,
        ],
        { timeout: 20_000, windowsHide: true }
      );
      const parsed = JSON.parse(stdout || '{}');
      const videoStream = (parsed.streams || []).find((s) => s.codec_type === 'video') || {};
      const durationSeconds = Math.max(0, Math.round(Number(parsed.format?.duration || videoStream.duration || 0)));
      const height = Number(videoStream.height || 0);
      const width = Number(videoStream.width || 0);
      const qualityLabel = height > 0 ? `${height}p` : null;
      return { probed: true, durationSeconds, width, height, qualityLabel };
    } catch {
      return { probed: false, durationSeconds: 0, width: 0, height: 0, qualityLabel: null };
    }
  }

  /**
   * Optimizes an authorized organization-owned MP4 for Android Media3 offline playback:
   * - Moves moov atom to front (+faststart) for instant seeking
   * - Optionally transcodes to a target resolution variant (e.g. 480p or 720p H.264/AAC)
   * - Gracefully falls back to verified MP4 pass-through if ffmpeg binary is not installed
   */
  async prepareOfflineMp4({ inputPath, outputPath, targetHeight = null }) {
    const validMp4 = await validateMp4FileHeader(inputPath);
    if (!validMp4) {
      throw new AppError(
        'Uploaded file is not a valid MP4 video container (missing ISO ftyp header).',
        400,
        'INVALID_MP4_FILE'
      );
    }

    const probe = await this.probeVideo(inputPath);
    const hasFfmpeg = await this.isFfmpegAvailable();

    if (hasFfmpeg) {
      const args = ['-y', '-i', inputPath];
      if (targetHeight && Number(targetHeight) >= 240 && Number(targetHeight) <= 1080) {
        args.push(
          '-vf',
          `scale=-2:${Math.floor(Number(targetHeight))}`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '24',
          '-c:a',
          'aac',
          '-b:a',
          '128k'
        );
      } else {
        args.push('-c', 'copy');
      }
      args.push('-movflags', '+faststart', outputPath);

      try {
        await execFileAsync(this.ffmpegBin, args, {
          timeout: 10 * 60 * 1000,
          windowsHide: true,
        });
        const finalProbe = await this.probeVideo(outputPath);
        const { sha256Checksum, fileSizeBytes } = await computeFileSha256AndSize(outputPath);
        return {
          transcodedWithFfmpeg: true,
          sha256Checksum,
          fileSizeBytes,
          durationSeconds: finalProbe.durationSeconds || probe.durationSeconds || 0,
          qualityLabel:
            targetHeight
              ? `${Math.floor(Number(targetHeight))}p`
              : finalProbe.qualityLabel || probe.qualityLabel || '720p',
        };
      } catch (err) {
        this.logger.warn(
          `[ffmpeg-processor] FFmpeg faststart/transcode failed (${err.message}); falling back to verified source MP4.`
        );
      }
    }

    // Fallback when ffmpeg is absent or copy failed: stream-copy verified MP4 directly
    await fs.promises.copyFile(inputPath, outputPath);
    const { sha256Checksum, fileSizeBytes } = await computeFileSha256AndSize(outputPath);
    return {
      transcodedWithFfmpeg: false,
      sha256Checksum,
      fileSizeBytes,
      durationSeconds: probe.durationSeconds || 0,
      qualityLabel: targetHeight ? `${Math.floor(Number(targetHeight))}p` : probe.qualityLabel || '720p',
    };
  }
}

