import React, { createContext, useContext, useEffect, useState } from 'react';
import { adminApi, getAdminToken, setAdminToken } from '../services/adminApi.js';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    const token = getAdminToken();
    if (!token) {
      setAdmin(null);
      setLoading(false);
      return;
    }
    try {
      const res = await adminApi.me();
      setAdmin(res.admin);
    } catch {
      setAdminToken('');
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMe();
  }, []);

  const login = async (email, password) => {
    const res = await adminApi.login(email, password);
    setAdminToken(res.tokens.accessToken);
    setAdmin(res.admin);
    return res.admin;
  };

  const logout = async () => {
    try {
      await adminApi.logout();
    } catch {
      // ignore network error on logout
    }
    setAdminToken('');
    setAdmin(null);
  };

  const can = (perm) => {
    if (!admin) return false;
    if (admin.permissions?.includes('*')) return true;
    if (Array.isArray(perm)) return perm.some((p) => admin.permissions?.includes(p));
    return Boolean(admin.permissions?.includes(perm));
  };

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout, can, refresh: loadMe }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
