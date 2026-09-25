// Explicit Stripe Test integration harness. Database is an isolated LOCAL clone.
// Usage: deno run [scoped permissions] --config supabase/functions/billing/deno.json
// scripts/stripe-test-server.ts <private-credential-directory> nuthrick_billing_<pid>
import { createBillingHandler } from "../supabase/functions/billing/handler.ts";
import { StripeBillingProvider } from "../supabase/functions/billing/stripe-provider.ts";
const [directory, database] = Deno.args;
if (!directory || !/^nuthrick_billing_\d+$/.test(database ?? "")) {
  throw new Error(
    "Explicit private directory and disposable local database required",
  );
}
const env = Object.fromEntries(
  Deno.readTextFileSync(`${directory}/stripe-test.txt`).trim().split("\n").map(
    (l) => l.split("="),
  ),
);
const provider = new StripeBillingProvider(
  env.STRIPE_SECRET_KEY,
  Deno.readTextFileSync(`${directory}/webhook-secret.txt`).trim(),
);
await provider.verifyAccount(env.STRIPE_ACCOUNT_ID);
const admin = "bd200000-0000-4000-8000-000000000001";
const owners = Array.from(
  { length: 16 },
  (_, n) => `bd200000-0000-4000-8000-${String(n + 2).padStart(12, "0")}`,
);
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
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
    clearEnv: true,
    stdout: "piped",
    stderr: "piped",
    env: { PATH: Deno.env.get("PATH")!, HOME: Deno.env.get("HOME")! },
  }).outputSync();
  if (!result.success) {
    const error = new TextDecoder().decode(result.stderr);
    throw new Error(
      error.match(/ERROR:\s+([a-z_]+)/)?.[1] ?? "local_database_error",
    );
  }
  return new TextDecoder().decode(result.stdout).trim();
}
const json = (query: string) => JSON.parse(sql(query));
sql(
  `insert into auth.users(id,email,email_confirmed_at) values ${
    [admin, ...owners].map((id) =>
      `(${quote(id)},${quote(id + "@example.test")},now())`
    ).join(",")
  } on conflict(id) do nothing;
insert into private.platform_admins(user_id) values(${
    quote(admin)
  }) on conflict do nothing;
insert into private.billing_test_accounts(professional_id) values ${
    owners.map((id) => `(${quote(id)})`).join(",")
  } on conflict do nothing;
update private.billing_settings set enabled=true;`,
);
const handler = createBillingHandler({
  site: "http://127.0.0.1:4193",
  provider: () =>
    Promise.resolve(
      new Proxy(provider, {
        get(target, key) {
          const value = Reflect.get(target, key);
          if (typeof value !== "function") return value;
          return async (...args: unknown[]) => {
            try {
              return await value.apply(target, args);
            } catch (error) {
              console.error(
                "Test provider failure",
                String(key),
                String(error instanceof Error ? error.message : error).replace(
                  /(?:sk_test_|whsec_)[A-Za-z0-9]+/g,
                  "[hidden]",
                ),
              );
              throw error;
            }
          };
        },
      }),
    ),
  authenticate: (token) =>
    Promise.resolve([admin, ...owners].includes(token) ? token : null),
  rpc: <T>(action: string, data: Record<string, unknown>) =>
    Promise.resolve(
      json(
        `select private.billing_server(${quote(action)},${
          quote(JSON.stringify(data))
        }::jsonb)`,
      ),
    ) as Promise<T>,
});
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
Deno.serve({ hostname: "127.0.0.1", port: 4193 }, async (req) => {
  const path = new URL(req.url).pathname;
  if (req.method === "GET" && path === "/status") {
    return response(
      json(
        `select jsonb_build_object('subscriptions',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from private.billing_subscriptions s),'payments',(select count(*) from private.billing_payments),'events',(select coalesce(jsonb_agg(jsonb_build_object('id',provider_event_id,'type',event_type,'processed',processed_at is not null,'error',last_error)),'[]') from private.billing_webhook_events),'credits',(select coalesce(jsonb_agg(jsonb_build_object('owner',professional_id,'included',included_credits,'additional',purchased_credits)),'[]') from private.ai_accounts))`,
      ),
    );
  }
  if (req.method === "GET" && path === "/app/my-plan") {
    return new Response(
      '<!doctype html><html lang="es"><meta charset="utf-8"><title>Nuthrick · Prueba</title><main style="font:20px system-ui;max-width:700px;margin:80px auto"><h1>Checkout de prueba completado</h1><p>Estamos verificando el webhook firmado de Stripe. Esta página no activa el plan.</p><p>Esta prueba no mueve dinero real.</p></main></html>',
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
  const result = await handler(req);
  if (path.endsWith("/webhook")) {
    console.log("Stripe webhook", result.status, await result.clone().text());
  }
  return result;
});
async function action(owner: string, data: Record<string, unknown>) {
  const result = await handler(
    new Request("http://127.0.0.1:4193/billing", {
      method: "POST",
      headers: {
        authorization: `Bearer ${owner}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ operation_key: crypto.randomUUID(), ...data }),
    }),
  );
  const body = await result.json();
  if (!result.ok) throw new Error(JSON.stringify(body));
  return body;
}
let existing = false;
try {
  existing = (await Deno.stat(`${directory}/checkouts.json`)).isFile;
} catch { /* Fresh test run. */ }
if (!existing) {
  await action(admin, { action: "sync_prices" });
  const scenarios = [];
  for (
    const [n, plan, interval] of [
      [0, "esencial", "monthly"],
      [1, "esencial", "annual"],
      [2, "profesional", "monthly"],
      [3, "profesional", "annual"],
    ] as const
  ) {
    const planId = sql(
      `select id from private.plans where code=${quote(plan)}`,
    );
    const checkout = await action(owners[n], {
      action: "checkout",
      plan_id: planId,
      interval,
    });
    scenarios.push({
      owner: owners[n],
      plan,
      plan_id: planId,
      interval,
      ...checkout,
    });
  }
  await Deno.writeTextFile(
    `${directory}/checkouts.json`,
    JSON.stringify(scenarios, null, 2),
    { mode: 0o600 },
  );
}
console.log("READY four Test Checkouts, isolated local database", database);
