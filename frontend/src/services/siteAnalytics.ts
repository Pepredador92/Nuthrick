import { publicReferrer, publicVisitPath } from '../../../supabase/functions/_shared/site-analytics';
import { isSimulation } from '@/src/features/simulator/state';
const sessionKey = 'nuthrick:analytics-session';
const sessionCookie = 'nuthrick_analytics_session';
let memorySession: string | undefined;
function validSession(value: string | null | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{32}$/.test(value));
}

function cookieSession() {
  try {
    const prefix = `${sessionCookie}=`;
    const value = document.cookie.split(';').map((part) => part.trim())
      .find((part) => part.startsWith(prefix))?.slice(prefix.length);
    return validSession(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function saveSessionCookie(value: string) {
  try {
    document.cookie = `${sessionCookie}=${value}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    return cookieSession() === value;
  } catch {
    return false;
  }
}

function sessionId() {
  // A first-party session cookie survives reloads and is shared by tabs, so
  // the database can deduplicate repeated views from the same browser session.
  const cookie = cookieSession();
  if (cookie) return cookie;

  let stored: string | null = null;
  try { stored = localStorage.getItem(sessionKey); } catch { /* Fall through to tab storage. */ }
  if (!validSession(stored)) {
    try { stored = sessionStorage.getItem(sessionKey); } catch { /* Fall through to memory. */ }
  }

  const value = validSession(stored) ? stored : memorySession ?? crypto.randomUUID().replace(/-/g, '');
  if (saveSessionCookie(value)) return value;

  // Keep the same behavior when first-party cookies are disabled.
  try { localStorage.setItem(sessionKey, value); } catch { /* Fall through to tab storage. */ }
  try { sessionStorage.setItem(sessionKey, value); } catch { /* Fall through to memory. */ }
  memorySession = value;
  return value;
}

export function trackSiteVisit(path: string) {
  if (isSimulation()) return;
  const category = publicVisitPath(path);
  if (!category) return;
  void fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/site-analytics`, {
    method: 'POST', keepalive: true, referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ path: category, referrer: publicReferrer(document.referrer), sessionId: sessionId() }),
  }).catch(() => undefined);
}
