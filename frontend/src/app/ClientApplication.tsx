"use client";

import { useEffect, useSyncExternalStore } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "@/src/features/auth/AuthProvider";
import {
  OnboardingGuard,
  RequireAuthentication,
} from "@/src/features/auth/RouteGuards";
import { PrivateLayout } from "@/src/layouts/PrivateLayout";
import {
  AuthCallbackPage,
  AuthPage,
  ForgotPasswordPage,
  ResetPasswordPage,
} from "@/src/screens/AuthPages";
import { DashboardPage } from "@/src/screens/DashboardPage";
import { LandingPage } from "@/src/screens/LandingPage";
import { LegalPage } from "@/src/screens/LegalPage";
import { NotFoundPage } from "@/src/screens/NotFoundPage";
import { OnboardingPage } from "@/src/screens/OnboardingPage";
import { ProfilePage } from "@/src/screens/ProfilePage";
import { PublicProfilePage } from "@/src/screens/PublicProfilePage";
import { PatientsPage } from "@/src/screens/PatientsPage";
import { PatientDetailPage } from "@/src/screens/PatientDetailPage";
import { ConsultationPage } from "@/src/screens/ConsultationPage";
import { ConsultationTemplateEditorPage } from "@/src/screens/ConsultationTemplateEditorPage";
import { DietWorkshopPage } from "@/src/screens/DietWorkshopPage";
import { AgendaPage } from "@/src/screens/AgendaPage";
import { PublicBookingPage } from "@/src/screens/PublicBookingPage";
import { AgendaResponsePage } from "@/src/screens/AgendaResponsePage";
import { PatientPortalPage } from "@/src/screens/PatientPortalPage";
import { PatientPortalOwnerPage } from "@/src/screens/PatientPortalOwnerPage";
import { PatientMessagesPage } from "@/src/screens/PatientMessagesPage";

import { AccessProvider, AdminGuard, ProfessionalAccessGate } from '@/src/features/admin/AccessProvider';
import { AdminLayout } from '@/src/features/admin/AdminLayout';
import { AdminHome, ProfessionalsPage, PlansPage, PlanEditorPage, CreditsPage } from '@/src/features/admin/AdminPages';
import { ProfessionalPage } from '@/src/features/admin/ProfessionalPage';
import { CommercialPlansPage } from '@/src/features/admin/CommercialPlansPage';
import { PromotionsPage, PromotionEditorPage, SubscriptionsPage, PaymentsPage, BillingSettingsPage } from '@/src/features/billing/AdminBillingPages';
import { MyPlanPage } from '@/src/features/billing/MyPlanPage';
import { CodesPage } from '@/src/features/admin/CodesPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

export function ClientApplication() {
  const isBrowser = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  if (!isBrowser)
    return <div className="min-h-screen bg-[#f7f8f4]" aria-hidden="true" />;

  return (
    <BrowserRouter>
      <AuthProvider>
        <AccessProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/planes" element={<CommercialPlansPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route element={<OnboardingGuard />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
          </Route>
          <Route element={<AdminGuard />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminHome />} />
              <Route path="professionals" element={<ProfessionalsPage />} />
              <Route path="professionals/:professionalId" element={<ProfessionalPage />} />
              <Route path="plans" element={<PlansPage />} />
              <Route path="plans/:planId" element={<PlanEditorPage />} />
              <Route path="access" element={<ProfessionalsPage accessMode />} />
              <Route path="access/codes" element={<CodesPage />} />
              <Route path="credits" element={<CreditsPage />} />
              <Route path="promotions" element={<PromotionsPage />} />
              <Route path="promotions/new" element={<PromotionEditorPage />} />
              <Route path="promotions/:campaignId" element={<PromotionEditorPage />} />
              <Route path="subscriptions" element={<SubscriptionsPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="billing" element={<BillingSettingsPage />} />
            </Route>
          </Route>
          <Route element={<RequireAuthentication />}>
            <Route path="/app" element={<PrivateLayout />}>
              <Route path="my-plan" element={<MyPlanPage />} />
              <Route element={<ProfessionalAccessGate />}>
              <Route index element={<DashboardPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="agenda" element={<AgendaPage />} />
              <Route path="messages" element={<PatientMessagesPage />} />
              <Route path="patients" element={<PatientsPage />} />
              <Route path="patients/:patientId/portal" element={<PatientPortalOwnerPage />} />
              <Route
                path="patients/:patientId"
                element={<PatientDetailPage />}
              />
              <Route
                path="patients/:patientId/consultations/new"
                element={<ConsultationPage />}
              />
              <Route
                path="patients/:patientId/consultations/:consultationId"
                element={<ConsultationPage />}
              />
              <Route
                path="consultation-templates/:consultationType"
                element={<ConsultationTemplateEditorPage />}
              />
              <Route path="diet-workshop" element={<DietWorkshopPage />} />
              <Route path="diet-workshop/:dietPlanId" element={<DietWorkshopPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="/p/:slug" element={<PublicProfilePage />} />
          <Route path="/p/:slug/agendar" element={<PublicBookingPage />} />
          <Route path="/p/:slug/agendar/datos" element={<PublicBookingPage />} />
          <Route path="/agenda/responder" element={<AgendaResponsePage />} />
          <Route path="/mi-espacio" element={<PatientPortalPage />} />
          <Route path="/privacy" element={<LegalPage type="privacy" />} />
          <Route path="/terms" element={<LegalPage type="terms" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </AccessProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
