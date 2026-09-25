// deno-lint-ignore-file require-await
// SDK mocks keep the asynchronous provider contract without network access.
import assert from "node:assert/strict";
import Stripe from "stripe";
import { collectionState, StripeBillingProvider } from "./stripe-provider.ts";
import type { Price } from "./domain.ts";
const target: Price = {
  id: "local_price",
  plan_id: "ba000000-0000-4000-8000-000000000001",
  plan_name: "Profesional",
  interval: "monthly",
  amount: 49900,
  currency: "MXN",
  rank: 20,
  provider_price_id: "price_target",
  fingerprint: "fingerprint",
};
function fixture(hasSchedule = true) {
  const now = Math.floor(Date.now() / 1000),
    start = now - 86400,
    end = now + 29 * 86400,
    cutoff = now + 10 * 86400;
  const calls: {
    method: string;
    params: Record<string, unknown>;
    key?: string;
  }[] = [];
  const schedule = {
    id: "sched_fixture",
    livemode: false,
    current_phase: { start_date: start, end_date: end },
    end_behavior: "release",
    metadata: { nuthrick_discount_until: String(cutoff) },
    phases: [{
      start_date: start,
      end_date: end,
      items: [{ price: "price_current", quantity: 1 }],
      discounts: [{
        coupon: "coupon_old",
        discount: null,
        promotion_code: null,
      }],
    }],
  };
  const subscription = {
    id: "sub_fixture",
    livemode: false,
    customer: "cus_fixture",
    status: "active",
    metadata: { nuthrick_intent: "intent_fixture" },
    billing_cycle_anchor: start,
    test_clock: null as string | null,
    discounts: ["di_original"],
    schedule: hasSchedule ? schedule.id : null,
    pending_update: null,
    cancel_at_period_end: false,
    latest_invoice: null,
    items: {
      data: [{
        id: "si_fixture",
        price: { id: "price_current", recurring: { interval: "month" } },
        quantity: 1,
        current_period_start: start,
        current_period_end: end,
      }],
    },
  };
  const sdk = {
    subscriptions: {
      retrieve: async () => subscription,
      update: async (
        _id: string,
        params: Record<string, unknown>,
        options: { idempotencyKey: string },
      ) => {
        calls.push({
          method: "subscription.update",
          params,
          key: options.idempotencyKey,
        });
        return subscription;
      },
      cancel: async (_id: string, params: Record<string, unknown>) => {
        calls.push({ method: "subscription.cancel", params });
        return subscription;
      },
    },
    subscriptionSchedules: {
      retrieve: async () => schedule,
      create: async () => schedule,
      update: async (
        _id: string,
        params: Record<string, unknown>,
        options: { idempotencyKey: string },
      ) => {
        calls.push({
          method: "schedule.update",
          params,
          key: options.idempotencyKey,
        });
        return schedule;
      },
      cancel: async (_id: string, params: Record<string, unknown>) => {
        calls.push({ method: "schedule.cancel", params });
        return schedule;
      },
    },
    accounts: { retrieve: async () => ({ id: "acct_fixture" }) },
    testHelpers: {
      testClocks: { retrieve: async () => ({ frozen_time: end }) },
    },
  };
  const provider = new StripeBillingProvider(
    "sk_test_fixture",
    "whsec_fixture",
    sdk as unknown as Stripe,
  );
  return { provider, calls, sdk, subscription, schedule, start, end, cutoff };
}
Deno.test("only the Stripe adapter translates native subscription states", () => {
  assert.equal(collectionState("trialing"), "trial");
  assert.equal(collectionState("past_due"), "payment_due");
  assert.equal(collectionState("canceled"), "ended");
  assert.equal(collectionState("incomplete_expired"), "ended");
  assert.equal(collectionState("unknown_future_state"), "paused");
});
Deno.test("provider verifies the configured account before using its keys", async () => {
  const { provider } = fixture();
  await provider.verifyAccount("acct_fixture");
  await assert.rejects(
    () => provider.verifyAccount("acct_other"),
    /stripe_account_mismatch/,
  );
});
Deno.test("immediate upgrades request Stripe proration and defer changes on incomplete payment", async () => {
  const { provider, calls } = fixture(false);
  await provider.changeSubscription(
    "sub_fixture",
    target,
    "immediate",
    "operation",
  );
  const call = calls[0];
  assert.equal(call.method, "subscription.update");
  assert.equal(call.params.proration_behavior, "always_invoice");
  assert.equal(call.params.payment_behavior, "pending_if_incomplete");
  assert.deepEqual(call.params.items, [{
    id: "si_fixture",
    price: "price_target",
  }]);
  assert.equal(call.key, "nuthrick:test:upgrade:operation");
});
Deno.test("downgrade keeps current paid price until period end and preserves discount expiry", async () => {
  const { provider, calls, end, cutoff } = fixture();
  await provider.changeSubscription(
    "sub_fixture",
    { ...target, rank: 0 },
    "period_end",
    "operation",
  );
  const update = calls[0]
    .params as unknown as Stripe.SubscriptionScheduleUpdateParams;
  assert.equal(update.proration_behavior, "none");
  assert.equal(update.end_behavior, "release");
  const phases = update.phases!;
  assert.equal(phases.length, 3);
  assert.equal(phases[0].end_date, cutoff);
  assert.deepEqual(phases[0].discounts, [{ discount: "di_original" }]);
  assert.deepEqual(phases[1].discounts, []);
  assert.equal(phases[1].end_date, end);
  assert.deepEqual(phases[1].items, [{ price: "price_current", quantity: 1 }]);
  assert.deepEqual(phases[2].items, [{ price: "price_target", quantity: 1 }]);
});
Deno.test("a scheduled promotion does not block an immediate prorated upgrade", async () => {
  const { provider, calls } = fixture();
  await provider.changeSubscription(
    "sub_fixture",
    target,
    "immediate",
    "operation",
  );
  const params = calls[0]
    .params as unknown as Stripe.SubscriptionScheduleUpdateParams;
  assert.equal(params.proration_behavior, "always_invoice");
  assert.deepEqual(params.phases![0].items, [{
    price: "price_target",
    quantity: 1,
  }]);
  assert.deepEqual(params.phases![0].discounts, [{ discount: "di_original" }]);
  assert.deepEqual(params.phases![1].discounts, []);
});
Deno.test("normal cancellation overrides a pending schedule while preserving paid access", async () => {
  const { provider, calls, end } = fixture();
  await provider.cancelSubscription("sub_fixture", false, "operation");
  const params = calls[0]
    .params as unknown as Stripe.SubscriptionScheduleUpdateParams;
  assert.equal(params.end_behavior, "cancel");
  assert.equal(params.phases!.at(-1)!.end_date, end);
  assert.equal(params.proration_behavior, "none");
  assert.ok(params.phases!.every((p) => p.items[0].price === "price_current"));
});
Deno.test("resuming a schedule retains its promotional cutoff and current plan", async () => {
  const { provider, calls, cutoff, schedule } = fixture();
  schedule.end_behavior = "cancel";
  await provider.resumeSubscription("sub_fixture", "operation");
  const params = calls[0]
    .params as unknown as Stripe.SubscriptionScheduleUpdateParams;
  assert.equal(params.end_behavior, "release");
  assert.equal(params.phases![0].end_date, cutoff);
  assert.deepEqual(params.phases![1].discounts, []);
});
Deno.test("setting a promotional cutoff preserves an existing cancellation", async () => {
  const { provider, calls, cutoff, end, schedule } = fixture();
  schedule.end_behavior = "cancel";
  schedule.metadata.nuthrick_discount_until = "";
  await provider.endDiscountAt(
    "sub_fixture",
    new Date(cutoff * 1000).toISOString(),
    "operation",
  );
  const params = calls[0]
    .params as unknown as Stripe.SubscriptionScheduleUpdateParams;
  assert.equal(params.end_behavior, "cancel");
  assert.equal(params.phases!.at(-1)!.end_date, end);
});
Deno.test("resume cannot silently remove a pending plan change", async () => {
  const { provider, calls } = fixture();
  await assert.rejects(
    () => provider.resumeSubscription("sub_fixture", "operation"),
    /subscription_change_unavailable/,
  );
  assert.equal(calls.length, 0);
});
Deno.test("expired discount does not recreate a released schedule on a test clock", async () => {
  const { provider, calls, subscription, cutoff, sdk } = fixture(false);
  subscription.test_clock = "clock_fixture";
  subscription.discounts = [];
  sdk.subscriptionSchedules.create = async () => {
    throw new Error("must not create a new schedule");
  };
  assert.equal(
    await provider.endDiscountAt(
      "sub_fixture",
      new Date(cutoff * 1000).toISOString(),
      "retry",
    ),
    null,
  );
  assert.equal(calls.length, 0);
});
Deno.test("immediate admin cancellation produces no proration or extra invoice", async () => {
  for (const scheduled of [false, true]) {
    const { provider, calls } = fixture(scheduled);
    await provider.cancelSubscription("sub_fixture", true, "operation");
    assert.equal(
      calls[0].method,
      scheduled ? "schedule.cancel" : "subscription.cancel",
    );
    assert.deepEqual(calls[0].params, { invoice_now: false, prorate: false });
  }
});
Deno.test("proration payment proof uses the positive current-price invoice line", async () => {
  const { sdk, subscription, start, end } = fixture(false);
  const current = {
    id: "il_current",
    amount: 15000,
    period: { start, end },
    parent: { type: "subscription_item_details" },
    pricing: { price_details: { price: "price_current" } },
  };
  const previous = {
    ...current,
    id: "il_previous",
    amount: -34900,
    pricing: { price_details: { price: "price_previous" } },
  };
  const invoice = {
    id: "in_fixture",
    livemode: false,
    parent: { subscription_details: { subscription: "sub_fixture" } },
    customer: "cus_fixture",
    status: "paid",
    amount_due: 15000,
    amount_paid: 15000,
    currency: "mxn",
    created: start,
    status_transitions: { paid_at: start },
    period_start: start,
    period_end: end,
    hosted_invoice_url: "https://invoice.stripe.com/i/fixture",
    lines: { has_more: true, data: [previous] },
  };
  const expanded = {
    ...sdk,
    subscriptions: {
      ...sdk.subscriptions,
      retrieve: async () => ({ ...subscription, latest_invoice: invoice }),
    },
    invoices: {
      listLineItems: async function* () {
        yield previous;
        yield current;
      },
    },
  };
  const provider = new StripeBillingProvider(
    "sk_test_fixture",
    "whsec_fixture",
    expanded as unknown as Stripe,
  );
  const snap = await provider.getSubscription("sub_fixture");
  assert.equal(snap.latest_invoice?.price_id, "price_current");
  assert.equal(
    snap.latest_invoice?.period_end,
    new Date(end * 1000).toISOString(),
  );
  assert.equal(snap.status, "active");
  assert.equal(snap.provider_status, "active");
});
