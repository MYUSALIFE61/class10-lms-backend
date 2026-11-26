import crypto from 'node:crypto';
import { AppError } from '../utils/errors.js';

function throwIfErr(error, ctx) {
  if (error) {
    throw new AppError(`${ctx}: ${error.message}`, 500, 'DATABASE_ERROR');
  }
}

/**
 * Extends existing InMemoryDataStore OR SupabaseDataStore with Authorized Offline Video Asset
 * and Student Download Metadata repository methods (zero duplicate lesson tables or DB clients).
 */
export function ensureOfflineDownloadStoreSupport(store) {
  if (store.__offlineDownloadsExtended) return store;
  store.__offlineDownloadsExtended = true;

  const isSupabase = Boolean(store.db && typeof store.db.from === 'function');
  if (isSupabase) {
    attachSupabaseOfflineMethods(store);
    return store;
  }

  attachInMemoryOfflineMethods(store);
  return store;
}

function attachSupabaseOfflineMethods(store) {
  const db = store.db;

  // ---- Lesson Video Assets ----
  store.listLessonVideoAssets = async (lessonId, { onlyReady = true } = {}) => {
    let query = db
      .from('lesson_video_assets')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (onlyReady) {
      query = query.eq('is_downloadable', true).eq('transcoding_status', 'ready');
    }
    const { data, error } = await query;
    throwIfErr(error, 'listLessonVideoAssets');
    return data || [];
  };

  store.getLessonVideoAssetById = async (assetId) => {
    const { data, error } = await db
      .from('lesson_video_assets')
      .select('*')
      .eq('id', assetId)
      .maybeSingle();
    throwIfErr(error, 'getLessonVideoAssetById');
    return data;
  };

  store.getDefaultDownloadableAssetForLesson = async (lessonId) => {
    const { data, error } = await db
      .from('lesson_video_assets')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('is_downloadable', true)
      .eq('transcoding_status', 'ready')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfErr(error, 'getDefaultDownloadableAssetForLesson');
    return data;
  };

  store.upsertLessonVideoAsset = async (asset) => {
    if (asset.is_default) {
      await db
        .from('lesson_video_assets')
        .update({ is_default: false })
        .eq('lesson_id', asset.lesson_id);
    }

    // Replace existing asset of same lesson + quality_label if present
    const { data: existing } = await db
      .from('lesson_video_assets')
      .select('id')
      .eq('lesson_id', asset.lesson_id)
      .eq('quality_label', asset.quality_label || '720p')
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await db
        .from('lesson_video_assets')
        .update({ ...asset, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*')
        .single();
      throwIfErr(error, 'upsertLessonVideoAsset(update)');
      return data;
    }

    const { data, error } = await db
      .from('lesson_video_assets')
      .insert(asset)
      .select('*')
      .single();
    throwIfErr(error, 'upsertLessonVideoAsset(insert)');
    return data;
  };

  store.deleteLessonVideoAsset = async (assetId) => {
    const { error } = await db.from('lesson_video_assets').delete().eq('id', assetId);
    throwIfErr(error, 'deleteLessonVideoAsset');
    return true;
  };

  // ---- Student Video Downloads ----
  store.getStudentDownloadById = async (downloadId) => {
    const { data, error } = await db
      .from('student_video_downloads')
      .select('*')
      .eq('id', downloadId)
      .maybeSingle();
    throwIfErr(error, 'getStudentDownloadById');
    return data;
  };

  store.getActiveStudentDownload = async ({ studentId, lessonId, deviceId = null }) => {
    let query = db
      .from('student_video_downloads')
      .select('*')
      .eq('student_id', studentId)
      .eq('lesson_id', lessonId)
      .neq('download_status', 'deleted')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (deviceId) {
      query = query.eq('device_id', deviceId);
    } else {
      query = query.is('device_id', null);
    }
    const { data, error } = await query.maybeSingle();
    throwIfErr(error, 'getActiveStudentDownload');
    return data;
  };

  store.listStudentDownloads = async (studentId, { deviceId = null, includeDeleted = false } = {}) => {
    let query = db
      .from('student_video_downloads')
      .select('*')
      .eq('student_id', studentId)
      .order('updated_at', { ascending: false });
    if (deviceId) query = query.eq('device_id', deviceId);
    if (!includeDeleted) query = query.neq('download_status', 'deleted');
    const { data, error } = await query;
    throwIfErr(error, 'listStudentDownloads');
    return data || [];
  };

  store.createStudentDownload = async (record) => {
    const { data, error } = await db
      .from('student_video_downloads')
      .insert(record)
      .select('*')
      .single();
    throwIfErr(error, 'createStudentDownload');
    return data;
  };

  store.updateStudentDownload = async (downloadId, patch) => {
    const { data, error } = await db
      .from('student_video_downloads')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', downloadId)
      .select('*')
      .single();
    throwIfErr(error, 'updateStudentDownload');
    return data;
  };

  store.updateStudentDownloadPositionByLesson = async ({ studentId, lessonId, positionSeconds }) => {
    const { error } = await db
      .from('student_video_downloads')
      .update({
        last_played_position: Math.max(0, Math.floor(Number(positionSeconds) || 0)),
        updated_at: new Date().toISOString(),
      })
      .eq('student_id', studentId)
      .eq('lesson_id', lessonId)
      .neq('download_status', 'deleted');
    throwIfErr(error, 'updateStudentDownloadPositionByLesson');
  };
}

function attachInMemoryOfflineMethods(store) {
  store.lessonVideoAssets = store.lessonVideoAssets || new Map();
  store.studentVideoDownloads = store.studentVideoDownloads || new Map();

  // ---- Lesson Video Assets ----
  store.listLessonVideoAssets = async (lessonId, { onlyReady = true } = {}) => {
    return [...store.lessonVideoAssets.values()]
      .filter((a) => {
        if (a.lesson_id !== lessonId) return false;
        if (onlyReady && (!a.is_downloadable || a.transcoding_status !== 'ready')) return false;
        return true;
      })
      .sort((a, b) => {
        if (Boolean(b.is_default) !== Boolean(a.is_default)) return b.is_default ? 1 : -1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
  };

  store.getLessonVideoAssetById = async (assetId) => store.lessonVideoAssets.get(assetId) || null;

  store.getDefaultDownloadableAssetForLesson = async (lessonId) => {
    const list = await store.listLessonVideoAssets(lessonId, { onlyReady: true });
    return list[0] || null;
  };

  store.upsertLessonVideoAsset = async (asset) => {
    const now = new Date().toISOString();
    const quality = asset.quality_label || '720p';

    if (asset.is_default !== false) {
      for (const existing of store.lessonVideoAssets.values()) {
        if (existing.lesson_id === asset.lesson_id) {
          existing.is_default = false;
        }
      }
    }

    const match = [...store.lessonVideoAssets.values()].find(
      (a) => a.lesson_id === asset.lesson_id && a.quality_label === quality
    );

    if (match) {
      const updated = {
        ...match,
        ...asset,
        quality_label: quality,
        updated_at: now,
      };
      store.lessonVideoAssets.set(updated.id, updated);
      return updated;
    }

    const created = {
      id: asset.id || crypto.randomUUID(),
      storage_provider: 'persistent_disk',
      original_file_name: '',
      quality_label: quality,
      mime_type: 'video/mp4',
      duration_seconds: 0,
      is_downloadable: true,
      is_default: true,
      transcoding_status: 'ready',
      uploaded_by: null,
      created_at: now,
      updated_at: now,
      ...asset,
    };
    store.lessonVideoAssets.set(created.id, created);
    return created;
  };

  store.deleteLessonVideoAsset = async (assetId) => {
    return store.lessonVideoAssets.delete(assetId);
  };

  // ---- Student Video Downloads ----
  store.getStudentDownloadById = async (downloadId) => store.studentVideoDownloads.get(downloadId) || null;

  store.getActiveStudentDownload = async ({ studentId, lessonId, deviceId = null }) => {
    const matches = [...store.studentVideoDownloads.values()]
      .filter(
        (d) =>
          d.student_id === studentId &&
          d.lesson_id === lessonId &&
          (d.device_id || null) === (deviceId || null) &&
          d.download_status !== 'deleted'
      )
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return matches[0] || null;
  };

  store.listStudentDownloads = async (studentId, { deviceId = null, includeDeleted = false } = {}) => {
    return [...store.studentVideoDownloads.values()]
      .filter((d) => {
        if (d.student_id !== studentId) return false;
        if (deviceId && d.device_id !== deviceId) return false;
        if (!includeDeleted && d.download_status === 'deleted') return false;
        return true;
      })
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  };

  store.createStudentDownload = async (record) => {
    const now = new Date().toISOString();
    const created = {
      id: record.id || crypto.randomUUID(),
      device_id: null,
      download_status: 'queued',
      file_size: 0,
      bytes_downloaded: 0,
      file_checksum: '',
      downloaded_at: null,
      last_played_position: 0,
      created_at: now,
      updated_at: now,
      ...record,
    };
    store.studentVideoDownloads.set(created.id, created);
    return created;
  };

  store.updateStudentDownload = async (downloadId, patch) => {
    const existing = store.studentVideoDownloads.get(downloadId);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    store.studentVideoDownloads.set(downloadId, updated);
    return updated;
  };

  store.updateStudentDownloadPositionByLesson = async ({ studentId, lessonId, positionSeconds }) => {
    const pos = Math.max(0, Math.floor(Number(positionSeconds) || 0));
    const now = new Date().toISOString();
    for (const rec of store.studentVideoDownloads.values()) {
      if (
        rec.student_id === studentId &&
        rec.lesson_id === lessonId &&
        rec.download_status !== 'deleted'
      ) {
        rec.last_played_position = pos;
        rec.updated_at = now;
      }
    }
  };
}

