// deno-lint-ignore-file require-await
import assert from "node:assert/strict";
import Stripe from "stripe";
import { StripeBillingProvider } from "./stripe-provider.ts";
const end = new Date(Date.now() + 7 * 86400000).toISOString().replace(
  /\.\d{3}Z$/,
  ".000Z",
);
function fixture() {
  const subscription = {
    id: "sub_mail",
    livemode: false,
    customer: "cus_mail",
    metadata: {},
    status: "active",
    cancel_at_period_end: false,
    billing_cycle_anchor: Date.now() / 1000 - 86400,
    latest_invoice: null,
    items: {
      data: [{
        quantity: 1,
        current_period_start: Date.now() / 1000 - 86400,
        current_period_end: Date.parse(end) / 1000,
        price: { id: "price_mail" },
      }],
    },
  };
  const invoice = {
    id: "in_mail",
    livemode: false,
    customer: "cus_mail",
    currency: "mxn",
    amount_due: 12345,
    parent: { subscription_details: { subscription: "sub_mail" } },
  };
  const refunds = [{
    id: "re_success",
    payment_intent: "pi_mail",
    currency: "mxn",
    amount: 1200,
    status: "succeeded",
  }, {
    id: "re_pending",
    payment_intent: "pi_mail",
    currency: "mxn",
    amount: 2400,
    status: "pending",
  }];
  const sdk = {
    subscriptions: { retrieve: async () => subscription },
    invoices: {
      retrieve: async () => invoice,
      createPreview: async (data: unknown) => {
        assert.deepEqual(data, {
          subscription: "sub_mail",
          customer: "cus_mail",
        });
        return invoice;
      },
    },
    invoicePayments: {
      list: () => ({
        async *[Symbol.asyncIterator]() {
          yield {
            invoice: "in_mail",
            currency: "mxn",
            livemode: false,
            payment: { payment_intent: "pi_mail" },
          };
        },
      }),
    },
    paymentIntents: {
      retrieve: async () => ({
        customer: "cus_mail",
        currency: "mxn",
        livemode: false,
      }),
    },
    refunds: {
      list: () => ({
        async *[Symbol.asyncIterator]() {
          yield* refunds;
        },
      }),
    },
  };
  const provider = new StripeBillingProvider(
    "sk_test_fixture",
    "whsec_fixture",
    sdk as unknown as Stripe,
  );
  return { provider, subscription, invoice, refunds };
}
Deno.test("renewal uses provider preview amount and rejects changed dates, foreign customer and cancellation", async () => {
  const f = fixture();
  assert.deepEqual(
    await f.provider.getRenewalNotice("sub_mail", "cus_mail", end),
    { at: end, amount: 12345, currency: "MXN" },
  );
  await assert.rejects(
    () => f.provider.getRenewalNotice("sub_mail", "cus_other", end),
    /invalid_renewal/,
  );
  await assert.rejects(
    () =>
      f.provider.getRenewalNotice(
        "sub_mail",
        "cus_mail",
        new Date().toISOString(),
      ),
    /invalid_renewal/,
  );
  assert.equal(
    (await f.provider.getRenewalNotice(
      "sub_mail",
      "cus_mail",
      end.replace("Z", "+00:00"),
    )).amount,
    12345,
  );
  f.subscription.cancel_at_period_end = true;
  await assert.rejects(
    () => f.provider.getRenewalNotice("sub_mail", "cus_mail", end),
    /invalid_renewal/,
  );
});
Deno.test("refund evidence excludes pending refunds and rejects cross-invoice currency", async () => {
  const f = fixture();
  assert.deepEqual(await f.provider.getInvoiceRefunds("in_mail"), [{
    id: "re_success",
    amount: 1200,
    currency: "MXN",
  }]);
  f.refunds[0].currency = "usd";
  await assert.rejects(
    () => f.provider.getInvoiceRefunds("in_mail"),
    /invalid_payment_identity/,
  );
});
Deno.test("refund webhook resolves canonical subscription before claiming the billing event", async () => {
  const sdk = {
    webhooks: {
      constructEventAsync: async () => ({
        id: "evt_refund",
        type: "refund.updated",
        created: 1,
        livemode: false,
        data: {
          object: {
            id: "re_confirmed",
            charge: "ch_mail",
            payment_intent: "pi_mail",
          },
        },
      }),
    },
    charges: {
      retrieve: async () => ({
        id: "ch_mail",
        customer: "cus_mail",
        payment_intent: "pi_mail",
        livemode: false,
      }),
    },
    checkout: { sessions: { list: async () => ({ data: [] }) } },
    invoicePayments: {
      list: async () => ({
        data: [{
          invoice: "in_mail",
          livemode: false,
          payment: { payment_intent: "pi_mail" },
        }],
        has_more: false,
      }),
    },
    invoices: {
      retrieve: async () => ({
        id: "in_mail",
        customer: "cus_mail",
        livemode: false,
        parent: { subscription_details: { subscription: "sub_mail" } },
      }),
    },
  };
  const p = new StripeBillingProvider(
    "sk_test_fixture",
    "whsec_fixture",
    sdk as unknown as Stripe,
  );
  const e = await p.handleWebhook("{}", "signature");
  assert.equal(e.subscription_id, "sub_mail");
  assert.equal(e.invoice_id, "in_mail");
  assert.equal(e.customer_id, "cus_mail");
});
