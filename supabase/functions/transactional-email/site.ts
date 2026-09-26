/** Web identity is independent from the operational email identity. */
export const PUBLIC_SITE_ORIGIN = "https://nuthrick.com";
export const TECHNICAL_SITE_ORIGIN = "https://nuthrick.vercel.app";

export function productOriginAllowed(origin: string | null, canonical: string) {
  return origin === canonical ||
    (canonical === PUBLIC_SITE_ORIGIN && origin === TECHNICAL_SITE_ORIGIN);
}
