// Real Stripe TEST-only checks against the explicit isolated local SQL harness.
// Run after completing the four Hosted Checkouts emitted by stripe-test-server.ts.
import assert from "node:assert/strict";
import Stripe from "stripe";
import type {
  Benefit,
  Campaign,
  Price,
} from "../supabase/functions/billing/domain.ts";
import {
  STRIPE_API_VERSION,
  StripeBillingProvider,
} from "../supabase/functions/billing/stripe-provider.ts";
const [dir, db, phase = "changes"] = Deno.args;
assert.match(db, /^nuthrick_billing_\d+$/);
const credentials = Object.fromEntries(
  Deno.readTextFileSync(`${dir}/stripe-test.txt`).trim().split("\n").map((l) =>
    l.split("=")
  ),
);
assert.ok(credentials.STRIPE_SECRET_KEY.startsWith("sk_test_"));
const secret = Deno.readTextFileSync(`${dir}/webhook-secret.txt`).trim();
const stripe = new Stripe(credentials.STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
  maxNetworkRetries: 1,
  timeout: 10000,
  httpClient: Stripe.createFetchHttpClient(),
});
const provider = new StripeBillingProvider(
  credentials.STRIPE_SECRET_KEY,
  secret,
  stripe,
);
await provider.verifyAccount(credentials.STRIPE_ACCOUNT_ID);
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
function sql(query: string) {
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
      db,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      query,
    ],
    clearEnv: true,
    env: { PATH: Deno.env.get("PATH")!, HOME: Deno.env.get("HOME")! },
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  if (!r.success) throw Error(new TextDecoder().decode(r.stderr));
  return new TextDecoder().decode(r.stdout).trim();
}
const query = (q: string) => {
  const value = sql(q);
  return value ? JSON.parse(value) : null;
};
const owner = (n: number) =>
  `bd200000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const state = (id: string) =>
  query(
    `select to_jsonb(s)||jsonb_build_object('plan',(select p.code from private.billing_price_mappings m join private.plans p on p.id=m.plan_id where m.id=s.price_mapping_id)) from private.billing_subscriptions s where professional_id=${
      quote(id)
    } order by created_at desc limit 1`,
  );
async function eventually(
  check: () => boolean | Promise<boolean>,
  label: string,
) {
  for (let i = 0; i < 30; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error("Timeout: " + label);
}
async function action(
  id: string,
  data: Record<string, unknown>,
  operation = crypto.randomUUID(),
) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch("http://127.0.0.1:4193/billing", {
      method: "POST",
      headers: {
        authorization: `Bearer ${id}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ operation_key: operation, ...data }),
    });
    const value = await r.json();
    if (r.ok) return value;
    if (value.error !== "billing_busy") throw Error(JSON.stringify(value));
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("Lease contention");
}
const essential = sql("select id from private.plans where code='esencial'");
const professional = sql(
  "select id from private.plans where code='profesional'",
);
function campaign(
  code: string,
  audience: string,
  planId: string,
  benefits: Benefit[],
  max: number,
  newOnly = false,
): Campaign {
  const existing = query(
    `select to_jsonb(c) from private.promotion_campaigns c where code=${
      quote(code)
    }`,
  );
  if (existing) return existing;
  const data = {
    code,
    name: `${code} · Prueba ADMIN-2`,
    audience,
    starts_at: new Date(Date.now() - 86400000).toISOString(),
    eligible_plan_ids: [planId],
    intervals: ["monthly"],
    benefits,
    max_redemptions: max,
    max_per_professional: 1,
    new_customers_only: newOnly,
  };
  return query(
    `set request.jwt.claim.sub=${
      quote(owner(1))
    };select private.billing_admin_api('save_campaign',${
      quote(JSON.stringify(data))
    }::jsonb)`,
  );
}
if (phase === "promotions") {
  const campaigns = [
    campaign("UAZ2026", "university", essential, [{
      type: "custom_price",
      amount: 249,
      duration: { kind: "months", months: 12 },
    }, {
      type: "initial_ai_credits",
      amount: 20,
      duration: { kind: "invoice" },
    }], 100),
    campaign("NUTRIMARIA", "influencer", professional, [{
      type: "percentage_discount",
      amount: 20,
      duration: { kind: "months", months: 3 },
    }], 50),
    campaign("CONSULTORIOABC", "clinic", professional, [{
      type: "custom_price",
      amount: 399,
      duration: { kind: "months", months: 6 },
    }], 20),
    campaign(
      "ESTUDIANTE50",
      "student",
      essential,
      [{
        type: "percentage_discount",
        amount: 50,
        duration: { kind: "months", months: 6 },
      }],
      100,
      true,
    ),
  ];
  const output = [];
  for (const [index, c] of campaigns.entries()) {
    const id = owner(index + 6), current = state(id);
    const checkout = current
      ? query(
        `select jsonb_build_object('id',id,'url',url) from private.billing_checkout_intents where professional_id=${
          quote(id)
        } order by created_at desc limit 1`,
      )
      : await action(id, {
        action: "checkout",
        plan_id: c.eligible_plan_ids[0],
        interval: "monthly",
        code: c.code,
      });
    const context = query(
      `select jsonb_build_object('customer',(select provider_customer_id from private.billing_customers where professional_id=i.professional_id),'intent',to_jsonb(i),'price',private.billing_price_json(i.price_mapping_id),'coupon',(select provider_coupon_id from private.billing_promotion_mappings where campaign_id=i.campaign_id and version=(i.campaign_snapshot->>'version')::int and price_mapping_id=i.price_mapping_id)) from private.billing_checkout_intents i where i.id=${
        quote(checkout.id)
      }`,
    );
    const p = context.price as Price;
    assert.equal(
      (await provider.ensurePromotion(c, p)).couponId,
      context.coupon,
    );
    assert.equal(
      (await provider.ensurePromotion(c, p)).couponId,
      context.coupon,
    );
    output.push({ owner: id, code: c.code, ...checkout });
    if (index === 0 && !current) {
      console.log(
        "READY UAZ2026 Hosted Checkout: 249 MXN/month, 12 months, 20 welcome credits",
      );
      continue;
    }
    let subId = current?.provider_subscription_id;
    if (!subId) {
      const method = await stripe.paymentMethods.attach("pm_card_visa", {
        customer: context.customer,
      });
      const sub = await stripe.subscriptions.create({
        customer: context.customer,
        items: [{ price: p.provider_price_id! }],
        discounts: [{ coupon: context.coupon }],
        default_payment_method: method.id,
        payment_behavior: "error_if_incomplete",
        metadata: { nuthrick_intent: checkout.id, nuthrick_owner: id },
      }, { idempotencyKey: `nuthrick:admin2:${db}:promo:${c.code}` });
      assert.equal(sub.livemode, false);
      subId = sub.id;
      await eventually(
        () => state(id)?.state === "active",
        c.code + " activation",
      );
      // This case tests the real subscription API with the reserved intent. Close its unused hosted session.
      await provider.expireCheckout(context.intent.provider_session_id);
    }
    const sub = await provider.getSubscription(subId);
    assert.equal(
      sub.latest_invoice?.amount_paid,
      [24900, 39920, 39900, 17450][index],
    );
    assert.equal(
      Number(
        sql(
          `select count(*) from private.promotion_redemptions where professional_id=${
            quote(id)
          }`,
        ),
      ),
      1,
    );
    if (index === 0) {
      assert.equal(
        Number(
          sql(
            `select purchased_credits from private.ai_accounts where professional_id=${
              quote(id)
            }`,
          ),
        ),
        20,
      );
    }
    console.log(
      "PASS",
      c.code,
      "actual Stripe Test price, single coupon mapping, attribution",
    );
  }
  Deno.writeTextFileSync(
    `${dir}/promo-checkouts.json`,
    JSON.stringify(output, null, 2),
    { mode: 0o600 },
  );
}
if (phase === "changes") {
  const id = owner(2);
  const before = query(
    "select jsonb_build_object('payments',(select count(*) from private.billing_payments),'ledger',(select count(*) from private.ai_credit_ledger))",
  );
  const eventId = sql(
    "select provider_event_id from private.billing_webhook_events where processed_at is not null order by created_at limit 1",
  );
  const event = await stripe.events.retrieve(eventId),
    raw = JSON.stringify(event);
  for (let i = 0; i < 2; i++) {
    const header = await stripe.webhooks.generateTestHeaderStringAsync({
      payload: raw,
      secret,
    });
    const r = await fetch("http://127.0.0.1:4193/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": header },
      body: raw,
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).replay, true);
  }
  assert.deepEqual(
    query(
      "select jsonb_build_object('payments',(select count(*) from private.billing_payments),'ledger',(select count(*) from private.ai_credit_ledger))",
    ),
    before,
  );
  console.log("PASS real Stripe event replay: no duplicate invoice or ledger");
  const upgradeKey = "be200000-0000-4000-8000-000000000001";
  const upgraded = await action(id, {
    action: "change",
    plan_id: professional,
    interval: "monthly",
  }, upgradeKey);
  assert.equal(upgraded.timing, "immediate");
  await eventually(
    () => state(id).plan === "profesional",
    "paid immediate upgrade",
  );
  await action(id, {
    action: "change",
    plan_id: professional,
    interval: "monthly",
  }, upgradeKey);
  const after = Number(
    sql(
      `select count(*) from private.billing_payments where professional_id=${
        quote(id)
      }`,
    ),
  );
  assert.equal(after, 2);
  console.log("PASS immediate prorated upgrade and operation replay");
  const down = await action(id, {
    action: "change",
    plan_id: essential,
    interval: "monthly",
  }, "be200000-0000-4000-8000-000000000002");
  assert.equal(down.timing, "period_end");
  await eventually(
    () => state(id).pending_plan_id === essential,
    "pending downgrade",
  );
  assert.equal(state(id).plan, "profesional");
  const schedule = await stripe.subscriptionSchedules.retrieve(
    down.schedule_id,
  );
  assert.equal(
    schedule.phases[1].start_date,
    Math.floor(Date.parse(state(id).period_end) / 1000),
  );
  console.log("PASS downgrade scheduled at paid-period end");
  await action(
    id,
    { action: "cancel" },
    "be200000-0000-4000-8000-000000000003",
  );
  await eventually(() => state(id).cancel_at_period_end, "cancel period end");
  assert.equal(state(id).state, "active");
  await action(
    id,
    { action: "resume" },
    "be200000-0000-4000-8000-000000000004",
  );
  await eventually(() => !state(id).cancel_at_period_end, "resume");
  assert.equal(state(id).state, "active");
  console.log("PASS cancel/resume retain paid access");
  const portal = await action(
    id,
    { action: "portal" },
    "be200000-0000-4000-8000-000000000005",
  );
  assert.equal(new URL(portal.url).hostname, "billing.stripe.com");
  Deno.writeTextFileSync(`${dir}/portal.json`, JSON.stringify(portal), {
    mode: 0o600,
  });
  console.log("PASS hosted Customer Portal session");
}

