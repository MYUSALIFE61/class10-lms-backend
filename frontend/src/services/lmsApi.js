import { APP_CONFIG } from '../config/env.js';
import { apiRequest } from './apiClient.js';
import { getDeviceMetadata, requestPlayIntegrityToken } from './nativeBridge.js';

export const lmsApi = {
  async register({ email, password, fullName, phone, board }) {
    const device = await getDeviceMetadata(APP_CONFIG.appVersion);
    return apiRequest('/auth/register', {
      method: 'POST',
      auth: false,
      body: { email, password, fullName, phone: phone || undefined, board, device },
    });
  },

  async login({ email, password }) {
    const device = await getDeviceMetadata(APP_CONFIG.appVersion);
    return apiRequest('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password, device },
    });
  },

  async logout({ allDevices = false } = {}) {
    return apiRequest('/auth/logout', { method: 'POST', body: { allDevices } });
  },

  async getMe() {
    return apiRequest('/auth/me');
  },

  async updateProfile(patch) {
    return apiRequest('/auth/me', { method: 'PATCH', body: patch });
  },

  async listDevices() {
    return apiRequest('/devices');
  },

  async revokeDevice(deviceId) {
    return apiRequest(`/devices/${deviceId}`, { method: 'DELETE' });
  },

  async getSubscriptionStatus() {
    return apiRequest('/subscriptions/status');
  },

  async getPlans() {
    return apiRequest('/subscriptions/plans');
  },

  async createPaymentOrder(planCode) {
    return apiRequest('/payments/create-order', {
      method: 'POST',
      body: planCode ? { planCode } : {},
    });
  },

  async verifyPayment({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    return apiRequest('/payments/verify', {
      method: 'POST',
      body: { razorpayOrderId, razorpayPaymentId, razorpaySignature },
    });
  },

  async getDashboard() {
    return apiRequest('/curriculum/dashboard');
  },

  async syncVideos() {
    return apiRequest('/curriculum/videos/sync', { method: 'POST', body: {} });
  },

  async getSubjects(board) {
    const qs = board ? `?board=${encodeURIComponent(board)}` : '';
    return apiRequest(`/curriculum/subjects${qs}`);
  },

  async getChapters(subjectId) {
    return apiRequest(`/curriculum/subjects/${subjectId}/chapters`);
  },

  async getLessons(chapterId, { page = 1, limit = 50 } = {}) {
    return apiRequest(`/curriculum/chapters/${chapterId}/lessons?page=${page}&limit=${limit}`);
  },

  async getLessonMcqs(lessonId) {
    return apiRequest(`/curriculum/lessons/${lessonId}/mcqs`);
  },

  async submitLessonMcqs(lessonId, answers) {
    return apiRequest(`/curriculum/lessons/${lessonId}/mcqs/submit`, {
      method: 'POST',
      body: { answers },
    });
  },

  async getNotes({ subjectId, chapterId, lessonId, page = 1, limit = 30 }) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (subjectId) params.set('subjectId', subjectId);
    if (chapterId) params.set('chapterId', chapterId);
    if (lessonId) params.set('lessonId', lessonId);
    return apiRequest(`/curriculum/notes?${params.toString()}`);
  },

  async getPyqs({ subjectId, chapterId, board, page = 1, limit = 30 }) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (subjectId) params.set('subjectId', subjectId);
    if (chapterId) params.set('chapterId', chapterId);
    if (board) params.set('board', board);
    return apiRequest(`/curriculum/pyqs?${params.toString()}`);
  },

  async getFormulas({ subjectId, chapterId, page = 1, limit = 50 }) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (subjectId) params.set('subjectId', subjectId);
    if (chapterId) params.set('chapterId', chapterId);
    return apiRequest(`/curriculum/formulas?${params.toString()}`);
  },

  async authorizePlayback(lessonId) {
    const device = await getDeviceMetadata(APP_CONFIG.appVersion);
    let integrityToken = null;
    try {
      const nonceData = await apiRequest('/integrity/nonce', { method: 'POST', body: {} });
      if (nonceData?.nonce) {
        integrityToken = await requestPlayIntegrityToken(nonceData);
      }
    } catch {
      // Integrity token request is optional when running outside Play Services
    }

    return apiRequest('/playback/authorize', {
      method: 'POST',
      body: {
        lessonId,
        deviceId: device.deviceId,
        ...(integrityToken ? { integrityToken } : {}),
      },
    });
  },

  async saveProgress({ lessonId, positionSeconds, durationSeconds, markCompleted = false }) {
    return apiRequest('/playback/progress', {
      method: 'POST',
      body: { lessonId, positionSeconds, durationSeconds, markCompleted },
    });
  },

  // ---- Dynamic Admin-Controlled Student APIs (/api/v1/student/*) ----
  async getStudentHome() {
    return apiRequest('/student/home');
  },

  async getStudentChapters(subjectId) {
    return apiRequest(`/student/subjects/${subjectId}/chapters`);
  },

  async getStudentLessons(chapterId, { page = 1, limit = 50 } = {}) {
    return apiRequest(`/student/chapters/${chapterId}/lessons?page=${page}&limit=${limit}`);
  },

  async getStudentResources({ subjectId, chapterId, lessonId, medium } = {}) {
    const params = new URLSearchParams();
    if (subjectId) params.set('subjectId', subjectId);
    if (chapterId) params.set('chapterId', chapterId);
    if (lessonId) params.set('lessonId', lessonId);
    if (medium) params.set('medium', medium);
    const qs = params.toString();
    return apiRequest(`/student/resources${qs ? `?${qs}` : ''}`);
  },

  async getStudentQuizzes({ subjectId, chapterId } = {}) {
    const params = new URLSearchParams();
    if (subjectId) params.set('subjectId', subjectId);
    if (chapterId) params.set('chapterId', chapterId);
    const qs = params.toString();
    return apiRequest(`/student/quizzes${qs ? `?${qs}` : ''}`);
  },

  async startStudentQuiz(quizId) {
    return apiRequest(`/student/quizzes/${quizId}/start`, { method: 'POST', body: {} });
  },

  async submitStudentQuiz(quizId, { attemptId, answers }) {
    return apiRequest(`/student/quizzes/${quizId}/submit`, {
      method: 'POST',
      body: { attemptId, answers },
    });
  },

  async getStudentExams() {
    return apiRequest('/student/exams');
  },

  async getStudentProgress() {
    return apiRequest('/student/progress');
  },

  async getStudentNotifications() {
    return apiRequest('/student/notifications');
  },

  async markNotificationRead(id) {
    return apiRequest(`/student/notifications/${id}/read`, { method: 'POST', body: {} });
  },

  // ---- Gamified Video-Based MCQ System ----
  async getStudentVideoQuizzes({ lessonId, subjectId } = {}) {
    const params = new URLSearchParams();
    if (lessonId) params.set('lessonId', lessonId);
    if (subjectId) params.set('subjectId', subjectId);
    const qs = params.toString();
    return apiRequest(`/student/video-quizzes${qs ? `?${qs}` : ''}`);
  },

  async startGamifiedVideoQuiz(quizId) {
    return apiRequest(`/student/video-quizzes/${quizId}/start`, { method: 'POST', body: {} });
  },

  async answerGamifiedQuestion(attemptId, { questionId, selectedOptionIndex = null, skipped = false }) {
    return apiRequest(`/student/video-quizzes/attempts/${attemptId}/answer`, {
      method: 'POST',
      body: { questionId, selectedOptionIndex, skipped },
    });
  },

  async completeGamifiedQuiz(attemptId) {
    return apiRequest(`/student/video-quizzes/attempts/${attemptId}/complete`, {
      method: 'POST',
      body: {},
    });
  },

  async getGamificationProfile() {
    return apiRequest('/student/gamification/profile');
  },

  async getGamificationLeaderboard() {
    return apiRequest('/student/gamification/leaderboard');
  },

  // ---- Authorized Offline Video Downloader APIs ----
  async getLessonDetails(lessonId) {
    return apiRequest(`/lessons/${lessonId}`);
  },

  async getLessonDownloadInfo(lessonId) {
    return apiRequest(`/lessons/${lessonId}/download-info`);
  },

  async initiateLessonDownload(lessonId, { qualityLabel, forceRedownload = false } = {}) {
    const device = await getDeviceMetadata(APP_CONFIG.appVersion);
    return apiRequest(`/lessons/${lessonId}/download`, {
      method: 'POST',
      body: {
        ...(qualityLabel ? { qualityLabel } : {}),
        forceRedownload: Boolean(forceRedownload),
        deviceId: device.deviceId,
      },
    });
  },

  async getDownloadStatus(downloadId) {
    return apiRequest(`/downloads/${downloadId}/status`);
  },

  async syncDownloadStatus(downloadId, payload) {
    return apiRequest(`/downloads/${downloadId}/status`, {
      method: 'PATCH',
      body: payload,
    });
  },

  async getDownloadManifest(downloadId) {
    return apiRequest(`/downloads/${downloadId}/manifest`);
  },

  async listMyDownloads() {
    return apiRequest('/downloads');
  },

  async deleteMyDownload(downloadId) {
    return apiRequest(`/downloads/${downloadId}`, { method: 'DELETE' });
  },

  async saveLessonProgress(lessonId, { positionSeconds, durationSeconds, markCompleted = false }) {
    return apiRequest(`/lessons/${lessonId}/progress`, {
      method: 'POST',
      body: { positionSeconds, durationSeconds, markCompleted },
    });
  },
};
