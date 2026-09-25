// deno-lint-ignore-file require-await
// Synthetic keys and SDK stubs only. These tests cannot contact Stripe.
import assert from "node:assert/strict";
import Stripe from "stripe";
import { StripeBillingProvider } from "./stripe-provider.ts";
import {
  assertEnvironmentObject,
  assertEnvironmentSecret,
  type BillingEnvironment,
  type CheckoutInput,
  type Price,
} from "./domain.ts";
import { createBillingHandler } from "./handler.ts";
const input: CheckoutInput = {
  owner: "ba000000-0000-4000-8000-000000000002",
  customerId: "cus_fixture",
  priceId: "price_fixture",
  intentId: "bc000000-0000-4000-8000-000000000001",
  site: "https://nuthrick.vercel.app",
  expiresAt: 1900000000,
};
const price: Price = {
  id: "fixture",
  plan_id: "bd000000-0000-4000-8000-000000000001",
  plan_name: "Esencial",
  interval: "monthly",
  amount: 34900,
  currency: "MXN",
  rank: 10,
  provider_price_id: null,
  fingerprint: "fixture",
};
function fixture(
  mode: BillingEnvironment,
  customerLive: boolean,
  priceLive: boolean,
) {
  const writes: string[] = [];
  const sdk = {
    customers: {
      retrieve: async () => ({ id: "cus_fixture", livemode: customerLive }),
      create: async (_data: unknown, options: { idempotencyKey: string }) => {
        writes.push(options.idempotencyKey);
        return { id: "cus_fixture", livemode: mode === "live" };
      },
    },
    prices: {
      retrieve: async () => ({ id: "price_fixture", livemode: priceLive }),
    },
    checkout: {
      sessions: {
        create: async (_data: unknown, options: { idempotencyKey: string }) => {
          writes.push(options.idempotencyKey);
          return {
            id: "cs_fixture",
            url: "https://checkout.stripe.com/fixture",
            expires_at: 1900000000,
            livemode: mode === "live",
          };
        },
      },
    },
  } as unknown as Stripe;
  return {
    provider: new StripeBillingProvider(
      `sk_${mode}_syntheticFixture`,
      "whsec_syntheticFixture",
      sdk,
      { mode },
    ),
    writes,
  };
}
Deno.test("secret prefixes and missing/foreign livemode fail closed", () => {
  assert.throws(
    () => assertEnvironmentSecret("sk_test_synthetic", "live"),
    /stripe_environment_mismatch/,
  );
  assert.throws(
    () => assertEnvironmentSecret("sk_live_synthetic", "test"),
    /stripe_test_configuration_required/,
  );
  assert.throws(
    () => assertEnvironmentObject({}, "live"),
    /stripe_environment_mismatch/,
  );
  assert.throws(
    () => assertEnvironmentObject({ livemode: true }, "test"),
    /live_mode_forbidden/,
  );
});
Deno.test("TEST customer plus LIVE price cannot create Checkout", async () => {
  const f = fixture("test", false, true);
  await assert.rejects(
    () => f.provider.createCheckout(input),
    /live_mode_forbidden/,
  );
  assert.deepEqual(f.writes, []);
});
Deno.test("LIVE secret rejects TEST customer, TEST price and unscoped mapping before mutation", async () => {
  const customer = fixture("live", false, true),
    mapping = fixture("live", true, false);
  await assert.rejects(
    () => customer.provider.createCheckout(input),
    /stripe_environment_mismatch/,
  );
  await assert.rejects(
    () => mapping.provider.createCheckout(input),
    /stripe_environment_mismatch/,
  );
  await assert.rejects(
    () => mapping.provider.ensurePrice({ ...price, mode: "test" }),
    /stripe_environment_mismatch/,
  );
  await assert.rejects(
    () => mapping.provider.ensurePrice(price),
    /stripe_environment_mismatch/,
  );
  assert.deepEqual([...customer.writes, ...mapping.writes], []);
});
Deno.test("idempotency namespaces and successful Checkout remain separate by environment", async () => {
  const test = fixture("test", false, false),
    live = fixture("live", true, true);
  await test.provider.createCustomer(input.owner);
  await live.provider.createCustomer(input.owner);
  await test.provider.createCheckout(input);
  await live.provider.createCheckout(input);
  assert.ok(test.writes.every((key) => key.startsWith("nuthrick:test:")));
  assert.ok(live.writes.every((key) => key.startsWith("nuthrick:live:")));
});
Deno.test("LIVE keeps credit purchases disabled and requires a reviewed portal configuration", async () => {
  const f = fixture("live", true, true);
  await assert.rejects(
    () => f.provider.createCreditCheckout(input),
    /live_credit_purchases_disabled/,
  );
  await assert.rejects(
    () => f.provider.createCustomerPortal("cus_fixture", input.site, "fixture"),
    /live_portal_not_configured/,
  );
  assert.deepEqual(f.writes, []);
});
Deno.test("webhook signature secrets and event modes cannot cross environments", async () => {
  const sdk = new Stripe("sk_test_syntheticFixture");
  const test = new StripeBillingProvider(
    "sk_test_syntheticFixture",
    "whsec_testFixture",
  );
  const live = new StripeBillingProvider(
    "sk_live_syntheticFixture",
    "whsec_liveFixture",
    undefined,
    { mode: "live" },
  );
  const payload = JSON.stringify({
    id: "evt_fixture",
    type: "customer.subscription.updated",
    created: Math.floor(Date.now() / 1000),
    livemode: true,
    data: { object: { id: "sub_fixture", customer: "cus_fixture" } },
  });
  const signature = await sdk.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: "whsec_liveFixture",
  });
  assert.equal((await live.handleWebhook(payload, signature)).livemode, true);
  await assert.rejects(
    () => test.handleWebhook(payload, signature),
    /invalid_signature/,
  );
  const signedForTest = await sdk.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: "whsec_testFixture",
  });
  await assert.rejects(
    () => test.handleWebhook(payload, signedForTest),
    /live_mode_forbidden/,
  );
  const testPayload = payload.replace('"livemode":true', '"livemode":false');
  const wrongModeSignature = await sdk.webhooks.generateTestHeaderStringAsync({
    payload: testPayload,
    secret: "whsec_liveFixture",
  });
  await assert.rejects(
    () => live.handleWebhook(testPayload, wrongModeSignature),
    /stripe_environment_mismatch/,
  );
});
Deno.test("gateway rejects an environment mismatch before claiming or updating any subscription", async () => {
  const calls: string[] = [];
  const handler = createBillingHandler({
    site: input.site,
    authenticate: async () => input.owner,
    rpc: async <T>(action: string) => {
      calls.push(action);
      return {} as T;
    },
    provider: async () =>
      ({
        ...fixture("test", false, false).provider,
        mode: "test",
        handleWebhook: async () => ({
          supported: true,
          customer_id: "cus_fixture",
          livemode: true,
        }),
      }) as unknown as StripeBillingProvider,
  });
  const response = await handler(
    new Request("https://example.invalid/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": "synthetic" },
      body: "{}",
    }),
  );
  assert.equal(response.status, 409);
  assert.deepEqual(calls, []);
});

