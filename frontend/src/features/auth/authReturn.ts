type ReturnLocation = Pick<Location, 'pathname' | 'search' | 'hash'>;

/** Supabase Dashboard invitations fall back to Site URL (/), outside the app router. */
export function authReturnTarget(location: ReturnLocation): string | null {
  if (location.pathname !== '/') return null;
  const fragment = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const failed = fragment.has('error') || fragment.has('error_code') || query.has('error') || query.has('error_code');
  const hasSession = fragment.has('access_token') || fragment.has('refresh_token');
  if (!hasSession && !query.has('code') && !failed) return null;
  const path = !failed && fragment.get('type') === 'recovery' ? '/reset-password' : '/auth/callback';
  // Keep credentials in the browser fragment; destination is always a fixed local route.
  return `${path}${location.search}${location.hash}`;
}
