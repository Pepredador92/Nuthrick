import { productOriginAllowed } from "../_shared/site.ts";
import { Webhook } from "svix";
import {
  EmailError,
  type Envelope,
  type Message,
  renderEmail,
  SITE,
  type TransactionalEmailProvider,
} from "./domain.ts";
type Data = Record<string, unknown>;
export type Dependencies = {
  rpc: <T = Data>(action: string, data?: Data) => Promise<T>;
  authenticate: (token: string) => Promise<string | null>;
  provider: () => TransactionalEmailProvider;
  workerSecret?: string;
  webhookSecret?: string;
  now?: () => number;
};
const safeErrors = new Set([
  "unauthorized",
  "admin_required",
  "invalid_input",
  "invalid_signature",
  "email_configuration_required",
  "email_configuration_changed",
  "email_domain_unavailable",
  "email_domain_mismatch",
  "invalid_domain",
  "email_worker_configuration_required",
]);
async function readBody(req: Request, max = 131072) {
  const reader = req.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new EmailError("invalid_input");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(result);
}
export function createEmailHandler(deps: Dependencies) {
  return async (req: Request) => {
    const origin = req.headers.get("origin");
    const headers = {
      "content-type": "application/json",
      "cache-control": "no-store",
      "vary": "Origin",
      ...(productOriginAllowed(origin, SITE)
        ? {
          "access-control-allow-origin": origin!,
          "access-control-allow-headers":
            "authorization, apikey, content-type, x-client-info",
          "access-control-allow-methods": "POST, OPTIONS",
        }
        : {}),
    };
    const reply = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: productOriginAllowed(origin, SITE) ? 204 : 403,
        headers,
      });
    }
    if (req.method !== "POST") {
      return reply({ error: "method_not_allowed" }, 405);
    }
    try {
      const raw = await readBody(req);
      if (new URL(req.url).pathname.endsWith("/transactional-email/webhook")) {
        if (!deps.webhookSecret) {
          throw new EmailError("email_configuration_required");
        }
        let event: {
          type: string;
          created_at: string;
          data: { email_id: string };
        };
        try {
          new Webhook(deps.webhookSecret).verify(raw, {
            "svix-id": req.headers.get("svix-id") ?? "",
            "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
            "svix-signature": req.headers.get("svix-signature") ?? "",
          });
          event = JSON.parse(raw);
          if (
            !event || typeof event.type !== "string" ||
            typeof event.created_at !== "string" ||
            typeof event.data?.email_id !== "string"
          ) throw new Error("invalid_event");
        } catch {
          throw new EmailError("invalid_signature");
        }
        if (
          ![
            "email.sent",
            "email.delivered",
            "email.bounced",
            "email.failed",
            "email.complained",
            "email.delivery_delayed",
            "email.suppressed",
          ].includes(event.type)
        ) return reply({ ignored: true });
        return reply(
          await deps.rpc("delivery_event", {
            event_id: req.headers.get("svix-id"),
            provider_message_id: event.data.email_id,
            type: event.type,
            occurred_at: event.created_at,
          }),
        );
      }
      if (origin && !productOriginAllowed(origin, SITE)) {
        return reply({ error: "origin_not_allowed" }, 403);
      }
      const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)
        ?.[1];
      if (!token) throw new EmailError("unauthorized");
      let data: Data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new EmailError("invalid_input");
      }
      if (
        !data || Array.isArray(data) ||
        !["worker", "verify"].includes(String(data.action))
      ) throw new EmailError("invalid_input");
      const worker = !!deps.workerSecret && deps.workerSecret.length >= 32 &&
        token === deps.workerSecret && data.action === "worker";
      if (!worker) {
        const actor = await deps.authenticate(token);
        if (!actor) throw new EmailError("unauthorized");
        await deps.rpc("authorize_admin", { actor });
      }
      const provider = deps.provider();
      if (data.action === "verify") {
        const settings = await deps.rpc<
          { domain_id: string; domain_name: string }
        >("configuration");
        const evidence = await provider.inspectDomain(
          settings.domain_id,
          settings.domain_name,
        );
        return reply(
          await deps.rpc("verified", {
            ...settings,
            evidence,
            runtime_ready: !!deps.webhookSecret && !!deps.workerSecret &&
              deps.workerSecret.length >= 32,
          }),
        );
      }
      const counts = { accepted: 0, failed: 0 };
      for (let i = 0; i < 5; i++) {
        const lease = crypto.randomUUID();
        const item = await deps.rpc<Envelope | null>("claim", {
          lease_key: lease,
        });
        if (!item) break;
        let result: Data;
        try {
          if (
            (deps.now?.() ?? Date.now()) - Date.parse(item.first_attempt_at) >
              23 * 60 * 60 * 1000
          ) throw new EmailError("email_delivery_requires_reconciliation");
          const message = item.prepared_message ??
            await deps.rpc<Message>("prepare", {
              id: item.id,
              lease_key: lease,
              message: renderEmail(item),
            });
          const id = await provider.send(message, item.id);
          result = { provider_message_id: id };
          counts.accepted++;
        } catch (e) {
          const error = e instanceof EmailError
            ? e
            : new EmailError("email_delivery_unknown", true);
          result = { code: error.message, retryable: error.retryable };
          counts.failed++;
        }
        // If persistence fails, retain the lease; next attempt uses the same frozen message/key.
        await deps.rpc("complete", {
          id: item.id,
          lease_key: lease,
          ...result,
        });
      }
      await deps.rpc("worker_done", counts);
      return reply(counts);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = safeErrors.has(message) ? message : "email_unavailable";
      return reply(
        { error: code },
        code === "unauthorized"
          ? 401
          : code === "admin_required"
          ? 403
          : code === "invalid_signature" || code === "invalid_input"
          ? 400
          : 409,
      );
    }
  };
}
