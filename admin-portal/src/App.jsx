import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext.jsx';
import { AdminLoginPage } from './pages/AdminLoginPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { StudentsPage } from './pages/StudentsPage.jsx';
import { AcademicManagementPage } from './pages/AcademicManagementPage.jsx';
import { LessonsPage } from './pages/LessonsPage.jsx';
import { VideoLibraryPage } from './pages/VideoLibraryPage.jsx';
import { ResourcesPage } from './pages/ResourcesPage.jsx';
import { QuestionBankPage } from './pages/QuestionBankPage.jsx';
import { VideoQuizStudioPage } from './pages/VideoQuizStudioPage.jsx';
import { QuizzesPage, ExamsPage } from './pages/QuizzesAndExamsPage.jsx';
import {
  ProgressReportsPage,
  NotificationsPage,
  SubscriptionsPage,
} from './pages/OperationsPages.jsx';
import {
  AppConfigPage,
  AdminUsersPage,
  AuditLogsPage,
} from './pages/AdminSystemPages.jsx';

function Protected({ children }) {
  const { admin, loading } = useAdminAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F8FF] text-sm font-semibold text-[#155EEF]">
        Verifying Administrator Session...
      </div>
    );
  }
  if (!admin) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AdminAuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AdminLoginPage />} />
          <Route path="/" element={<Protected><DashboardPage /></Protected>} />
          <Route path="/students" element={<Protected><StudentsPage /></Protected>} />
          <Route path="/academic" element={<Protected><AcademicManagementPage /></Protected>} />
          <Route path="/lessons" element={<Protected><LessonsPage /></Protected>} />
          <Route path="/videos" element={<Protected><VideoLibraryPage /></Protected>} />
          <Route path="/resources" element={<Protected><ResourcesPage /></Protected>} />
          <Route path="/video-quizzes" element={<Protected><VideoQuizStudioPage /></Protected>} />
          <Route path="/questions" element={<Protected><QuestionBankPage /></Protected>} />
          <Route path="/quizzes" element={<Protected><QuizzesPage /></Protected>} />
          <Route path="/exams" element={<Protected><ExamsPage /></Protected>} />
          <Route path="/progress" element={<Protected><ProgressReportsPage /></Protected>} />
          <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
          <Route path="/subscriptions" element={<Protected><SubscriptionsPage /></Protected>} />
          <Route path="/app-config" element={<Protected><AppConfigPage /></Protected>} />
          <Route path="/admins" element={<Protected><AdminUsersPage /></Protected>} />
          <Route path="/audit-logs" element={<Protected><AuditLogsPage /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AdminAuthProvider>
  );
}
