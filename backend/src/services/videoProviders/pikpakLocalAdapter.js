/**
 * LOCAL PERSONAL TESTING ADAPTER ONLY — PikPak CLI Video Provider
 *
 * WARNING: PikPak's User Agreement (Clause 2.3 & 8.1) prohibits commercial LMS use,
 * caps accounts at 3 simultaneous devices, and throttles Connected Apps (CLI) after
 * 5 GB/day (Free) or 1 TB/month (Premium).
 *
 * For commercial launch, switch VIDEO_STORAGE_PROVIDER=cloudflare_r2 in `.env`
 * to use CloudflareR2Adapter without changing the Student Dashboard or Android Media3 player.
 */
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ALLOWED_UPSTREAM_DOMAINS = new Set(['mypikpak.com']);
const PROACTIVE_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const MAX_REDIRECTS = 3;

const VIDEO_EXT_MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

export function validatePikPakUpstreamUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Upstream URL is malformed');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Blocked non-HTTPS upstream protocol: ${parsed.protocol}`);
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const allowed = [...ALLOWED_UPSTREAM_DOMAINS].some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
  if (!allowed) {
    throw new Error(`Blocked unauthorized upstream hostname: ${host}`);
  }
  return parsed;
}

function extractExpiryMs(parsedUrl) {
  for (const [, val] of parsedUrl.searchParams.entries()) {
    if (/^\d{10}$/.test(val)) {
      const ts = Number(val) * 1000;
      if (ts > Date.now() - 86400_000 && ts < Date.now() + 365 * 86400_000) {
        return ts;
      }
    }
  }
  return Date.now() + 60 * 60 * 1000;
}

function fingerprintUrl(rawUrl) {
  return crypto.createHash('sha256').update(rawUrl).digest('hex').slice(0, 12);
}

function inferVideoMime(fileName, rawMime = '') {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (VIDEO_EXT_MIME[ext]) return VIDEO_EXT_MIME[ext];
  if (rawMime && rawMime.startsWith('video/')) return rawMime;
  return 'video/mp4';
}

function isVideoEntry(entry) {
  if (!entry || entry.kind === 'folder' || entry.kind === 'drive#folder') return false;
  const name = String(entry.name || '');
  const ext = path.extname(name).toLowerCase();
  if (VIDEO_EXT_MIME[ext]) return true;
  if (typeof entry.mime_type === 'string' && entry.mime_type.startsWith('video/')) return true;
  return false;
}

function formatTitleFromFileName(fileName) {
  const base = String(fileName || 'Untitled Lesson').replace(/\.[^.]+$/, '');
  return base.replace(/[_]+/g, ' ').trim() || 'Untitled Lesson';
}

