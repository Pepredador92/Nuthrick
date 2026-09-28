import { StripeBillingProvider } from "../billing/stripe-provider.ts";
import { createClient } from "@supabase/supabase-js";
import { createEmailHandler } from "./handler.ts";
import { GmailEmailProvider } from "./gmail-provider.ts";
import { ResendEmailProvider } from "./provider.ts";
import { EmailError } from "./domain.ts";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type RpcData = Record<string, unknown>;
async function rpc<T = RpcData>(
  action: string,
  data: RpcData = {},
): Promise<T> {
  const result = action === "authorize_worker"
    ? await db.rpc("transactional_email_worker_authorized", {
      p_token: data.token,
    })
    : await db.rpc("transactional_email_server", {
      p_action: action,
      p_data: data,
    });
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

Deno.serve(createEmailHandler({
  provider: async () => {
    const settings = await rpc<{
      provider: string;
      from_email: string;
    }>("configuration");
    if (settings.provider === "gmail") {
      const credentials = await rpc<{
        email: string;
        encrypted_refresh_token: string;
      }>("gmail_credentials");
      if (
        !credentials ||
        credentials.email.trim().toLowerCase() !==
          settings.from_email.trim().toLowerCase()
      ) {
        throw new EmailError("email_sender_mismatch");
      }
      return new GmailEmailProvider({
        senderEmail: settings.from_email,
        encryptedRefreshToken: credentials.encrypted_refresh_token,
        encryptionKey: Deno.env.get("AGENDA_ENCRYPTION_KEY") ?? "",
        clientId: Deno.env.get("AGENDA_GOOGLE_CLIENT_ID") ?? "",
        clientSecret: Deno.env.get("AGENDA_GOOGLE_CLIENT_SECRET") ?? "",
      });
    }
    return new ResendEmailProvider(Deno.env.get("RESEND_API_KEY") ?? "");
  },
  collect: async () => {
    const candidates = await rpc<
      {
        id: string;
        provider_subscription_id: string;
        provider_customer_id: string;
        period_end: string;
        mode: "test" | "live";
      }[]
    >("renewal_candidates");
    const providers = new Map<string, StripeBillingProvider>();
    for (const item of candidates) {
      let provider = providers.get(item.mode);
      if (!provider) {
        const { data, error } = await db.rpc(
          "billing_provider_credentials_for",
          { p_environment: item.mode },
        );
        if (error || !data) throw new EmailError("billing_not_configured");
        provider = new StripeBillingProvider(
          data.secret_key,
          data.webhook_secret,
          undefined,
          { mode: item.mode },
        );
        await provider.verifyAccount(data.account_id);
        providers.set(item.mode, provider);
      }
      const notice = await provider.getRenewalNotice(
        item.provider_subscription_id,
        item.provider_customer_id,
        item.period_end,
      );
      await rpc("renewal_verified", { id: item.id, ...notice });
    }
  },
  workerSecret: Deno.env.get("TRANSACTIONAL_EMAIL_WORKER_SECRET"),
  webhookSecret: Deno.env.get("RESEND_WEBHOOK_SECRET"),
  authenticate: async (token) => {
    const { data, error } = await db.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  rpc,
}));
