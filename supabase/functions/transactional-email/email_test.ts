import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1";
import { Webhook } from "svix";
import {
  EmailError,
  type Envelope,
  renderEmail,
  SITE,
  TEMPLATE_KEYS,
} from "./domain.ts";
import { ResendEmailProvider } from "./provider.ts";
import { createEmailHandler, type Dependencies } from "./handler.ts";
const envelope: Envelope = {
  id: "00000000-0000-4000-8000-000000000001",
  recipient: "controlled@example.org",
  template_key: "welcome",
  subject: "Bienvenida · nutrición",
  body: "Información comercial áéíóú.",
  mode: "test",
  controlled_test: true,
  from_email: "notifications@example.org",
  reply_to: "support@example.org",
  support_email: "support@example.org",
  privacy_email: "privacy@example.org",
  first_attempt_at: new Date().toISOString(),
  attempts: 1,
};
Deno.test("all 15 templates render production links, Spanish, footer and TEST label without patient payload", () => {
  for (const template_key of TEMPLATE_KEYS) {
    const input = {
      ...envelope,
      template_key,
      patient: "PRIVATE_PATIENT",
      diagnosis: "PRIVATE_DIAGNOSIS",
    };
    const m = renderEmail(input);
    assert(m.subject.startsWith("[TEST]"));
    assert(m.html.includes("viewport"));
    assert(m.html.includes("áéíóú"));
    assert(!m.html.includes("PRIVATE_"));
    assert(!m.text.includes("PRIVATE_"));
    assert(!m.html.includes("localhost"));
    for (const path of ["/terms", "/privacy", "/refunds"]) {
      assert(m.html.includes(SITE + path));
    }
  }
});
Deno.test("render rejects invalid recipient/header and escapes text injection", () => {
  assertThrows(
    () => renderEmail({ ...envelope, recipient: "invalid" }),
    EmailError,
    "invalid_recipient",
  );
  assertThrows(
    () => renderEmail({ ...envelope, subject: "Subject\r\nBcc: attacker" }),
    EmailError,
    "invalid_template",
  );
  const m = renderEmail({ ...envelope, body: '<img src=x onerror="boom">' });
  assert(!m.html.includes("<img"));
  assert(m.html.includes("&lt;img"));
});
Deno.test("provider uses stable idempotency key and exact body on retry", async () => {
  const requests: RequestInit[] = [];
  const http: typeof fetch = async (_url, init) => {
    requests.push(init!);
    return Response.json({ id: "provider_id" });
  };
  const p = new ResendEmailProvider("re_fixture", http);
  const m = renderEmail(envelope);
  await p.send(m, envelope.id);
  await p.send(m, envelope.id);
  assertEquals(requests[0].body, requests[1].body);
  assertEquals(
    new Headers(requests[0].headers).get("Idempotency-Key"),
    "nuthrick-email/" + envelope.id,
  );
});
for (
  const [status, retryable, code] of [[429, true, "email_rate_limited"], [
    500,
    true,
    "email_delivery_unknown",
  ], [403, false, "email_provider_rejected"]] as const
) {
  Deno.test(`provider ${status} has bounded safe failure`, async () => {
    const p = new ResendEmailProvider(
      "re_fixture",
      async () => new Response("secret internal detail", { status }),
    );
    const e = await assertRejects(
      () => p.send(renderEmail(envelope), envelope.id),
      EmailError,
      code,
    );
    assertEquals(e.retryable, retryable);
  });
}
Deno.test("network timeout is ambiguous retryable, no leaked exception", async () => {
  const p = new ResendEmailProvider(
    "re_fixture",
    () => Promise.reject(new Error("SECRET")),
  );
  const e = await assertRejects(
    () => p.send(renderEmail(envelope), envelope.id),
    EmailError,
    "email_delivery_unknown",
  );
  assertEquals(e.retryable, true);
});
Deno.test("domain proof requires SPF, DKIM and one DMARC record", async () => {
  const id = envelope.id;
  const p = new ResendEmailProvider(
    "re_fixture",
    async (url) =>
      String(url).includes("resend.com")
        ? Response.json({
          id,
          name: "example.org",
          status: "verified",
          records: [{ record: "SPF", status: "verified" }, {
            record: "DKIM",
            status: "verified",
          }],
        })
        : Response.json({
          Answer: [{ type: 16, data: '"v=DMARC1; p=none;"' }],
        }),
  );
  const e = await p.inspectDomain(id, "example.org");
  assert(e.spf && e.dkim && e.dmarc);
  await assertRejects(
    () => p.inspectDomain(id, "different.org"),
    EmailError,
    "email_domain_mismatch",
  );
});
const secret = "whsec_" + btoa("local-test-webhook-secret-32-bytes");
function dependencies(rpc: Dependencies["rpc"]): Dependencies {
  return {
    rpc,
    authenticate: async () => "admin-id",
    provider: () => ({
      send: async () => "provider_id",
      inspectDomain: async () => ({
        spf: true,
        dkim: true,
        dmarc: true,
        provider_status: "verified",
        records: [],
        dmarc_records: [],
      }),
    }),
    workerSecret: "w".repeat(32),
    webhookSecret: secret,
  };
}
Deno.test("Svix verifies raw payload; minimal delivery metadata stored; duplicate uses same event ID", async () => {
  const calls: unknown[] = [];
  const deps = dependencies(
    async <T>(_a: string, d?: Record<string, unknown>) => {
      calls.push(d);
      return {} as T;
    },
  );
  const handler = createEmailHandler(deps);
  const body = JSON.stringify({
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: { email_id: "provider_id", to: ["PII"], subject: "SECRET" },
  });
  const now = new Date();
  const id = "msg_fixture_1";
  const headers = {
    "svix-id": id,
    "svix-timestamp": Math.floor(now.getTime() / 1000).toString(),
    "svix-signature": new Webhook(secret).sign(id, now, body),
  };
  for (let i = 0; i < 2; i++) {
    assertEquals(
      (await handler(
        new Request("https://server/transactional-email/webhook", {
          method: "POST",
          headers,
          body,
        }),
      )).status,
      200,
    );
  }
  assertEquals(calls[0], calls[1]);
  assert(!JSON.stringify(calls).includes("PII"));
  assert(!JSON.stringify(calls).includes("SECRET"));
  assertEquals(
    (await handler(
      new Request("https://server/transactional-email/webhook", {
        method: "POST",
        headers,
        body: body + " ",
      }),
    )).status,
    400,
  );
});
Deno.test("worker rejects missing auth, foreign origin and ordinary professional", async () => {
  const deps = dependencies(async () => {
    throw new EmailError("admin_required");
  });
  const handler = createEmailHandler(deps);
  const request = (headers: Record<string, string>) =>
    new Request("https://server/transactional-email", {
      method: "POST",
      headers,
      body: '{"action":"worker"}',
    });
  assertEquals((await handler(request({}))).status, 401);
  assertEquals(
    (await handler(
      request({ authorization: "Bearer user", origin: "https://evil.example" }),
    )).status,
    403,
  );
  assertEquals(
    (await handler(request({ authorization: "Bearer user" }))).status,
    403,
  );
});
Deno.test("worker persists frozen message and completion, but refuses resend after 23h", async () => {
  for (const expired of [false, true]) {
    let sent = 0;
    let claims = 0;
    const actions: string[] = [];
    const deps = dependencies(
      async <T>(a: string, d?: Record<string, unknown>) => {
        actions.push(a);
        if (a === "claim") {
          return (claims++ === 0
            ? {
              ...envelope,
              first_attempt_at: new Date(
                Date.now() - (expired ? 25 : 0) * 3600000,
              ).toISOString(),
            }
            : null) as T;
        }
        if (a === "prepare") return d?.message as T;
        if (a === "complete" && expired) {
          assertEquals(d?.code, "email_delivery_requires_reconciliation");
        }
        return {} as T;
      },
    );
    deps.provider = () => ({
      send: async () => {
        sent++;
        return "provider_id";
      },
      inspectDomain: async () => {
        throw new Error();
      },
    });
    const r = await createEmailHandler(deps)(
      new Request("https://server/transactional-email", {
        method: "POST",
        headers: { authorization: "Bearer " + "w".repeat(32) },
        body: '{"action":"worker"}',
      }),
    );
    assertEquals(r.status, 200);
    assertEquals(sent, expired ? 0 : 1);
    assert(actions.includes("complete"));
    if (!expired) assert(actions.includes("prepare"));
  }
});
