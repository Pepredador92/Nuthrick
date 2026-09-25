// deno-lint-ignore-file require-await
// Dependency mocks keep the asynchronous RPC contract without network access.
import assert from "node:assert/strict";
import Stripe from "stripe";
import {
  assertTestSecret,
  type BillingProvider,
  type Campaign,
  changeTiming,
  type CheckoutInput,
  couponFor,
  type InvoiceSnapshot,
  type Price,
  safeHostedUrl,
  type SubscriptionSnapshot,
  type VerifiedEvent,
} from "./domain.ts";
import { type BillingDependencies, createBillingHandler } from "./handler.ts";
import { StripeBillingProvider } from "./stripe-provider.ts";
const owner = "ba000000-0000-4000-8000-000000000002",
  intentId = "bc000000-0000-4000-8000-000000000001",
  planId = "bd000000-0000-4000-8000-000000000001";
const price: Price = {
  id: "bd000000-0000-4000-8000-000000000002",
  plan_id: planId,
  plan_name: "Esencial",
  interval: "monthly",
  amount: 34900,
  currency: "MXN",
  rank: 10,
  provider_price_id: "price_es",
  fingerprint: "price_fixture",
};
const campaign: Campaign = {
  id: "bb000000-0000-4000-8000-000000000001",
  code: "UAZ2026",
  name: "Universidad",
  version: 1,
  audience: "university",
  active: true,
  starts_at: "2026-01-01T00:00:00Z",
  ends_at: null,
  eligible_plan_ids: [planId],
  intervals: ["monthly"],
  max_redemptions: 100,
  max_per_professional: 1,
  new_customers_only: false,
  visibility: "private",
  benefits: [{
    type: "custom_price",
    amount: 249,
    duration: { kind: "months", months: 12 },
  }, { type: "initial_ai_credits", amount: 20, duration: { kind: "invoice" } }],
};
const invoice: InvoiceSnapshot = {
  id: "in_fixture",
  subscription_id: "sub_fixture",
  customer_id: "cus_fixture",
  status: "paid",
  amount_due: 24900,
  amount_paid: 24900,
  currency: "MXN",
  created: "2026-09-01T00:00:00Z",
  paid_at: "2026-09-01T00:00:00Z",
  period_start: "2026-09-01T00:00:00Z",
  period_end: "2026-10-01T00:00:00Z",
  hosted_url: "https://invoice.stripe.com/i/fixture",
  price_id: "price_es",
};
const snapshot: SubscriptionSnapshot = {
  id: "sub_fixture",
  intent_id: intentId,
  customer_id: "cus_fixture",
  price_id: "price_es",
  status: "active",
  provider_status: "active",
  period_start: invoice.period_start,
  period_end: invoice.period_end,
  anchor: invoice.period_start,
  cancel_at_period_end: false,
  schedule_id: null,
  latest_invoice: invoice,
  pending_update: false,
  livemode: false,
};
const event: VerifiedEvent = {
  id: "evt_fixture",
  type: "invoice.paid",
  supported: true,
  created: Date.now() / 1000,
  customer_id: "cus_fixture",
  subscription_id: "sub_fixture",
  invoice_id: "in_fixture",
  checkout_id: null,
  livemode: false,
};
class MockBillingProvider implements BillingProvider {
  readonly name = "mock";
  readonly mode = "test";
  calls: string[] = [];
  currentEvent = { ...event };
  currentSubscription = { ...snapshot };
  checkoutInput: CheckoutInput | null = null;
  createCustomer = () => {
    this.calls.push("customer");
    return Promise.resolve("cus_fixture");
  };
  ensurePrice = () => {
    this.calls.push("price");
    return Promise.resolve("price_es");
  };
  ensurePromotion = () => {
    this.calls.push("promotion");
    return Promise.resolve({ couponId: "coupon_fixture", endAt: null });
  };
  createCheckout = (input: CheckoutInput) => {
    this.calls.push("checkout");
    this.checkoutInput = input;
    return Promise.resolve({
      id: "cs_fixture",
      url: "https://checkout.stripe.com/c/pay/cs_fixture",
      expires_at: input.expiresAt,
    });
  };
  getCheckout = () =>
    Promise.resolve({ status: "complete", subscriptionId: "sub_fixture" });
  findCheckout = () => Promise.resolve(null);
  expireCheckout = () => {
    this.calls.push("expire");
    return Promise.resolve();
  };
  createCustomerPortal = () =>
    Promise.resolve("https://billing.stripe.com/p/fixture");
  getSubscription = () => {
    this.calls.push("subscription");
    return Promise.resolve(this.currentSubscription);
  };
  changeSubscription = () => {
    this.calls.push("change");
    return Promise.resolve({ scheduleId: null });
  };
  cancelSubscription = () => {
    this.calls.push("cancel");
    return Promise.resolve();
  };
  resumeSubscription = () => {
    this.calls.push("resume");
    return Promise.resolve();
  };
  handleWebhook = (_raw: string, signature: string) => {
    this.calls.push("signature");
    if (signature !== "valid") {
      return Promise.reject(new Error("invalid_signature"));
    }
    return Promise.resolve(this.currentEvent);
  };
  getInvoice = () => {
    this.calls.push("invoice");
    return Promise.resolve(invoice);
  };
  endDiscountAt = () => Promise.resolve("schedule_fixture");
}
function setup(
  override: (action: string, data: Record<string, unknown>) => unknown = () =>
    undefined,
) {
  const provider = new MockBillingProvider();
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  const rpc: BillingDependencies["rpc"] = async <T>(
    action: string,
    data: Record<string, unknown>,
  ): Promise<T> => {
    calls.push({ action, data });
    const custom = override(action, data);
    if (custom !== undefined) return custom as T;
    const result: Record<string, unknown> = {
      prepare_checkout: {
        intent: {
          id: intentId,
          professional_id: owner,
          provider_session_id: null,
          expires_at: new Date(Date.now() + 35 * 60_000).toISOString(),
          url: null,
          campaign_snapshot: campaign,
        },
        price,
        customer_id: null,
      },
      checkout_saved: { url: "https://checkout.stripe.com/c/pay/cs_fixture" },
      claim_event: {
        owner,
        intent: { id: intentId, campaign_snapshot: campaign },
        managed_subscription: true,
      },
      apply: { processed: true },
      event_done: { processed: true },
      prepare_operation: {
        subscription: { provider_subscription_id: "sub_fixture" },
        current_price: price,
        target_price: { ...price, rank: 20 },
        customer_id: "cus_fixture",
      },
      operation_saved: { requested: true },
    };
    return (result[action] ?? {}) as T;
  };
  const handler = createBillingHandler({
    site: "https://nuthrick.vercel.app",
    authenticate: (token) =>
      Promise.resolve(token === "valid-user" ? owner : null),
    provider: () => Promise.resolve(provider),
    rpc,
  });
  return { provider, calls, handler };
}
function request(
  data: unknown,
  headers: Record<string, string> = {},
  path = "billing",
) {
  return new Request(`https://project.supabase.co/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer valid-user",
      ...headers,
    },
    body: JSON.stringify(data),
  });
}
Deno.test("UAZ2026 maps to a 100 MXN discount for 12 months; non-price benefits stay local", () => {
  assert.deepEqual(couponFor(campaign, price), {
    amount_off: 10000,
    currency: "mxn",
    duration: "repeating",
    duration_in_months: 12,
  });
  assert.equal(
    couponFor({ ...campaign, benefits: [campaign.benefits[1]] }, price),
    null,
  );
});
Deno.test("influencer, student, clinic, free and invoice/until/forever mappings", () => {
  for (
    const [benefits, expected] of [
      [[{
        type: "percentage_discount",
        amount: 20,
        duration: { kind: "months", months: 3 },
      }], { percent_off: 20, duration: "repeating", duration_in_months: 3 }],
      [[{
        type: "percentage_discount",
        amount: 50,
        duration: { kind: "months", months: 6 },
      }], { percent_off: 50, duration: "repeating", duration_in_months: 6 }],
      [[{
        type: "custom_price",
        amount: 399,
        duration: { kind: "months", months: 6 },
      }], {
        amount_off: 10000,
        currency: "mxn",
        duration: "repeating",
        duration_in_months: 6,
      }],
      [[{ type: "free_period", duration: { kind: "invoice" } }], {
        percent_off: 100,
        duration: "once",
      }],
      [[{
        type: "fixed_discount",
        amount: 100,
        duration: { kind: "until", until: "2027-01-01T00:00:00Z" },
      }], { amount_off: 10000, currency: "mxn", duration: "forever" }],
      [[{
        type: "percentage_discount",
        amount: 10,
        duration: { kind: "forever" },
      }], { percent_off: 10, duration: "forever" }],
    ] as [Campaign["benefits"], Record<string, unknown>][]
  ) {
    assert.deepEqual(
      couponFor({ ...campaign, benefits }, { ...price, amount: 49900 }),
      expected,
    );
  }
});
Deno.test("Live keys and unsafe provider URLs are rejected", () => {
  assert.throws(() => assertTestSecret("sk_live_fixture"));
  assert.throws(() => assertTestSecret("rk_test_fixture"));
  assertTestSecret("sk_test_fixture");
  for (
    const url of [
      "http://invoice.stripe.com/i/1",
      "https://invoice.stripe.com.evil.test/",
      "https://user:secret@invoice.stripe.com/i/1",
      "javascript:alert(1)",
    ]
  ) assert.equal(safeHostedUrl(url, "invoice"), null);
  assert.equal(
    safeHostedUrl("https://invoice.stripe.com/i/fixture", "invoice"),
    "https://invoice.stripe.com/i/fixture",
  );
});
Deno.test("upgrade is immediate only within the same interval", () => {
  assert.equal(
    changeTiming(10, "monthly", { ...price, rank: 20 }),
    "immediate",
  );
  assert.equal(changeTiming(20, "monthly", price), "period_end");
  assert.equal(
    changeTiming(10, "annual", { ...price, rank: 20 }),
    "period_end",
  );
});
Deno.test("invalid webhook signature never claims an event or writes access", async () => {
  const { handler, calls } = setup();
  const response = await handler(
    request(
      { forged: true },
      { "stripe-signature": "invalid" },
      "billing/webhook",
    ),
  );
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});
Deno.test("provider signature validation covers the exact raw body, timestamp and mode", async () => {
  const provider = new StripeBillingProvider(
    "sk_test_fixture",
    "whsec_fixture",
  );
  const body = JSON.stringify({
    id: "evt_signed",
    type: "invoice.paid",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: "in_signed",
        customer: "cus_fixture",
        parent: { subscription_details: { subscription: "sub_fixture" } },
      },
    },
  });
  const sign = (payload: string, timestamp = Math.floor(Date.now() / 1000)) =>
    Stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: "whsec_fixture",
      timestamp,
    });
  assert.equal(
    (await provider.handleWebhook(body, await sign(body))).subscription_id,
    "sub_fixture",
  );
  await assert.rejects(
    async () => provider.handleWebhook(body + " ", await sign(body)),
    /invalid_signature/,
  );
  await assert.rejects(
    async () =>
      provider.handleWebhook(
        body,
        await sign(body, Math.floor(Date.now() / 1000) - 600),
      ),
    /invalid_signature/,
  );
  const live = body.replace('"livemode":false', '"livemode":true');
  await assert.rejects(
    async () => provider.handleWebhook(live, await sign(live)),
    /live_mode_forbidden/,
  );
});
Deno.test("unauthenticated and foreign-origin requests cannot start provider work", async () => {
  for (
    const headers of [{ authorization: "Bearer forged" }, {
      origin: "https://evil.test",
    }] as Record<string, string>[]
  ) {
    const { handler, provider, calls } = setup();
    const result = await handler(
      request({
        action: "checkout",
        operation_key: intentId,
        plan_id: planId,
        interval: "monthly",
      }, headers),
    );
    assert.ok([401, 403].includes(result.status));
    assert.equal(provider.calls.length, 0);
    assert.equal(calls.length, 0);
  }
});
Deno.test("Checkout reserves once, persists mappings, and cannot activate access", async () => {
  const { handler, provider, calls } = setup();
  const response = await handler(
    request({
      action: "checkout",
      operation_key: intentId,
      plan_id: planId,
      interval: "monthly",
      code: "UAZ2026",
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(provider.calls, [
    "customer",
    "price",
    "promotion",
    "checkout",
  ]);
  assert.equal(provider.checkoutInput?.intentId, intentId);
  assert.ok(calls.some((c) => c.action === "promotion_saved"));
  assert.ok(!calls.some((c) => c.action === "apply"));
  assert.equal(calls.at(-1)?.action, "unlock");
});
Deno.test("verified webhook fetches canonical subscription and event invoice before applying", async () => {
  const { handler, calls, provider } = setup();
  const response = await handler(
    request({}, { "stripe-signature": "valid" }, "billing/webhook"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(provider.calls, ["signature", "invoice", "subscription"]);
  const applied = calls.find((c) => c.action === "apply")!;
  assert.equal(applied.data.owner, owner);
  assert.equal(
    applied.data.subscription,
    snapshot === provider.currentSubscription
      ? snapshot
      : provider.currentSubscription,
  );
});
Deno.test("duplicate event avoids provider reads and all writes", async () => {
  const { handler, calls, provider } = setup((a) =>
    a === "claim_event" ? { replay: true } : undefined
  );
  assert.equal(
    (await handler(
      request({}, { "stripe-signature": "valid" }, "billing/webhook"),
    )).status,
    200,
  );
  assert.deepEqual(provider.calls, ["signature"]);
  assert.deepEqual(calls.map((c) => c.action), ["claim_event"]);
});
Deno.test("busy webhook returns retryable status instead of acknowledging loss", async () => {
  const { handler, calls } = setup((a) => {
    if (a === "claim_event") throw new Error("billing_busy");
  });
  const response = await handler(
    request({}, { "stripe-signature": "valid" }, "billing/webhook"),
  );
  assert.equal(response.status, 503);
  assert.ok(!calls.some((c) => c.action === "apply"));
});
Deno.test("unmanaged provider subscription cannot be adopted by matching the price", async () => {
  const { handler, provider, calls } = setup((a) =>
    a === "claim_event"
      ? { owner, intent: { id: intentId }, managed_subscription: false }
      : undefined
  );
  provider.currentSubscription = { ...snapshot, intent_id: null };
  assert.equal(
    (await handler(
      request({}, { "stripe-signature": "valid" }, "billing/webhook"),
    )).status,
    200,
  );
  assert.ok(!calls.some((c) => c.action === "apply"));
});
Deno.test("success query parameters have no privileged activation path", async () => {
  const { handler, calls } = setup();
  const response = await handler(
    request({ action: "success", paid: true, operation_key: intentId }),
  );
  assert.equal(response.status, 409);
  assert.equal(calls.length, 0);
});
Deno.test("administrative cancellation checks privilege before locking another account", async () => {
  const { handler, provider, calls } = setup((a) => {
    if (a === "authorize_admin") throw new Error("admin_required");
  });
  const response = await handler(
    request({
      action: "cancel_now",
      professional_id: planId,
      operation_key: intentId,
      confirmation: "CANCELAR AHORA",
      reason: "fixture reason",
    }),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(calls.map((c) => c.action), ["authorize_admin"]);
  assert.equal(provider.calls.length, 0);
});
Deno.test("body size and malformed JSON are bounded without provider work", async () => {
  const { handler, provider } = setup();
  const response = await handler(request({ padding: "x".repeat(17000) }));
  assert.equal(response.status, 409);
  assert.equal(provider.calls.length, 0);
  for (const invalid of [null, [], 1, "checkout"]) {
    const response = await handler(request(invalid));
    assert.deepEqual(await response.json(), { error: "invalid_input" });
  }
});
Deno.test("failed verified events store a safe code and remain retryable", async () => {
  const { handler, calls } = setup((a) => {
    if (a === "apply") throw new Error("sk_test_secret provider payload");
  });
  const response = await handler(
    request({}, { "stripe-signature": "valid" }, "billing/webhook"),
  );
  assert.equal(response.status, 503);
  const recorded = calls.find((c) => c.action === "event_failed");
  assert.ok(recorded);
  assert.equal(recorded.data.code, "billing_unavailable");
  assert.ok(!JSON.stringify(recorded).includes("sk_test_"));
});
Deno.test("provider failure messages never leak credentials or payment payloads", async () => {
  const { handler } = setup((a) => {
    if (a === "prepare_checkout") {
      throw new Error("secret sk_test_doNotExpose card data");
    }
  });
  const response = await handler(
    request({
      action: "checkout",
      operation_key: intentId,
      plan_id: planId,
      interval: "monthly",
    }),
  );
  assert.deepEqual(await response.json(), { error: "billing_unavailable" });
});
