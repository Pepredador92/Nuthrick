import { describe, expect, it, vi } from "vitest";
import { sessionRecoveryFetch } from "./sessionRecovery";

const origin = "https://project.supabase.co";
const resource = origin + "/rest/v1/rpc/sync_consultation_answers";
const token = (session: string, expires: number) =>
  "header." + btoa(JSON.stringify({ sub: "professional", session_id: session, exp: expires })) + ".signature";
const initial = token("active-session", 1);
const renewed = token("active-session", 2);
const authResult = (access_token: string) => ({ data: { session: { access_token } } });
const request = { method: "POST", body: '{"requestId":"synthetic"}', headers: { Authorization: `Bearer ${initial}` } };

describe("Supabase session recovery", () => {
  it("renews a rejected token and reuses the exact mutation on the same session", async () => {
    const auth = {
      getSession: vi.fn().mockResolvedValue(authResult(initial)),
      refreshSession: vi.fn().mockResolvedValue(authResult(renewed)),
    };
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "PGRST303", message: "JWT expired" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ version: 2 }));
    const fetchWithRecovery = sessionRecoveryFetch(origin, () => auth, send);
    expect(await (await fetchWithRecovery(resource, request)).json()).toEqual({ version: 2 });
    expect(auth.refreshSession).toHaveBeenCalledOnce();
    expect(send.mock.calls[1]?.[1]?.body).toBe(request.body);
    expect(new Headers(send.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe(`Bearer ${renewed}`);
  });

  it("shares a refresh across simultaneous rejected requests", async () => {
    const auth = { getSession: vi.fn().mockResolvedValue(authResult(initial)), refreshSession: vi.fn().mockResolvedValue(authResult(renewed)) };
    const send = vi.fn<typeof fetch>(async (_input, options) =>
      new Headers(options?.headers).get("Authorization") === `Bearer ${renewed}`
        ? Response.json({})
        : Response.json({ message: "Invalid JWT" }, { status: 401 }));
    const fetchWithRecovery = sessionRecoveryFetch(origin, () => auth, send);
    const results = await Promise.all([fetchWithRecovery(resource, request), fetchWithRecovery(resource, request)]);
    expect(results.map(response => response.status)).toEqual([200, 200]);
    expect(auth.refreshSession).toHaveBeenCalledOnce();
  });

  it("preserves the rejection after sign-in to a different session and skips ordinary authorization errors", async () => {
    const auth = { getSession: vi.fn().mockResolvedValue(authResult(token("other-session", 2))), refreshSession: vi.fn() };
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ code: "PGRST301" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ error: "permission_denied" }, { status: 401 }));
    const fetchWithRecovery = sessionRecoveryFetch(origin, () => auth, send);
    expect((await fetchWithRecovery(resource, request)).status).toBe(401);
    expect((await fetchWithRecovery(resource, request)).status).toBe(401);
    expect(send).toHaveBeenCalledTimes(2);
    expect(auth.getSession).toHaveBeenCalledOnce();
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});
