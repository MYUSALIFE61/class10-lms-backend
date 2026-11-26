import crypto from 'node:crypto';
import { AppError } from '../utils/errors.js';

function throwIfErr(error, ctx) {
  if (error) throw new AppError(`${ctx}: ${error.message}`, 500, 'DATABASE_ERROR');
}

/**
 * Extends existing InMemoryDataStore or SupabaseDataStore with Gamification Profile,
 * Achievements, and Video-Quiz lookup helpers (zero duplicate DB connections).
 */
export function ensureGamificationStoreSupport(store) {
  if (store.__gamificationExtended) return store;
  store.__gamificationExtended = true;

  const isSupabase = Boolean(store.db && typeof store.db.from === 'function');
  if (isSupabase) {
    const db = store.db;
    store.getGamificationProfile = async (userId) => {
      const { data, error } = await db
        .from('student_gamification_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      throwIfErr(error, 'getGamificationProfile');
      return data;
    };
    store.upsertGamificationProfile = async (row) => {
      const { data, error } = await db
        .from('student_gamification_profiles')
        .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .select('*')
        .single();
      throwIfErr(error, 'upsertGamificationProfile');
      return data;
    };
    store.listAllGamificationProfiles = async () => {
      const { data, error } = await db
        .from('student_gamification_profiles')
        .select('*')
        .order('total_xp', { ascending: false })
        .limit(100);
      throwIfErr(error, 'listAllGamificationProfiles');
      return data || [];
    };
    store.listStudentAchievements = async (userId) => {
      const { data, error } = await db
        .from('student_achievements')
        .select('*')
        .eq('user_id', userId)
        .order('awarded_at', { ascending: false });
      throwIfErr(error, 'listStudentAchievements');
      return data || [];
    };
    store.grantAchievement = async (row) => {
      const { data, error } = await db
        .from('student_achievements')
        .upsert(row, { onConflict: 'user_id,badge_code,entity_id', ignoreDuplicates: true })
        .select('*')
        .maybeSingle();
      throwIfErr(error, 'grantAchievement');
      return data;
    };
    return store;
  }

  // InMemoryDataStore extension
  store.gamificationProfiles = store.gamificationProfiles || new Map();
  store.studentAchievements = store.studentAchievements || [];

  store.getGamificationProfile = async (userId) => store.gamificationProfiles.get(userId) || null;
  store.upsertGamificationProfile = async (row) => {
    const existing = store.gamificationProfiles.get(row.user_id) || {};
    const next = { ...existing, ...row, updated_at: new Date().toISOString() };
    store.gamificationProfiles.set(row.user_id, next);
    return next;
  };
  store.listAllGamificationProfiles = async () =>
    [...store.gamificationProfiles.values()].sort((a, b) => (b.total_xp || 0) - (a.total_xp || 0));

  store.listStudentAchievements = async (userId) =>
    store.studentAchievements
      .filter((a) => a.user_id === userId)
      .sort((a, b) => new Date(b.awarded_at) - new Date(a.awarded_at));

  store.grantAchievement = async (row) => {
    const entityKey = row.entity_id || 'global';
    const exists = store.studentAchievements.find(
      (a) => a.user_id === row.user_id && a.badge_code === row.badge_code && a.entity_id === entityKey
    );
    if (exists) return null;
    const rec = {
      id: crypto.randomUUID(),
      entity_id: entityKey,
      awarded_at: new Date().toISOString(),
      ...row,
    };
    store.studentAchievements.push(rec);
    return rec;
  };

  return store;
}
