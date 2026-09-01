import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '@/src/components/ui/Status';
import { useAuth } from './AuthProvider';
import { decidePrivateRoute } from './routeDecision';

export function RequireAuthentication() {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const decision = decidePrivateRoute({ loading, hasUser: Boolean(user), onboardingCompleted: profile?.onboarding_completed, pathname: location.pathname });
  if (decision === 'loading') return <LoadingState label="Preparando tu espacio…" />;
  if (decision === 'login') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (decision === 'onboarding') return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

export function OnboardingGuard() {
  const { user, profile, loading } = useAuth();
  if (loading) return <LoadingState label="Cargando tu perfil…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.onboarding_completed) return <Navigate to="/app" replace />;
  return <Outlet />;
}
