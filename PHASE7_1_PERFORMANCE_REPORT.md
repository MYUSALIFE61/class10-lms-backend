# PHASE 7.1 — Physical Device Performance & Stability Report

**Device:** iQOO `I2223` (Android 15 / API 35, `5,448 MB` RAM)  
**App Package:** `in.class10lms.ssc` (PID `24794` / `29904` / `30959`)

---

## 1. Live Device Telemetry Captured via ADB (Part 12)

| Metric | Observed Physical Value on iQOO `I2223` | Status |
|---|---|---|
| **Cold App Launch Time (`am start -W`)** | `LaunchState: COLD`, `TotalTime: 3646 ms`, `WaitTime: 3649 ms` | **PASSED** |
| **Total Memory (`dumpsys meminfo in.class10lms.ssc`)** | `TOTAL PSS: 193,240 KB (~188.7 MB)`, `Private Dirty: 113,688 KB`, `Dalvik Heap Alloc: 5,456 KB / 11,600 KB`, `Native Heap Alloc: 24,544 KB / 37,640 KB`, `EGL mtrack: 41,104 KB` | **PASSED** (Healthy for WebView + Media3) |
| **CPU Usage (`dumpsys cpuinfo`)** | `10% 29904/in.class10lms.ssc: 8.1% user + 2% kernel` | **PASSED** |
| **Crash Buffer (`logcat -d -b crash`)** | `ZERO_CRASHES` across all installation, payment, download, Media3, and Airplane Mode runs | **PASSED** |
| **ANRs (`/data/anr`)** | Zero ANRs caused by `in.class10lms.ssc` during test window (`11:26–12:02`; pre-existing timestamps in `/data/anr` were `2026-11-26` & `08:08` prior to Phase 7.1) | **PASSED** |
| **Download Speed (`Class 10 Real Numbers.mp4` 3.73 MB via USB reverse)** | Encrypted (`AES-256-GCM`), SHA-256 hashed, and committed in `< 2` seconds | **PASSED** |
| **Long-Duration Battery Drain Benchmark** | Single short-window battery telemetry (`USB powered: true`); multi-hour unplugged video drain not benchmarked | **NOT TESTED** |
