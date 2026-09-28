// Real Stripe TEST events, production handler, disposable LOCAL SQL database.
// Events are retrieved from Stripe and replayed with an ephemeral local signature.
// This does not certify public webhook delivery or a real-money charge.
// Exported business notices can subsequently be delivered to an authorized inbox.
import assert from "node:assert/strict";
import Stripe from "stripe";
import { createBillingHandler } from "../supabase/functions/billing/handler.ts";
import {
  STRIPE_API_VERSION,
  StripeBillingProvider,
} from "../supabase/functions/billing/stripe-provider.ts";
const [dir, db] = Deno.args;
assert.match(db, /^nuthrick_billing_\d+$/);
const credentials = JSON.parse(
  Deno.readTextFileSync(`${dir}/stripe-test.json`),
);
assert.equal(credentials.mode, "test");
assert.equal(credentials.account_id, "acct_1UJP0ZDdgZFOxyxH");
assert.ok(credentials.secret_key.startsWith("sk_test_"));
const stripe = new Stripe(credentials.secret_key, {
  apiVersion: STRIPE_API_VERSION,
  maxNetworkRetries: 1,
  timeout: 20000,
  httpClient: Stripe.createFetchHttpClient(),
});
const localSigningSecret = `whsec_local_${crypto.randomUUID()}`;
const provider = new StripeBillingProvider(
  credentials.secret_key,
  localSigningSecret,
  stripe,
);
await provider.verifyAccount(credentials.account_id);
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
function sql(q: string): string {
  const r = new Deno.Command("docker", {
    args: [
      "exec",
      "-i",
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
      q,
    ],
    stdout: "piped",
    stderr: "piped",
    clearEnv: true,
    env: { PATH: Deno.env.get("PATH")!, HOME: Deno.env.get("HOME")! },
  }).outputSync();
  if (!r.success) throw Error(new TextDecoder().decode(r.stderr));
  return new TextDecoder().decode(r.stdout).trim();
}
const json = (q: string) => JSON.parse(sql(q));
const owner = (n: number) =>
  `ce280000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owners = [1, 2, 3, 4].map(owner);
const started = new Date().toISOString();
const run = `commercial-${db}-${Date.now()}`;
const clocks: string[] = [];
const proof: Record<string, unknown>[] = [];
const handler = createBillingHandler({
  site: "https://nuthrick.com",
  authenticate: () => Promise.resolve(null),
  provider: () => Promise.resolve(provider),
  rpc: <T>(a: string, d: Record<string, unknown>) =>
    Promise.resolve(
      json(
        `select private.billing_server(${quote(a)},${
          quote(JSON.stringify(d))
        }::jsonb)`,
      ),
    ) as Promise<T>,
});
const state = (id: string) =>
  json(
    `select to_jsonb(s) from private.billing_subscriptions s where professional_id=${
      quote(id)
    } order by created_at desc limit 1`,
  );
async function deliver(
  type: Stripe.Event.Type,
  match: (v: Record<string, unknown>) => boolean,
) {
  let event: Stripe.Event | undefined;
  for (let i = 0; i < 20 && !event; i++) {
    const events = await stripe.events.list({ type, limit: 100 });
    event = events.data.find((e) =>
      match(e.data.object as unknown as Record<string, unknown>)
    );
    if (!event) await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(event, `Stripe event ${type}`);
  assert.equal(event.livemode, false);
  const raw = JSON.stringify(event);
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({
    payload: raw,
    secret: localSigningSecret,
    cryptoProvider: Stripe.createSubtleCryptoProvider(),
  });
  const request = () =>
    new Request("https://nuthrick.com/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: raw,
    });
  const response = await handler(request());
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.notEqual(result.ignored, true, `Ignored ${type}`);
  const count = sql("select count(*) from private.transactional_email_outbox");
  const replay = await handler(request());
  assert.equal(replay.status, 200);
  assert.equal(
    sql("select count(*) from private.transactional_email_outbox"),
    count,
    "Replay generated duplicate notice",
  );
  proof.push({ event_id: event.id, type, duplicate_replay_passed: true });
  console.log("PASS Stripe TEST event", type, event.id);
}
async function fixture(n: number, daysAgo: number, renewalAnchor = false) {
  const id = owner(n), lk = crypto.randomUUID();
  const clock = await stripe.testHelpers.testClocks.create({
    name: run.slice(0, 55) + `-${n}`,
    frozen_time: Math.floor(Date.now() / 1000) - daysAgo * 86400,
  });
  clocks.push(clock.id);
  Deno.writeTextFileSync(
    `${dir}/commercial-clocks.json`,
    JSON.stringify(clocks),
    { mode: 0o600 },
  );
  const customer = await stripe.customers.create({
    test_clock: clock.id,
    name: "Nuthrick isolated commercial TEST",
    metadata: { nuthrick_owner: id, nuthrick_test_run: run },
  });
  const rpc = (a: string, d: Record<string, unknown> = {}) =>
    json(
      `select private.billing_server(${quote(a)},${
        quote(
          JSON.stringify({
            owner: id,
            lock_key: lk,
            environment: "test",
            ...d,
          }),
        )
      }::jsonb)`,
    );
  rpc("lock");
  let ctx;
  try {
    ctx = rpc("prepare_checkout", {
      operation_key: lk,
      plan_id: sql("select id from private.plans where code='esencial'"),
      interval: "monthly",
    });
    rpc("customer_saved", { customer_id: customer.id });
    ctx.priceId = await provider.ensurePrice(ctx.price);
    rpc("price_saved", {
      price_mapping_id: ctx.price.id,
      price_id: ctx.priceId,
    });
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
    ...(renewalAnchor
      ? { billing_cycle_anchor: Math.floor(Date.now() / 1000) + 7 * 86400 }
      : {}),
    metadata: {
      nuthrick_intent: ctx.intent.id,
      nuthrick_owner: id,
      nuthrick_test_run: run,
    },
  });
  assert.equal(sub.livemode, false);
  await deliver("customer.subscription.created", (v) => v.id === sub.id);
  assert.equal(state(id).state, "active");
  await deliver("invoice.paid", (v) => v.id === sub.latest_invoice);
  return { id, clock: clock.id, customer: customer.id, sub: sub.id };
}
try {
  sql(
    `insert into auth.users(id,email,email_confirmed_at) values ${
      owners.map((id) => `(${quote(id)},${quote(id + "@example.test")},now())`)
        .join(",")
    };
  insert into private.billing_test_accounts(professional_id) values ${
      owners.map((id) => `(${quote(id)})`).join(",")
    };
  update private.billing_settings set enabled=true;
  update private.billing_price_mappings set provider_price_id=null where mode='test';
  update private.transactional_email_settings set delivery_mode='controlled',operational_since=null;
  update public.professional_profiles set onboarding_completed=true where id in (${
      owners.map(quote).join(",")
    });`,
  );
  const f = await fixture(1, 33);
  let subscription = await stripe.subscriptions.retrieve(f.sub);
  const bad = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", {
    customer: f.customer,
  });
  await stripe.subscriptions.update(f.sub, { default_payment_method: bad.id });
  await stripe.testHelpers.testClocks.advance(f.clock, {
    frozen_time: subscription.items.data[0].current_period_end + 7200,
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (
      (await stripe.testHelpers.testClocks.retrieve(f.clock)).status === "ready"
    ) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(ready, "Test clock did not settle");
  subscription = await stripe.subscriptions.retrieve(f.sub);
  let invoice = await stripe.invoices.retrieve(
    subscription.latest_invoice as string,
  );
  if (invoice.status === "draft") {
    invoice = await stripe.invoices.finalizeInvoice(invoice.id);
  }
  if (invoice.status === "open") {
    try {
      await stripe.invoices.pay(invoice.id);
    } catch (e) {
      assert.equal((e as Stripe.errors.StripeError).type, "StripeCardError");
    }
  }
  await deliver("invoice.payment_failed", (v) => v.id === invoice.id);
  assert.equal(state(f.id).state, "grace");
  // SQL clock advances only inside this disposable clone.
  sql(
    `select private.billing_tick(${
      quote(state(f.id).grace_until)
    }::timestamptz+interval '1 second')`,
  );
  assert.equal(state(f.id).state, "suspended");
  console.log("PASS local scheduled grace expiration -> suspended");
  const good = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: f.customer,
  });
  await stripe.subscriptions.update(f.sub, { default_payment_method: good.id });
  await stripe.invoices.pay(invoice.id, { payment_method: good.id });
  await deliver("invoice.paid", (v) => v.id === invoice.id);
  assert.equal(state(f.id).state, "active");
  const payments = await stripe.invoicePayments.list({
    invoice: invoice.id,
    status: "paid",
    limit: 10,
  });
  const pi = payments.data[0]?.payment.payment_intent;
  assert.equal(typeof pi, "string");
  const refund = await stripe.refunds.create({
    payment_intent: pi as string,
    amount: 12300,
    metadata: { nuthrick_test_run: run },
  });
  assert.equal(refund.status, "succeeded");
  await deliver("refund.created", (v) => v.id === refund.id);
  await stripe.subscriptions.update(f.sub, { cancel_at_period_end: true });
  await deliver(
    "customer.subscription.updated",
    (v) => v.id === f.sub && v.cancel_at_period_end === true,
  );
  await stripe.subscriptions.cancel(f.sub);
  await deliver("customer.subscription.deleted", (v) => v.id === f.sub);
  assert.equal(state(f.id).state, "cancelled");
  const renewal = await fixture(2, 0, true);
  const s = state(renewal.id);
  const notice = await provider.getRenewalNotice(
    renewal.sub,
    renewal.customer,
    s.period_end,
  );
  sql(
    `select private.transactional_email_server('renewal_verified',${
      quote(JSON.stringify({ id: s.id, ...notice }))
    }::jsonb)`,
  );
  assert.equal(notice.currency, "MXN");
  assert.equal(notice.amount, 34900);
  proof.push({
    renewal_subscription: renewal.sub,
    amount_minor: notice.amount,
    period_end: notice.at,
  });
  console.log("PASS verified Stripe upcoming renewal amount/date");
  // Real local application redemption + lifecycle jobs; no production Beta access changes.
  sql(
    `select set_config('request.jwt.claim.sub','ba000000-0000-4000-8000-000000000001',false);
  select public.admin_api('save_code',jsonb_build_object('code','MAILBETA28','name','Isolated commercial mail TEST','plan_id',(select id from private.plans where code='beta'),'duration_days',6,'max_redemptions',2,'initial_ai_credits',0,'starts_at',now()-interval '1 hour','expires_at',now()+interval '1 day','active',true));
  select set_config('request.jwt.claim.sub',${
      quote(owner(3))
    },false);select public.redeem_access_code('MAILBETA28');
  select set_config('request.jwt.claim.sub',${
      quote(owner(4))
    },false);select public.redeem_access_code('MAILBETA28');
  update private.professional_access set starts_at=now()-interval '7 days',ends_at=now()-interval '1 hour' where professional_id=${
      quote(owner(4))
    };
  select private.enqueue_beta_lifecycle_emails();select private.enqueue_beta_lifecycle_emails();`,
  );
  const rows = json(
    `select jsonb_agg(jsonb_build_object('source_event',event_key,'template_key',template_key,'payload',payload,'mode',mode) order by created_at,id) from private.transactional_email_outbox where professional_id in (${
      owners.map(quote).join(",")
    })`,
  );
  const expected = [
    "welcome",
    "subscription_activated",
    "payment_confirmed",
    "payment_failed",
    "grace_started",
    "account_suspended",
    "payment_recovered",
    "subscription_refunded",
    "cancellation_scheduled",
    "subscription_cancelled",
    "renewal_upcoming",
    "promotion_applied",
    "beta_expiring",
    "beta_expired",
  ];
  for (const t of expected) {
    assert.ok(
      rows.some((r: { template_key: string }) => r.template_key === t),
      `Missing ${t}`,
    );
  }
  const report = {
    run,
    started,
    finished: new Date().toISOString(),
    passed: true,
    stripe_mode: "test",
    database_scope: "disposable_local",
    event_transport:
      "Stripe API retrieval, local signed replay; public webhook transport not certified by this run",
    proof,
    rows,
    expected_templates: expected,
  };
  Deno.writeTextFileSync(
    `${dir}/commercial-evidence.json`,
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(
    "PASS",
    expected.length,
    "commercial templates generated from business flows; exported",
    rows.length,
    "notices",
  );
} finally {
  for (const id of clocks) {
    try {
      await stripe.testHelpers.testClocks.del(id);
      console.log("CLEANED TEST clock", id);
    } catch {
      console.error("TEST clock cleanup needs retry", id);
    }
  }
}
