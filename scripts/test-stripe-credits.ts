// Real Nuthrick Sandbox calls with synthetic data and a disposable LOCAL database.
import assert from "node:assert/strict";
import Stripe from "stripe";
import {
  STRIPE_API_VERSION,
  StripeBillingProvider,
} from "../supabase/functions/billing/stripe-provider.ts";
const [dir, database, action] = Deno.args;
assert.match(database, /^nuthrick_billing_\d+$/);
const c = JSON.parse(Deno.readTextFileSync(`${dir}/stripe-test.json`));
assert.equal(c.mode, "test");
assert.equal(c.account_id, "acct_1UJP0ZDdgZFOxyxH");
assert.ok(c.secret_key.startsWith("sk_test_"));
const stripe = new Stripe(c.secret_key, { apiVersion: STRIPE_API_VERSION });
const whsec = Deno.readTextFileSync(`${dir}/webhook-secret.txt`).trim();
const provider = new StripeBillingProvider(c.secret_key, whsec);
await provider.verifyAccount(c.account_id);
const owner = "ca400000-0000-4000-8000-000000000002";
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
function sql(q: string) {
  const r = new Deno.Command("docker", {
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
      q,
    ],
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  if (!r.success) throw new Error(new TextDecoder().decode(r.stderr));
  return new TextDecoder().decode(r.stdout).trim();
}
const status = async () =>
  await (await fetch("http://127.0.0.1:4194/status")).json();
async function until(
  check: (s: Awaited<ReturnType<typeof status>>) => boolean,
) {
  for (let i = 0; i < 25; i++) {
    const s = await status();
    if (check(s)) return s;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Webhook did not reach expected state");
}
if (action === "refund") {
  const s = await status(),
    p = s.purchases.find((p: { credits_purchased: number }) =>
      p.credits_purchased === 500
    );
  assert.ok(p?.credited_at);
  assert.equal(p.amount_paid, 2500);
  const row = JSON.parse(
    sql(
      `select to_jsonb(p) from private.ai_credit_purchases p where id=${
        quote(p.id)
      }`,
    ),
  );
  assert.ok(row.provider_payment_id.startsWith("pi_"));
  assert.equal(
    (await provider.getCreditPayment(row.provider_checkout_id)).paid,
    true,
  );
  const rawEvent = (await stripe.events.list({
    type: "checkout.session.completed",
    limit: 100,
  })).data.find((e) => e.type === "checkout.session.completed" && e.data.object.id === row.provider_checkout_id);
  assert.ok(rawEvent);
  const payload = JSON.stringify(rawEvent);
  const signatures = await stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: whsec,
  });
  for (let i = 0; i < 2; i++) {
    const response = await fetch("http://127.0.0.1:4194/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": signatures },
      body: payload,
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).replay, true);
  }
  assert.equal(
    sql(
      `select count(*) from private.ai_credit_ledger where credit_purchase_id=${
        quote(p.id)
      } and type='PURCHASE'`,
    ),
    "1",
  );
  const partial = await stripe.refunds.create({
    payment_intent: row.provider_payment_id,
    amount: 1000,
  }, { idempotencyKey: `admin3:test:partial:${p.id}` });
  assert.equal(partial.status, "succeeded");
  await until((s) =>
    s.purchases.find((x: { id: string }) => x.id === p.id)?.refunded_amount ===
      1000
  );
  const full = await stripe.refunds.create({
    payment_intent: row.provider_payment_id,
  }, { idempotencyKey: `admin3:test:full:${p.id}` });
  assert.equal(full.status, "succeeded");
  const after = await until((s) =>
    s.purchases.find((x: { id: string }) => x.id === p.id)?.status ===
      "refunded"
  );
  assert.equal(after.balances.additional, 0);
  assert.equal(after.balances.included, 10);
  assert.equal(
    sql(
      `select sum(purchased_delta) from private.ai_credit_ledger where credit_purchase_id=${
        quote(p.id)
      }`,
    ),
    "0.000",
  );
  const result = {
    purchase: p.id,
    checkout: row.provider_checkout_id,
    payment: row.provider_payment_id,
    customer: row.provider_customer_id,
    refunds: [partial.id, full.id],
    grant_count: 1,
    purchased: 500,
    reversed: 500,
    additional_after: 0,
    mode: "test",
    openai_calls: 0,
  };
  Deno.writeTextFileSync(
    `${dir}/credit-real-results.json`,
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(
    "PASS real HostedCheckout → signed webhook → +500; duplicate signed replay; partial + total refund → 0 additional",
    JSON.stringify(result),
  );
} else if (action === "small" || action === "large") {
  const amount = action === "small" ? 100 : 1000,
    pkg = action === "small"
      ? "ce400000-0000-4000-8000-000000000001"
      : "ce400000-0000-4000-8000-000000000003";
  sql(
    `insert into private.ai_credit_packages(id,code,name,credits,price_amount,currency) values('${pkg}','ADMIN3_E2E_${amount}_TEST','${amount} créditos · TEST',${amount},${
      amount === 100 ? 20 : 50
    },'MXN') on conflict do nothing;`,
  );
  if (
    action === "small" &&
    sql(
        "select exists(select 1 from private.promotion_campaigns where code='ADMIN3_REAL_TEST')",
      ) === "f"
  ) {
    sql(
      `select set_config('request.jwt.claim.sub','ca300000-0000-4000-8000-000000000001',false);select public.billing_admin_api('save_campaign',jsonb_build_object('code','ADMIN3_REAL_TEST','name','Descuento y bonus TEST','audience','campaign','target','ai_credit_package','starts_at',now()-interval '1 hour','eligible_package_ids',jsonb_build_array('${pkg}'),'eligible_plan_ids','[]'::jsonb,'intervals','["monthly"]'::jsonb,'benefits','[{"type":"percentage_discount","amount":20,"duration":{"kind":"invoice"}},{"type":"bonus_ai_credits","amount":20,"duration":{"kind":"invoice"}}]'::jsonb,'max_redemptions',10,'max_per_professional',1));`,
    );
  }
  const r = await fetch("http://127.0.0.1:4194/billing", {
    method: "POST",
    headers: {
      authorization: "Bearer " + owner,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "credit_checkout",
      package_id: pkg,
      code: action === "small" ? "ADMIN3_REAL_TEST" : "",
      operation_key: crypto.randomUUID(),
    }),
  });
  assert.equal(r.status, 200, await r.clone().text());
  const p = await r.json();
  Deno.writeTextFileSync(
    `${dir}/credit-${action}-checkout.json`,
    JSON.stringify(p),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(p));
} else if (action === "verify") {
  const s = await until((s) =>
    s.purchases.filter((p: { status: string }) => p.status === "paid")
      .length === 2
  );
  assert.equal(s.balances.additional, 1120);
  const small = s.purchases.find((p: { credits_purchased: number }) =>
    p.credits_purchased === 100
  );
  assert.equal(small.amount_paid, 1600);
  assert.equal(small.bonus_credits, 20);
  assert.equal(
    sql(
      `select count(distinct c.provider_customer_id) from private.ai_credit_purchases p join private.billing_customers c using(professional_id) where p.professional_id='${owner}'`,
    ),
    "1",
  );
  assert.equal(
    sql(
      `select count(*) from private.billing_subscriptions where professional_id='${owner}'`,
    ),
    "0",
  );
  console.log(
    "PASS all three package sizes; real 20% discount +20 bonus; customer reused; no subscription created; additional=1120",
  );
}
