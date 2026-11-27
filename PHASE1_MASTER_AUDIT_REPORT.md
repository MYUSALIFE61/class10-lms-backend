# Phase 1 — Existing Class 10 LMS Application Audit & Master Implementation Plan

**Audit Document ID:** `CLASS10-LMS-MASTER-PHASE1-AUDIT`  
**Audit Date:** November 26, 2026 (22:34 IST)  
**Scope:** End-to-End Inspection of Existing Android App, React Frontend, Express Backend, Admin Portal & Production Supabase/Render Infrastructure  
**Execution Guardrail:** Pure Read-Only Audit — **0 production rows, schemas, keys, or deployments modified.**

---

## 1. Executive Summary & Architectural Baseline

The existing workspace is **not** a blank prototype — it already contains a strong native Android security/encryption core, a working Node.js/Express + Supabase PostgreSQL backend deployed live on Render (`https://class10-lms-backend.onrender.com`), a Capacitor 7 React frontend, and a React Admin Portal.

However, cross-checking every requirement of the **Complete Subscription-Based Class 10 LMS Master Prompt** against the actual codebase reveals **critical UX flow gaps, Razorpay Android WebView blockers, durable object-storage gaps, missing offline entitlement licensing, and incomplete learning sections** that must be systematically resolved phase-by-phase before Google Play production launch.

### Baseline Automated Test Verification (Observed)
* **React Frontend (`frontend/`):** `npx vitest run` — **5 test files passed, 20 tests passed**.
* **Node.js Backend (`backend/`):** Earlier verified — **8 test suites (26 tests) pass**.
* **Android Native Unit Suite (`frontend/android/`):** Earlier verified — **31 unit tests pass** (covering chunked AES-256-GCM tamper/cross-student isolation and `LmsNavigationPolicy`).

---

## 2. Feature Matrix: Implemented vs Partial vs Missing

