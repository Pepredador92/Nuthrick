type SessionAuth = {
  getSession: () => Promise<{ data: { session: { access_token: string } | null } }>;
  refreshSession: () => Promise<{ data: { session: { access_token: string } | null } }>;
};

function tokenSession(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" && typeof payload.session_id === "string"
      ? { user: payload.sub as string, session: payload.session_id as string, expires: Number(payload.exp) }
      : null;
  } catch {
    return null;
  }
}

// Let the SDK manage token rotation. Retry only a request explicitly rejected
// at authentication, and only under a new token for that same signed-in session.
export function sessionRecoveryFetch(baseUrl: string, auth: () => SessionAuth, send: typeof fetch = fetch): typeof fetch {
  const origin = new URL(baseUrl).origin;
  let refreshing: { token: string; result: Promise<string | null> } | null = null;

  return async (input, init) => {
    const result = await send(input, init);
    if (result.status !== 401 || init?.signal?.aborted) return result;
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin !== origin || !/^\/(?:rest|functions)\/v1\//.test(url.pathname)) return result;

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const token = headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
    const previous = token ? tokenSession(token) : null;
    if (!token || !previous || (typeof ReadableStream !== "undefined" && init?.body instanceof ReadableStream)) return result;
    const error = await result.clone().json().catch(() => null) as { code?: string; message?: string; error?: string } | null;
    const rejected = ["PGRST301", "PGRST303", "bad_jwt"].includes(error?.code ?? "") ||
      /^(?:invalid jwt|jwt expired|jwt has expired)\b/i.test(error?.message ?? "") ||
      (error?.error === "unauthorized" && previous.expires <= Date.now() / 1000);
    if (!rejected) return result;

    const sameSession = (accessToken: string) => {
      const identity = tokenSession(accessToken);
      return identity?.user === previous.user && identity.session === previous.session;
    };
    if (refreshing?.token !== token) {
      const recovery = (async () => {
        try {
          const { data: { session } } = await auth().getSession();
          if (!session || !sameSession(session.access_token)) return null;
          if (session.access_token !== token) return session.access_token;
          const { data } = await auth().refreshSession();
          return data.session && sameSession(data.session.access_token) ? data.session.access_token : null;
        } catch {
          return null;
        }
      })();
      refreshing = { token, result: recovery };
      void recovery.finally(() => {
        if (refreshing?.result === recovery) refreshing = null;
      });
    }
    const renewed = await refreshing.result;
    if (!renewed || renewed === token || init?.signal?.aborted || (input instanceof Request && input.bodyUsed)) return result;
    headers.set("Authorization", `Bearer ${renewed}`);
    return send(input, { ...init, headers });
  };
}
