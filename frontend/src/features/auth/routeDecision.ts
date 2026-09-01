export type PrivateRouteDecision = 'loading' | 'login' | 'onboarding' | 'allow';

export function decidePrivateRoute(input: {
  loading: boolean;
  hasUser: boolean;
  onboardingCompleted?: boolean;
  pathname: string;
}): PrivateRouteDecision {
  if (input.loading) return 'loading';
  if (!input.hasUser) return 'login';
  if (!input.onboardingCompleted && input.pathname !== '/onboarding') return 'onboarding';
  return 'allow';
}