| Area | Already Implemented | Partially Implemented | Missing / Must Build |
| :--- | :--- | :--- | :--- |
| **1. Welcome & Onboarding UI** | Branded Splash loading screen (`SplashPage.jsx`). | Login/Register mode toggle on `LoginPage.jsx`. | Dedicated **Welcome Screen** (Logo, intro, Sign Up, Sign In, Terms & Conditions page, Privacy Policy page). |
| **2. Student Registration** | `POST /auth/register` hashing passwords via Supabase Auth, single-device binding, `board` (`AP`/`TS`). | `profiles` has `school`, `district`, `class_name` in DB (`006`), unused at signup. Login/Register live inside `LoginPage.jsx`. | `username` (unique) column & check, Confirm Password, strong password rules, mandatory mobile validation, `state`, `district`, `schoolName`, `className` inputs, post-signup redirect to `/subscription` (currently goes to `/dashboard`). |
| **3. Subscription Plans** | `subscription_plans` table + `GET /api/v1/subscriptions/plans` + `SubscriptionPage.jsx` card list. | Currently only **1** plan seeded (`CLASS10_ANNUAL_499`, ₹499 / 365 days). | Update/seed the **3 required plans**: Monthly (1 mo, **₹200**), Half-Yearly (6 mo, **₹500**), Annual (12 mo, **₹799**) via safe migration; support `CANCELLED` & `FAILED` subscription statuses. |
| **4. Payment Gateway (Razorpay)** | Server-side order creation (`createOrder`), HMAC-SHA256 `verifyPayment`, webhook signature verification & idempotency (`PaymentService.js`), Live keys configured on Render. | `SubscriptionPage.jsx` loads web `checkout.razorpay.com/v1/checkout.js`. | **BUG/BLOCKER in `LmsNavigationPolicy.kt` & `MainActivity.kt`:** blocks `upi://`, `phonepe://`, `tez://`, `paytmmp://`, bank 3DS popups, and non-`razorpay.com` ACS hosts! Add dedicated Checkout Summary screen, gateway payment-fetch status verification (`razorpay.payments.fetch`), **Payment Success Screen** (animation, tx ref, validity, **Login button** -> `/login`), **Payment Failure**, and **Pending Verification** screens. |
| **5. Student Login & Gate** | `POST /auth/login` with JWT (`15m`), rotating refresh tokens (`7d`) + reuse revocation, `MAX_DEVICES_PER_STUDENT=1` limit. | Email + password login only; "Forgot Password" is a static support email alert. | **Username / Mobile Number / Email** login resolution; **Forgot Password** flow (OTP/reset link); post-login **Subscription Status & Expiry Gate** redirecting unpaid/expired students to `/subscription` / `/renewal`. |
| **6. Student Dashboard** | `DashboardPage.jsx` wired to `GET /api/v1/student/home` & Supabase `subjects`, Continue Learning, stats, announcements. | Shows active subjects & recent progress; no explicit subscription expiry card or Downloaded Videos shortcut card on Home. | Show Subscription Status + Expiry Date badge prominently, **Downloaded Videos** quick card/section on Dashboard, Recently Viewed Lessons, remove dead "Sync Videos" PikPak button for students. |
| **7. Subject Chapters** | `SubjectDetailPage.jsx` & `ChapterDetailPage.jsx` load real DB chapters (`videoCount`, `testCount`) from `GET /student/subjects/:id/chapters`. | Displays chapter number, title, summary, video/test counts; `thumbnail_url` exists in DB (`006`) but unused in UI. | Render `thumbnailUrl`, **completion status badge**, **lesson count**, and **chapter learning progress % bar**. |
| **8. Lesson Learning Page** | `LessonPlayerPage.jsx` + `LessonDetailsScreen.jsx` with Download/Watch Now, MCQs, Video Quizzes, `NotesPanel`, PYQs, Formulas. | Notes/PYQs/Formulas live mostly on `ChapterDetailPage` tabs or markdown-only `NotesPanel`; PDFs saved to ephemeral container disk (`adminStoreExtension.js`). | **Teacher Name** field (`lessons`), **in-app zoomable/scrollable PDF & Image Handwritten Notes Viewer** with offline caching, **Important Concepts** (`lesson_concepts`), **Quick Revision** (`lesson_revision_points` definitions/formulas/key points), and **Previous Exam Questions** tabs inside `LessonPlayerPage` itself filtered to that exact lesson/topic. |
| **9–10. Video Storage & Secure Download** | `OfflineStorageService`, `OfflineDownloadService` (short-lived HMAC download tokens, HTTP `Range` 206 streaming, `OFFLINE_MAX_UPLOAD_MB=1024`), `Class10OfflineDownloadPlugin.kt` (`StatFs` check, 64 KB chunks, Range resume, SHA-256 verification). | Configured `OFFLINE_VIDEO_STORAGE_PROVIDER=persistent_disk` on Render **Free** (`0` disks -> ephemeral!). `supabase_storage` has `0` buckets and **50 MB** cap vs **123.82 MB** video. No Pause/Resume UI state. | Durable private storage (**Cloudflare R2** S3-compatible upload + signed streaming or upgraded paid disk/Supabase Pro), unified `PlaybackService` streaming for uploaded MP4s, **Pause / Resume Download** state in Kotlin + React UI (`Paused -> Resume Download`). |
| **11–12. App-Private Encrypted Storage & Media3 Player** | **`OfflineVideoVault.kt` + `AuthenticatedChunkedCipher.kt` + `AndroidKeystoreKeyWrapper` + `EncryptedOfflineDataSource.kt` + `LmsMedia3PlayerActivity.kt`:** app-private `noBackupFilesDir/offline_lessons/`, `.nomedia`, `allowBackup="false"`, Keystore AES-256-GCM DEK wrapping, `EncryptedSharedPreferences`, 64 KB chunk AES-256-GCM (`salt8||chunkIdx`, AAD `c10v2|lessonId|studentId|chunkIdx`), $O(1)$ seek in Media3, watermark, `FLAG_SECURE`, A15 screen recording callback. | Preserved and verified intact! | Add **time-limited Offline Entitlement / License check** before decryption inside `OfflineVideoVault.kt`. Minor cleanup: update stale comments referencing CTR (`Class10OfflineDownloadPlugin.kt:27`, `EncryptedOfflineDataSource.kt:16`). |
| **13. Offline Access & Entitlement Policy** | `OfflineVideoVault` persists `.enc` + metadata across app restarts cleanly. | Currently hardcodes `OFFLINE_RETENTION_POLICY=wipe_on_logout` in `AuthContext.jsx:173` & deletes all downloads on ordinary logout! Zero offline expiry enforcement. | Change default policy so **ordinary logout keeps device-bound `.enc` files encrypted**, wipe only on **device revocation / account switch / explicit clear**, and enforce **signed time-limited offline license TTL / subscription expiry check** with refresh on reconnect. |
| **14–15. Database & Admin Portal** | Migrations `001`–`008`, 39 tables (all RLS-enabled), Admin RBAC, audit logs, CMS CRUD. | **BUG in `VideoLibraryPage.jsx`:** MP4 upload modal only shows items that already have a `lesson_video_sources` row; no teacher name, concepts/revision UI, or download monitoring page. | Additive migration `009` (username, teacher_name, concepts, revision points, plans, offline licenses, webhook event log). Unified Admin Lesson Editor (upload MP4, thumbnail, notes, concepts, revision, PYQs in one workflow) + Admin Download/Subscription Monitor + Admin seed. |

