import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { NetworkProvider } from './context/NetworkContext.jsx';
import { SplashPage } from './pages/SplashPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { CoursesPage } from './pages/CoursesPage.jsx';
import { QuizPage } from './pages/QuizPage.jsx';
import { ProgressPage } from './pages/ProgressPage.jsx';
import { SubscriptionPage } from './pages/SubscriptionPage.jsx';
import { SubjectDetailPage } from './pages/SubjectDetailPage.jsx';
import { ChapterDetailPage } from './pages/ChapterDetailPage.jsx';
import { RevisionZonePage } from './pages/RevisionZonePage.jsx';
import { LessonPlayerPage } from './pages/LessonPlayerPage.jsx';
import { MyDownloadsScreen } from './pages/MyDownloadsScreen.jsx';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage.jsx';

function AndroidHardwareBackBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let handle = null;

    CapApp.addListener('backButton', ({ canGoBack }) => {
      const fullscreenExitEvent = new CustomEvent('lms:android-back', { cancelable: true });
      const notCancelled = window.dispatchEvent(fullscreenExitEvent);
      if (!notCancelled) return;

      const rootPaths = ['/dashboard', '/login'];
      if (!rootPaths.includes(location.pathname) && canGoBack) {
        navigate(-1);
      } else if (location.pathname !== '/dashboard' && location.pathname !== '/login') {
        navigate('/dashboard', { replace: true });
      } else {
        CapApp.exitApp();
      }
    }).then((h) => {
      handle = h;
    });

    return () => {
      if (handle?.remove) handle.remove();
    };
  }, [location.pathname, navigate]);

  return null;
}

function ProtectedRoute({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <SplashPage />;
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return children;
}

function PublicOnlyRoute({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <SplashPage />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return children;
}

export function AppRoutes() {
  return (
    <>
      <AndroidHardwareBackBridge />
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/courses"
          element={
            <ProtectedRoute>
              <CoursesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/exams"
          element={
            <ProtectedRoute>
              <QuizPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/progress"
          element={
            <ProtectedRoute>
              <ProgressPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/subscription"
          element={
            <ProtectedRoute>
              <SubscriptionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/subjects/:subjectId"
          element={
            <ProtectedRoute>
              <SubjectDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/subjects/:subjectId/chapters/:chapterId"
          element={
            <ProtectedRoute>
              <ChapterDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/revision"
          element={
            <ProtectedRoute>
              <RevisionZonePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lessons/:lessonId"
          element={
            <ProtectedRoute>
              <LessonPlayerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/downloads"
          element={
            <ProtectedRoute>
              <MyDownloadsScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfileSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <NetworkProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </NetworkProvider>
  );
}
