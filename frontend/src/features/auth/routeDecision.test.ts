import { describe, expect, it } from 'vitest';
import { decidePrivateRoute } from './routeDecision';

describe('private route decisions', () => {
  it('redirects anonymous users to login', () => {
    expect(decidePrivateRoute({ loading: false, hasUser: false, pathname: '/app' })).toBe('login');
  });

  it('requires onboarding before the dashboard', () => {
    expect(decidePrivateRoute({ loading: false, hasUser: true, onboardingCompleted: false, pathname: '/app' })).toBe('onboarding');
  });

  it('allows configured professionals', () => {
    expect(decidePrivateRoute({ loading: false, hasUser: true, onboardingCompleted: true, pathname: '/app' })).toBe('allow');
  });
});