---

## 3. Critical Bugs & Security Issues Found in Current Codebase

### Bugs
1. **BUG-01 — Razorpay UPI / 3DS Checkout Broken on Capacitor Android (`LmsNavigationPolicy.kt:40, 68–85, 168–178`, `MainActivity.kt:154–168`):**
   * `LmsNavigationPolicy.BLOCKED_EXTERNAL_SCHEMES` blocks `upi`, `phonepe`, `tez`, `paytmmp`.
   * `PAYMENT_SUBFRAME_HOSTS` only allows `razorpay.com`, blocking bank ACS / NPCI OTP domains loaded during Card 3D-Secure verification.
   * `MainActivity.WebChromeClient.onCreateWindow()` unconditionally returns `false`, blocking Razorpay's payment verification popup windows.
2. **BUG-02 — Admin Cannot Upload Offline MP4s to New Lessons (`admin-portal/src/pages/VideoLibraryPage.jsx:73`, `LessonsPage.jsx`):**
   * "Offline MP4" button only renders inside `VideoLibraryPage`, which calls `adminApi.listVideos()` (reads `lesson_video_sources`). Newly created lessons without an external/PikPak video source cannot receive an MP4 upload in the Admin UI.
3. **BUG-03 — Student Profile Hardcoded Prompt Strings & Admin Leak (`frontend/src/components/learning/ResourcePanels.jsx:32, 76, 127`, `ChapterDetailPage.jsx:155`, `SubjectDetailPage.jsx:212`, `RevisionZonePage.jsx:110`):**
   * Empty states tell students: *"Upload MP4 videos into this chapter folder... and tap Sync Videos"* or hardcode `"₹499 Pass"` instead of dynamic pricing / student-friendly copy.
4. **BUG-04 — Registration Redirects to Dashboard Instead of Plans (`LoginPage.jsx:48`) & Unpaid Login Not Gated (`App.jsx`):**
   * After Sign Up, `LoginPage.jsx` navigates to `/dashboard` instead of `/subscription`. Students logging in with expired/pending subscriptions also land on `/dashboard`.
5. **BUG-05 — Missing Pause State Cancels & Deletes Partial File (`Class10OfflineDownloadPlugin.kt:509–544`):**
   * Tapping Cancel deletes `.enc.part` and metadata. There is no `pauseDownload` method that halts the stream while preserving `.enc.part` and chunk alignment for true "Paused → Resume Download" UX.
