// Explicit TEST harness. All database writes stay in a disposable LOCAL clone.
import { createBillingHandler } from "../supabase/functions/billing/handler.ts";
import { StripeBillingProvider } from "../supabase/functions/billing/stripe-provider.ts";
const [dir, database] = Deno.args;
if (!dir || !/^nuthrick_billing_\d+$/.test(database ?? "")) {
  throw new Error("Disposable local database required");
}
const credentials = JSON.parse(
  Deno.readTextFileSync(`${dir}/stripe-test.json`),
);
if (
  credentials.mode !== "test" ||
  credentials.account_id !== "acct_1UJP0ZDdgZFOxyxH" ||
  !credentials.secret_key.startsWith("sk_test_")
) throw new Error("Nuthrick Sandbox required");
const secret = Deno.readTextFileSync(`${dir}/webhook-secret.txt`).trim();
const provider = new StripeBillingProvider(credentials.secret_key, secret);
await provider.verifyAccount(credentials.account_id);
const owner = "ca400000-0000-4000-8000-000000000002";
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
function sql(query: string) {
  const result = new Deno.Command("docker", {
    args: [
      "exec",
      "supabase_db_Nuthrick",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      query,
    ],
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  if (!result.success) {
    throw new Error(
      new TextDecoder().decode(result.stderr).match(/ERROR:\s+([a-z_]+)/)
        ?.[1] ?? "local_db_error",
    );
  }
  return new TextDecoder().decode(result.stdout).trim();
}
const json = (q: string) => JSON.parse(sql(q));
sql(
  `insert into auth.users(id,email,email_confirmed_at) values('${owner}','admin3-local@example.test',now()) on conflict(id) do nothing;update public.professional_profiles set full_name='ADMIN-3 TEST local',onboarding_completed=true where id='${owner}';insert into private.billing_test_accounts(professional_id) values('${owner}') on conflict do nothing;insert into private.professional_access(professional_id,plan_id,status,source) values('${owner}',(select id from private.plans where code='esencial'),'active','manual') on conflict(professional_id) do nothing;insert into private.ai_accounts(professional_id,included_credits,purchased_credits,billing_period_start,billing_period_end) values('${owner}',10,0,now(),now()+interval '1 month') on conflict do nothing;update private.billing_settings set enabled=true;`,
);
const handler = createBillingHandler({
  site: "http://127.0.0.1:4194",
  provider: () =>
    Promise.resolve(
      new Proxy(provider, {
        get(target, key) {
          const fn = Reflect.get(target, key);
          if (typeof fn !== "function") return fn;
          return async (...args: unknown[]) => {
            try {
              return await fn.apply(target, args);
            } catch (e) {
              console.error(
                "Provider",
                String(key),
                String(e instanceof Error ? e.message : e).replace(
                  /(?:sk_test_|whsec_)[A-Za-z0-9]+/g,
                  "[hidden]",
                ),
              );
              throw e;
            }
          };
        },
      }),
    ),
  authenticate: (t) => Promise.resolve(t === owner ? owner : null),
  rpc: <T>(action: string, data: Record<string, unknown>) =>
    Promise.resolve(
      json(
        `select public.billing_server(${quote(action)},${
          quote(JSON.stringify(data))
        }::jsonb)`,
      ),
    ) as Promise<T>,
});
Deno.serve({ hostname: "127.0.0.1", port: 4194 }, async (req) => {
  const path = new URL(req.url).pathname;
  if (path === "/status") {
    return Response.json(
      json(`select private.credit_purchase_summary('${owner}')`),
    );
  }
  if (path === "/app/credits") {
    return new Response(
      '<!doctype html><html lang="es"><meta charset="utf-8"><title>Nuthrick · Recarga TEST</title><main style="font:20px system-ui;max-width:720px;margin:80px auto"><h1>Recarga TEST enviada</h1><p>Esta página no acredita saldo. Se está verificando el webhook firmado de Stripe.</p><p>Prueba sin dinero real y sin llamadas a IA.</p></main></html>',
      { headers: { "content-type": "text/html;charset=utf-8" } },
    );
  }
  const result = await handler(req);
  if (path.endsWith("/webhook")) {
    console.log("webhook", result.status, await result.clone().text());
  }
  return result;
});
const pending = json(
  `select private.credit_purchase_summary('${owner}')->'pending'`,
);
if (!pending) {
  const packageId = "ce400000-0000-4000-8000-000000000002";
  sql(
    `insert into private.ai_credit_packages(id,code,name,credits,price_amount,currency) values('${packageId}','ADMIN3_E2E_500_TEST','500 créditos · TEST',500,25,'MXN') on conflict do nothing;`,
  );
  const req = new Request("http://127.0.0.1:4194/billing", {
    method: "POST",
    headers: {
      authorization: "Bearer " + owner,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "credit_checkout",
      package_id: packageId,
      operation_key: crypto.randomUUID(),
    }),
  });
  const r = await handler(req);
  const result = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(result));
  Deno.writeTextFileSync(
    `${dir}/credit-checkout.json`,
    JSON.stringify(result),
    { mode: 0o600 },
  );
  console.log("TEST checkout ready", result.id);
} else console.log("Existing pending checkout", pending.id);