function resolveDefaultCliBinary(configuredPath = '') {
  const candidates = [
    configuredPath,
    path.resolve(process.cwd(), '..', '.tools', 'pikpak.exe'),
    path.resolve(process.cwd(), '.tools', 'pikpak.exe'),
    'd:\\Downloads\\Android apk file\\.tools\\pikpak.exe',
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.pikpak', 'pikpak.exe') : '',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return 'pikpak';
}

export class PikPakLocalAdapter {
  constructor({ cliPath = '', execFileFn = execFileAsync, logger = console } = {}) {
    this.name = 'pikpak_local';
    this.isCommercialSafe = false;
    this.cliPath = resolveDefaultCliBinary(cliPath);
    this.execFileFn = execFileFn;
    this.logger = logger;
    this.urlCache = new Map(); // fileId -> { url, parsed, expiresAtMs, fingerprint }
    this.inflight = new Map(); // fileId -> Promise
  }

  async _runCli(args, timeout = 25_000) {
    const { stdout } = await this.execFileFn(this.cliPath, args, {
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      timeout,
    });
    return stdout;
  }

  async _listFolder(folderId = null) {
    const args = folderId ? ['ls', folderId, '-F', 'json'] : ['ls', '-F', 'json'];
    const stdout = await this._runCli(args);
    const parsed = JSON.parse(stdout || '{}');
    if (Array.isArray(parsed)) return parsed;
    return parsed.files || parsed.items || parsed.data || [];
  }

  /**
   * Lists all video files across PikPak root and nested syllabus folders (up to maxDepth = 4,
   * supporting Class_10/01_Mathematics/Ch01_Real_Numbers/01_Introduction.mp4).
   * Never returns tokens or signed URLs.
   */
  async listVideos({ maxDepth = 4 } = {}) {
    const videos = [];
    const seenIds = new Set();

    const walk = async (folderId, folderSegments, depth) => {
      const entries = await this._listFolder(folderId);
      for (const entry of entries) {
        if (!entry || !entry.id || seenIds.has(entry.id)) continue;
        seenIds.add(entry.id);

        const isFolder = entry.kind === 'folder' || entry.kind === 'drive#folder';
        if (isFolder && depth < maxDepth) {
          await walk(entry.id, [...folderSegments, entry.name || 'Folder'], depth + 1);
          continue;
        }

        if (isVideoEntry(entry)) {
          const fileName = entry.name || `video-${entry.id}.mp4`;
          const folderName = folderSegments.length ? folderSegments[folderSegments.length - 1] : 'PikPak Root';
          videos.push({
            provider: this.name,
            providerFileId: entry.id,
            fileName,
            title: formatTitleFromFileName(fileName),
            folderName,
            folderSegments,
            sizeLabel: typeof entry.size === 'string' ? entry.size : '',
            sizeBytes: typeof entry.size === 'number' ? entry.size : null,
            mimeType: inferVideoMime(fileName, entry.mime_type),
            modifiedAt: entry.modified || entry.modified_time || null,
          });
        }
      }
    };

    await walk(null, [], 0);

    // Prioritize MP4 lessons first (best cross-browser + Media3 compatibility), then newest
    videos.sort((a, b) => {
      const aMp4 = a.mimeType === 'video/mp4' ? 0 : 1;
      const bMp4 = b.mimeType === 'video/mp4' ? 0 : 1;
      if (aMp4 !== bMp4) return aMp4 - bMp4;
      return String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || ''));
    });

    return videos;
  }

  async resolveStreamUrl(fileId, { forceRefresh = false } = {}) {
    const now = Date.now();
    const cached = this.urlCache.get(fileId);
    if (!forceRefresh && cached && cached.expiresAtMs - PROACTIVE_REFRESH_MARGIN_MS > now) {
      return cached;
    }

    if (!this.inflight.has(fileId)) {
      const promise = (async () => {
        const stdout = await this._runCli(['play', fileId, '--url-only'], 20_000);
        const urlLine = stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => /^https:\/\//i.test(l));

        if (!urlLine) {
          throw new Error('PikPak CLI did not return a direct HTTPS playback URL');
        }
        const parsed = validatePikPakUpstreamUrl(urlLine);
        const entry = {
          url: urlLine,
          parsed,
          expiresAtMs: extractExpiryMs(parsed),
          fingerprint: fingerprintUrl(urlLine),
        };
        this.urlCache.set(fileId, entry);
        return entry;
      })().finally(() => {
        this.inflight.delete(fileId);
      });
      this.inflight.set(fileId, promise);
    }

    return this.inflight.get(fileId);
  }

  invalidateUrl(fileId) {
    this.urlCache.delete(fileId);
  }

  _requestUpstream(urlString, method, rangeHeader, redirectCount = 0) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = validatePikPakUpstreamUrl(urlString);
      } catch (err) {
        return reject(err);
      }

      const headers = { 'User-Agent': 'Class10LMS-LocalAdapter/1.0' };
      if (rangeHeader) headers.Range = rangeHeader;

      const req = https.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: `${parsed.pathname}${parsed.search}`,
          method,
          headers,
          timeout: 25_000,
        },
        (res) => {
          const status = res.statusCode || 502;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            res.resume();
            if (redirectCount >= MAX_REDIRECTS) {
              return reject(new Error('Too many upstream redirects'));
            }
            const nextUrl = new URL(res.headers.location, parsed).toString();
            return this._requestUpstream(nextUrl, method, rangeHeader, redirectCount + 1)
              .then(resolve)
              .catch(reject);
          }
          resolve({ upstreamReq: req, upstreamRes: res });
        }
      );

      req.on('timeout', () => req.destroy(new Error('Upstream CDN request timed out')));
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Zero-buffer HTTP 200/206/416 streaming from PikPak CDN directly to Express response.
   * Never exposes the signed PikPak URL or credentials to the client.
   */
  async streamVideoToResponse({ fileId, mimeType = 'video/mp4', req, res }) {
    const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
    const rawRange = req.headers.range;

    if (rawRange && !/^bytes=\d*-\d*$/i.test(rawRange.trim())) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_RANGE', message: 'Invalid Range header' } });
    }

    let entry = await this.resolveStreamUrl(fileId);
    let upstream = await this._requestUpstream(entry.url, method, rawRange);

    if ([401, 403, 410].includes(upstream.upstreamRes.statusCode)) {
      this.logger.warn(
        `[pikpak-adapter] Upstream ${upstream.upstreamRes.statusCode} on url#${entry.fingerprint}; refreshing via CLI`
      );
      upstream.upstreamRes.resume();
      upstream.upstreamReq.destroy();
      this.invalidateUrl(fileId);
      entry = await this.resolveStreamUrl(fileId, { forceRefresh: true });
      upstream = await this._requestUpstream(entry.url, method, rawRange);
    }

    const { upstreamReq, upstreamRes } = upstream;
    const status = upstreamRes.statusCode || 502;

    if (![200, 206, 416].includes(status)) {
      upstreamRes.resume();
      upstreamReq.destroy();
      return res.status(502).json({
        success: false,
        error: { code: 'UPSTREAM_STREAM_ERROR', message: `Video source returned HTTP ${status}` },
      });
    }

    const outHeaders = {
      'Content-Type': mimeType || 'video/mp4',
      'Accept-Ranges': upstreamRes.headers['accept-ranges'] || 'bytes',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (upstreamRes.headers['content-range']) outHeaders['Content-Range'] = upstreamRes.headers['content-range'];
    if (upstreamRes.headers['content-length']) outHeaders['Content-Length'] = upstreamRes.headers['content-length'];
    if (upstreamRes.headers.etag) outHeaders.ETag = upstreamRes.headers.etag;

    res.writeHead(status, outHeaders);

    if (method === 'HEAD' || status === 416) {
      upstreamRes.resume();
      upstreamReq.destroy();
      res.end();
      return;
    }

    let cleaned = false;
    const cleanup = (abortUpstream) => {
      if (cleaned) return;
      cleaned = true;
      if (abortUpstream) {
        upstreamRes.destroy();
        upstreamReq.destroy();
      }
    };

    res.on('close', () => cleanup(!res.writableEnded));
    upstreamRes.on('error', () => {
      cleanup(true);
      if (!res.writableEnded) res.destroy();
    });
    upstreamRes.on('end', () => cleanup(false));
    upstreamRes.pipe(res);
  }
}
