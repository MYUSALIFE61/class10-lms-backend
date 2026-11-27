const DEFAULT_PROD_API_BASE_URL = 'https://api.class10lms.in/api/v1';

function isLoopback(url) {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?/i.test(url);
}

const IS_STRICT_PROD = Boolean(import.meta.env.PROD) && import.meta.env.MODE !== 'development';

function resolveDefaultApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    const custom = import.meta.env.VITE_API_BASE_URL.trim();
    if (IS_STRICT_PROD && isLoopback(custom)) {
      throw new Error(
        `[SECURITY ERROR] Production builds must NEVER use loopback/localhost API endpoints (got: ${custom}). Set a verified HTTPS production URL in VITE_API_BASE_URL.`
      );
    }
    return custom;
  }

  // In Vite dev server, development builds, or test runner, proxy via /api/v1 or local dev backend.
  // Strict production builds NEVER fall back to localhost.
  if (import.meta.env.DEV || import.meta.env.MODE === 'development' || import.meta.env.MODE === 'test') {
    if (
      typeof window !== 'undefined' &&
      window.location?.protocol === 'http:' &&
      window.location?.port === '5173'
    ) {
      return '/api/v1';
    }
    return 'http://localhost:4000/api/v1';
  }

  return DEFAULT_PROD_API_BASE_URL;
}

const resolvedApiBaseUrl = resolveDefaultApiBaseUrl().replace(/\/$/, '');

export const APP_CONFIG = {
  apiBaseUrl: resolvedApiBaseUrl,
  appName: import.meta.env.VITE_APP_NAME || 'Class 10 SSC LMS',
  appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || 'support@class10lms.in',
  isProduction: IS_STRICT_PROD,
  isDevelopment: Boolean(import.meta.env.DEV) || import.meta.env.MODE === 'development',
};

export function validateRuntimeConfig() {
  if (APP_CONFIG.isProduction) {
    if (!APP_CONFIG.apiBaseUrl.startsWith('https://')) {
      throw new Error(
        `[SECURITY ERROR] Production API base URL must use HTTPS (got: ${APP_CONFIG.apiBaseUrl})`
      );
    }
    if (isLoopback(APP_CONFIG.apiBaseUrl)) {
      throw new Error(
        `[SECURITY ERROR] Production API base URL cannot be localhost or loopback (got: ${APP_CONFIG.apiBaseUrl})`
      );
    }
  }
  return true;
}
