/**
 * Phase 4 — Task 1 & Task 2 Safe Local Probe Script
 * SECURITY GUARANTEE: Never prints credentials, tokens, emails, or signed playback URLs.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

const CLI_CANDIDATES = [
  'd:\\Downloads\\Android apk file\\.tools\\pikpak.exe',
  `${process.env.USERPROFILE}\\.pikpak\\pikpak.exe`,
];

function findCli() {
  for (const p of CLI_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  return 'pikpak';
}

async function runCli(args) {
  const exe = findCli();
  const { stdout } = await execFileAsync(exe, args, {
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout.trim();
}

function extractItems(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.files)) return parsed.files;
  if (Array.isArray(parsed?.items)) return parsed.items;
  if (Array.isArray(parsed?.data)) return parsed.data;
  return [];
}

async function findOneMp4(folderId = null, depth = 0) {
  if (depth > 2) return null;
  const args = ['ls', '-F', 'json', '--limit', '100'];
  if (folderId) args.push(folderId);
  const out = await runCli(args);
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    return { parseError: true, sampleKeys: out.slice(0, 120) };
  }
  const items = extractItems(parsed);

  // Prefer .mp4 files first
  for (const item of items) {
    const name = String(item.name || item.Name || '');
    const kind = String(item.kind || item.type || item.Type || '').toLowerCase();
    const mime = String(item.mime_type || item.mimeType || '').toLowerCase();
    if (
      !kind.includes('folder') &&
      (name.toLowerCase().endsWith('.mp4') || mime.includes('video/mp4'))
    ) {
      return {
        id: item.id || item.ID || item.file_id,
        name,
        size: Number(item.size || item.Size || 0),
        mimeType: mime || 'video/mp4',
      };
    }
  }

  // Recurse into subfolders (e.g. "My Pack") if no MP4 at root
  for (const item of items) {
    const kind = String(item.kind || item.type || item.Type || '').toLowerCase();
    const id = item.id || item.ID;
    if (kind.includes('folder') && id) {
      const nested = await findOneMp4(id, depth + 1);
      if (nested && !nested.parseError) return nested;
    }
  }
  return null;
}

function analyzeUrlMetadataSafely(rawUrl) {
  const u = new URL(rawUrl);
  const paramKeys = [...u.searchParams.keys()];
  let detectedExpiryIso = null;
  let detectedTtlMinutes = null;

  for (const key of paramKeys) {
    const val = u.searchParams.get(key) || '';
    // Look for Unix epoch timestamps in seconds (~1.7e9 to 2.2e9)
    if (/^\d{10}$/.test(val)) {
      const ts = Number(val) * 1000;
      if (ts > Date.now() - 3600_000 && ts < Date.now() + 365 * 86400_000) {
        detectedExpiryIso = new Date(ts).toISOString();
        detectedTtlMinutes = Math.round((ts - Date.now()) / 60000);
        break;
      }
    }
  }

  const extMatch = u.pathname.match(/\.[a-zA-Z0-9]{2,5}$/);
  return {
    protocol: u.protocol,
    hostDomainSuffix: u.hostname.split('.').slice(-2).join('.'),
    pathExtension: extMatch ? extMatch[0].toLowerCase() : '(none)',
    queryParamKeysOnly: paramKeys,
    detectedExpiryIso,
    detectedTtlMinutes,
    sha256Prefix: crypto.createHash('sha256').update(rawUrl).digest('hex').slice(0, 12),
  };
}

async function probeStreamUrl(rawUrl, fileSize) {
  const results = {};

  // Probe 1: Initial 4 KB Range request (verifies direct playability, status, Content-Type, Range support & MP4 magic bytes)
  const t0 = Date.now();
  const r1 = await fetch(rawUrl, {
    method: 'GET',
    headers: { Range: 'bytes=0-4095' },
    redirect: 'follow',
  });
  const buf1 = Buffer.from(await r1.arrayBuffer());
  results.initialProbeMs = Date.now() - t0;
  results.initialStatus = r1.status;
  results.contentType = r1.headers.get('content-type');
  results.contentLengthHeader = r1.headers.get('content-length');
  results.acceptRanges = r1.headers.get('accept-ranges');
  results.contentRange = r1.headers.get('content-range');
  results.bytesReceived = buf1.length;

  // Detect MP4 ISO BMFF header ('ftyp' at bytes 4..8) or HLS '#EXTM3U'
  const asciiHead = buf1.subarray(0, 64).toString('latin1');
  results.hasMp4FtypBox = buf1.length >= 8 && buf1.subarray(4, 8).toString('latin1') === 'ftyp';
  results.isHlsPlaylist = asciiHead.startsWith('#EXTM3U');
  results.looksLikeHtmlPage = /<!doctype|<html/i.test(asciiHead);

  // Probe 2: Mid-file seek test (4 KB at 25% offset or 1 MB offset)
  const totalBytes = (() => {
    if (results.contentRange) {
      const m = results.contentRange.match(/\/(\d+)$/);
      if (m) return Number(m[1]);
    }
    return fileSize || 0;
  })();

  if (totalBytes > 65536) {
    const seekStart = Math.min(Math.floor(totalBytes * 0.25), totalBytes - 8192);
    const seekEnd = seekStart + 4095;
    const tSeek = Date.now();
    const r2 = await fetch(rawUrl, {
      method: 'GET',
      headers: { Range: `bytes=${seekStart}-${seekEnd}` },
      redirect: 'follow',
    });
    const buf2 = Buffer.from(await r2.arrayBuffer());
    results.seekTest = {
      requestedRange: `bytes=${seekStart}-${seekEnd}`,
      status: r2.status,
      contentRange: r2.headers.get('content-range'),
      bytesReceived: buf2.length,
      latencyMs: Date.now() - tSeek,
      differentFromStartBytes: !buf1.subarray(0, 64).equals(buf2.subarray(0, 64)),
    };
  }

  return results;
}

async function main() {
  console.log('=== PHASE 4: TASK 1 & TASK 2 SAFE PROBE ===');

  // 1. Verify CLI auth status (sanitized)
  const version = await runCli(['version']);
  console.log('CLI_VERSION:', version);

  let statusRaw;
  try {
    statusRaw = await runCli(['auth', 'status', '-F', 'json']);
    const st = JSON.parse(statusRaw);
    console.log('AUTH_CHECK:', JSON.stringify({
      authenticated: Boolean(st?.logged_in ?? st?.authenticated ?? true),
      hasVipField: st?.vip !== undefined || st?.is_vip !== undefined,
      vipStatus: st?.vip?.status ?? st?.vip_status ?? st?.membership ?? 'unknown',
      storageQuotaBytes: st?.quota?.limit ?? st?.storage?.limit ?? null,
      storageUsedBytes: st?.quota?.usage ?? st?.storage?.usage ?? null,
    }));
  } catch (err) {
    console.error('AUTH_STATUS_FAILED:', err.message);
    process.exit(1);
  }

  // 2. Locate ONE test MP4 file
  const mp4 = await findOneMp4();
  if (!mp4 || mp4.parseError) {
    console.log('TEST_MP4_RESULT:', JSON.stringify(mp4 || { found: false }));
    process.exit(2);
  }
  console.log('TEST_MP4_FOUND:', JSON.stringify({
    fileId: mp4.id,
    fileName: mp4.name,
    sizeBytes: mp4.size,
    sizeMB: Number((mp4.size / (1024 * 1024)).toFixed(2)),
    mimeType: mp4.mimeType,
  }));

  // 3. Request playback URL via official CLI (in memory ONLY — never printed!)
  const rawPlayOut1 = await runCli(['play', mp4.id, '--url-only']);
  const urlLine1 = rawPlayOut1
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^https?:\/\//i.test(l));

  if (!urlLine1) {
    console.log('PLAY_URL_RESULT:', JSON.stringify({ obtained: false, lineCount: rawPlayOut1.split(/\r?\n/).length }));
    process.exit(3);
  }

  const meta1 = analyzeUrlMetadataSafely(urlLine1);
  console.log('URL_METADATA_SANITIZED:', JSON.stringify(meta1, null, 2));

  // 4. Probe stream HTTP status, Content-Type, Range support, MP4 magic & mid-file seek
  const probe = await probeStreamUrl(urlLine1, mp4.size);
  console.log('STREAM_PROBE:', JSON.stringify(probe, null, 2));

  // 5. Inspect `pikpak get <fileID> --url-type play -F json` schema (keys & media types ONLY — zero URLs!)
  try {
    const getOut = await runCli(['get', mp4.id, '--url-type', 'play', '-F', 'json']);
    const getJson = JSON.parse(getOut);
    const mediaSummary = Array.isArray(getJson?.medias)
      ? getJson.medias.map((m) => ({
          resolution: m.resolution_name || m.media_name || null,
          videoCodec: m.video?.codec || null,
          width: m.video?.width || null,
          height: m.video?.height || null,
          duration: m.video?.duration || null,
          hasLink: Boolean(m.link?.url),
          linkExpire: m.link?.expire || null,
        }))
      : [];
    console.log('GET_PLAY_METADATA:', JSON.stringify({
      topLevelKeys: Object.keys(getJson || {}),
      hasWebContentLink: Boolean(getJson?.web_content_link),
      mediaCount: mediaSummary.length,
      medias: mediaSummary,
    }, null, 2));
  } catch (err) {
    console.log('GET_PLAY_METADATA_NOTE:', err.message);
  }

  // 6. Test whether a fresh URL can be regenerated cleanly
  await new Promise((r) => setTimeout(r, 2000));
  const rawPlayOut2 = await runCli(['play', mp4.id, '--url-only']);
  const urlLine2 = rawPlayOut2
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^https?:\/\//i.test(l));
  if (urlLine2) {
    const meta2 = analyzeUrlMetadataSafely(urlLine2);
    console.log('FRESH_URL_CHECK:', JSON.stringify({
      regeneratedOk: true,
      urlChangedOnSecondCall: meta2.sha256Prefix !== meta1.sha256Prefix,
      secondExpiryIso: meta2.detectedExpiryIso,
    }));
  }
}

main().catch((err) => {
  console.error('PROBE_ERROR:', err.message);
  process.exit(1);
});
