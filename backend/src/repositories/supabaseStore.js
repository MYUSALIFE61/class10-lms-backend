import { AppError } from '../utils/errors.js';

function throwIfError(error, context) {
  if (error) {
    throw new AppError(`${context}: ${error.message}`, 500, 'DATABASE_ERROR');
  }
}

/**
 * Production Supabase PostgreSQL data access layer.
 * Uses service-role client exclusively on the Express backend.
 */
export class SupabaseDataStore {
  constructor(supabaseAdmin) {
    this.db = supabaseAdmin;
  }

  // ---- Profiles ----
  async getProfileById(userId) {
    const { data, error } = await this.db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    throwIfError(error, 'getProfileById');
    return data;
  }

  async getProfileByUsername(username) {
    if (!username) return null;
    const normalized = String(username).trim().toLowerCase();
    const { data, error } = await this.db
      .from('profiles')
      .select('*')
      .eq('username', normalized)
      .maybeSingle();
    throwIfError(error, 'getProfileByUsername');
    return data;
  }

  async getProfileByPhone(phone) {
    if (!phone) return null;
    const normalized = String(phone).trim();
    const { data, error } = await this.db
      .from('profiles')
      .select('*')
      .eq('phone', normalized)
      .maybeSingle();
    throwIfError(error, 'getProfileByPhone');
    return data;
  }

  async createProfile(profile) {
    const { data, error } = await this.db
      .from('profiles')
      .insert(profile)
      .select('*')
      .single();
    throwIfError(error, 'createProfile');
    return data;
  }

  async updateProfile(userId, patch) {
    const { data, error } = await this.db
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('*')
      .single();
    throwIfError(error, 'updateProfile');
    return data;
  }

