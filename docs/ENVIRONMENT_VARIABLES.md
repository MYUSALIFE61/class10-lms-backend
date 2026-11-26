# Environment Variables Documentation

> [!CAUTION]
> **NEVER** place `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DEVICE_HASH_SECRET`, or Google Service Account JSON inside `frontend/` or any Android APK asset.

---

## 1. Backend Environment Variables (`backend/.env`)

Reference template: [backend/.env.example](file:///d:/Downloads/Android%20apk%20file/backend/.env.example)

| Variable | Required | Example / Default | Purpose |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `production` | Controls error redaction and logging behavior. |
| `PORT` | Yes | `4000` | Express HTTP listen port behind HTTPS reverse proxy / TLS terminator. |
| `TRUST_PROXY` | Yes | `1` | Ensures `req.ip` reflects real student IP behind Nginx/Cloudflare/Render. |
| `ALLOWED_ORIGINS` | Yes | `https://app.class10lms.in,https://localhost` | Strict CORS allowlist matching Capacitor `server.androidScheme` + `hostname`. |
| `SUPABASE_URL` | Yes | `https://<ref>.supabase.co` | Your Supabase PostgreSQL project URL. |
| `SUPABASE_ANON_KEY` | Yes | `eyJ...` | Used only by backend auth adapter for credential login verification. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | `eyJ...` | **SECRET.** Used exclusively on Express backend to read `lesson_video_sources` vault and write verified subscriptions. |
| `JWT_ACCESS_SECRET` | Yes | 64-char random hex | Signs short-lived (15m) access tokens bound to device & session ID. |
| `JWT_REFRESH_SECRET` | Yes | 64-char random hex | Signs rotating 7-day refresh tokens (stored SHA-256 hashed in `user_sessions`). |
| `DEVICE_HASH_SECRET` | Yes | 64-char random hex | HMAC secret for hashing Android device identifiers before DB persistence. |
| `JWT_ACCESS_TTL` | No | `15m` | Short-lived access token lifetime. |
| `JWT_REFRESH_TTL_DAYS` | No | `7` | Refresh session validity window in days. |
| `SUBSCRIPTION_PLAN_CODE` | No | `CLASS10_ANNUAL_499` | Default plan code resolved from `public.subscription_plans` (₹499 = `49900` paise). |
| `MAX_DEVICES_PER_STUDENT` | No | `1` | Maximum concurrent active Android devices per student (`1` or `2`). |
| `CONCURRENT_SESSION_WINDOW_MINUTES` | No | `10` | Window for flagging simultaneous logins across distinct devices. |
| `RAZORPAY_KEY_ID` | Yes | `rzp_live_...` | Public Razorpay Key ID returned by `/api/v1/payments/create-order`. |
| `RAZORPAY_KEY_SECRET` | Yes | `...` | **SECRET.** Verifies checkout HMAC-SHA256 signature (`order_id|payment_id`). |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | `...` | **SECRET.** Verifies `X-Razorpay-Signature` on `/api/v1/payments/webhook`. |
| `GOOGLE_PLAY_PACKAGE_NAME` | No | `in.class10lms.ssc` | Android application ID used when decoding Play Integrity tokens. |
| `GOOGLE_CLOUD_PROJECT_NUMBER` | No | `123456789012` | Google Cloud project number linked to Play Console Integrity API. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | No | Single-line JSON | **SECRET.** Google service account with Play Integrity API access. |
| `INTEGRITY_DISTRIBUTION_MODE` | No | `sideload` | `sideload` for direct APK distribution; `play_store` once published on Google Play. |
| `INTEGRITY_ENFORCEMENT_MODE` | No | `monitor` | `monitor` logs risk signals without blocking; `enforce` rejects failing devices (`403`). |

---

## 2. Frontend / APK Environment Variables (`frontend/.env`)

Reference template: [frontend/.env.example](file:///d:/Downloads/Android%20apk%20file/frontend/.env.example)

| Variable | Required | Example | Purpose |
| :--- | :---: | :--- | :--- |
| `VITE_API_BASE_URL` | Yes | `https://api.class10lms.in/api/v1` | Production HTTPS API base URL (cleartext HTTP is blocked in release APK). |
| `VITE_APP_NAME` | No | `Class 10 SSC LMS` | Displayed brand title in Splash & Login screens. |
| `VITE_APP_VERSION` | No | `1.0.0` | Sent in `X-App-Version` header for device auditing. |
| `VITE_SUPPORT_EMAIL` | No | `support@class10lms.in` | Support contact address. |

---

## 3. Android Release Signing (`frontend/android/keystore.properties`)

**Never commit `keystore.properties` or `*.jks` to Git.**

```properties
storeFile=release-upload.jks
storePassword=<strong-keystore-password>
keyAlias=class10lms-release
keyPassword=<strong-key-password>
```
