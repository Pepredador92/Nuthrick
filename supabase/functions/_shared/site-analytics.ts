/** Public categories only: never persist a patient link, query, or profile slug. */
export function publicVisitPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) return null;
  const path = value.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  if (['/', '/planes', '/privacy', '/terms', '/refunds'].includes(path)) return path;
  if (/^\/p\/[a-z0-9-]+$/i.test(path)) return '/perfil-publico';
  if (/^\/p\/[a-z0-9-]+\/agendar$/i.test(path)) return '/reservar-cita';
  return null;
}
export function publicReferrer(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password && /^[a-z0-9.-]+$/i.test(url.hostname) ? url.origin.slice(0, 200) : '';
  } catch { return ''; }
}
