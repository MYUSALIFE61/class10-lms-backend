# PHASE 9.0 — DOMAIN, DNS & TLS CHECKLIST (`staging-api.class10lms.in`)

**Target Staging API Domain:** `staging-api.class10lms.in`
**Existing Production Domain (DO NOT MODIFY):** `api.class10lms.in` (`cdm-dc4216p5efls73cr9l30` -> `srv-dc41v1vf3r2c73a29agg`)
**Status:** Preparation Only — **Zero** DNS edits or Render custom domain registrations executed.

---

## 1. Required DNS Record Specification

After provisioning `class10-lms-backend-staging` on Render, attach custom domain `staging-api.class10lms.in` inside Render Dashboard -> Settings -> Custom Domains and read the **exact Render-assigned target hostname** (`<assigned-staging-service>.onrender.com`, never guessed upfront).

Add this record at the DNS registrar managing `class10lms.in`:

| Field | Value | Notes |
| :--- | :--- | :--- |
| **Type** | `CNAME` | Subdomain alias |
| **Host / Name** | `staging-api` | Resolves `staging-api.class10lms.in` |
| **Target / Value** | `<render-provided-staging-hostname>` | Exact `.onrender.com` hostname displayed by Render after service creation |
| **TTL** | `300` *(5 minutes)* or `Auto` | Fast propagation for staging verification |
| **Proxy Status** | DNS-only *(if using Cloudflare)* during Render TLS issuance | Lets Render complete HTTP-01 Let's Encrypt verification cleanly |

---

## 2. Verification Procedures (Run After DNS Propagation)

1. **DNS Resolution Verification (PowerShell):**
   ```powershell
   Resolve-DnsName staging-api.class10lms.in -Type CNAME
   Resolve-DnsName staging-api.class10lms.in
   ```
   Verify `api.class10lms.in` remains untouched (`Resolve-DnsName api.class10lms.in` compared against baseline).
2. **Render Custom Domain & Let's Encrypt Certificate Verification:**
   - Render Domain Status shows **Verified** and **Certificate Issued**.
   - Verify TLS handshake & certificate chain:
     ```powershell
     curl.exe -vI https://staging-api.class10lms.in/health
     ```
     Confirm HTTP `200 OK`, TLS 1.2/1.3 valid issuer (Let's Encrypt / Google Trust Services), CN/SAN includes `staging-api.class10lms.in`, and JSON payload `{"success":true,"status":"ok","service":"class10-lms-backend",...}`.
3. **CORS Origin Alignment:**
   - Staging backend `ALLOWED_ORIGINS` must list:
     - `https://app.class10lms.in` *(Capacitor WebView origin configured in `frontend/capacitor.config.json`)*
     - `https://localhost` *(fallback Capacitor origin)*
     - `https://<staging-admin-portal-origin>` *(exact Render Static Site / Vercel staging URL for Admin Portal)*
   - Verify preflight `OPTIONS` from `https://app.class10lms.in` succeeds (`Access-Control-Allow-Origin: https://app.class10lms.in`, `Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length, X-Content-SHA256`), and unauthorized origins receive `403 CORS_FORBIDDEN`.