  // ---- Devices ----
  async listUserDevices(userId, { activeOnly = false } = {}) {
    let query = this.db
      .from('user_devices')
      .select('*')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false });
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    throwIfError(error, 'listUserDevices');
    return data || [];
  }

  async getDeviceByUserAndHash(userId, deviceIdHash) {
    const { data, error } = await this.db
      .from('user_devices')
      .select('*')
      .eq('user_id', userId)
      .eq('device_id_hash', deviceIdHash)
      .maybeSingle();
    throwIfError(error, 'getDeviceByUserAndHash');
    return data;
  }

  async getDeviceById(deviceId) {
    const { data, error } = await this.db
      .from('user_devices')
      .select('*')
      .eq('id', deviceId)
      .maybeSingle();
    throwIfError(error, 'getDeviceById');
    return data;
  }

  async upsertDevice(device) {
    const { data, error } = await this.db
      .from('user_devices')
      .upsert(device, { onConflict: 'user_id,device_id_hash' })
      .select('*')
      .single();
    throwIfError(error, 'upsertDevice');
    return data;
  }

  async updateDevice(deviceId, patch) {
    const { data, error } = await this.db
      .from('user_devices')
      .update(patch)
      .eq('id', deviceId)
      .select('*')
      .single();
    throwIfError(error, 'updateDevice');
    return data;
  }

  // ---- Sessions ----
  async createSession(session) {
    const { data, error } = await this.db
      .from('user_sessions')
      .insert(session)
      .select('*')
      .single();
    throwIfError(error, 'createSession');
    return data;
  }

  async getSessionById(sessionId) {
    const { data, error } = await this.db
      .from('user_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    throwIfError(error, 'getSessionById');
    return data;
  }

  async getSessionByRefreshHash(refreshHash) {
    const { data, error } = await this.db
      .from('user_sessions')
      .select('*')
      .eq('refresh_token_hash', refreshHash)
      .maybeSingle();
    throwIfError(error, 'getSessionByRefreshHash');
    return data;
  }

  async listActiveSessionsForUser(userId) {
    const { data, error } = await this.db
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_revoked', false)
      .gt('expires_at', new Date().toISOString())
      .order('last_activity_at', { ascending: false });
    throwIfError(error, 'listActiveSessionsForUser');
    return data || [];
  }

  async updateSession(sessionId, patch) {
    const { data, error } = await this.db
      .from('user_sessions')
      .update(patch)
      .eq('id', sessionId)
      .select('*')
      .single();
    throwIfError(error, 'updateSession');
    return data;
  }

  async revokeSessionsByDevice(userId, deviceId, reason) {
    const { error } = await this.db
      .from('user_sessions')
      .update({ is_revoked: true, revoked_reason: reason })
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .eq('is_revoked', false);
    throwIfError(error, 'revokeSessionsByDevice');
  }

  async revokeAllSessionsForUser(userId, reason, { exceptSessionId = null } = {}) {
    let query = this.db
      .from('user_sessions')
      .update({ is_revoked: true, revoked_reason: reason })
      .eq('user_id', userId)
      .eq('is_revoked', false);
    if (exceptSessionId) query = query.neq('id', exceptSessionId);
    const { error } = await query;
    throwIfError(error, 'revokeAllSessionsForUser');
  }

  // ---- Security Events ----
  async logSecurityEvent(event) {
    const { error } = await this.db.from('security_events').insert(event);
    throwIfError(error, 'logSecurityEvent');
  }

  // ---- Subscription Plans & Subscriptions ----
  async getPlanById(planId) {
    const { data, error } = await this.db
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle();
    throwIfError(error, 'getPlanById');
    return data;
  }

  async getPlanByCode(code, { activeOnly = false } = {}) {
    let query = this.db
      .from('subscription_plans')
      .select('*')
      .eq('code', code);
    if (activeOnly) {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query.maybeSingle();
    throwIfError(error, 'getPlanByCode');
    return data;
  }

  async listActivePlans() {
    const { data, error } = await this.db
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price_paise', { ascending: true });
    throwIfError(error, 'listActivePlans');
    return (data || []).sort(
      (a, b) => (a.display_order ?? 10) - (b.display_order ?? 10) || a.price_paise - b.price_paise
    );
  }

  async getLatestSubscription(userId) {
    const { data, error } = await this.db
      .from('subscriptions')
      .select('*, subscription_plans(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfError(error, 'getLatestSubscription');
    return data;
  }

  async getActiveSubscription(userId) {
    const { data, error } = await this.db
      .from('subscriptions')
      .select('*, subscription_plans(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfError(error, 'getActiveSubscription');
    return data;
  }

  async createSubscription(sub) {
    const { data, error } = await this.db
      .from('subscriptions')
      .insert(sub)
      .select('*')
      .single();
    throwIfError(error, 'createSubscription');
    return data;
  }

  async updateSubscription(subscriptionId, patch) {
    const { data, error } = await this.db
      .from('subscriptions')
      .update(patch)
      .eq('id', subscriptionId)
      .select('*')
      .single();
    throwIfError(error, 'updateSubscription');
    return data;
  }

  // ---- Payment Transactions ----
  async createPaymentTransaction(tx) {
    const { data, error } = await this.db
      .from('payment_transactions')
      .insert(tx)
      .select('*')
      .single();
    throwIfError(error, 'createPaymentTransaction');
    return data;
  }

  async getPaymentByOrderId(razorpayOrderId) {
    const { data, error } = await this.db
      .from('payment_transactions')
      .select('*')
      .eq('razorpay_order_id', razorpayOrderId)
      .maybeSingle();
    throwIfError(error, 'getPaymentByOrderId');
    return data;
  }

  async getPaymentById(paymentId) {
    const { data, error } = await this.db
      .from('payment_transactions')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();
    throwIfError(error, 'getPaymentById');
    return data;
  }

  async updatePaymentTransaction(paymentId, patch) {
    const { data, error } = await this.db
      .from('payment_transactions')
      .update(patch)
      .eq('id', paymentId)
      .select('*')
      .single();
    throwIfError(error, 'updatePaymentTransaction');
    return data;
  }

  async getPaymentByWebhookEventId(eventId) {
    if (!eventId) return null;
    const { data, error } = await this.db
      .from('payment_transactions')
      .select('*')
      .eq('webhook_event_id', eventId)
      .maybeSingle();
    throwIfError(error, 'getPaymentByWebhookEventId');
    return data;
  }

  async listPaymentsByUser(userId) {
    const { data, error } = await this.db
      .from('payment_transactions')
      .select('*, subscription_plans(code, name, duration_days)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    throwIfError(error, 'listPaymentsByUser');
    return data || [];
  }

  // ---- Curriculum ----
  async listSubjects({ board } = {}) {
    let query = this.db
      .from('subjects')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (board && (board === 'AP' || board === 'TS')) {
      query = query.in('board', [board, 'BOTH']);
    }
    const { data, error } = await query;
    throwIfError(error, 'listSubjects');
    return data || [];
  }

  async getSubjectById(subjectId) {
    const { data, error } = await this.db
      .from('subjects')
      .select('*')
      .eq('id', subjectId)
      .eq('is_active', true)
      .maybeSingle();
    throwIfError(error, 'getSubjectById');
    return data;
  }

  async listChaptersBySubject(subjectId) {
    const { data, error } = await this.db
      .from('chapters')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    throwIfError(error, 'listChaptersBySubject');
    return data || [];
  }

  async listLessonsByChapter(chapterId, { page = 1, limit = 50 } = {}) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, error, count } = await this.db
      .from('lessons')
      .select('*', { count: 'exact' })
      .eq('chapter_id', chapterId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .range(from, to);
    throwIfError(error, 'listLessonsByChapter');
    return { items: data || [], total: count ?? (data?.length || 0) };
  }

  async getLessonById(lessonId) {
    const { data, error } = await this.db
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .maybeSingle();
    throwIfError(error, 'getLessonById');
    return data;
  }

  async getLessonVideoSource(lessonId) {
    const { data, error } = await this.db
      .from('lesson_video_sources')
      .select('*')
      .eq('lesson_id', lessonId)
      .maybeSingle();
    throwIfError(error, 'getLessonVideoSource');
    return data;
  }

  async ensureSyncedVideoChapter() {
    const { data: existing, error: findErr } = await this.db
      .from('chapters')
      .select('*')
      .eq('title', 'Uploaded Video Lessons')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    throwIfError(findErr, 'ensureSyncedVideoChapter.find');
    if (existing) return existing;

    const subjects = await this.listSubjects();
    if (!subjects.length) {
      throw new AppError('No active subjects exist in database for synced videos', 400, 'NO_SUBJECTS');
    }

    const { data: created, error: createErr } = await this.db
      .from('chapters')
      .insert({
        subject_id: subjects[0].id,
        chapter_number: 0,
        title: 'Uploaded Video Lessons',
        summary: 'Videos synced from configured LMS video storage provider.',
        display_order: 0,
        is_active: true,
      })
      .select('*')
      .single();
    throwIfError(createErr, 'ensureSyncedVideoChapter.create');
    return created;
  }

  async upsertSyncedVideoLesson({ lesson, videoSource }) {
    const dbLesson = {
      id: lesson.id,
      subject_id: lesson.subject_id,
      chapter_id: lesson.chapter_id,
      title: lesson.title,
      description: lesson.description,
      thumbnail_url: lesson.thumbnail_url || null,
      duration_seconds: lesson.duration_seconds || 0,
      display_order: lesson.display_order || 1,
      is_premium: Boolean(lesson.is_premium),
      is_active: true,
    };
    const { data: savedLesson, error: lErr } = await this.db
      .from('lessons')
      .upsert(dbLesson, { onConflict: 'id' })
      .select('*')
      .single();
    throwIfError(lErr, 'upsertSyncedVideoLesson.lesson');

    const dbSource = {
      lesson_id: videoSource.lesson_id,
      provider: videoSource.provider,
      provider_file_id: videoSource.provider_file_id || null,
      file_name: videoSource.file_name || null,
      mime_type: videoSource.mime_type || 'video/mp4',
      youtube_video_id: null,
      stream_url: videoSource.stream_url || null,
    };
    const { error: sErr } = await this.db
      .from('lesson_video_sources')
      .upsert(dbSource, { onConflict: 'lesson_id' });
    throwIfError(sErr, 'upsertSyncedVideoLesson.source');

    return savedLesson;
  }

  async listSyncedVideoLessons() {
    const { data: sources, error: sErr } = await this.db
      .from('lesson_video_sources')
      .select('lesson_id, provider, file_name')
      .in('provider', ['pikpak_local', 'private_stream', 'private_asset_stream']);
    throwIfError(sErr, 'listSyncedVideoLessons.sources');
    if (!sources || sources.length === 0) return [];

    const ids = sources.map((s) => s.lesson_id);
    const sourceById = new Map(sources.map((s) => [s.lesson_id, s]));
    const { data: lessons, error: lErr } = await this.db
      .from('lessons')
      .select('*')
      .in('id', ids)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    throwIfError(lErr, 'listSyncedVideoLessons.lessons');

    return (lessons || []).map((l) => {
      const src = sourceById.get(l.id);
      return {
        ...l,
        source_provider: src?.provider || 'private_asset_stream',
        source_file_name: src?.file_name || l.title,
      };
    });
  }

  async listLessonMcqs(lessonId) {
    const { data, error } = await this.db
      .from('lesson_mcqs')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    throwIfError(error, 'listLessonMcqs');
    return data || [];
  }

  async createMcqAttempt(attempt) {
    const { data, error } = await this.db
      .from('mcq_attempts')
      .insert(attempt)
      .select('*')
      .single();
    throwIfError(error, 'createMcqAttempt');
    return data;
  }

  async listNotes({ subjectId, chapterId, lessonId, page = 1, limit = 30 }) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let query = this.db
      .from('lesson_notes')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (subjectId) query = query.eq('subject_id', subjectId);
    if (chapterId) query = query.eq('chapter_id', chapterId);
    if (lessonId) query = query.eq('lesson_id', lessonId);
    const { data, error, count } = await query.range(from, to);
    throwIfError(error, 'listNotes');
    return { items: data || [], total: count ?? (data?.length || 0) };
  }

  async listLessonConcepts({ lessonId }) {
    const { data, error } = await this.db
      .from('lesson_concepts')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error && (error.code === '42P01' || String(error.message || '').includes('does not exist'))) {
      return [];
    }
    throwIfError(error, 'listLessonConcepts');
    return data || [];
  }

  async listLessonRevisionPoints({ lessonId }) {
    const { data, error } = await this.db
      .from('lesson_revision_points')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error && (error.code === '42P01' || String(error.message || '').includes('does not exist'))) {
      return [];
    }
    throwIfError(error, 'listLessonRevisionPoints');
    return data || [];
  }

  async listLessonPyqs({ lessonId, board }) {
    let query = this.db
      .from('previous_exam_questions')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('exam_year', { ascending: false });
    if (board && (board === 'AP' || board === 'TS')) {
      query = query.in('board', [board, 'BOTH']);
    }
    const { data, error } = await query;
    if (error && (error.code === '42703' || String(error.message || '').includes('lesson_id'))) {
      return [];
    }
    throwIfError(error, 'listLessonPyqs');
    return data || [];
  }

  async listPyqs({ subjectId, chapterId, board, page = 1, limit = 30 }) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let query = this.db
      .from('previous_exam_questions')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('exam_year', { ascending: false })
      .order('display_order', { ascending: true });
    if (subjectId) query = query.eq('subject_id', subjectId);
    if (chapterId) query = query.eq('chapter_id', chapterId);
    if (board && (board === 'AP' || board === 'TS')) {
      query = query.in('board', [board, 'BOTH']);
    }
    const { data, error, count } = await query.range(from, to);
    throwIfError(error, 'listPyqs');
    return { items: data || [], total: count ?? (data?.length || 0) };
  }

  async listFormulas({ subjectId, chapterId, page = 1, limit = 50 }) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    let query = this.db
      .from('important_formulas')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (subjectId) query = query.eq('subject_id', subjectId);
    if (chapterId) query = query.eq('chapter_id', chapterId);
    const { data, error, count } = await query.range(from, to);
    throwIfError(error, 'listFormulas');
    return { items: data || [], total: count ?? (data?.length || 0) };
  }

  // ---- Progress & Playback Audit ----
  async getLessonProgress(userId, lessonId) {
    const { data, error } = await this.db
      .from('lesson_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .maybeSingle();
    throwIfError(error, 'getLessonProgress');
    return data;
  }

  async listUserProgress(userId) {
    const { data, error } = await this.db
      .from('lesson_progress')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    throwIfError(error, 'listUserProgress');
    return data || [];
  }

  async upsertLessonProgress(progress) {
    const { data, error } = await this.db
      .from('lesson_progress')
      .upsert(progress, { onConflict: 'user_id,lesson_id' })
      .select('*')
      .single();
    throwIfError(error, 'upsertLessonProgress');
    return data;
  }

  async logPlaybackAudit(entry) {
    const { error } = await this.db.from('playback_audit_logs').insert(entry);
    throwIfError(error, 'logPlaybackAudit');
  }
}
