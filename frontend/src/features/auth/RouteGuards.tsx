import { billingReturn } from '@/src/features/billing/returnToPlan';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '@/src/components/ui/Status';
import { useAuth } from './AuthProvider';
import { decidePrivateRoute } from './routeDecision';

export function RequireAuthentication() {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const decision = decidePrivateRoute({ loading, hasUser: Boolean(user), onboardingCompleted: profile?.onboarding_completed, pathname: location.pathname });
  if (decision === 'loading') return <LoadingState label="Preparando tu espacio…" />;
  if (decision === 'login') {
    const resume = (location.state as { resumeConsultation?: string } | null)?.resumeConsultation;
    const path = resume && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(resume)
      && /^\/app\/patients\/[^/]+\/consultations\/new$/.test(location.pathname)
      ? location.pathname.replace(/\/new$/, `/${resume}`)
      : location.pathname;
    return <Navigate to="/login" replace state={{ from: path + location.search + location.hash }} />;
  }
  if (decision === 'onboarding') return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

export function OnboardingGuard() {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingState label="Cargando tu perfil…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.onboarding_completed) return <Navigate to={billingReturn() ?? "/app"} replace />;
  return <Outlet />;
}
