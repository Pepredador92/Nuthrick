// deno-lint-ignore-file require-await
import assert from "node:assert/strict";
import Stripe from "stripe";
import { createBillingHandler } from "./handler.ts";
import { StripeBillingProvider } from "./stripe-provider.ts";
import type {
  BillingProvider,
  CheckoutInput,
  CreditPayment,
} from "./domain.ts";
const owner = "ca300000-0000-4000-8000-000000000002",
  op = "cd300000-0000-4000-8000-000000000001",
  pkg = "cb300000-0000-4000-8000-000000000002";
const payment: CreditPayment = {
  mode: "payment",
  checkout_id: "cs_credit",
  checkout_status: "complete",
  purchase_id: op,
  owner,
  customer_id: "cus_existing",
  payment_id: "pi_credit",
  charge_id: "ch_credit",
  price_id: "price_credit",
  quantity: 1,
  currency: "MXN",
  amount_total: 2500,
  amount_paid: 2500,
  paid: true,
  paid_at: new Date().toISOString(),
  payment_failed: false,
  amount_refunded: 0,
  refund_pending: false,
  dispute_id: null,
  dispute_status: null,
  livemode: false,
};
function setup(
  options: {
    replay?: boolean;
    fail?: string;
    url?: string;
    complete?: boolean;
  } = {},
) {
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  let checkout: CheckoutInput | undefined;
  let providerCalls = 0;
  const purchase = {
    id: op,
    package_id: pkg,
    provider_checkout_id: "cs_credit",
    checkout_url: options.url ?? null,
    expires_at: new Date(Date.now() + 2100000).toISOString(),
    campaign_snapshot: null,
  };
  const provider = {
    name: "mock",
    mode: "test",
    ensureCreditPrice: async () => "price_credit",
    createCreditCheckout: async (i: CheckoutInput) => {
      checkout = i;
      return {
        id: "cs_credit",
        url: "https://checkout.stripe.com/c/pay/test",
        expires_at: i.expiresAt,
      };
    },
    handleWebhook: async (_raw: string, signature: string) => {
      if (signature !== "valid") throw new Error("invalid_signature");
      return {
        id: "evt_credit",
        type: "checkout.session.completed",
        supported: true,
        created: Date.now() / 1000,
        customer_id: "cus_existing",
        checkout_id: "cs_credit",
        payment_id: "pi_credit",
        subscription_id: null,
        invoice_id: null,
        livemode: false,
      };
    },
    getCreditPayment: async () => payment,
    getCheckout: async () => ({
      status: options.complete ? "complete" : "open",
      subscriptionId: null,
    }),
    expireCheckout: async () => {},
    findCheckout: async () => null,
  } as unknown as BillingProvider;
  const handler = createBillingHandler({
    site: "https://nuthrick.test",
    authenticate: async (t) => t === "valid" ? owner : null,
    provider: async () => {
      providerCalls++;
      return provider;
    },
    rpc: async <T>(action: string, data: Record<string, unknown>) => {
      calls.push({ action, data });
      if (options.fail && action === "credit_prepare") {
        throw new Error(options.fail);
      }
      const result = action === "claim_event"
        ? { owner, replay: options.replay, credit_purchase: purchase }
        : action === "credit_prepare"
        ? {
          purchase,
          price: { id: "mapping", package_id: pkg, amount: 2500, credits: 500 },
          customer_id: "cus_existing",
        }
        : action === "credit_context"
        ? { purchase, customer_id: "cus_existing" }
        : action === "credit_preview"
        ? { amount: 2500, credits: 500, bonus: 0, currency: "MXN" }
        : action === "credit_checkout_saved"
        ? { id: op, url: data.url }
        : { processed: true };
      return result as T;
    },
  });
  const request = (data: Record<string, unknown>, token = "valid") =>
    handler(
      new Request("https://nuthrick.test/billing", {
        method: "POST",
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ operation_key: op, ...data }),
      }),
    );
  const webhook = (signature = "valid") =>
    handler(
      new Request("https://nuthrick.test/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: "{}",
      }),
    );
  return {
    calls,
    request,
    webhook,
    checkout: () => checkout,
    providerCalls: () => providerCalls,
  };
}
Deno.test("credit checkout derives owner, uses server mapping, reuses customer and cannot grant", async () => {
  const f = setup();
  assert.equal(
    (await f.request({ action: "credit_checkout", package_id: pkg })).status,
    200,
  );
  assert.deepEqual(f.checkout()?.customerId, "cus_existing");
  assert.equal(f.checkout()?.owner, owner);
  assert.equal(f.checkout()?.priceId, "price_credit");
  assert.ok(
    !f.calls.some((c) => ["credit_apply", "customer_saved"].includes(c.action)),
  );
  assert.equal(
    f.calls.find((c) => c.action === "credit_prepare")?.data.owner,
    owner,
  );
});
Deno.test("credit checkout rejects client-supplied quantities, prices and identities", async () => {
  for (const field of ["credits", "amount", "professional_id", "price_id"]) {
    const f = setup();
    assert.equal(
      (await f.request({
        action: "credit_checkout",
        package_id: pkg,
        [field]: 100000,
      })).status,
      409,
    );
    assert.ok(!f.calls.some((c) => c.action === "credit_prepare"));
  }
  const f = setup();
  assert.equal(
    (await f.request({ action: "credit_checkout", package_id: pkg }, "invalid"))
      .status,
    401,
  );
  assert.equal(f.providerCalls(), 0);
});
Deno.test("pending checkout retry reuses URL without a new provider operation", async () => {
  const f = setup({ url: "https://checkout.stripe.com/c/pay/existing" });
  assert.equal(
    (await f.request({ action: "credit_checkout", package_id: pkg })).status,
    200,
  );
  assert.equal(f.providerCalls(), 0);
});
Deno.test("preview cannot create a provider session or credit ledger entry", async () => {
  const f = setup();
  assert.equal(
    (await f.request({
      action: "credit_preview",
      package_id: pkg,
      code: "TEST",
    })).status,
    200,
  );
  assert.equal(f.providerCalls(), 0);
  assert.ok(!f.calls.some((c) => c.action === "credit_apply"));
});
Deno.test("signed credit webhook fetches canonical payment before atomic apply", async () => {
  const f = setup();
  assert.equal((await f.webhook()).status, 200);
  const applied = f.calls.find((c) => c.action === "credit_apply");
  assert.deepEqual(applied?.data.payment, payment);
  assert.equal(applied?.data.purchase_id, op);
  assert.ok(!f.calls.some((c) => c.action === "apply"));
});
Deno.test("invalid signature and duplicate event never invoke a credit grant", async () => {
  const f = setup();
  assert.equal((await f.webhook("bad")).status, 400);
  assert.equal(f.calls.length, 0);
  const replay = setup({ replay: true });
  assert.equal((await replay.webhook()).status, 200);
  assert.ok(!replay.calls.some((c) => c.action === "credit_apply"));
});
Deno.test("completed pending checkout cannot be discarded before webhook confirmation", async () => {
  const f = setup({ complete: true });
  assert.equal((await f.request({ action: "credit_expire" })).status, 409);
  assert.ok(!f.calls.some((c) => c.action === "credit_expired"));
});
Deno.test("credit entitlement and checkout rate limits return actionable HTTP statuses", async () => {
  assert.equal(
    (await setup({ fail: "credit_purchase_not_allowed" }).request({
      action: "credit_checkout",
      package_id: pkg,
    })).status,
    403,
  );
  assert.equal(
    (await setup({ fail: "credit_checkout_rate_limited" }).request({
      action: "credit_checkout",
      package_id: pkg,
    })).status,
    429,
  );
});
function sdkFixture() {
  const charge = {
    id: "ch_credit",
    livemode: false,
    customer: "cus_existing",
    payment_intent: "pi_credit",
    paid: true,
    captured: true,
    created: Math.floor(Date.now() / 1000),
  };
  const pi = {
    id: "pi_credit",
    livemode: false,
    customer: "cus_existing",
    amount: 2500,
    amount_received: 2500,
    currency: "mxn",
    status: "succeeded",
    latest_charge: charge,
    last_payment_error: null,
  };
  const session = {
    id: "cs_credit",
    livemode: false,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    amount_total: 2500,
    currency: "mxn",
    customer: "cus_existing",
    client_reference_id: owner,
    metadata: { nuthrick_purchase: op },
    payment_intent: pi,
    created: charge.created,
  };
  const refunds: {
    amount: number;
    status: string;
    currency: string;
    payment_intent: string;
  }[] = [];
  const disputes: { id: string; status: string; livemode: boolean }[] = [];
  let checkoutParams: Record<string, unknown> | undefined;
  const sdk = {
    checkout: {
      sessions: {
        retrieve: async () => session,
        listLineItems: async () => ({
          has_more: false,
          data: [{ quantity: 1, price: { id: "price_credit" } }],
        }),
        create: async (p: Record<string, unknown>) => {
          checkoutParams = p;
          return {
            id: "cs_credit",
            url: "https://checkout.stripe.com/c/pay/test",
            livemode: false,
            expires_at: Date.now() / 1000 + 2100,
          };
        },
      },
    },
    refunds: {
      list: () => ({
        async *[Symbol.asyncIterator]() {
          yield* refunds;
        },
      }),
    },
    disputes: { list: async () => ({ data: disputes }) },
  } as unknown as Stripe;
  const provider = new StripeBillingProvider(
    "sk_test_fixture",
    "whsec_fixture",
    sdk,
  );
  return {
    provider,
    session,
    pi,
    charge,
    refunds,
    disputes,
    params: () => checkoutParams,
  };
}
Deno.test("Stripe credit checkout is one-time payment with no clinical metadata", async () => {
  const f = sdkFixture();
  await f.provider.createCreditCheckout({
    owner,
    customerId: "cus_existing",
    priceId: "price_credit",
    intentId: op,
    site: "https://nuthrick.test",
    expiresAt: Math.floor(Date.now() / 1000) + 2100,
  });
  const p = f.params()!;
  assert.equal(p.mode, "payment");
  assert.equal(p.customer, "cus_existing");
  assert.equal(p.subscription_data, undefined);
  assert.ok(String(p.success_url).includes("/app/credits?purchase="));
  assert.deepEqual(Object.keys(p.metadata as object).sort(), [
    "nuthrick_intent",
    "nuthrick_purchase",
  ]);
});
Deno.test("canonical credit proof includes only successful refunds and pending review", async () => {
  const f = sdkFixture();
  f.refunds.push({
    amount: 1000,
    status: "succeeded",
    currency: "mxn",
    payment_intent: "pi_credit",
  }, {
    amount: 500,
    status: "failed",
    currency: "mxn",
    payment_intent: "pi_credit",
  }, {
    amount: 200,
    status: "pending",
    currency: "mxn",
    payment_intent: "pi_credit",
  });
  f.disputes.push({
    id: "dp_fixture",
    status: "needs_response",
    livemode: false,
  });
  const p = await f.provider.getCreditPayment("cs_credit");
  assert.equal(p.paid, true);
  assert.equal(p.amount_refunded, 1000);
  assert.equal(p.refund_pending, true);
  assert.equal(p.dispute_status, "needs_response");
});
Deno.test("unpaid, wrong-owner and live Stripe payment objects cannot grant", async () => {
  const f = sdkFixture();
  f.pi.status = "requires_payment_method";
  assert.equal((await f.provider.getCreditPayment("cs_credit")).paid, false);
  f.pi.customer = "cus_other";
  await assert.rejects(
    () => f.provider.getCreditPayment("cs_credit"),
    /invalid_payment_identity/,
  );
  f.session.livemode = true;
  await assert.rejects(
    () => f.provider.getCreditPayment("cs_credit"),
    /live_mode_forbidden/,
  );
});
