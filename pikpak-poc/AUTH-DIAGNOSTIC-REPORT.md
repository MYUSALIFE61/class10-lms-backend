# PikPak CLI Authentication Diagnostic Report

**Date:** 2026-11-23  
**CLI Executable:** `D:\Downloads\Android apk file\.tools\pikpak.exe`  
**CLI Version:** `pikpak version v0.6.0`  
**Scope:** Isolated PoC (`pikpak-poc/`) — Zero production LMS files modified  

---

## 1. Phase 1 — Verified CLI Syntax & Behavior (`v0.6.0`)

Verified directly from official `--help` output and `pikpak config ls`:

| Command | Verified Official Syntax & Flags | Behavior Confirmed |
| :--- | :--- | :--- |
| `auth login` | `pikpak auth login [-m device\|browser] [--no-launch-browser] [--continue <code_id>] [--force] [-l <label>] [--scope <scopes>]` | Supports two interactive OAuth flows: **Browser OAuth callback** (`-m browser`, default on desktop) and **OAuth 2.0 Device Authorization Grant** (`-m device`, link + short code — no localhost callback required). |
| `auth status` | `pikpak auth status [-F json\|yaml] [-v]` | Reports `{"logged_in": false}` (exit code `0`) when unauthenticated; reports profile, VIP status, and storage quota when authenticated. |
| `auth logout` | `pikpak auth logout` | Clears locally saved login information. |
| `config ls` | `pikpak config ls` | Confirms CLI config directory is `C:\Users\USER1\.pikpak` (`settings.json`, `logs\`, `affiliate`). |

---

## 2. Diagnostic Evidence Collected (Zero Credentials Inspected or Printed)

| Check | Verified Finding | Fault? |
| :--- | :--- | :---: |
| **`pikpak auth status -v -F json`** | Exit `0`, returned `{"logged_in": false}`. | Confirms unauthenticated |
| **Profile & Home Paths** | `USERPROFILE=C:\Users\USER1`, `HOME=C:\Users\USER1`, matching `pikpak config ls` (`C:\Users\USER1\.pikpak`). | OK |
| **Directory Contents (`C:\Users\USER1\.pikpak`)** | Contains **only** `.device.json` (`48 bytes`, `LastWriteTime: 23-Nov-26 11:46:30 AM`) — created when `auth status` first ran. No session file has been created or modified since `11:46:30 AM`. | **Confirms no CLI session saved** |
| **Windows Credential Manager (`cmdkey /list`)** | Zero credential targets matching `pikpak`. | **Confirms no keyring token saved** |
| **Directory Permissions (`icacls`)** | `RANJITHKUMAR\USER1:(OI)(CI)(F)` (Full Control). | OK (not a permission issue) |
| **Disk Space** | `C:` has `323.05 MB` free; `D:` has `25,427.2 MB` free. | OK (sufficient for session storage) |
| **Executable / Antivirus Stream (`Get-Item -Stream *`)** | Only `:$DATA` stream present (`41,731,584 bytes`); `pikpak.exe` executes cleanly without SmartScreen/AV block. | OK |
| **Default Browser** | `ChromeHTML` (Google Chrome). | OK |
| **Windows Firewall** | All 3 profiles (`Domain`, `Private`, `Public`) are **`Enabled = True`** with **zero inbound allow rules for `pikpak.exe`**. | **Callback Risk in `-m browser` mode** |
| **Active Processes** | Zero running `pikpak` processes. | Confirms no login process currently waiting |

---

## 3. Root Cause Summary

1. **No authenticated CLI session was persisted** to either `C:\Users\USER1\.pikpak` or Windows Credential Manager (the sole file `.device.json` has not been updated since `11:46:30 AM`, and `auth status` returns `{"logged_in": false}`).
2. **Why browser login (`-m browser`) fails to persist in this setup:**
   - Signing into PikPak's web drive (`mypikpak.com`) in Chrome does **not** create a CLI session; the CLI requires completing its own OAuth approval flow while `pikpak.exe` remains open.
   - Default `pikpak auth login` uses a local browser OAuth callback listener, while **Windows Firewall is enabled across all profiles (`Domain`/`Private`/`Public`) with no allow rule for `pikpak.exe`**, which can block or drop the localhost redirect callback before the session is saved (or if the terminal closes before authorization finishes).

---

## 4. Recommended Safe Recovery (Phase 2)

Use the official **OAuth Device Authorization flow (`--method device`)**, which eliminates local callback listeners and firewall/browser redirect issues entirely:

```powershell
& "d:\Downloads\Android apk file\.tools\pikpak.exe" auth login --method device
```

1. Run that single command in your own PowerShell terminal.
2. Open the verification URL shown by the CLI in Chrome, enter the short device code displayed, and click **Confirm / Authorize**.
3. Keep the PowerShell window open until `pikpak.exe` prints that login succeeded (never paste any token/email into chat).

---

## 5. Resolution & Remaining Limitations

- **Resolution (2026-11-23):** **RESOLVED.** User executed `& "d:\Downloads\Android apk file\.tools\pikpak.exe" auth login --method device` and approved the device code in Chrome (`"Device authorization successful!"`). Verified via official `pikpak auth status -F json` -> exit `0`, **`logged_in: true`** (Free account, `vipStatus: "invalid"`).
- **Known Limitations:**
  - Default `-m browser` flow remains susceptible to Windows Firewall blocking localhost OAuth callbacks unless an allow rule is added; `--method device` is the reliable authentication flow on this machine.
  - This establishes a local personal CLI session for the one-video PoC only; PikPak Free account limits (`6 GB` storage, `5 GB/day` Connected Apps downstream cap -> `100 KB/s` throttle, max 3 simultaneous devices, and User Agreement Clause 8.1 non-commercial restriction) still apply.