Deno.test("Live inspection reads catalogue, portal, webhook and subscriptions without creating charges", async () => {
  const reads: string[] = [];
  const prices = Array.from(
    { length: 4 },
    (_, i) => ({
      ...price,
      id: `mapping_${i}`,
      mode: "live" as const,
      provider_price_id: `price_${i}`,
      provider_product_id: `prod_${i}`,
    }),
  );
  let remoteStatus = "active";
  const sdk = {
    prices: {
      retrieve: async (id: string) => {
        reads.push("price");
        return {
          id,
          livemode: true,
          active: true,
          unit_amount: 34900,
          currency: "mxn",
          product: id.replace("price_", "prod_"),
          recurring: { interval: "month", interval_count: 1 },
        };
      },
    },
    products: { retrieve: async () => ({ livemode: true, active: true }) },
    webhookEndpoints: {
      list: () => [{
        livemode: true,
        status: "enabled",
        url: "https://example.invalid/billing/webhook/live",
        enabled_events: ["*"],
      }],
    },
    billingPortal: {
      configurations: {
        retrieve: async () => ({
          livemode: true,
          active: true,
          features: {
            payment_method_update: { enabled: true },
            invoice_history: { enabled: true },
            customer_update: { enabled: true },
            subscription_cancel: { enabled: true, mode: "at_period_end" },
            subscription_update: { enabled: false },
          },
        }),
      },
    },
    subscriptions: {
      list: () => [{
        id: "sub_fixture",
        customer: "cus_fixture",
        status: remoteStatus,
        cancel_at_period_end: false,
        livemode: true,
        items: { data: [{ price: { id: "price_0" } }] },
      }],
    },
  } as unknown as Stripe;
  const provider = new StripeBillingProvider(
    "sk_live_syntheticFixture",
    "whsec_syntheticFixture",
    sdk,
    { mode: "live", portalConfigurationId: "bpc_fixture" },
  );
  const context = {
    prices,
    webhookUrl: "https://example.invalid/billing/webhook/live",
    subscriptions: [{
      id: "sub_fixture",
      customer_id: "cus_fixture",
      price_id: "price_0",
      status: "active",
      cancel_at_period_end: false,
    }],
  };
  assert.deepEqual(await provider.inspectConfiguration(context), {
    prices_verified: true,
    price_mapping_ids: prices.map((p) => p.id),
    webhook_reachable: true,
    portal_verified: true,
    reconciliation_ok: true,
    mismatches: [],
  });
  remoteStatus = "past_due";
  const mismatch = await provider.inspectConfiguration(context);
  assert.equal(mismatch.reconciliation_ok, false);
  assert.deepEqual(mismatch.mismatches, ["sub_fixture"]);
  assert.equal(reads.length, 8);
});
Deno.test("Live inspection is admin-only and Legal gate runs before provider access", async () => {
  let providerCalls = 0;
  for (const admin of [false, true]) {
    const handler = createBillingHandler({
      site: input.site,
      authenticate: async () => input.owner,
      rpc: async <T>(action: string) => {
        if (action === "authorize_admin" && !admin) {
          throw new Error("admin_required");
        }
        return {} as T;
      },
      resolveEnvironment: async () => {
        throw new Error("live_legal_pending");
      },
      provider: async () => {
        providerCalls++;
        return fixture("live", true, true).provider;
      },
    });
    const response = await handler(
      new Request(input.site + "/billing", {
        method: "POST",
        headers: { authorization: "Bearer synthetic" },
        body: JSON.stringify({
          action: "inspect_live",
          operation_key: input.intentId,
        }),
      }),
    );
    assert.equal(
      (await response.json()).error,
      admin ? "live_legal_pending" : "admin_required",
    );
  }
  assert.equal(providerCalls, 0);
});
