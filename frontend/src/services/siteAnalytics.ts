import { publicReferrer, publicVisitPath } from '../../../supabase/functions/_shared/site-analytics';
const sessionKey = 'nuthrick:analytics-session';
let memorySession: string | undefined;
function sessionId() {
  try {
    const existing = sessionStorage.getItem(sessionKey);
    if (existing) return existing;
    const created = crypto.randomUUID().replace(/-/g, '');
    sessionStorage.setItem(sessionKey, created);
    return created;
  } catch {
    memorySession ??= crypto.randomUUID().replace(/-/g, '');
    return memorySession;
  }
}
export function trackSiteVisit(path: string) {
  const category = publicVisitPath(path);
  if (!category) return;
  void fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/site-analytics`, {
    method: 'POST', keepalive: true, referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ path: category, referrer: publicReferrer(document.referrer), sessionId: sessionId() }),
  }).catch(() => undefined);
}
