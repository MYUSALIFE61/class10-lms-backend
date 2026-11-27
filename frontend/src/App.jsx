import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { NetworkProvider } from './context/NetworkContext.jsx';
import { SplashPage } from './pages/SplashPage.jsx';
import { WelcomePage } from './pages/WelcomePage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { SignupPage } from './pages/SignupPage.jsx';
import { LegalPage } from './pages/LegalPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { CoursesPage } from './pages/CoursesPage.jsx';
import { QuizPage } from './pages/QuizPage.jsx';
import { ProgressPage } from './pages/ProgressPage.jsx';
import { SubscriptionPage } from './pages/SubscriptionPage.jsx';
import { CheckoutPage } from './pages/CheckoutPage.jsx';
import { PaymentResultPage } from './pages/PaymentResultPage.jsx';
import { PaymentHistoryPage } from './pages/PaymentHistoryPage.jsx';
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

      const rootPaths = ['/dashboard', '/login', '/', '/welcome', '/subscription', '/renewal'];
      if (!rootPaths.includes(location.pathname) && canGoBack) {
        navigate(-1);
      } else if (!rootPaths.includes(location.pathname)) {
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

export function resolveAuthenticatedHome(subscription) {
  if (subscription?.isActive) return '/dashboard';
  if (subscription?.status === 'expired') return '/renewal';
  return '/subscription';
}

function ProtectedRoute({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <SplashPage />;
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return children;
}

function SubscriptionRequiredRoute({ children }) {
  const { status, subscription } = useAuth();
  if (status === 'loading') return <SplashPage />;
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  if (!subscription?.isActive) {
    return <Navigate to={resolveAuthenticatedHome(subscription)} replace />;
  }
  return children;
}

function PublicOnlyRoute({ children }) {
  const { status, subscription } = useAuth();
  if (status === 'loading') return <SplashPage />;
  if (status === 'authenticated') {
    return <Navigate to={resolveAuthenticatedHome(subscription)} replace />;
  }
  return children;
}

function SmartFallbackRoute() {
  const { status, subscription } = useAuth();
  if (status === 'loading') return <SplashPage />;
  if (status !== 'authenticated') return <Navigate to="/" replace />;
  return <Navigate to={resolveAuthenticatedHome(subscription)} replace />;
}

export function AppRoutes() {
  return (
    <>
      <AndroidHardwareBackBridge />
      <Routes>
        <Route
          path="/"
          element={
            <PublicOnlyRoute>
              <WelcomePage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/welcome"
          element={
            <PublicOnlyRoute>
              <WelcomePage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnlyRoute>
              <SignupPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnlyRoute>
              <SignupPage />
            </PublicOnlyRoute>
          }
        />
        <Route path="/terms" element={<LegalPage type="terms" />} />
        <Route path="/privacy" element={<LegalPage type="privacy" />} />
        <Route
          path="/dashboard"
          element={
            <SubscriptionRequiredRoute>
              <DashboardPage />
            </SubscriptionRequiredRoute>
          }
        />
        <Route
          path="/courses"
          element={
            <SubscriptionRequiredRoute>
              <CoursesPage />
            </SubscriptionRequiredRoute>
          }
        />
        <Route
          path="/exams"
          element={
            <SubscriptionRequiredRoute>
              <QuizPage />
            </SubscriptionRequiredRoute>
          }
        />
        <Route
          path="/progress"
          element={
            <SubscriptionRequiredRoute>
              <ProgressPage />
            </SubscriptionRequiredRoute>
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
          path="/renewal"
          element={
            <ProtectedRoute>
              <SubscriptionPage isRenewal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/checkout"
          element={
            <ProtectedRoute>
              <CheckoutPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/checkout/:planCode"
          element={
            <ProtectedRoute>
              <CheckoutPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payment/success"
          element={
            <ProtectedRoute>
              <PaymentResultPage resultStatus="success" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payment/failure"
          element={
            <ProtectedRoute>
              <PaymentResultPage resultStatus="failure" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payment/pending"
          element={
            <ProtectedRoute>
              <PaymentResultPage resultStatus="pending" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payments/history"
          element={
            <ProtectedRoute>
              <PaymentHistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/subjects/:subjectId"
          element={
            <SubscriptionRequiredRoute>
              <SubjectDetailPage />
            </SubscriptionRequiredRoute>
          }
        />
        <Route
          path="/subjects/:subjectId/chapters/:chapterId"
          element={
            <SubscriptionRequiredRoute>
              <ChapterDetailPage />
            </SubscriptionRequiredRoute>
          }
        />
        <Route
          path="/revision"
          element={
            <SubscriptionRequiredRoute>
              <RevisionZonePage />
            </SubscriptionRequiredRoute>
          }
        />
        <Route
          path="/lessons/:lessonId"
          element={
            <SubscriptionRequiredRoute>
              <LessonPlayerPage />
            </SubscriptionRequiredRoute>
          }
        />
        <Route
          path="/downloads"
          element={
            <SubscriptionRequiredRoute>
              <MyDownloadsScreen />
            </SubscriptionRequiredRoute>
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
        <Route path="*" element={<SmartFallbackRoute />} />
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
