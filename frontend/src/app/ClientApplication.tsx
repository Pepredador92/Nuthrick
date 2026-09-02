'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/src/features/auth/AuthProvider';
import { OnboardingGuard, RequireAuthentication } from '@/src/features/auth/RouteGuards';
import { PrivateLayout } from '@/src/layouts/PrivateLayout';
import { AuthCallbackPage, AuthPage, ForgotPasswordPage, ResetPasswordPage } from '@/src/screens/AuthPages';
import { DashboardPage } from '@/src/screens/DashboardPage';
import { LandingPage } from '@/src/screens/LandingPage';
import { LegalPage } from '@/src/screens/LegalPage';
import { NotFoundPage } from '@/src/screens/NotFoundPage';
import { OnboardingPage } from '@/src/screens/OnboardingPage';
import { ProfilePage } from '@/src/screens/ProfilePage';
import { PublicProfilePage } from '@/src/screens/PublicProfilePage';
import { PatientsPage } from '@/src/screens/PatientsPage';
import { PatientDetailPage } from '@/src/screens/PatientDetailPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}

export function ClientApplication() {
  const isBrowser = useSyncExternalStore(() => () => undefined, () => true, () => false);
  if (!isBrowser) return <div className="min-h-screen bg-[#f7f8f4]" aria-hidden="true" />;

  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route element={<OnboardingGuard />}><Route path="/onboarding" element={<OnboardingPage />} /></Route>
          <Route element={<RequireAuthentication />}>
            <Route path="/app" element={<PrivateLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="patients" element={<PatientsPage />} />
              <Route path="patients/:patientId" element={<PatientDetailPage />} />
              <Route path="patients/:patientId/record" element={<PatientDetailPage recordMode />} />
            </Route>
          </Route>
          <Route path="/p/:slug" element={<PublicProfilePage />} />
          <Route path="/privacy" element={<LegalPage type="privacy" />} />
          <Route path="/terms" element={<LegalPage type="terms" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