6. **BUG-06 — `LoginPage.jsx` Non-Functional "Google" Button (`LoginPage.jsx:340–355`):**
   * Clicking "Google" shows a static notice instead of either real OAuth or being removed cleanly in favor of Email / Username / Mobile login.
7. **BUG-07 — Missing Online Stream Fallback for Uploaded `lesson_video_assets` (`playbackService.js:200–273`):**
   * `PlaybackService.authorizePlayback()` throws `VIDEO_UNAVAILABLE` (404) if an MP4 was uploaded via `/offline-assets/upload` without also creating a `lesson_video_sources` record.
8. **BUG-08 — Ephemeral Storage for Both Videos AND Notes PDFs (`offlineStorageService.js:12`, `adminStoreExtension.js:10`):**
   * Both `backend/storage/offline_videos` and `backend/uploads/resources` write to Render's ephemeral local filesystem on the Free tier, causing total asset loss on restart/redeploy.

### Security & Privacy Problems
1. **SEC-01 — No Signed Offline License / Expiry Enforcement (`OfflineVideoVault.kt`):**
   * Downloaded `.enc` files currently remain playable offline forever until logout, even after a student's 1-month/6-month/12-month subscription expires. Requires a backend-signed, student+device+expiry-bound offline license (`HMAC` or `Ed25519` payload with `subscriptionExpiresAt` + `offlineLeaseExpiresAt`, verified offline and refreshed on reconnect).
2. **SEC-02 — Logout Wipes Downloads Unconditionally (`AuthContext.jsx:180`, `env.js:63–65`):**
   * `wipe_on_logout` deletes valid paid offline content if a student signs out temporarily, contradicting Step 13 guidance. Keep encrypted files bound to `studentId` (`keep_encrypted_bound_to_student`) and require authenticated re-login + valid license; wipe only on device revocation, suspension, or user delete.
3. **SEC-03 — Single Payment Verification Endpoint Lacks Live Gateway Status Re-Check (`PaymentService.js:206–240`):**
   * `verifyPayment` checks Razorpay HMAC signature cleanly, which proves payload authenticity from Checkout, but also fetching `this.paymentGateway.client.payments.fetch(razorpayPaymentId)` ensures the gateway reports `captured` (or captures if `authorized` with same order ID & trusted amount). Also need webhook duplicate event tracking (`payment_webhook_events` / `webhook_event_id` lookup) even for non-`captured` retries.
4. **SEC-04 — Production Domain `api.class10lms.in` NXDOMAIN & Public GitHub Repo:**
   * `api.class10lms.in` has no DNS CNAME record yet; `MYUSALIFE61/class10-lms-backend` visibility should be switched to Private.

### Honest Limitations of Android Device Security (Master Prompt Section 11 Requirement)
> **Transparency Note:** Hardware-backed `AndroidKeyStore`, `EncryptedSharedPreferences`, chunked AES-256-GCM with per-student AAD, `noBackupFilesDir`, and `FLAG_SECURE` + Android 15 `addScreenRecordingCallback` make casual copying (File Manager, Gallery, VLC, MX Player, ADB non-root backups, screenshots, OS screen recorders) **ineffective**. However, on **rooted/compromised devices with kernel hooks**, custom HDMI capture hardware, or an **external camera pointed at the screen**, no software encryption or OS `FLAG_SECURE` flag can physically guarantee 100% copy-prevention. Play Integrity + per-student dynamic visible watermarking serve as layered deterrence alongside cryptography.

---

## 4. Required Database Schema Changes (Additive Migration Plan)

> Existing schema (`001`–`008`, 39 tables) already covers profiles, sessions, devices, plans, subscriptions, payment transactions, subjects, chapters, topics, lessons, notes, PYQs, formulas, exams, quizzes, `lesson_video_assets`, `student_video_downloads`, and RBAC. We will **reuse existing tables** and propose **Migration `009_master_lms_alignment.sql`** (strictly additive & idempotent):

