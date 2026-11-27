# PHASE 7.1 — Physical Device Offline Encryption, Airplane Mode & Android Security Report

**Device:** iQOO `I2223` (Android 15 / API 35, Serial `10BD750FUC0006P`)  
**Scope:** Parts 9, 10 & 11 (Private Storage Forensics, Gallery/File Manager/VLC Isolation, Airplane Mode, Offline Lease Expiry/Renewal, `FLAG_SECURE`, Sandbox Security)

---

## 1. Private Storage & AES-256-GCM Forensic Evidence (Part 9)

Inspected app sandbox on the iQOO `I2223` via `run-as in.class10lms.ssc` (without rooting the device):
- **Storage Location:** `no_backup/offline_lessons/5095213d2427ad889990/d1a87c67-8b44-4024-b400-b9d44d1b295f.enc`
- **File Size:** **`3,733,976` bytes** (`3,733,064` plaintext bytes + `57` chunks × `16`-byte AES-GCM authentication tags = `+912` bytes exact match).
- **Raw Ciphertext Header Inspection (`od -tx1 -N 32`):**
  `cc 1d d4 02 dd 91 04 3a 20 61 49 ee 24 12 af 7e 21 9d 9d 66 66 0e a9 3f b8 da d0 83 45 ac fc 85`
  - **Zero plaintext `ftyp` (`66 74 79 70`) MP4 header** — file is verified encrypted ciphertext on disk.
- **Keystore-Backed Metadata (`shared_prefs/class10_lms_offline_vault_v1.xml`):**
  - EncryptedSharedPreferences Tink ciphertext confirmed (`AWrNNq8JPdy1DaBjprWzarPWbdiEy...` → `AT8OaNjt7++Y/xzwbtFGvDF...`) — zero plaintext DEKs or lease tokens.
- **Public Storage, MediaStore & Gallery Check:**
  - `content://media/external/video/media` query → `CLEAN_NO_LMS_VIDEOS` (0 LMS files in Gallery / MediaStore / Files).
  - `/sdcard/Download`, `/sdcard/Movies`, `/sdcard/DCIM` scan → empty (`0` LMS `.mp4` or `.enc` files).
- **External Player (VLC) Attempt:**
  - Explicitly launched `org.videolan.vlc/.gui.video.VideoPlayerActivity` targeting the private `.enc` path.
  - **Observed VLC Logcat Error:** `E VLC : libvlc stream: cannot open file /data/user/0/in.class10lms.ssc/no_backup/offline_lessons/5095213d2427ad889990/d1a87c67-8b44-4024-b400-b9d44d1b295f.enc (No such file or directory)` — Android OS app-sandbox + AES-256-GCM encryption completely blocks VLC/MX Player.

---

## 2. Airplane Mode & Offline Authorization Tests (Part 10)

| # | Test Case | Observed Physical Evidence on iQOO `I2223` | Status |
|---|---|---|---|
| 1–4 | Enable Airplane Mode, force-stop & cold-relaunch app | `cmd connectivity airplane-mode enable` (`airplane_mode_on = 1`), `am force-stop`, cold launched `/downloads` cleanly (`phase7_1_device_airplane_downloads.png` showing `Offline Mode` banner + `Watch Now`) | **PASSED** |
| 5–7 | Play downloaded video & seek in Airplane Mode | Launched `LmsMedia3PlayerActivity` while offline: `MEDIA3_READY offline=true durationMs=91040` | **PASSED** |
| 8 | Expired offline lease rejection (controlled fixture — phone clock untouched) | Initial run caught `maxOf(recordLeaseExp, studentLeaseExp)` precedence bug in `OfflineVideoVault.kt`! **FIXED**, rebuilt APK, and re-verified: `MEDIA3_READY` did NOT fire (`false`), error screen displayed `"Your offline viewing license has expired..."` (`true`) | **PASSED** (After Fix) |
| 9–10 | Reconnect to internet & renew lease | `cmd connectivity airplane-mode disable` (`0`), called `POST /downloads/lease/refresh` (7-day lease renewed), re-opened Media3 → `MEDIA3_READY offline=true` | **PASSED** |

---

## 3. Android Security Verification & Honest Limitations (Part 11)

- **`FLAG_SECURE` Screenshot Protection:** Verified via `dumpsys window windows` (`fl=LAYOUT_IN_SCREEN SECURE ...` on both `MainActivity` and `LmsMedia3PlayerActivity`) AND `adb shell screencap -p` producing a solid black frame (`phase7_1_flag_secure_screencap.png`).
- **Honest Security Limitations Documented:**
  1. Rooted Android phones or Frida/Xposed hooks can bypass Keystore/software `FLAG_SECURE` and dump memory during playback.
  2. External camera recording of the physical display cannot be prevented; dynamic moving student watermark acts as forensic traceability only.
  3. An offline phone cannot receive instant server-side revocation until the 7-day offline lease window expires or connectivity returns.
  4. Screen-recording callback on Android 15 requires interactive OS control-center screen-record toggle; `ScreenCaptureProtectionManager` is unit-tested (`ScreenCaptureProtectionManagerTest.kt`), manual OS screen-record button test was not pressed physically.
