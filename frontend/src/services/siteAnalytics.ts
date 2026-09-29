const sessionKey = "nuthrick:analytics-session";

function sessionId() {
  try {
    const existing = sessionStorage.getItem(sessionKey);
    if (existing) return existing;
    const created = crypto.randomUUID().replace(/-/g, "");
    sessionStorage.setItem(sessionKey, created);
    return created;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

export function trackSiteVisit(path: string) {
  if (!path || path.startsWith("/app") || path.startsWith("/admin")) return;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/site-analytics`;
  const body = JSON.stringify({
    path: path.slice(0, 240),
    referrer: document.referrer.slice(0, 500),
    sessionId: sessionId(),
  });
  void fetch(url, {
    method: "POST",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body,
  }).catch(() => undefined);
}
