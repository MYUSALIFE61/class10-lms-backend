# PHASE 9.0 — ANDROID & ADMIN PORTAL STAGING CONFIGURATION

**Status:** Preparation Only — Zero production configs altered; no APK built or distributed; Admin Portal not deployed.

---

## 1. Android Staging APK Configuration

### 1.1 Verified Existing Config Files
- [frontend/capacitor.config.json](file:///d:/Downloads/Android%20apk%20file/frontend/capacitor.config.json):
  - `appId`: `in.class10lms.ssc`
  - `server.androidScheme`: `https`, `server.hostname`: `app.class10lms.in`, `cleartext`: `false`
  - `android.allowMixedContent`: `false`, `android.webContentsDebuggingEnabled`: `false`
- [frontend/scripts/configure-capacitor.js](file:///d:/Downloads/Android%20apk%20file/frontend/scripts/configure-capacitor.js): Supports `prod` (strict HTTPS) vs `dev` (`http://localhost`).
- [frontend/src/config/env.js](file:///d:/Downloads/Android%20apk%20file/frontend/src/config/env.js):
  - Keeps `DEFAULT_PROD_API_BASE_URL = 'https://api.class10lms.in/api/v1'`.
  - Reads `import.meta.env.VITE_API_BASE_URL` at build time and enforces `IS_STRICT_PROD` (`https://` required, loopback blocked).
- [frontend/android/app/src/main/res/xml/network_security_config.xml](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/res/xml/network_security_config.xml): `cleartextTrafficPermitted="false"`, trusts system CA roots (compatible with `https://staging-api.class10lms.in`).

### 1.2 Isolated Staging Build Recipe (Zero Edits to Tracked Prod Config)
Pass `VITE_API_BASE_URL` via environment (or an untracked `.env.staging.local`) during Vite build + Capacitor sync—**never** edit `DEFAULT_PROD_API_BASE_URL`:
```powershell
cd frontend
$env:VITE_API_BASE_URL = "https://staging-api.class10lms.in/api/v1"
npm run build:prod
npx cap sync android
# Verify embedded bundle contains staging URL and ZERO localhost/api.class10lms.in API endpoints:
Select-String -Path "android\app\src\main\assets\public\assets\*.js" -Pattern "staging-api\.class10lms\.in|api\.class10lms\.in|localhost"
# Build local staging debug APK (never upload to Google Play):
cd android
.\gradlew.bat :app:assembleDebug --no-daemon --max-workers=1
```

### 1.3 Verified Android Security & Vault Guarantees
- **App-Private Video Vault:** [OfflineVideoVault.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/OfflineVideoVault.kt) writes encrypted chunks strictly under `context.noBackupFilesDir/offline_lessons/`.
- **AES-256-GCM + Android Keystore:** Verified via `OfflineCryptoEngine.kt` & `AuthenticatedChunkedCipher.kt` + `EncryptedSharedPreferences` (`MasterKey`).
- **Screen Protection:** [LmsMedia3PlayerActivity.kt](file:///d:/Downloads/Android%20apk%20file/frontend/android/app/src/main/java/in/class10lms/ssc/LmsMedia3PlayerActivity.kt) enforces `FLAG_SECURE`, Android 15 screen-recording callback (`DETECT_SCREEN_RECORDING`), and secondary display detection.
- **No Raw URL / File Exposure:** Backend `getDownloadManifest` issues short-lived HMAC download tokens; raw `storage_key` / server disk paths are never sent to Android.

---

## 2. Admin Portal Staging Configuration

### 2.1 Code Inspection Findings
- [admin-portal/src/services/adminApi.js](file:///d:/Downloads/Android%20apk%20file/admin-portal/src/services/adminApi.js#L2):
  `const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1/admin';`
- Supports `/auth/login`, Video Library (`uploadLessonOfflineMp4` using `XMLHttpRequest` progress to `/lessons/:lessonId/offline-assets/upload`), Lesson CRUD, PDF/Resource upload (`POST /resources`), Student management, Subscriptions, and Payment status inspection.
- No `.env.example` exists in `admin-portal/` yet; [admin-portal/vite.config.js](file:///d:/Downloads/Android%20apk%20file/admin-portal/vite.config.js) proxies `/api` to `http://127.0.0.1:4000` in local dev only.

### 2.2 Staging Build Configuration
When building or hosting Admin Portal Staging (e.g., Render Static Site, Publish Dir: `admin-portal/dist`):
- **Build Command:** `cd admin-portal && npm ci && npm run build`
- **Build Environment Variable:**
  ```env
  VITE_API_BASE_URL=https://staging-api.class10lms.in/api/v1/admin
  ```
- **Isolation Check:** Inspect generated `admin-portal/dist/assets/*.js` after build to verify `staging-api.class10lms.in/api/v1/admin` is embedded and **zero** references to `api.class10lms.in` or `127.0.0.1:4000` exist.
- **Staging Admin Account Requirement:** Seed one dedicated staging `super_admin` row in staging Supabase `public.admin_users` (never reuse production admin passwords).