1. **Extend `public.profiles`:**
   * Add `username TEXT` (case-insensitive unique partial index `UNIQUE (lower(username)) WHERE username IS NOT NULL`), `state TEXT DEFAULT 'Andhra Pradesh'`. *(Reuse existing `school`, `district`, `class_name`, `board`, `phone` added in `006`)*.
   * Add unique index on `phone` (when non-null) so students can log in via mobile number or prevent duplicate phone signups if desired (or handle gracefully).
2. **Extend `public.subscription_plans`:**
   * Add `features_json JSONB DEFAULT '[]'::jsonb`, `duration_label TEXT`, `sort_order INTEGER DEFAULT 1`.
   * Seed the 3 required plans (`CLASS10_MONTHLY_200` ₹200 / 30d, `CLASS10_HALFYEAR_500` ₹500 / 180d, `CLASS10_ANNUAL_799` ₹799 / 365d) and deactivate legacy `CLASS10_ANNUAL_499` if approved.
3. **Extend `public.subscriptions` & `public.payment_transactions`:**
   * Expand `subscriptions.status` CHECK constraint to include `('pending', 'active', 'expired', 'revoked', 'cancelled', 'failed')`.
   * Add `payment_status TEXT`, `plan_name_snapshot TEXT`, `amount_paise INTEGER` (or join with plan/tx) so subscription records capture full snapshot metadata directly.
   * Create `public.payment_webhook_events (id UUID PK, gateway_event_id TEXT UNIQUE, event_type TEXT, order_id TEXT, payment_id TEXT, payload_json JSONB, processed_at TIMESTAMPTZ)` with RLS enabled & revoked from `anon`/`authenticated` for strict multi-event webhook idempotency.
4. **Extend `public.lessons` + New Lesson Learning Tables:**
   * Add `teacher_name TEXT DEFAULT 'Class 10 SSC Faculty'` on `public.lessons`.
   * Add `public.lesson_concepts (id UUID PK, subject_id, chapter_id, lesson_id, title, summary, explanation_markdown, display_order, is_premium, is_active, created_at)` with RLS (`has_active_subscription` or free preview).
   * Add `public.lesson_revision_points (id UUID PK, subject_id, chapter_id, lesson_id, point_type CHECK ('definition','formula','key_point','explanation'), title, content_markdown, formula_expression, display_order, is_premium, is_active, created_at)` with RLS.
   * Allow `lesson_id` filtering on `previous_exam_questions` (`ADD COLUMN IF NOT EXISTS lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL`, plus `question_type TEXT DEFAULT 'short_answer'`).
   * Extend `study_resources` / `offline` notes: support `storage_provider` (`persistent_disk`, `supabase_storage`, `cloudflare_r2`) & `storage_key` on `study_resources` so handwritten notes PDFs persist across Render restarts!
5. **Offline License & Pause State on `public.student_video_downloads`:**
   * Expand `download_status` CHECK to include `'paused'`.
   * Add `public.offline_license_records (id UUID PK, student_id, download_id, device_id, license_expires_at, subscription_expires_at, issued_at, revoked_at, signature TEXT)` with RLS (`auth.uid() = student_id` SELECT only).

---

## 5. Complete List of Files Requiring Modification (By Phase)

### Android Native (`frontend/android/app/src/main/java/in/class10lms/ssc/`)
* `LmsNavigationPolicy.kt` & `MainActivity.kt` — Support Razorpay Checkout WebView & UPI/Bank 3DS flows securely (or integrate native `com.razorpay:checkout` SDK plugin + keep strict YouTube blocking!).
* `Class10OfflineDownloadPlugin.kt` — Add `@PluginMethod fun pauseDownload`, preserve `.enc.part` on pause, clean up stale `CTR` comments.
* `OfflineVideoVault.kt` — Add `STATUS_PAUSED`, offline signed license metadata storage & expiry validation (`offlineLicenseExpiresAt`, `subscriptionExpiresAt`), retain encrypted files on normal logout (`clearDownloadsOnLogout` only for device change/switch/revocation).
* `LmsMedia3PlayerActivity.kt` — Enforce offline license expiry check before opening `EncryptedOfflineDataSource`.

