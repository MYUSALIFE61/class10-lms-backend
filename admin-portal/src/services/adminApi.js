const TOKEN_KEY = 'class10_lms_admin_token';
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1/admin';

export function getAdminToken() {
  return window.localStorage.getItem(TOKEN_KEY) || '';
}

export function setAdminToken(token) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function req(path, { method = 'GET', body = null, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    ...(body !== null ? { body: JSON.stringify(body) } : {}),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth) {
      setAdminToken('');
    }
    const err = new Error(json?.error?.message || `Request failed (${res.status})`);
    err.code = json?.error?.code || 'REQUEST_ERROR';
    err.status = res.status;
    throw err;
  }
  return json.data;
}

function toQuery(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const adminApi = {
  // Auth
  login: (email, password) => req('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => req('/auth/me'),
  logout: () => req('/auth/logout', { method: 'POST', body: {} }),

  // Dashboard
  getDashboard: (filters) => req(`/dashboard${toQuery(filters)}`),

  // Students
  listStudents: (filters) => req(`/students${toQuery(filters)}`),
  getStudent: (id) => req(`/students/${id}`),
  updateStudent: (id, patch) => req(`/students/${id}`, { method: 'PATCH', body: patch }),
  resetStudentPassword: (id, newPassword) =>
    req(`/students/${id}/reset-password`, { method: 'POST', body: { newPassword } }),

  // Academic Structure
  listBoards: () => req('/boards'),
  createBoard: (data) => req('/boards', { method: 'POST', body: data }),
  updateBoard: (id, patch) => req(`/boards/${id}`, { method: 'PATCH', body: patch }),

  listAcademicYears: () => req('/academic-years'),
  createAcademicYear: (data) => req('/academic-years', { method: 'POST', body: data }),
  updateAcademicYear: (id, patch) => req(`/academic-years/${id}`, { method: 'PATCH', body: patch }),

  listSubjects: (filters) => req(`/subjects${toQuery(filters)}`),
  createSubject: (data) => req('/subjects', { method: 'POST', body: data }),
  updateSubject: (id, patch) => req(`/subjects/${id}`, { method: 'PATCH', body: patch }),
  archiveSubject: (id) => req(`/subjects/${id}`, { method: 'DELETE' }),

  listChapters: (filters) => req(`/chapters${toQuery(filters)}`),
  createChapter: (data) => req('/chapters', { method: 'POST', body: data }),
  updateChapter: (id, patch) => req(`/chapters/${id}`, { method: 'PATCH', body: patch }),

  listTopics: (filters) => req(`/topics${toQuery(filters)}`),
  createTopic: (data) => req('/topics', { method: 'POST', body: data }),
  updateTopic: (id, patch) => req(`/topics/${id}`, { method: 'PATCH', body: patch }),

  // Lessons & Videos & Study Resources
  listLessons: (filters) => req(`/lessons${toQuery(filters)}`),
  createLesson: (data) => req('/lessons', { method: 'POST', body: data }),
  updateLesson: (id, patch) => req(`/lessons/${id}`, { method: 'PATCH', body: patch }),
  reorderLessons: (orderedIds) => req('/lessons/reorder', { method: 'POST', body: { orderedIds } }),

  listVideos: () => req('/videos'),
  syncVideos: () => req('/videos/sync', { method: 'POST', body: {} }),
  mapVideo: (lessonId, data) => req(`/videos/${lessonId}/map`, { method: 'PATCH', body: data }),
  previewVideo: (lessonId) => req(`/videos/${lessonId}/preview`, { method: 'POST', body: {} }),

  listResources: (filters) => req(`/resources${toQuery(filters)}`),
  createResource: (data) => req('/resources', { method: 'POST', body: data }),
  updateResource: (id, patch) => req(`/resources/${id}`, { method: 'PATCH', body: patch }),

  // Question Bank, Quizzes & Exams
  listQuestions: (filters) => req(`/questions${toQuery(filters)}`),
  createQuestion: (data) => req('/questions', { method: 'POST', body: data }),
  updateQuestion: (id, patch) => req(`/questions/${id}`, { method: 'PATCH', body: patch }),
  bulkImportQuestions: (payload) => req('/questions/bulk-import', { method: 'POST', body: payload }),
  getQuestionsExportUrl: (filters) => `${API_BASE}/questions/export${toQuery(filters)}`,

  listQuizzes: (filters) => req(`/quizzes${toQuery(filters)}`),
  createQuiz: (data) => req('/quizzes', { method: 'POST', body: data }),
  updateQuiz: (id, patch) => req(`/quizzes/${id}`, { method: 'PATCH', body: patch }),

  listExams: (filters) => req(`/exams${toQuery(filters)}`),
  createExam: (data) => req('/exams', { method: 'POST', body: data }),
  updateExam: (id, patch) => req(`/exams/${id}`, { method: 'PATCH', body: patch }),
  listExamAttempts: (examId) => req(`/exams/${examId}/attempts`),
  evaluateExamAttempt: (attemptId, payload) =>
    req(`/exams/attempts/${attemptId}/evaluate`, { method: 'POST', body: payload }),

  // Operations, Analytics, Notifications, Subscriptions, Config, RBAC, Audit
  getReports: (filters) => req(`/reports${toQuery(filters)}`),
  listNotifications: () => req('/notifications'),
  sendNotification: (data) => req('/notifications', { method: 'POST', body: data }),

  getSubscriptions: () => req('/subscriptions'),
  createPlan: (data) => req('/subscriptions/plans', { method: 'POST', body: data }),
  updatePlan: (id, patch) => req(`/subscriptions/plans/${id}`, { method: 'PATCH', body: patch }),
  assignSubscription: (data) => req('/subscriptions/assign', { method: 'POST', body: data }),

  getSettings: () => req('/settings'),
  updateSettings: (patch) => req('/settings', { method: 'PATCH', body: patch }),

  listAdmins: () => req('/admins'),
  createAdmin: (data) => req('/admins', { method: 'POST', body: data }),
  updateAdmin: (id, patch) => req(`/admins/${id}`, { method: 'PATCH', body: patch }),

  listAuditLogs: (filters) => req(`/audit-logs${toQuery(filters)}`),
  listSecurityEvents: (filters) => req(`/security-events${toQuery(filters)}`),

  // Gamified Video-Based MCQ Studio
  listVideoQuizzes: () => req('/video-quizzes'),
  updateLessonTranscript: (lessonId, payload) =>
    req(`/video-quizzes/lessons/${lessonId}/transcript`, { method: 'PATCH', body: payload }),
  generateAiVideoQuestions: (payload) =>
    req('/video-quizzes/generate-ai', { method: 'POST', body: payload }),
  listLessonVideoQuestions: (lessonId) =>
    req(`/video-quizzes/lessons/${lessonId}/questions`),
  createManualVideoQuestion: (lessonId, data) =>
    req(`/video-quizzes/lessons/${lessonId}/questions`, { method: 'POST', body: data }),
  reviewAiVideoQuestion: (questionId, decision, patch = {}) =>
    req(`/video-quizzes/questions/${questionId}/review`, { method: 'POST', body: { decision, patch } }),
  createVideoQuiz: (data) => req('/video-quizzes', { method: 'POST', body: data }),
  updateVideoQuiz: (quizId, data) => req(`/video-quizzes/${quizId}`, { method: 'PATCH', body: data }),
  getVideoQuizAnalytics: (filters) => req(`/video-quizzes/analytics${toQuery(filters)}`),

  // Authorized Offline MP4 Assets
  listLessonOfflineAssets: (lessonId) => req(`/lessons/${lessonId}/offline-assets`),
  registerLessonOfflineAsset: (lessonId, data) =>
    req(`/lessons/${lessonId}/offline-assets`, { method: 'POST', body: data }),
  deleteLessonOfflineAsset: (assetId) => req(`/offline-assets/${assetId}`, { method: 'DELETE' }),
  uploadLessonOfflineMp4: (lessonId, { file, qualityLabel = '720p', targetHeight = '', onProgress = null }) =>
    new Promise((resolve, reject) => {
      const token = getAdminToken();
      const qs = toQuery({
        fileName: file?.name || 'lesson.mp4',
        qualityLabel,
        targetHeight: targetHeight || undefined,
      });
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/lessons/${lessonId}/offline-assets/upload${qs}`);
      xhr.setRequestHeader('Content-Type', 'video/mp4');
      xhr.setRequestHeader('X-File-Name', file?.name || 'lesson.mp4');
      xhr.setRequestHeader('X-Quality-Label', qualityLabel);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && typeof onProgress === 'function') {
          const percent = Math.min(99, Math.round((evt.loaded / evt.total) * 100));
          onProgress({ percent, loaded: evt.loaded, total: evt.total });
        }
      };

      xhr.onload = () => {
        let json = {};
        try {
          json = JSON.parse(xhr.responseText || '{}');
        } catch {
          json = {};
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          if (typeof onProgress === 'function') {
            onProgress({ percent: 100, loaded: file?.size || 0, total: file?.size || 0 });
          }
          resolve(json.data);
        } else {
          const err = new Error(json?.error?.message || `Upload failed (${xhr.status})`);
          err.code = json?.error?.code || 'UPLOAD_ERROR';
          reject(err);
        }
      };

      xhr.onerror = () => {
        const err = new Error('Network error while uploading MP4. Please retry.');
        err.code = 'NETWORK_ERROR';
        reject(err);
      };

      xhr.send(file);
    }),
};
