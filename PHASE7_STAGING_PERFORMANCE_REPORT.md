# PHASE 7 — Staging Performance & Reliability Benchmark Report

**Environment:** Controlled Local Staging Instance (Production Untouched — zero load sent to Render or Supabase)  
**Benchmark Script:** `scratch/phase7_staging_benchmark.mjs`  
**Status:** **COMPLETED AND TESTED** (Local staging capacity measured; hosted Render staging + real PostgreSQL connection pool latency pending hosted staging setup)

---

## 1. API Concurrency Benchmarks (50 / 100 / 200 Concurrent Students)

Each simulated student executed 3 authenticated API requests in parallel (`GET /student/home`, `GET /lessons/:id`, `POST /lessons/:id/download`):

| Concurrent Students | Total API Calls | Success Rate | Errors | Wall Time | p50 Latency | p95 Latency | p99 Latency | Node RSS | Heap Used |
|---|---|---|---|---|---|---|---|---|---|
| **50** | 150 | **100.0%** | 0 | `630.0 ms` | `200.8 ms` | `252.6 ms` | `278.9 ms` | `119.4 MB` | `48.9 MB` |
| **100** | 300 | **100.0%** | 0 | `1,032.3 ms` | `312.4 ms` | `422.7 ms` | `427.6 ms` | `131.1 MB` | `42.8 MB` |
| **200** | 600 | **100.0%** | 0 | `2,689.2 ms` | `860.5 ms` | `1,108.7 ms` | `1,504.8 ms` | `155.0 MB` | `66.4 MB` |

---

## 2. Separate HTTP 206 Video Range Bandwidth Benchmark

To keep API performance strictly separate from media streaming bandwidth (Part I):
- **Fixture:** `50 MB` private MP4 uploaded to `persistent_disk`.
- **Workload:** 20 concurrent HTTP `206 Partial Content` Range requests (`1 MB` each = `20.0 MB` total transferred).
- **Results:**
  - `allHttp206`: **`true`** (`20/20` HTTP 206 responses)
  - Wall Time: **`272.6 ms`**
  - Aggregate Local Disk Throughput: **`615.4 Mbps`**
  - Latency: p50 **`235.1 ms`**, p95 **`269.4 ms`**, p99 **`269.4 ms`**

---

## 3. Honest Bottleneck & Capacity Disclaimers

1. **API Concurrency ≠ Simultaneous Video Streams:** Passing 200 concurrent API calls locally does **NOT** prove a single Render Starter instance can sustain 200 simultaneous 120 MB video downloads over WAN. For 200 simultaneous 5 Mbps streams (~1 Gbps egress), direct CDN/object-storage delivery (**Cloudflare R2**) is required.
2. **Database Connection Pooling:** Local staging used the in-memory store; hosted staging against Supabase PostgreSQL (PgBouncer Transaction Pooler on port `6543`) must be measured separately to validate DB connection saturation under 100–200 concurrent logins.
3. **Memory Stability:** Node heap stayed under `66.4 MB` (`155 MB` RSS) during 600 concurrent requests + 50 MB streaming I/O, confirming zero full-file video memory buffering.
