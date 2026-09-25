import { createClient } from "@supabase/supabase-js";
import { createBillingHandler } from "./handler.ts";
import { StripeBillingProvider } from "./stripe-provider.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let providerPromise: Promise<StripeBillingProvider> | undefined;
const provider = () =>
  providerPromise ??= (async () => {
    const secret = Deno.env.get("STRIPE_SECRET_KEY"),
      webhook = Deno.env.get("STRIPE_WEBHOOK_SECRET"),
      account = Deno.env.get("STRIPE_ACCOUNT_ID");
    let credentials: {
      secret_key: string;
      webhook_secret: string;
      account_id: string;
    };
    if (secret || webhook || account) {
      if (!secret || !webhook || !account) {
        throw new Error(
          "billing_not_configured",
        );
      }
      credentials = {
        secret_key: secret,
        webhook_secret: webhook,
        account_id: account,
      };
    } else {
      const { data, error } = await service.rpc("billing_provider_credentials");
      if (error || !data) throw new Error("billing_not_configured");
      credentials = data;
    }
    const instance = new StripeBillingProvider(
      credentials.secret_key,
      credentials.webhook_secret,
    );
    await instance.verifyAccount(credentials.account_id);
    return instance;
  })().catch((error) => {
    providerPromise = undefined;
    throw error;
  });
Deno.serve(createBillingHandler({
  site: Deno.env.get("BILLING_SITE_URL") ?? "https://nuthrick.vercel.app",
  provider,
  authenticate: async (token) => {
    const { data, error } = await service.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  rpc: async <T>(action: string, data: Record<string, unknown>): Promise<T> => {
    const { data: result, error } = await service.rpc("billing_server", {
      p_action: action,
      p_data: data,
    });
    if (error) throw new Error(error.message);
    return result as T;
  },
}));