### React Student App (`frontend/src/`)
* New Pages:
  * `pages/WelcomePage.jsx` (Logo, intro, Sign Up, Sign In, Terms & Conditions, Privacy Policy links/modals)
  * `pages/CheckoutPage.jsx`, `pages/PaymentResultPage.jsx` (Success animation + Login CTA, Failure retry, Pending Verification)
  * `pages/ForgotPasswordPage.jsx`
  * `pages/LegalPage.jsx` (Terms & Conditions + Privacy Policy)
* Updated Files:
  * `App.jsx` — Unauthenticated root -> `/welcome`; routes for `/signup`, `/checkout/:planCode`, `/payment-result`, `/forgot-password`, `/legal/:doc`, `/renewal`; subscription gate wrapper redirecting unpaid/expired students cleanly on login.
  * `LoginPage.jsx` — Split/clean Sign Up form (all required fields + confirm password + strength rules) and Sign In form (username/email/mobile + password + Forgot Password).
  * `SubscriptionPage.jsx` — 3 plans (₹200 / ₹500 / ₹799) + Renewal mode + Select Plan -> `/checkout/:planCode`.
  * `DashboardPage.jsx`, `SubjectDetailPage.jsx`, `ChapterDetailPage.jsx` — Subscription expiry banner, Downloaded Videos shortcut, chapter thumbnails/progress/lesson counts, remove PikPak/₹499 legacy copy.
  * `LessonPlayerPage.jsx`, `LessonDetailsScreen.jsx`, `ResourcePanels.jsx` — Teacher name, online fallback playback, Handwritten Notes PDF/Image zoom+scroll+offline viewer, Important Concepts tab, Quick Revision tab, Lesson-scoped PYQs tab.
  * `VideoDownloadButton.jsx`, `offlineDownloadService.js`, `MyDownloadsScreen.jsx`, `AuthContext.jsx` — True **Paused / Resume Download** UI + state machine, offline license token validation & refresh on reconnect, non-destructive ordinary logout policy.

### Backend (`backend/src/`)
* `routes/auth.routes.js`, `services/authService.js`, `services/supabaseAuthProvider.js` — Username/mobile login lookup, uniqueness validation, expanded registration fields (`username`, `state`, `district`, `schoolName`, `className`), Forgot Password / Reset flow, subscription status in login response.
* `routes/subscriptions.routes.js`, `routes/payments.routes.js`, `services/paymentService.js` — Razorpay `payments.fetch()` dual-verification, pending status endpoint, `payment_webhook_events` idempotency, plan validity extension for renewals.
* `services/offlineStorageService.js`, `services/playbackService.js`, `services/offlineDownloadService.js` — Cloudflare R2 / durable upload adapter (once user provides/approves storage), online streaming support from `lesson_video_assets`, signed offline license issuance/refresh endpoints, PDF/notes durable storage.
* `services/adminCmsService.js`, `services/adminOperationsService.js`, `services/studentDynamicService.js`, `repositories/supabaseStore.js`, `repositories/adminStoreExtension.js` — Support `teacherName`, concepts, revision points, lesson-scoped PYQs, admin download monitoring.

### Admin Portal (`admin-portal/src/`)
* `LessonsPage.jsx`, `VideoLibraryPage.jsx`, `ResourcesPage.jsx`, `OperationsPages.jsx`, `services/adminApi.js` — Unified Lesson Studio (create/publish lesson + upload MP4 directly + upload thumbnail + associate notes PDF + manage Important Concepts + Quick Revision + PYQs) and Download Monitoring dashboard.

---

## 6. Phased Execution Roadmap (Phases 2–10)

