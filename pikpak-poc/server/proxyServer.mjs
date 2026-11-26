/**
 * PikPak One-Video PoC — Localhost-Only Streaming Proxy (Phase 3)
 *
 * Strict guarantees:
 * - Binds exclusively to 127.0.0.1 (never exposed publicly)
 * - Allows ONLY the single verified test file ID (VP75WkqprAY1HT95P3QYcv8Ro2)
 * - Restricts upstream requests strictly to verified *.mypikpak.com HTTPS hosts (SSRF protection)
 * - Streams directly from upstream to client (no full-file RAM buffering, no disk downloads)
 * - Cancels upstream sockets immediately on client disconnect/seek abort
 * - Never exposes PikPak credentials, tokens, or signed URLs to clients or logs
 */
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const ALLOWED_TEST_FILE = Object.freeze({
  fileId: 'VP75WkqprAY1HT95P3QYcv8Ro2',
  fileName: 'VID-20261108-WA0000.mp4',
  mimeType: 'video/mp4',
});

const ALLOWED_UPSTREAM_DOMAINS = new Set(['mypikpak.com']);
const PROACTIVE_REFRESH_MARGIN_MS = 5 * 60 * 1000; // Refresh 5 min before expiry
const MAX_REDIRECTS = 3;

const CLI_CANDIDATES = [
  'd:\\Downloads\\Android apk file\\.tools\\pikpak.exe',
  `${process.env.USERPROFILE || ''}\\.pikpak\\pikpak.exe`,
];

export function resolveCliBinary() {
  for (const p of CLI_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  return 'pikpak';
}

/**
 * SSRF Guard: validates HTTPS scheme and strict PikPak CDN hostname boundary.
 * Never logs raw URL or query parameters.
 */
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
  const isAllowed = [...ALLOWED_UPSTREAM_DOMAINS].some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
  if (!isAllowed) {
    throw new Error(`Blocked unauthorized upstream hostname: ${host}`);
  }
  return parsed;
}

export function extractExpiryMs(parsedUrl) {
  for (const [, val] of parsedUrl.searchParams.entries()) {
    if (/^\d{10}$/.test(val)) {
      const ts = Number(val) * 1000;
      if (ts > Date.now() - 86400_000 && ts < Date.now() + 365 * 86400_000) {
        return ts;
      }
    }
  }
  return Date.now() + 60 * 60 * 1000; // Fallback 60m cache window if no expire param
}

export function fingerprintUrl(rawUrl) {
  return crypto.createHash('sha256').update(rawUrl).digest('hex').slice(0, 12);
}

export class PikPakCliUrlResolver {
  constructor({ cliPath = resolveCliBinary(), fileId = ALLOWED_TEST_FILE.fileId } = {}) {
    this.cliPath = cliPath;
    this.fileId = fileId;
    this.cached = null; // { url, parsed, expiresAtMs, fingerprint }
    this.inflight = null;
  }

  async fetchFreshUrlFromCli() {
    const { stdout } = await execFileAsync(
      this.cliPath,
      ['play', this.fileId, '--url-only'],
      { maxBuffer: 2 * 1024 * 1024, windowsHide: true, timeout: 20_000 }
    );
    const urlLine = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /^https:\/\//i.test(l));

    if (!urlLine) {
      throw new Error('PikPak CLI did not return an HTTPS playback URL');
    }

    const parsed = validatePikPakUpstreamUrl(urlLine);
    const entry = {
      url: urlLine,
      parsed,
      expiresAtMs: extractExpiryMs(parsed),
      fingerprint: fingerprintUrl(urlLine),
      fetchedAtMs: Date.now(),
    };
    this.cached = entry;
    return entry;
  }