// Clock fixtures use actual Stripe subscriptions with reserved Nuthrick intents.
// Only the signed listener can activate the matching local account.
async function clockFixture(
  n: number,
  name: string,
  daysAgo: number,
  code = "",
) {
  const path = `${dir}/clock-${name}.json`;
  try {
    return JSON.parse(Deno.readTextFileSync(path));
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  const id = owner(n), key = crypto.randomUUID();
  const clock = await stripe.testHelpers.testClocks.create({
    name: `Nuthrick ADMIN-2 ${name}`,
    frozen_time: Math.floor(Date.now() / 1000) - daysAgo * 86400,
  }, { idempotencyKey: `nuthrick:${db}:clock:${name}` });
  const customer = await stripe.customers.create({
    test_clock: clock.id,
    metadata: { nuthrick_owner: id },
    name: `Nuthrick Test ${name}`,
  }, { idempotencyKey: `nuthrick:${db}:clock-customer:${name}` });
  const rpc = (a: string, data: Record<string, unknown> = {}) =>
    query(
      `select private.billing_server(${quote(a)},${
        quote(JSON.stringify({ owner: id, lock_key: key, ...data }))
      }::jsonb)`,
    );
  rpc("lock");
  let ctx;
  try {
    ctx = rpc("prepare_checkout", {
      operation_key: key,
      plan_id: essential,
      interval: "monthly",
      code,
    });
    rpc("customer_saved", { customer_id: customer.id });
    const priceId = await provider.ensurePrice(ctx.price);
    rpc("price_saved", { price_mapping_id: ctx.price.id, price_id: priceId });
    const promo = ctx.intent.campaign_snapshot
      ? await provider.ensurePromotion(ctx.intent.campaign_snapshot, ctx.price)
      : null;
    if (promo) {
      rpc("promotion_saved", {
        intent_id: ctx.intent.id,
        coupon_id: promo.couponId,
        end_at: promo.endAt,
      });
    }
    ctx.priceId = priceId;
    ctx.couponId = promo?.couponId;
  } finally {
    rpc("unlock");
  }
  const pm = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: customer.id,
  });
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: ctx.priceId }],
    default_payment_method: pm.id,
    payment_behavior: "error_if_incomplete",
    ...(ctx.couponId ? { discounts: [{ coupon: ctx.couponId }] } : {}),
    metadata: { nuthrick_intent: ctx.intent.id, nuthrick_owner: id },
  }, { idempotencyKey: `nuthrick:${db}:clock-sub:${name}` });
  const fixture = {
    owner: id,
    clock: clock.id,
    customer: customer.id,
    subscription: sub.id,
  };
  Deno.writeTextFileSync(path, JSON.stringify(fixture), { mode: 0o600 });
  await eventually(() => !!state(id), `${name} initial signed webhook`);
  return fixture;
}
async function advance(clock: string, to: number) {
  await eventually(
    async () =>
      (await stripe.testHelpers.testClocks.retrieve(clock)).status === "ready",
    "clock ready before advance",
  );
  const current = await stripe.testHelpers.testClocks.retrieve(clock);
  if (current.frozen_time >= to) return;
  await stripe.testHelpers.testClocks.advance(clock, { frozen_time: to });
  await eventually(
    async () =>
      (await stripe.testHelpers.testClocks.retrieve(clock)).status === "ready",
    "clock advance",
  );
}
if (phase === "fallback") {
  const f = await clockFixture(10, "uaz-fallback", 0, "UAZ2026");
  let invoices = await stripe.invoices.list({
    subscription: f.subscription,
    limit: 100,
  });
  while (invoices.data.length < 13) {
    const sub = await stripe.subscriptions.retrieve(f.subscription);
    await advance(f.clock, sub.items.data[0].current_period_end + 7200);
    invoices = await stripe.invoices.list({
      subscription: f.subscription,
      limit: 100,
    });
    // Stripe clocks can leave automatic invoices in draft until the next advance.
    const latest = invoices.data[0];
    if (latest.status === "draft") {
      await stripe.invoices.finalizeInvoice(latest.id);
    }
    const ready = await stripe.invoices.retrieve(latest.id);
    if (ready.status === "open") await stripe.invoices.pay(ready.id);
    console.log(
      "UAZ clock invoice",
      invoices.data.length,
      "amount",
      ready.amount_due,
    );
  }
  invoices = await stripe.invoices.list({
    subscription: f.subscription,
    limit: 100,
  });
  const ordered = [...invoices.data].sort((a, b) => a.created - b.created);
  assert.equal(ordered.length, 13);
  assert.ok(ordered.slice(0, 12).every((i) => i.amount_paid === 24900));
  assert.equal(ordered[12].amount_paid, 34900);
  await eventually(
    () =>
      Number(
        sql(
          `select count(*) from private.billing_payments where professional_id=${
            quote(f.owner)
          } and amount_paid=34900 and status='paid'`,
        ),
      ) === 1,
    "fallback paid webhook",
  );
  assert.equal(
    Number(
      sql(
        `select purchased_credits from private.ai_accounts where professional_id=${
          quote(f.owner)
        }`,
      ),
    ),
    20,
  );
  assert.equal(
    Number(
      sql(
        `select count(*) from private.promotion_redemptions where professional_id=${
          quote(f.owner)
        }`,
      ),
    ),
    1,
  );
  console.log(
    "PASS UAZ twelve actual 249 MXN invoices, thirteenth 349 MXN; credits and attribution remain single",
  );
}
if (phase === "failure") {
  for (
    const [n, name, days, expected] of [[11, "grace-recover", 33, "grace"], [
      12,
      "grace-expired",
      41,
      "suspended",
    ]] as const
  ) {
    const f = await clockFixture(n, name, days);
    let sub = await stripe.subscriptions.retrieve(f.subscription);
    const declined = await stripe.paymentMethods.attach(
      "pm_card_chargeCustomerFail",
      { customer: f.customer },
    );
    await stripe.subscriptions.update(sub.id, {
      default_payment_method: declined.id,
    });
    await advance(f.clock, sub.items.data[0].current_period_end + 7200);
    sub = await stripe.subscriptions.retrieve(sub.id);
    let inv = await stripe.invoices.retrieve(sub.latest_invoice as string);
    if (inv.status === "draft") {
      inv = await stripe.invoices.finalizeInvoice(inv.id);
    }
    if (inv.status === "open") {
      try {
        await stripe.invoices.pay(inv.id);
      } catch (e) {
        assert.equal((e as Stripe.errors.StripeError).type, "StripeCardError");
      }
    }
    await eventually(
      () => state(f.owner)?.state === expected,
      `${name} failed payment state`,
    );
    console.log("PASS actual declined renewal →", expected);
    const visa = await stripe.paymentMethods.attach("pm_card_visa", {
      customer: f.customer,
    });
    await stripe.subscriptions.update(sub.id, {
      default_payment_method: visa.id,
    });
    await stripe.invoices.pay(inv.id, { payment_method: visa.id });
    await eventually(
      () => state(f.owner)?.state === "active",
      `${name} recovered signed payment`,
    );
    console.log("PASS", expected, "→ active after actual Stripe Test recovery");
  }
}
if (phase === "admin-cancel") {
  const id = owner(9),
    before = Number(
      sql(
        `select count(*) from private.billing_payments where professional_id=${
          quote(id)
        }`,
      ),
    );
  await action(owner(1), {
    action: "cancel_now",
    professional_id: id,
    confirmation: "CANCELAR AHORA",
    reason: "Fin de prueba aislada ADMIN-2",
  }, "be200000-0000-4000-8000-000000000006");
  await eventually(
    () => state(id)?.state === "cancelled",
    "admin immediate cancellation",
  );
  assert.equal(
    Number(
      sql(
        `select count(*) from private.billing_payments where professional_id=${
          quote(id)
        }`,
      ),
    ),
    before,
  );
  console.log(
    "PASS admin immediate cancellation, no extra invoice, history retained",
  );
}
if (phase === "until") {
  const c = campaign("UNTILCLOCK", "campaign", essential, [{
    type: "percentage_discount",
    amount: 50,
    duration: {
      kind: "until",
      until: new Date(Date.now() + 2 * 86400000).toISOString(),
    },
  }], 5);
  const f = await clockFixture(13, "until-cutoff", 0, c.code);
  const cutoff = Math.floor(Date.parse(c.benefits[0].duration.until!) / 1000);
  await eventually(
    async () =>
      !!(await stripe.subscriptions.retrieve(f.subscription)).schedule,
    "cutoff schedule attached",
  );
  await advance(f.clock, cutoff + 60);
  await eventually(
    async () =>
      !(await stripe.subscriptions.retrieve(f.subscription)).discounts.length,
    "discount ends at chosen date",
  );
  let s = await stripe.subscriptions.retrieve(f.subscription);
  for (let i = 0; i < 2; i++) {
    await advance(f.clock, s.items.data[0].current_period_end + 7200);
    s = await stripe.subscriptions.retrieve(f.subscription);
    let inv = await stripe.invoices.retrieve(s.latest_invoice as string);
    if (inv.status === "draft") {
      inv = await stripe.invoices.finalizeInvoice(inv.id);
    }
    if (inv.status === "open") inv = await stripe.invoices.pay(inv.id);
    assert.equal(inv.amount_paid, 34900);
  }
  await eventually(
    async () => !(await stripe.subscriptions.retrieve(f.subscription)).schedule,
    "schedule released without recreation",
  );
  assert.equal(
    await provider.endDiscountAt(
      f.subscription,
      new Date(cutoff * 1000).toISOString(),
      "late-renewal",
    ),
    null,
  );
  console.log(
    "PASS date-limited promotion ends, normal price resumes, later renewals do not recreate schedule",
  );
}
