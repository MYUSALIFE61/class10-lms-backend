import { APP_CONFIG } from '../config/env.js';
import {
  getSecureItem,
  removeSecureItem,
  setSecureItem,
  getDeviceMetadata,
} from './nativeBridge.js';

const TOKEN_STORAGE_KEY = 'auth_tokens';

export class ApiClientError extends Error {
  constructor(message, status = 0, code = 'NETWORK_ERROR', details = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let inMemoryTokens = null;
let refreshPromise = null;
let unauthorizedListeners = new Set();

export function onUnauthorizedSession(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized(reason) {
  for (const fn of unauthorizedListeners) {
    try {
      fn(reason);
    } catch {
      // ignore listener errors
    }
  }
}

export async function loadStoredTokens() {
  if (inMemoryTokens) return inMemoryTokens;
  const raw = await getSecureItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    inMemoryTokens = JSON.parse(raw);
    return inMemoryTokens;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens) {
  inMemoryTokens = tokens;
  await setSecureItem(TOKEN_STORAGE_KEY, tokens);
}

export async function clearTokens() {
  inMemoryTokens = null;
  await removeSecureItem(TOKEN_STORAGE_KEY);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiClientError(
        'Request timed out on slow network. Please check your connection and retry.',
        0,
        'REQUEST_TIMEOUT'
      );
    }
    throw new ApiClientError(
      'Unable to reach server. Please check your internet connection.',
      0,
      'NETWORK_OFFLINE'
    );
  } finally {
    clearTimeout(timer);
  }
}

async function performSingleFlightRefresh() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const tokens = await loadStoredTokens();
    if (!tokens?.refreshToken) {
      throw new ApiClientError('Session expired', 401, 'NO_REFRESH_TOKEN');
    }

    const device = await getDeviceMetadata(APP_CONFIG.appVersion);
    const res = await fetchWithTimeout(`${APP_CONFIG.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': device.deviceId,
        'X-App-Version': APP_CONFIG.appVersion,
      },
      body: JSON.stringify({
        refreshToken: tokens.refreshToken,
        deviceId: device.deviceId,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.data?.tokens) {
      await clearTokens();
      notifyUnauthorized(json?.error?.code || 'REFRESH_FAILED');
      throw new ApiClientError(
        json?.error?.message || 'Session expired. Please sign in again.',
        res.status,
        json?.error?.code || 'SESSION_EXPIRED'
      );
    }

    await saveTokens(json.data.tokens);
    return json.data.tokens;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiRequest(
  path,
  { method = 'GET', body = undefined, auth = true, headers = {}, timeoutMs = 15000 } = {}
) {
  const device = await getDeviceMetadata(APP_CONFIG.appVersion);
  const tokens = auth ? await loadStoredTokens() : null;

  const buildHeaders = (accessToken) => ({
    'Content-Type': 'application/json',
    'X-Device-Id': device.deviceId,
    'X-App-Version': APP_CONFIG.appVersion,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...headers,
  });

  const execute = async (accessToken) => {
    const res = await fetchWithTimeout(
      `${APP_CONFIG.apiBaseUrl}${path}`,
      {
        method,
        headers: buildHeaders(accessToken),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
      timeoutMs
    );
    const json = await res.json().catch(() => ({}));
    return { res, json };
  };

  let { res, json } = await execute(tokens?.accessToken);

  // Automatic silent refresh on expired access token
  if (
    auth &&
    res.status === 401 &&
    tokens?.refreshToken &&
    ['TOKEN_EXPIRED', 'UNAUTHORIZED'].includes(json?.error?.code)
  ) {
    const newTokens = await performSingleFlightRefresh();
    ({ res, json } = await execute(newTokens.accessToken));
  }

  if (!res.ok) {
    const errCode = json?.error?.code || 'API_ERROR';
    if (
      auth &&
      res.status === 401 &&
      ['SESSION_REVOKED', 'DEVICE_REVOKED', 'TOKEN_REUSE_DETECTED', 'SESSION_EXPIRED'].includes(
        errCode
      )
    ) {
      await clearTokens();
      notifyUnauthorized(errCode);
    }
    throw new ApiClientError(
      json?.error?.message || `Request failed (${res.status})`,
      res.status,
      errCode,
      json?.error?.details || null
    );
  }

  return json.data;
}
