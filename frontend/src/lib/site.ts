import { siteOrigin } from '../../../supabase/functions/_shared/site';

// NEXT_PUBLIC_* is injected by vinext for both server metadata and browser links.
export const SITE_ORIGIN = siteOrigin(process.env.NEXT_PUBLIC_SITE_URL);
export function publicUrl(path = '/') {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new Error('invalid_public_path');
  return new URL(path, SITE_ORIGIN).toString();
}
export function authRedirectUrl(path: '/auth/callback' | '/reset-password') {
  // Local development keeps its own session storage; hosted product links are canonical.
  const current = typeof window !== 'undefined' ? new URL(window.location.origin) : null;
  const local = current && ['localhost', '127.0.0.1', '[::1]'].includes(current.hostname);
  return new URL(path, local ? current.origin : SITE_ORIGIN).toString();
}
