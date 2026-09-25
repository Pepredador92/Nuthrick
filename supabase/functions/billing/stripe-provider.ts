import Stripe from "stripe";
import {
  assertTestObject,
  assertTestSecret,
  type BillingProvider,
  type Campaign,
  type CheckoutInput,
  type CollectionState,
  couponFor,
  financialBenefit,
  type InvoiceSnapshot,
  iso,
  type Price,
  safeHostedUrl,
  type SubscriptionSnapshot,
  type VerifiedEvent,
} from "./domain.ts";
export function collectionState(status: string): CollectionState {
  const states: Record<string, CollectionState> = {
    active: "active",
    trialing: "trial",
    past_due: "payment_due",
    unpaid: "unpaid",
    incomplete: "incomplete",
    paused: "paused",
    canceled: "ended",
    incomplete_expired: "ended",
  };
  return states[status] ?? "paused";
}
export const STRIPE_API_VERSION = "2026-08-26.dahlia";
const id = (v: unknown): string | null =>
  typeof v === "string"
    ? v
    : v && typeof v === "object" && "id" in v
    ? String(v.id)
    : null;
const missing = (e: unknown) =>
  e instanceof Stripe.errors.StripeInvalidRequestError &&
  e.code === "resource_missing";
export const supportedEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.finalization_failed",
  "invoice.voided",
  "invoice.marked_uncollectible",
]);
export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe";
  readonly mode = "test" as const;
  private stripe: Stripe;
  constructor(secret: string, private webhookSecret: string, stripe?: Stripe) {
    assertTestSecret(secret);
    this.stripe = stripe ??
      new Stripe(secret, {
        apiVersion: STRIPE_API_VERSION,
        maxNetworkRetries: 1,
        timeout: 10000,
        httpClient: Stripe.createFetchHttpClient(),
      });
  }
  async verifyAccount(expected: string) {
    if (!/^acct_[A-Za-z0-9]+$/.test(expected)) {
      throw new Error("stripe_account_configuration_required");
    }
    const account = await this.stripe.accounts.retrieve(null);
    if (account.id !== expected) throw new Error("stripe_account_mismatch");
  }
  async createCustomer(owner: string) {
    const c = await this.stripe.customers.create({
      metadata: { nuthrick_owner: owner, nuthrick_mode: "test" },
    }, { idempotencyKey: `nuthrick:test:customer:${owner}` });
    assertTestObject(c);
    return c.id;
  }
  async ensurePrice(p: Price) {
    const prices = await this.stripe.prices.list({
      lookup_keys: [p.fingerprint],
      limit: 1,
    });
    if (prices.data[0]) {
      const v = prices.data[0];
      assertTestObject(v);
      if (
        v.unit_amount !== p.amount || v.currency.toUpperCase() !== p.currency ||
        v.recurring?.interval !==
          (p.interval === "monthly" ? "month" : "year") ||
        v.recurring.interval_count !== 1
      ) throw new Error("price_mapping_mismatch");
      return v.id;
    }
    const productId = `nuthrick_${p.plan_id.replaceAll("-", "")}`;
    try {
      assertTestObject(await this.stripe.products.retrieve(productId));
    } catch (e) {
      if (!missing(e)) throw e;
      await this.stripe.products.create({ id: productId, name: p.plan_name }, {
        idempotencyKey: `nuthrick:test:product:${p.plan_id}`,
      });
    }
    const price = await this.stripe.prices.create({
      product: productId,
      currency: p.currency.toLowerCase(),
      unit_amount: p.amount,
      recurring: { interval: p.interval === "monthly" ? "month" : "year" },
      lookup_key: p.fingerprint,
      metadata: { nuthrick_plan: p.plan_id, nuthrick_interval: p.interval },
    }, { idempotencyKey: `nuthrick:test:price:${p.fingerprint}` });
    assertTestObject(price);
    return price.id;
  }
  async ensurePromotion(c: Campaign, p: Price) {
    const params = couponFor(c, p);
    if (!params) return { couponId: null, endAt: null };
    const couponId = `nh_${
      c.id.replaceAll("-", "")
    }_${c.version}_${p.fingerprint}`;
    try {
      const coupon = await this.stripe.coupons.retrieve(couponId);
      assertTestObject(coupon);
    } catch (e) {
      if (!missing(e)) throw e;
      const coupon = await this.stripe.coupons.create({
        id: couponId,
        name: c.name.slice(0, 40),
        ...params,
        metadata: { nuthrick_campaign: c.id, version: String(c.version) },
      }, { idempotencyKey: `nuthrick:test:coupon:${couponId}` });
      assertTestObject(coupon);
    }
    const b = financialBenefit(c.benefits)!;
    return {
      couponId,
      endAt: b.duration.kind === "until" ? b.duration.until! : null,
    };
  }
  async createCheckout(i: CheckoutInput) {
    const s = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: i.customerId,
      client_reference_id: i.owner,
      line_items: [{ price: i.priceId, quantity: 1 }],
      payment_method_types: ["card"],
      success_url: `${i.site}/app/my-plan?checkout=success`,
      cancel_url: `${i.site}/planes?checkout=cancelled`,
      expires_at: i.expiresAt,
      metadata: { nuthrick_intent: i.intentId },
      subscription_data: {
        metadata: { nuthrick_intent: i.intentId, nuthrick_owner: i.owner },
      },
      ...(i.couponId ? { discounts: [{ coupon: i.couponId }] } : {}),
    }, { idempotencyKey: `nuthrick:test:checkout:${i.intentId}` });
    assertTestObject(s);
    const url = safeHostedUrl(s.url, "checkout");
    if (!url) throw new Error("invalid_provider_url");
    return { id: s.id, url, expires_at: s.expires_at };
  }
  async getCheckout(sessionId: string) {
    const s = await this.stripe.checkout.sessions.retrieve(sessionId);
    assertTestObject(s);
    return { status: s.status ?? "open", subscriptionId: id(s.subscription) };
  }
  async findCheckout(customerId: string, intentId: string) {
    for await (
      const session of this.stripe.checkout.sessions.list({
        customer: customerId,
        limit: 100,
      })
    ) {
      assertTestObject(session);
      if (session.metadata?.nuthrick_intent === intentId) {
        return { id: session.id, status: session.status ?? "open" };
      }
    }
    return null;
  }
  async expireCheckout(sessionId: string) {
    const s = await this.stripe.checkout.sessions.expire(sessionId);
    assertTestObject(s);
  }
  async createCustomerPortal(customerId: string, site: string, key: string) {
    const configs = await this.stripe.billingPortal.configurations.list({
      active: true,
      limit: 100,
    });
    let config = configs.data.find((c) =>
      c.metadata?.nuthrick === "admin2-test-v1"
    );
    config ??= await this.stripe.billingPortal.configurations.create({
      business_profile: { headline: "Nuthrick · Suscripción de prueba" },
      metadata: { nuthrick: "admin2-test-v1" },
      features: {
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        customer_update: {
          enabled: true,
          allowed_updates: ["address", "name"],
        },
        subscription_cancel: { enabled: false },
        subscription_update: { enabled: false },
      },
    }, { idempotencyKey: "nuthrick:test:portal:config:v1" });
    const s = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      configuration: config.id,
      return_url: `${site}/app/my-plan`,
    }, { idempotencyKey: `nuthrick:test:portal:${key}` });
    const url = safeHostedUrl(s.url, "portal");
    if (!url) throw new Error("invalid_provider_url");
    return url;
  }
  private invoice(v: Stripe.Invoice, preferredPrice?: string): InvoiceSnapshot {
    assertTestObject(v);
    const sub = id(v.parent?.subscription_details?.subscription);
    if (!sub) throw new Error("not_subscription_invoice");
    const line = v.lines.data.find((l) =>
      preferredPrice &&
      id(l.pricing?.price_details?.price) === preferredPrice && l.amount >= 0
    ) ??
      v.lines.data.find((l) =>
        l.parent?.type === "subscription_item_details" && l.amount >= 0
      ) ?? v.lines.data[0];
    return {
      id: v.id,
      subscription_id: sub,
      customer_id: id(v.customer)!,
      status: v.status ?? "draft",
      amount_due: v.amount_due,
      amount_paid: v.amount_paid,
      currency: v.currency.toUpperCase(),
      created: iso(v.created),
      paid_at: v.status_transitions.paid_at
        ? iso(v.status_transitions.paid_at)
        : null,
      period_start: iso(line?.period.start ?? v.period_start),
      period_end: iso(line?.period.end ?? v.period_end),
      hosted_url: safeHostedUrl(v.hosted_invoice_url, "invoice"),
      price_id: id(line?.pricing?.price_details?.price),
    };
  }
  private async readInvoice(value: Stripe.Invoice, preferredPrice?: string) {
    if (value.lines.has_more) {
      const lines: Stripe.InvoiceLineItem[] = [];
      for await (
        const line of this.stripe.invoices.listLineItems(value.id, {
          limit: 100,
        })
      ) lines.push(line);
      value = {
        ...value,
        lines: { ...value.lines, data: lines, has_more: false },
      };
    }
    return this.invoice(value, preferredPrice);
  }
  async getInvoice(invoiceId: string) {
    return this.readInvoice(await this.stripe.invoices.retrieve(invoiceId));
  }
  async getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    const s = await this.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice", "schedule"],
    });
    assertTestObject(s);
    if (s.items.data.length !== 1 || s.items.data[0].quantity !== 1) {
      throw new Error("unsupported_subscription");
    }
    const i = s.items.data[0];
    return {
      id: s.id,
      intent_id: s.metadata.nuthrick_intent ?? null,
      customer_id: id(s.customer)!,
      price_id: i.price.id,
      status: collectionState(s.status),
      provider_status: s.status,
      period_start: iso(i.current_period_start),
      period_end: iso(i.current_period_end),
      anchor: iso(s.billing_cycle_anchor),
      cancel_at_period_end: s.cancel_at_period_end ||
        (typeof s.schedule === "object" &&
          s.schedule?.end_behavior === "cancel"),
      schedule_id: id(s.schedule),
      pending_update: Boolean(s.pending_update),
      latest_invoice: typeof s.latest_invoice === "object" && s.latest_invoice
        ? await this.readInvoice(s.latest_invoice, i.price.id)
        : s.latest_invoice
        ? await this.readInvoice(
          await this.stripe.invoices.retrieve(s.latest_invoice),
          i.price.id,
        )
        : null,
      livemode: false,
    };
  }
  private async schedule(
    s: Stripe.Subscription,
    key: string,
    options: {
      target?: Price;
      immediate?: boolean;
      cancel?: boolean;
      until?: string;
      preserveChange?: boolean;
    },
  ) {
    const existing = id(s.schedule);
    const schedule = existing
      ? await this.stripe.subscriptionSchedules.retrieve(existing)
      : await this.stripe.subscriptionSchedules.create({
        from_subscription: s.id,
      }, { idempotencyKey: `nuthrick:test:schedule:create:${key}` });
    assertTestObject(schedule);
    const phase =
      schedule.phases.find((p) =>
        p.start_date === schedule.current_phase?.start_date
      ) ?? schedule.phases[0];
    if (!phase || s.items.data.length !== 1) {
      throw new Error("unsupported_subscription");
    }
    const item = s.items.data[0];
    const clockId = id(s.test_clock);
    const providerNow = clockId
      ? (await this.stripe.testHelpers.testClocks.retrieve(clockId)).frozen_time
      : Math.floor(Date.now() / 1000);
    const discountEnd = options.until
      ? Math.floor(Date.parse(options.until) / 1000)
      : Number(schedule.metadata?.nuthrick_discount_until || 0);
    // Reuse the applied Discount ID so changing phases never restarts its duration.
    const discounts: Stripe.SubscriptionScheduleUpdateParams.Phase.Discount[] =
      s.discounts.map((d) => ({ discount: id(d)! }));
    const future = options.preserveChange
      ? schedule.phases.find((p) =>
        p.start_date > phase.start_date &&
        id(p.items[0]?.price) !== item.price.id
      )
      : undefined;
    const targetId = options.target?.provider_price_id ??
      (future ? id(future.items[0].price) : null);
    const changeAt = options.target
      ? (options.immediate ? phase.start_date : item.current_period_end)
      : future?.start_date;
    const targetInterval = options.target?.interval === "annual"
      ? "year"
      : options.target
      ? "month"
      : item.price.recurring?.interval === "year"
      ? "year"
      : "month";
    const cancel = options.cancel || (options.preserveChange &&
      (s.cancel_at_period_end || schedule.end_behavior === "cancel"));
    const end = cancel ? item.current_period_end : undefined;
    const boundaries = [
      phase.start_date,
      ...(changeAt && changeAt > phase.start_date && (!end || changeAt < end)
        ? [changeAt]
        : []),
      ...(discountEnd > providerNow && (!end || discountEnd < end)
        ? [discountEnd]
        : []),
    ].filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b);
    const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = boundaries
      .map((start, n) => {
        const price = targetId && changeAt !== undefined && start >= changeAt
          ? targetId
          : item.price.id;
        const until = boundaries[n + 1] ?? end;
        return {
          start_date: start,
          ...(until ? { end_date: until } : {
            duration: {
              interval: price === targetId
                ? targetInterval
                : item.price.recurring?.interval === "year"
                ? "year" as const
                : "month" as const,
              interval_count: 1,
            },
          }),
          items: [{ price, quantity: 1 }],
          discounts:
            discountEnd && (providerNow >= discountEnd || start >= discountEnd)
              ? []
              : discounts,
          proration_behavior: "none",
        };
      });
    await this.stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: cancel ? "cancel" : "release",
      metadata: {
        nuthrick: "admin2-test-v1",
        nuthrick_discount_until: discountEnd ? String(discountEnd) : "",
      },
      proration_behavior: options.immediate ? "always_invoice" : "none",
      phases,
    }, { idempotencyKey: `nuthrick:test:schedule:update:${key}` });
    return schedule.id;
  }
  async changeSubscription(
    subscriptionId: string,
    p: Price,
    timing: "immediate" | "period_end",
    key: string,
  ) {
    const s = await this.stripe.subscriptions.retrieve(subscriptionId);
    assertTestObject(s);
    if (s.status !== "active" || s.pending_update) {
      throw new Error("payment_pending");
    }
    if (timing === "immediate" && !s.schedule) {
      const result = await this.stripe.subscriptions.update(s.id, {
        items: [{ id: s.items.data[0].id, price: p.provider_price_id! }],
        payment_behavior: "pending_if_incomplete",
        proration_behavior: "always_invoice",
      }, { idempotencyKey: `nuthrick:test:upgrade:${key}` });
      assertTestObject(result);
      return { scheduleId: null };
    }
    return {
      scheduleId: await this.schedule(s, key, {
        target: p,
        immediate: timing === "immediate",
      }),
    };
  }
  async endDiscountAt(subscriptionId: string, until: string, key: string) {
    const s = await this.stripe.subscriptions.retrieve(subscriptionId);
    assertTestObject(s);
    const clockId = id(s.test_clock);
    const providerNow = clockId
      ? (await this.stripe.testHelpers.testClocks.retrieve(clockId)).frozen_time
      : Math.floor(Date.now() / 1000);
    // A released cutoff schedule must not be recreated by later renewals.
    if (
      providerNow >= Math.floor(Date.parse(until) / 1000) && !s.discounts.length
    ) {
      return id(s.schedule);
    }
    if (s.schedule) {
      const existing = await this.stripe.subscriptionSchedules.retrieve(
        id(s.schedule)!,
      );
      if (
        existing.metadata?.nuthrick_discount_until ===
          String(Math.floor(Date.parse(until) / 1000))
      ) return existing.id;
    }
    return this.schedule(s, key, { until, preserveChange: true });
  }
  async cancelSubscription(
    subscriptionId: string,
    immediately: boolean,
    key: string,
  ) {
    const s = await this.stripe.subscriptions.retrieve(subscriptionId);
    assertTestObject(s);
    if (immediately) {
      if (s.schedule) {
        await this.stripe.subscriptionSchedules.cancel(id(s.schedule)!, {
          invoice_now: false,
          prorate: false,
        }, { idempotencyKey: `nuthrick:test:cancel-schedule:${key}` });
      } else {
        const r = await this.stripe.subscriptions.cancel(subscriptionId, {
          invoice_now: false,
          prorate: false,
        }, { idempotencyKey: `nuthrick:test:cancel-now:${key}` });
        assertTestObject(r);
      }
    } else if (s.schedule) await this.schedule(s, key, { cancel: true });
    else {
      const r = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      }, { idempotencyKey: `nuthrick:test:cancel:${key}` });
      assertTestObject(r);
    }
  }
  async resumeSubscription(subscriptionId: string, key: string) {
    const s = await this.stripe.subscriptions.retrieve(subscriptionId);
    assertTestObject(s);
    if (s.status === "canceled") throw new Error("subscription_missing");
    const schedule = s.schedule
      ? await this.stripe.subscriptionSchedules.retrieve(id(s.schedule)!)
      : null;
    if (!s.cancel_at_period_end && schedule?.end_behavior !== "cancel") {
      throw new Error("subscription_change_unavailable");
    }
    if (s.schedule) await this.schedule(s, key, {});
    else {
      const r = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      }, { idempotencyKey: `nuthrick:test:resume:${key}` });
      assertTestObject(r);
    }
  }
  async handleWebhook(raw: string, signature: string): Promise<VerifiedEvent> {
    let e: Stripe.Event;
    try {
      e = await this.stripe.webhooks.constructEventAsync(
        raw,
        signature,
        this.webhookSecret,
        300,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch {
      throw new Error("invalid_signature");
    }
    assertTestObject(e);
    const v = e.data.object as unknown as Record<string, unknown>;
    const parent = v.parent as {
      subscription_details?: { subscription?: unknown };
    } | undefined;
    return {
      id: e.id,
      type: e.type,
      supported: supportedEvents.has(e.type),
      created: e.created,
      livemode: false,
      customer_id: id(v.customer),
      subscription_id: e.type.startsWith("customer.subscription.")
        ? String(v.id)
        : id(v.subscription) ?? id(parent?.subscription_details?.subscription),
      invoice_id: e.type.startsWith("invoice.") ? String(v.id) : null,
      checkout_id: e.type.startsWith("checkout.session.") ? String(v.id) : null,
    };
  }
}