| Phase | Target Scope | Dependencies / User Inputs Needed |
| :---: | :--- | :--- |
| **Phase 2** | **Welcome, Registration & 3 Subscription Plans** (Migration `009` + Welcome/Signup/Legal/Plans UI + Backend username/mobile registration) | Approval to apply Migration `009` & replace/update `CLASS10_ANNUAL_499` with ₹200 / ₹500 / ₹799 plans |
| **Phase 3** | **Razorpay Checkout, UPI/Card Android Fix & Result Screens** (Dual verification, webhook idempotency, Success/Fail/Pending screens, `LmsNavigationPolicy` UPI/3DS fix) | Decide whether to test with Razorpay **Test Mode keys** temporarily during QA before keeping Live keys |
| **Phase 4** | **Subscription-Gated Login, Forgot Password & Enhanced Dashboard/Chapters** | Builds cleanly on Phase 2–3 |
| **Phase 5** | **Durable Video/Notes Storage & Unified Admin Content Studio** | **Critical Decision Needed:** Choose Durable Storage (Cloudflare R2 credentials OR Render Starter + Persistent Disk OR Supabase Pro) + Admin credentials (`rk5759706@gmail.com`) |
| **Phase 6** | **Secure Video Download Pause/Resume & Offline License Issuance** | Builds on Phase 5 |
| **Phase 7** | **Internal Offline Media3 Player & Entitlement Expiry Verification** | Preserve AES-256-GCM + add signed license TTL validation |
| **Phase 8** | **Lesson Learning Page Completion** (Teacher name, Zoomable/Offline PDF/Image Notes Viewer, Important Concepts, Quick Revision, Lesson PYQs) | Migration `009` tables |
| **Phase 9** | **Real-Device E2E, File Manager/VLC/MX Isolation & Airplane Mode QA** (`iQOO Z7s 5G`) | Physical device reconnected via USB + `api.class10lms.in` DNS CNAME set |
| **Phase 10** | **Production Migrations, Play Release AAB, Legal Pages & Launch Checklist** | Keystore / Play Console release readiness |

---

## 7. Phase 2 Implementation Results & Verification Evidence (Completed — Ready for Phase 3 Approval)

**Execution Date:** November 26, 2026 (23:10 IST)  
**Scope:** Welcome Screen, Complete Student Registration, Username Uniqueness, Legal Screens, Three Backend-Controlled Subscription Plans (`₹200` / `₹500` / `₹799`), Pending State, and Subscription Routing Gate (No Live Payment Transactions).

### Exact Files Created & Modified
* **Database Migrations (Reversible — Pending Approved Maintenance Window Before Production Execution):**
  * Added `supabase/migrations/009_phase2_registration_and_plans.sql`: adds `username` and `state` to `public.profiles`, unique index `uq_profiles_username_lower`, non-unique lookup index `idx_profiles_phone_nonempty`, expands `subscriptions` status constraint to `('pending', 'active', 'expired', 'revoked', 'cancelled', 'failed')`, adds `duration_label`, `features_json`, `display_order`, `is_recommended` to `public.subscription_plans`, marks legacy `CLASS10_ANNUAL_499` inactive (`is_active = FALSE` without deleting historical FKs), and upserts `CLASS10_MONTHLY_200` (`₹200` / 30d), `CLASS10_HALFYEAR_500` (`₹500` / 180d), and `CLASS10_ANNUAL_799` (`₹799` / 365d).
  * Added `supabase/migrations/rollbacks/009_phase2_registration_and_plans.rollback.sql` for full reversibility.
  * *Production Safety:* Migration `009` has **not** yet been executed against the live Supabase project or pushed to the auto-deploy Render `main` branch so the running Phase 1 production service (`srv-dc41v1vf3r2c73a29agg`) remains uninterrupted until Phase 2 deployment/migration approval.
