/** Web identity is independent from the operational email identity. */
export const PUBLIC_SITE_ORIGIN = 'https://nuthrick.com';
export const TECHNICAL_SITE_ORIGIN = 'https://nuthrick.vercel.app';

export function siteOrigin(configured?: string): string {
  const url = new URL(configured || PUBLIC_SITE_ORIGIN);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('invalid_site_url');
  }
  return url.origin;
}

/** Exact origins only. The technical fallback remains usable without becoming canonical. */
export function productOriginAllowed(origin: string | null, canonical: string): boolean {
  return origin === canonical || (canonical === PUBLIC_SITE_ORIGIN && origin === TECHNICAL_SITE_ORIGIN);
}
