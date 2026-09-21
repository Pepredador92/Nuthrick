// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { sanitizePortalContent } from "../../../supabase/functions/agenda/portal-content";
import { portalRequest } from "../../../supabase/functions/agenda/portal";
import {
  secretToken,
  sha256,
  encrypt,
} from "../../../supabase/functions/agenda/security";
const content = {
  goal: "Objetivo",
  instructions: "Visible",
  results: [],
  consultations: [],
};
const owner = "00000000-0000-0000-0000-000000000001";
const patientId = "10000000-0000-0000-0000-000000000001";
const req = new Request("https://example.invalid");
function dependencies() {
  return {
    rpc: vi.fn<
      (data: Record<string, unknown>) => Promise<Record<string, unknown>>
    >(async () => ({})),
    owner: vi.fn(async () => owner),
    limit: vi.fn(async () => {}),
    mail: vi.fn(async () => "sent"),
    key: secretToken(),
  };
}
describe("patient-only portal boundary", () => {
  it("issues a random manual code only after verified owner and identity acknowledgement, never emails it", async () => {
    const d = dependencies(),
      link = secretToken();
    d.rpc
      .mockResolvedValueOnce({
        enabled: true,
        encryptedLink: await encrypt(d.key, link),
      })
      .mockResolvedValueOnce({ expiresAt: "2026-09-21T20:00:00Z" });
    const result = await portalRequest(
      req,
      {
        op: "portal_owner",
        action: "issue_code",
        patientId,
        identityConfirmed: true,
        owner: "INJECTED",
      },
      d,
    );
    expect(result.code).toMatch(/^\d{8}$/);
    expect(d.owner).toHaveBeenCalledOnce();
    expect(d.mail).not.toHaveBeenCalled();
    const sent = d.rpc.mock.calls[1][0].p_data as Record<string, unknown>;
    expect(sent.owner).toBe(owner);
    expect(sent).not.toHaveProperty("code");
    expect(sent.linkHash).toBe(await sha256(link));
    const verify = dependencies();
    verify.key = d.key;
    verify.rpc.mockResolvedValue({ verified: true });
    await portalRequest(
      req,
      { op: "portal_verify_professional", link, code: result.code },
      verify,
    );
    const verified = verify.rpc.mock.calls[0][0].p_data as Record<
      string,
      unknown
    >;
    expect(verified.codeHash).toBe(sent.codeHash);
    expect(verified).not.toHaveProperty("email");
    await expect(
      portalRequest(
        req,
        { op: "portal_owner", action: "issue_code", patientId },
        dependencies(),
      ),
    ).rejects.toThrow("identity_confirmation_required");
    await expect(
      portalRequest(
        req,
        {
          op: "portal_patient",
          action: "issue_code",
          session: secretToken(),
          identityConfirmed: true,
        },
        dependencies(),
      ),
    ).rejects.toThrow("invalid_action");
  });
  it("strips clinical metadata at every nested level and preserves methods independently", () => {
    const point = {
      consultationId: patientId,
      date: "2026-09-16",
      value: "23",
      private: "SECRET",
    };
    const sanitized = sanitizePortalContent({
      ...content,
      privateNotes: "SECRET",
      results: ["Siri", "Brozek"].map((method) => ({
        id: method,
        label: "Masa grasa",
        unit: "kg",
        method,
        points: [point],
        inputs: "SECRET",
      })),
      consultations: [
        {
          id: patientId,
          date: "2026-09-16",
          title: "Seguimiento",
          summary: "Visible",
          answers: "SECRET",
        },
      ],
    });
    expect(JSON.stringify(sanitized)).not.toContain("SECRET");
    expect(sanitized.results.map((r) => r.method)).toEqual(["Siri", "Brozek"]);
  });
  it("rejects oversized or malformed data", () => {
    expect(() =>
      sanitizePortalContent({ ...content, instructions: "a".repeat(12001) }),
    ).toThrow();
    expect(() =>
      sanitizePortalContent({ ...content, results: Array(61).fill({}) }),
    ).toThrow();
    expect(() =>
      sanitizePortalContent({
        ...content,
        consultations: [
          { id: "bad", date: "2026-09-16", title: "x", summary: "" },
        ],
      }),
    ).toThrow();
  });
  it("derives the professional from verified authentication, not supplied owner/sender", async () => {
    const d = dependencies();
    await portalRequest(
      req,
      {
        op: "portal_owner",
        action: "message",
        patientId,
        owner: "attacker",
        sender: "patient",
        body: "Hola",
        clientId: patientId,
      },
      d,
    );
    expect(d.owner).toHaveBeenCalledWith(req);
    expect(d.rpc).toHaveBeenCalledWith({
      p_action: "message",
      p_data: { owner, patientId, body: "Hola", clientId: patientId },
    });
  });
  it("a patient cannot inject owner or another patient id into an operation", async () => {
    const d = dependencies(),
      session = secretToken();
    await portalRequest(
      req,
      {
        op: "portal_patient",
        session,
        action: "message",
        owner,
        patientId,
        body: "Hola",
        clientId: patientId,
      },
      d,
    );
    expect(d.rpc).toHaveBeenCalledWith({
      p_action: "message",
      p_data: {
        sessionHash: await sha256(session),
        body: "Hola",
        clientId: patientId,
      },
    });
    expect(d.owner).not.toHaveBeenCalled();
  });
  it("denies patient publishing and professional access to personal notes", async () => {
    const d = dependencies();
    await expect(
      portalRequest(
        req,
        {
          op: "portal_patient",
          session: secretToken(),
          action: "publish",
          shared: content,
        },
        d,
      ),
    ).rejects.toThrow("invalid_action");
    await expect(
      portalRequest(req, { op: "portal_owner", patientId, action: "notes" }, d),
    ).rejects.toThrow("invalid_action");
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("does not email an invalid challenge, and never returns OTPs or recipient data", async () => {
    const d = dependencies(),
      link = secretToken();
    d.rpc.mockResolvedValueOnce({ error: "portal_unavailable" });
    await expect(
      portalRequest(
        req,
        { op: "portal_code", link, email: "patient@example.invalid" },
        d,
      ),
    ).rejects.toThrow("portal_unavailable");
    expect(d.mail).not.toHaveBeenCalled();
    d.rpc.mockResolvedValueOnce({ email: "patient@example.invalid" });
    const result = await portalRequest(
      req,
      { op: "portal_code", link, email: "patient@example.invalid" },
      d,
    );
    expect(Object.keys(result).sort()).toEqual(["delivery", "id"]);
    expect(d.mail).toHaveBeenCalledOnce();
    const args = d.rpc.mock.calls.at(-1)![0] as {
      p_data: Record<string, unknown>;
    };
    expect(args.p_data.linkHash).toBe(await sha256(link));
    expect(args.p_data).not.toHaveProperty("code");
  });
  it("stores only a hashed session on a successful purpose-specific verification", async () => {
    const d = dependencies();
    d.rpc.mockResolvedValue({ verified: true });
    const result = await portalRequest(
      req,
      {
        op: "portal_verify",
        link: secretToken(),
        id: patientId,
        code: "123456",
      },
      d,
    );
    const sent = d.rpc.mock.calls[0][0] as {
      p_action: string;
      p_data: Record<string, unknown>;
    };
    expect(sent.p_action).toBe("verify");
    expect(sent.p_data.newSessionHash).toBe(
      await sha256(String(result.session)),
    );
    expect(sent.p_data).not.toHaveProperty("session");
  });
});
