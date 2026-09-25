import { createClient } from "@supabase/supabase-js";
import { createEmailHandler } from "./handler.ts";
import { ResendEmailProvider } from "./provider.ts";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(createEmailHandler({
  provider: () => new ResendEmailProvider(Deno.env.get("RESEND_API_KEY") ?? ""),
  workerSecret: Deno.env.get("TRANSACTIONAL_EMAIL_WORKER_SECRET"),
  webhookSecret: Deno.env.get("RESEND_WEBHOOK_SECRET"),
  authenticate: async (token) => {
    const { data, error } = await db.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  rpc: async <T>(action: string, data: Record<string, unknown> = {}) => {
    const result = await db.rpc("transactional_email_server", {
      p_action: action,
      p_data: data,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data as T;
  },
}));