  async getValidUrl({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cached &&
      this.cached.expiresAtMs - PROACTIVE_REFRESH_MARGIN_MS > now
    ) {
      return this.cached;
    }

    if (!this.inflight) {
      this.inflight = this.fetchFreshUrlFromCli().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  invalidate() {
    this.cached = null;
  }

  clear() {
    this.cached = null;
    this.inflight = null;
  }
}

export function createPikPakProxyServer({
  resolver = new PikPakCliUrlResolver(),
  logger = console,
} = {}) {
  const stats = {
    activeUpstreamStreams: 0,
    totalStreamRequests: 0,
    clientDisconnects: 0,
    expiredUrlRecoveries: 0,
    upstreamErrors: 0,
  };

  function requestUpstream(urlString, method, rangeHeader, redirectCount = 0) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = validatePikPakUpstreamUrl(urlString);
      } catch (err) {
        return reject(err);
      }

      const headers = {
        'User-Agent': 'Class10LMS-PikPakPoC/1.0',
      };
      if (rangeHeader) {
        headers.Range = rangeHeader;
      }

      const req = https.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: `${parsed.pathname}${parsed.search}`,
          method,
          headers,
          timeout: 20_000,
        },
        (res) => {
          const status = res.statusCode || 502;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            res.resume();
            if (redirectCount >= MAX_REDIRECTS) {
              return reject(new Error('Too many upstream redirects'));
            }
            const nextUrl = new URL(res.headers.location, parsed).toString();
            return requestUpstream(nextUrl, method, rangeHeader, redirectCount + 1)
              .then(resolve)
              .catch(reject);
          }
          resolve({ upstreamReq: req, upstreamRes: res });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('Upstream CDN request timed out'));
      });
      req.on('error', reject);
      req.end();
    });
  }

  function sendJson(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  async function handleStream(req, res) {
    stats.totalStreamRequests += 1;
    const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
    const rawRange = req.headers.range;

    if (rawRange && !/^bytes=\d*-\d*$/i.test(rawRange.trim())) {
      return sendJson(res, 400, { error: 'Invalid Range header format' });
    }

    let entry;
    try {
      entry = await resolver.getValidUrl();
    } catch (err) {
      stats.upstreamErrors += 1;
      logger.error('[pikpak-proxy] Failed resolving playback URL:', err.message);
      return sendJson(res, 502, { error: 'Unable to resolve playback stream via local PikPak CLI' });
    }

    let upstream;
    try {
      upstream = await requestUpstream(entry.url, method, rawRange);
    } catch (err) {
      stats.upstreamErrors += 1;
      logger.error('[pikpak-proxy] Upstream connection failed:', err.message);
      return sendJson(res, 502, { error: 'Upstream stream connection failed' });
    }

    // Automatic expired-URL recovery on 401/403/410 from PikPak CDN
    if ([401, 403, 410].includes(upstream.upstreamRes.statusCode)) {
      logger.warn(
        `[pikpak-proxy] Upstream status ${upstream.upstreamRes.statusCode} for url#${entry.fingerprint}; refreshing via CLI...`
      );
      upstream.upstreamRes.resume();
      upstream.upstreamReq.destroy();
      resolver.invalidate();
      try {
        entry = await resolver.getValidUrl({ forceRefresh: true });
        upstream = await requestUpstream(entry.url, method, rawRange);
        stats.expiredUrlRecoveries += 1;
      } catch (retryErr) {
        stats.upstreamErrors += 1;
        logger.error('[pikpak-proxy] URL refresh recovery failed:', retryErr.message);
        return sendJson(res, 502, { error: 'Playback stream refresh failed' });
      }
    }

    const { upstreamReq, upstreamRes } = upstream;
    const upstreamStatus = upstreamRes.statusCode || 502;

    if (![200, 206, 416].includes(upstreamStatus)) {
      upstreamRes.resume();
      upstreamReq.destroy();
      stats.upstreamErrors += 1;
      logger.warn(`[pikpak-proxy] Unexpected upstream HTTP ${upstreamStatus}`);
      return sendJson(res, 502, { error: `Upstream CDN returned HTTP ${upstreamStatus}` });
    }

    const outHeaders = {
      'Content-Type': ALLOWED_TEST_FILE.mimeType,
      'Accept-Ranges': upstreamRes.headers['accept-ranges'] || 'bytes',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (upstreamRes.headers['content-range']) {
      outHeaders['Content-Range'] = upstreamRes.headers['content-range'];
    }
    if (upstreamRes.headers['content-length']) {
      outHeaders['Content-Length'] = upstreamRes.headers['content-length'];
    }
    if (upstreamRes.headers.etag) {
      outHeaders.ETag = upstreamRes.headers.etag;
    }

    res.writeHead(upstreamStatus, outHeaders);

    if (method === 'HEAD' || upstreamStatus === 416) {
      upstreamRes.resume();
      upstreamReq.destroy();
      res.end();
      return;
    }

    stats.activeUpstreamStreams += 1;
    let cleaned = false;
    const cleanup = (clientAborted) => {
      if (cleaned) return;
      cleaned = true;
      stats.activeUpstreamStreams = Math.max(0, stats.activeUpstreamStreams - 1);
      if (clientAborted) {
        stats.clientDisconnects += 1;
        upstreamRes.destroy();
        upstreamReq.destroy();
      }
    };

    res.on('close', () => {
      if (!res.writableEnded) {
        cleanup(true);
      } else {
        cleanup(false);
      }
    });

    upstreamRes.on('error', (err) => {
      logger.warn('[pikpak-proxy] Upstream stream interrupted:', err.message);
      cleanup(true);
      if (!res.writableEnded) res.destroy();
    });

    upstreamRes.on('end', () => cleanup(false));
    upstreamRes.pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = urlObj.pathname;

      if (pathname === '/api/pikpak-poc/health' && req.method === 'GET') {
        return sendJson(res, 200, {
          status: 'ok',
          boundHost: '127.0.0.1',
          fileId: ALLOWED_TEST_FILE.fileId,
          fileName: ALLOWED_TEST_FILE.fileName,
          stats,
        });
      }

      if (pathname === '/api/pikpak-poc/metadata' && req.method === 'GET') {
        return sendJson(res, 200, {
          fileId: ALLOWED_TEST_FILE.fileId,
          fileName: ALLOWED_TEST_FILE.fileName,
          mimeType: ALLOWED_TEST_FILE.mimeType,
          streamPath: '/api/pikpak-poc/stream',
        });
      }

      if (pathname === '/api/pikpak-poc/refresh' && req.method === 'POST') {
        const refreshed = await resolver.getValidUrl({ forceRefresh: true });
        return sendJson(res, 200, {
          refreshed: true,
          urlFingerprint: refreshed.fingerprint,
          ttlMinutes: Math.round((refreshed.expiresAtMs - Date.now()) / 60_000),
        });
      }

      if (
        pathname === '/api/pikpak-poc/stream' &&
        (req.method === 'GET' || req.method === 'HEAD')
      ) {
        return await handleStream(req, res);
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      logger.error('[pikpak-proxy] Request handler error:', err.message);
      if (!res.headersSent) {
        return sendJson(res, 500, { error: 'Internal proxy error' });
      }
      res.destroy();
    }
  });

  return { server, stats, resolver };
}

// Standalone execution entrypoint (strictly bound to 127.0.0.1)
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const PORT = Number(process.env.PIKPAK_POC_PORT || 4555);
  const { server, resolver } = createPikPakProxyServer();

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[pikpak-proxy] Listening strictly on http://127.0.0.1:${PORT}`);
    console.log(`[pikpak-proxy] Stream endpoint: http://127.0.0.1:${PORT}/api/pikpak-poc/stream`);
    console.log(`[pikpak-proxy] Allowed test video: ${ALLOWED_TEST_FILE.fileName} (${ALLOWED_TEST_FILE.fileId})`);
  });

  const shutdown = () => {
    console.log('[pikpak-proxy] Shutting down and clearing in-memory playback URL cache...');
    resolver.clear();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
