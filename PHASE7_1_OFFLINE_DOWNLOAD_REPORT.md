# PHASE 7.1 — Physical Device Offline Video Download Report

**Device:** iQOO `I2223` (Android 15 / API 35)  
**Test Videos Used:**
1. `D:\Downloads\Class 10 Real Numbers.mp4` (`3,733,064` bytes, SHA-256 `610ef6dd9e3ec30de9d43181c7faeddd453856a012c7b8dcb06c5c4582f5a8b0`)
2. `D:\Downloads\Real Numbers Introduction - 1.1.mp4` (`163,865,185` bytes / **163.8 MB**, SHA-256 `cfb55d2e8e3cbaa2162102cda9d8f3e447eab0511bb6b3f6eca6a8923f5e9aa1`)

---

## 1. Critical Physical-Device Bug Fixed (`PluginCall.getLong`)

- **Bug Observed on Real Phone:** Tapping `Download Video` on the iQOO `I2223` initially failed with:
  `Download Could Not Complete: Valid fileSize and 64-char SHA-256 checksum are required for verified downloads`
- **Root Cause Found in Capacitor 7 Java Bridge (`PluginCall.java`):** `PluginCall.getLong("fileSize")` only accepts `instanceof Long`, whereas JavaScript numbers `< 2^31` (`3,733,064` bytes, `durationSeconds`, `lastPositionMs`, etc.) deserialize in `org.json.JSONObject` as `Integer` — causing `call.getLong(...)` to return `null` (`0L`) on real Android phones!
- **Fix Applied (Backed Up First):** Added `readLongArg(call, key, defaultValue)` inspecting `(call.data?.opt(key) as? Number)?.toLong()` across [Class10OfflineDownloadPlugin.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/Class10OfflineDownloadPlugin.kt) and [Class10MediaPlayerPlugin.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/Class10MediaPlayerPlugin.kt). Verified via Gradle JUnit + fresh APK install.

---

## 2. Physical Download Lifecycle Verification (Part 8)

| # | Test Case | Observed Physical Evidence on iQOO `I2223` | Status |
|---|---|---|---|
| 1–2 | Start download & live progress (`3.73 MB` MP4) | Downloaded smoothly to 100%, verified full decrypted SHA-256 (`bytes=3733064`), renamed atomically `.enc.part` → `.enc` (`3,733,976` bytes = +912B AES-256-GCM tags) | **PASSED** |
| 3 | Pause download (`163.8 MB` MP4) | Tapped `Pause` mid-stream → UI switched to `Resume (...)`; `.enc.part` preserved at chunk boundary on disk (`14,159,232` bytes) | **PASSED** |
| 4 | Resume download (`163.8 MB` MP4) | Tapped `Resume` → resumed HTTP 206 download cleanly (`Downloading ...`) | **PASSED** |
| 5 | Cancel download (`163.8 MB` MP4) | Tapped `Cancel` → UI restored `Download Video` and deleted `.enc.part` (`CLEAN_NO_PART`) | **PASSED** |
| 6–7 | Complete download → auto-switch to `Watch Now` | Button automatically changed from `Download Video (3.6 MB)` to `Watch Now` ([phase7_1_device_watch_now.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_watch_now.png)) | **PASSED** |
| 8 | Open My Downloads (`/downloads`) | Displayed `Private Encrypted Storage • 1 verified lesson • 3.6 MB used • 14.18 GB free` ([phase7_1_device_my_downloads.png](file:///C:/Users/USER1/.gemini/antigravity/brain/25ce8fd8-ed3a-43b1-92a5-888a77b4ab50/phase7_1_device_my_downloads.png)) | **PASSED** |
| 9–10 | Play downloaded lesson & seek in native Media3 | Opened `LmsMedia3PlayerActivity` (`MEDIA3_READY offline=true durationMs=91040`), tapped forward seek + Home/Back cleanly | **PASSED** |
| 11 | Duplicate download prevention & corrupted chunk rejection | Verified in `Class10OfflineDownloadPlugin` (`alreadyDownloaded`) & `AuthenticatedChunkedCipherTest` (JUnit); corrupted chunk file tampering on live phone covered by JUnit | **PASSED** (Automated JUnit) / **NOT TESTED** (Manual disk-tamper on live phone) |
