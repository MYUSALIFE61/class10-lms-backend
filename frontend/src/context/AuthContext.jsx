import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  clearTokens,
  loadStoredTokens,
  onUnauthorizedSession,
  saveTokens,
} from '../services/apiClient.js';
import { lmsApi } from '../services/lmsApi.js';
import { getSecureItem, removeSecureItem, setSecureItem } from '../services/nativeBridge.js';
import {
  flushPendingOfflineSync,
  offlineDownloadService,
} from '../services/offlineDownloadService.js';

const AuthContext = createContext(null);
const CACHED_SESSION_KEY = 'offline_cached_student_profile';

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading'); // loading | authenticated | unauthenticated
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [device, setDevice] = useState(null);
  const [sessionAlert, setSessionAlert] = useState(null);
  const userRef = useRef(null);
  userRef.current = user;

  const persistSessionSnapshot = useCallback(async (snapshot) => {
    try {
      await setSecureItem(CACHED_SESSION_KEY, snapshot);
    } catch {
      // Non-fatal
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setStatus('loading');
    const tokens = await loadStoredTokens();
    if (!tokens?.accessToken) {
      setUser(null);
      setSubscription(null);
      setStatus('unauthenticated');
      return;
    }

    try {
      const data = await lmsApi.getMe();
      setUser(data.user);
      setSubscription(data.subscription);
      setDevice(data.device);
      await persistSessionSnapshot({
        user: data.user,
        subscription: data.subscription,
        device: data.device,
      });
      setStatus('authenticated');
      flushPendingOfflineSync().catch(() => {});
    } catch (err) {
      // Offline restart resilience: preserve authenticated session when device has no internet
      // so students can open My Downloads and play verified encrypted lessons offline.
      const isNetworkFailure =
        err?.status === 0 ||
        err?.code === 'NETWORK_OFFLINE' ||
        err?.code === 'REQUEST_TIMEOUT' ||
        (typeof navigator !== 'undefined' && navigator.onLine === false);

      if (isNetworkFailure) {
        const rawCached = await getSecureItem(CACHED_SESSION_KEY);
        if (rawCached) {
          try {
            const cached = JSON.parse(rawCached);
            if (cached?.user?.id) {
              setUser(cached.user);
              setSubscription(cached.subscription || null);
              setDevice(cached.device || null);
              setStatus('authenticated');
              return;
            }
          } catch {
            // Fall through to unauthenticated
          }
        }
      }

      await clearTokens();
      await removeSecureItem(CACHED_SESSION_KEY);
      setUser(null);
      setSubscription(null);
      setStatus('unauthenticated');
    }
  }, [persistSessionSnapshot]);

  useEffect(() => {
    bootstrap();
    const unsubUnauth = onUnauthorizedSession(async (reason) => {
      const currentUid = userRef.current?.id || '';
      await removeSecureItem(CACHED_SESSION_KEY);
      await offlineDownloadService.clearDownloadsOnLogout({ studentId: currentUid }).catch(() => {});
      setUser(null);
      setSubscription(null);
      setStatus('unauthenticated');
      setSessionAlert(
        reason === 'DEVICE_REVOKED'
          ? 'This device was revoked. Please sign in again.'
          : 'Your session ended. Please sign in again.'
      );
    });

    const handleOnline = () => {
      flushPendingOfflineSync().catch(() => {});
    };
    window.addEventListener('online', handleOnline);

    return () => {
      unsubUnauth();
      window.removeEventListener('online', handleOnline);
    };
  }, [bootstrap]);

  const login = useCallback(
    async ({ email, password }) => {
      setSessionAlert(null);
      const data = await lmsApi.login({ email, password });
      await saveTokens(data.tokens);
      setUser(data.user);
      setDevice(data.device);
      const me = await lmsApi.getMe();
      setSubscription(me.subscription);
      await persistSessionSnapshot({
        user: data.user,
        subscription: me.subscription,
        device: data.device,
      });
      setStatus('authenticated');
      flushPendingOfflineSync().catch(() => {});
      return data;
    },
    [persistSessionSnapshot]
  );

  const register = useCallback(
    async (payload) => {
      setSessionAlert(null);
      const data = await lmsApi.register(payload);
      await saveTokens(data.tokens);
      const sub = { status: 'unpaid', isActive: false, startsAt: null, expiresAt: null };
      setUser(data.user);
      setDevice(data.device);
      setSubscription(sub);
      await persistSessionSnapshot({
        user: data.user,
        subscription: sub,
        device: data.device,
      });
      setStatus('authenticated');
      return data;
    },
    [persistSessionSnapshot]
  );

  const refreshProfile = useCallback(async () => {
    const me = await lmsApi.getMe();
    setUser(me.user);
    setSubscription(me.subscription);
    setDevice(me.device);
    await persistSessionSnapshot({
      user: me.user,
      subscription: me.subscription,
      device: me.device,
    });
    return me;
  }, [persistSessionSnapshot]);

  const logout = useCallback(async ({ allDevices = false, retentionPolicy = 'wipe_on_logout' } = {}) => {
    const currentUid = userRef.current?.id || '';
    try {
      await lmsApi.logout({ allDevices });
    } catch {
      // Clear local credentials regardless of network errors
    }
    await offlineDownloadService
      .clearDownloadsOnLogout({ studentId: currentUid, retentionPolicy })
      .catch(() => {});
    await clearTokens();
    await removeSecureItem(CACHED_SESSION_KEY);
    setUser(null);
    setSubscription(null);
    setDevice(null);
    setStatus('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        subscription,
        device,
        sessionAlert,
        clearSessionAlert: () => setSessionAlert(null),
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
