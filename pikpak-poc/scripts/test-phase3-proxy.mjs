/**
 * Phase 3 Automated Verification Suite for Localhost PikPak Streaming Proxy.
 * Tests ONLY the single verified test video (VP75WkqprAY1HT95P3QYcv8Ro2).
 * Never prints signed URLs, tokens, or credentials.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createPikPakProxyServer,
  PikPakCliUrlResolver,
  validatePikPakUpstreamUrl,
} from '../server/proxyServer.mjs';

function startLocalServer(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ port: addr.port, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function runTests() {
  const resolver = new PikPakCliUrlResolver();
  const { server, stats } = createPikPakProxyServer({ resolver });
  const { baseUrl } = await startLocalServer(server);

  const report = {};

  try {
    // 0. SSRF host validation check
    assert.throws(() => validatePikPakUpstreamUrl('http://dl.mypikpak.com/file'), /non-HTTPS/i);
    assert.throws(() => validatePikPakUpstreamUrl('https://evil-mypikpak.com/file'), /unauthorized/i);
    assert.throws(() => validatePikPakUpstreamUrl('https://127.0.0.1/secret'), /unauthorized/i);
    assert.throws(() => validatePikPakUpstreamUrl('https://169.254.169.254/latest/meta-data'), /unauthorized/i);
    report.ssrfProtection = 'PASS';

    // 1. Metadata & Health check (confirm zero signed URL leakage)
    const metaRes = await fetch(`${baseUrl}/api/pikpak-poc/metadata`);
    const metaJson = await metaRes.json();
    assert.equal(metaRes.status, 200);
    assert.equal(metaJson.mimeType, 'video/mp4');
    assert.equal(JSON.stringify(metaJson).includes('sign='), false);
    assert.equal(JSON.stringify(metaJson).includes('mypikpak.com'), false);
    report.metadataNoLeak = 'PASS';

    // 2. Initial playback HEAD + initial Range 0-4095 request
    const headRes = await fetch(`${baseUrl}/api/pikpak-poc/stream`, { method: 'HEAD' });
    assert.equal(headRes.status, 200);
    assert.equal(headRes.headers.get('content-type'), 'video/mp4');
    assert.equal(headRes.headers.get('accept-ranges'), 'bytes');
    const totalSize = Number(headRes.headers.get('content-length'));
    assert.equal(totalSize, 1400481);

    const t0 = Date.now();
    const rInitial = await fetch(`${baseUrl}/api/pikpak-poc/stream`, {
      headers: { Range: 'bytes=0-4095' },
    });
    const bInitial = Buffer.from(await rInitial.arrayBuffer());
    assert.equal(rInitial.status, 206);
    assert.equal(rInitial.headers.get('content-type'), 'video/mp4');
    assert.equal(rInitial.headers.get('content-range'), 'bytes 0-4095/1400481');
    assert.equal(bInitial.length, 4096);
    assert.equal(bInitial.subarray(4, 8).toString('latin1'), 'ftyp');
    report.initialPlaybackRequest = {
      status: rInitial.status,
      contentType: rInitial.headers.get('content-type'),
      contentRange: rInitial.headers.get('content-range'),
      validMp4Ftyp: true,
      latencyMs: Date.now() - t0,
    };

    // 3. Out-of-bounds Range request -> preserves HTTP 416
    const r416 = await fetch(`${baseUrl}/api/pikpak-poc/stream`, {
      headers: { Range: 'bytes=99999999-100000000' },
    });
    assert.equal(r416.status, 416);
    report.range416Preserved = { status: r416.status };

    // 4. Mid-file seek test (50% offset)
    const seekStart = 700000;
    const seekEnd = 704095;
    const tSeek = Date.now();
    const rSeek = await fetch(`${baseUrl}/api/pikpak-poc/stream`, {
      headers: { Range: `bytes=${seekStart}-${seekEnd}` },
    });
    const bSeek = Buffer.from(await rSeek.arrayBuffer());
    assert.equal(rSeek.status, 206);
    assert.equal(rSeek.headers.get('content-range'), `bytes ${seekStart}-${seekEnd}/1400481`);
    assert.equal(bSeek.length, 4096);
    assert.equal(bInitial.subarray(0, 64).equals(bSeek.subarray(0, 64)), false);
    report.midFileSeek = {
      status: rSeek.status,
      contentRange: rSeek.headers.get('content-range'),
      latencyMs: Date.now() - tSeek,
    };

    // 5. Multiple sequential Range requests (3 consecutive 8 KB chunks)
    const seqTimings = [];
    for (let i = 0; i < 3; i += 1) {
      const start = i * 8192;
      const end = start + 8191;
      const ts = Date.now();
      const rs = await fetch(`${baseUrl}/api/pikpak-poc/stream`, {
        headers: { Range: `bytes=${start}-${end}` },
      });
      const bs = Buffer.from(await rs.arrayBuffer());
      assert.equal(rs.status, 206);
      assert.equal(bs.length, 8192);
      seqTimings.push(Date.now() - ts);
    }
    report.sequentialRanges = { count: 3, chunkBytes: 8192, latenciesMs: seqTimings };

    // 6. Client disconnect mid-stream (open full stream, abort after first bytes, verify cleanup)
    const disconnectResult = await new Promise((resolve, reject) => {
      const addr = server.address();
      const clientReq = http.request(
        { host: '127.0.0.1', port: addr.port, path: '/api/pikpak-poc/stream', method: 'GET' },
        (res) => {
          let bytesBeforeAbort = 0;
          res.once('data', (chunk) => {
            bytesBeforeAbort += chunk.length;
            clientReq.destroy();
            res.destroy();
            setTimeout(() => {
              resolve({
                status: res.statusCode,
                bytesBeforeAbort,
                activeStreamsAfterDisconnect: stats.activeUpstreamStreams,
                disconnectsRecorded: stats.clientDisconnects,
              });
            }, 250);
          });
        }
      );
      clientReq.on('error', () => {}); // Expected on client destroy
      clientReq.end();
      setTimeout(() => reject(new Error('Disconnect test timed out')), 10_000);
    });
    assert.equal(disconnectResult.status, 200);
    assert.equal(disconnectResult.activeStreamsAfterDisconnect, 0);
    assert.ok(disconnectResult.bytesBeforeAbort < totalSize);
    report.clientDisconnect = disconnectResult;

    // 7. Explicit URL refresh via CLI
    const prevFingerprint = resolver.cached?.fingerprint;
    await new Promise((r) => setTimeout(r, 1500));
    const refRes = await fetch(`${baseUrl}/api/pikpak-poc/refresh`, { method: 'POST' });
    const refJson = await refRes.json();
    assert.equal(refRes.status, 200);
    assert.equal(refJson.refreshed, true);
    assert.notEqual(refJson.urlFingerprint, prevFingerprint);
    report.urlRefresh = {
      refreshed: true,
      rotatedFingerprint: true,
      ttlMinutes: refJson.ttlMinutes,
    };

    // 8. Expired URL recovery (simulate tampered/expired sign param on verified PikPak CDN host)
    const realCached = resolver.cached;
    const tampered = new URL(realCached.url);
    tampered.searchParams.set('expire', String(Math.floor(Date.now() / 1000) - 3600));
    tampered.searchParams.set('sign', 'expired_test_signature_000000');
    resolver.cached = {
      url: tampered.toString(),
      parsed: tampered,
      expiresAtMs: Date.now() + 60 * 60 * 1000, // Pretend cache thinks it's still fresh so upstream rejects it
      fingerprint: 'expired_sim',
      fetchedAtMs: Date.now(),
    };

    const tRec = Date.now();
    const rRec = await fetch(`${baseUrl}/api/pikpak-poc/stream`, {
      headers: { Range: 'bytes=0-4095' },
    });
    const bRec = Buffer.from(await rRec.arrayBuffer());
    assert.equal(rRec.status, 206);
    assert.equal(bRec.subarray(4, 8).toString('latin1'), 'ftyp');
    assert.ok(stats.expiredUrlRecoveries >= 1);
    report.expiredUrlRecovery = {
      recoveredStatus: rRec.status,
      validMp4FtypAfterRecovery: true,
      recoveriesCount: stats.expiredUrlRecoveries,
      latencyMs: Date.now() - tRec,
    };

    console.log('PHASE3_PROXY_TESTS_PASSED:', JSON.stringify(report, null, 2));
  } finally {
    resolver.clear();
    await stopServer(server);
  }
}

runTests().catch((err) => {
  console.error('PHASE3_PROXY_TESTS_FAILED:', err.message);
  process.exit(1);
});