* **Backend (`backend/`):**
  * `src/repositories/supabaseStore.js`: added `getProfileByUsername`, `getProfileByPhone`, `getPlanById`, `{ activeOnly }` support on `getPlanByCode`, and JS ordering by `display_order` + `price_paise` in `listActivePlans`.
  * `src/routes/auth.routes.js` & `src/services/authService.js`: added `GET /api/v1/auth/check-username`, extended `/auth/register` & `/auth/me` with `username`, `confirmPassword`, strong password check (uppercase + lowercase + number), `state`, `district`, `schoolName`, `className`, `USERNAME_EXISTS` conflict enforcement (`409`), and normalized `subscription` summary via `buildSubscriptionSummary` & `formatStudentProfileDto`.
  * `src/services/paymentService.js` & `src/routes/subscriptions.routes.js`: added `POST /api/v1/subscriptions/select-plan` (`selectPendingPlan`), `formatPlanDto`, server-controlled duration resolution via `getPlanById`, inactive-plan rejection for explicit selection (`CLASS10_ANNUAL_499` returns `404`), and unpaid/pending/cancelled/failed enforcement blocking paid lesson playback (`403 SUBSCRIPTION_REQUIRED` / `SUBSCRIPTION_UNPAID`).
  * `tests/helpers/testHarness.js`, `scripts/dev-preview-server.js`, and new `tests/phase2_onboarding_and_plans.test.js`.
* **Frontend (`frontend/`):**
  * Added `src/pages/WelcomePage.jsx` (branded welcome card, Sign Up, Sign In, Terms & Privacy footer links).
  * Added `src/pages/SignupPage.jsx` (Full Name, Mobile Number, Email Address, Username with live debounced availability badge, Board, Class, State, District, School Name, Password strength rules, Confirm Password matching, legal consent, and strict post-signup routing to `/subscription`).
  * Added `src/pages/LegalPage.jsx` (Terms & Conditions `/terms` and Privacy Policy `/privacy`).
  * Updated `src/App.jsx`, `src/services/lmsApi.js`, `src/context/AuthContext.jsx`, `src/pages/LoginPage.jsx`, `src/pages/SubscriptionPage.jsx`, `src/pages/ProfileSettingsPage.jsx`, and `src/styles/app.css` to enforce `PublicOnlyRoute`, `SubscriptionRequiredRoute`, `/subscription` (unpaid/pending), `/renewal` (expired), `/dashboard` (active), and interactive 3-plan selection without triggering live Razorpay charges.
  * Added `src/test/phase2_welcome_signup_plans.test.jsx`.

### Verification & Test Evidence
1. **Backend Automated Tests (`npx vitest run` & `npm run lint:syntax`):** **9 test files passed (9), 29 tests passed (29)** — including 3 new Phase 2 onboarding/plan tests (`phase2_onboarding_and_plans.test.js`) verifying username uniqueness, password/confirmPassword rules, state/district/school persistence, all 3 plan prices/durations (`20000`/`30d`, `50000`/`180d`, `79900`/`365d`), pending status without activation, expired status detection, and unpaid lesson blocking (`403`).
2. **Frontend Automated Tests (`npx vitest run --no-file-parallelism`) & Build (`npx vite build`):** **6 test files passed (6), 23 tests passed (23)**, and Vite production bundle succeeded (`1642 modules transformed`, 0 errors).
3. **Interactive Headless Browser Verification (`http://localhost:5173` + local preview backend `http://localhost:4000`):** Verified zero console errors across Welcome (`/`), Legal (`/terms`, `/privacy`), Signup (`/signup`), strict post-signup redirect to `/subscription` with 3 plans (`₹200` / `₹500` / `₹799`), pending selection (`PENDING VERIFICATION` without live payment), strict unpaid block redirecting `/dashboard` & `/lessons/*` -> `/subscription`, and expired login redirecting `expired@ts10.in` -> `/renewal`. Artifacts saved: `phase2_welcome.png`, `phase2_legal_privacy.png`, `phase2_signup.png`, `phase2_plans.png`, `phase2_pending_state.png`, `phase2_expired_renewal.png`. *(Note: Desktop Chrome MCP attach did not connect because `chrome://inspect/#remote-debugging` `DevToolsActivePort` is not active on the host Chrome profile, so verification screenshots were captured cleanly via isolated headless Microsoft Edge.)*

---

**Phase 2 Complete — Stopped prior to Phase 3 awaiting your separate approval.**
