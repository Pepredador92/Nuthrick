import Stripe from "stripe";
import {
  assertEnvironmentObject,
  assertEnvironmentSecret,
  type BillingEnvironment,
  type BillingProvider,
  type Campaign,
  type CheckoutInput,
  type CollectionState,
  couponFor,
  type CreditPayment,
  type CreditPrice,
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
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "refund.created",
  "refund.updated",
  "refund.failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
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
  readonly mode: BillingEnvironment;
  private stripe: Stripe;
  private portalConfigurationId?: string;
  private assertObject(value: { livemode?: boolean }) {
    assertEnvironmentObject(value, this.mode);
  }
  private assertPrice(price: Price) {
    if ((price.mode ?? "test") !== this.mode) {
      throw new Error("stripe_environment_mismatch");
    }
  }
  private async checkoutReferences(input: CheckoutInput) {
    const customer = await this.stripe.customers.retrieve(input.customerId);
    if (customer.deleted) throw new Error("customer_missing");
    this.assertObject(customer);
    this.assertObject(await this.stripe.prices.retrieve(input.priceId));
    if (input.couponId) {
      this.assertObject(await this.stripe.coupons.retrieve(input.couponId));
    }
  }
  constructor(
    secret: string,
    private webhookSecret: string,
    stripe?: Stripe,
    options: { mode?: BillingEnvironment; portalConfigurationId?: string } = {},
  ) {
    this.mode = options.mode ?? "test";
    this.portalConfigurationId = options.portalConfigurationId;
    assertEnvironmentSecret(secret, this.mode);
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
    if (
      this.mode === "live" &&
      (!account.charges_enabled || !account.payouts_enabled ||
        !account.details_submitted || account.country !== "MX" ||
        account.default_currency !== "mxn" ||
        !account.business_profile?.name ||
        !account.settings?.payments?.statement_descriptor ||
        account.requirements?.currently_due?.length)
    ) throw new Error("live_account_not_ready");
  }
  async createCustomer(owner: string) {
    const c = await this.stripe.customers.create({
      metadata: { nuthrick_owner: owner, nuthrick_mode: this.mode },
    }, { idempotencyKey: `nuthrick:${this.mode}:customer:${owner}` });
    this.assertObject(c);
    return c.id;
  }
  async inspectConfiguration(
    input: {
      prices: Price[];
      webhookUrl: string;
      subscriptions: {
        id: string;
        customer_id: string;
        price_id: string;
        status: string;
        cancel_at_period_end: boolean;
      }[];
    },
  ) {
    if (this.mode !== "live") throw new Error("stripe_environment_mismatch");
    let pricesVerified = input.prices.length === 4;
    for (const price of input.prices) {
      this.assertPrice(price);
      if (!price.provider_price_id || !price.provider_product_id) {
        pricesVerified = false;
        continue;
      }
      const remote = await this.stripe.prices.retrieve(price.provider_price_id);
      this.assertObject(remote);
      const product = await this.stripe.products.retrieve(
        price.provider_product_id,
      );
      this.assertObject(product);
      if (!product.active) pricesVerified = false;
      if (
        !remote.active || remote.unit_amount !== price.amount ||
        remote.currency.toUpperCase() !== price.currency ||
        id(remote.product) !== price.provider_product_id ||
        remote.recurring?.interval !==
          (price.interval === "monthly" ? "month" : "year") ||
        remote.recurring?.interval_count !== 1
      ) pricesVerified = false;
    }
    let reachable = false;
    for await (
      const endpoint of this.stripe.webhookEndpoints.list({ limit: 100 })
    ) {
      if (endpoint.url !== input.webhookUrl) continue;
      this.assertObject(endpoint);
      reachable = endpoint.status === "enabled" &&
        [
          "invoice.paid",
          "invoice.payment_failed",
          "customer.subscription.updated",
          "customer.subscription.deleted",
          "checkout.session.completed",
        ].every((event) =>
          endpoint.enabled_events.includes("*") ||
          endpoint.enabled_events.includes(event)
        );
    }
    let portalVerified = false;
    if (this.portalConfigurationId) {
      const config = await this.stripe.billingPortal.configurations.retrieve(
        this.portalConfigurationId,
      );
      this.assertObject(config);
      portalVerified = config.active &&
        config.features.payment_method_update.enabled &&
        config.features.invoice_history.enabled &&
        config.features.customer_update.enabled &&
        config.features.subscription_cancel.enabled &&
        config.features.subscription_cancel.mode === "at_period_end" &&
        !config.features.subscription_update.enabled;
    }
    const local = new Map(input.subscriptions.map((s) => [s.id, s]));
    const mismatches: string[] = [];
    for await (
      const subscription of this.stripe.subscriptions.list({
        status: "all",
        limit: 100,
      })
    ) {
      this.assertObject(subscription);
      const expected = local.get(subscription.id);
      if (
        !expected || expected.customer_id !== id(subscription.customer) ||
        expected.price_id !== subscription.items.data[0]?.price.id ||
        expected.status !== subscription.status ||
        expected.cancel_at_period_end !== subscription.cancel_at_period_end
      ) mismatches.push(subscription.id);
      local.delete(subscription.id);
    }
    mismatches.push(...local.keys());
    return {
      prices_verified: pricesVerified,
      price_mapping_ids: input.prices.map((p) => p.id),
      webhook_reachable: reachable,
      portal_verified: portalVerified,
      reconciliation_ok: mismatches.length === 0,
      mismatches,
    };
  }
  async ensurePrice(p: Price) {
    this.assertPrice(p);
    const prices = await this.stripe.prices.list({
      lookup_keys: [p.fingerprint],
      limit: 1,
    });
    if (prices.data[0]) {
      const v = prices.data[0];
      this.assertObject(v);
      if (
        v.unit_amount !== p.amount || v.currency.toUpperCase() !== p.currency ||
        v.recurring?.interval !==
          (p.interval === "monthly" ? "month" : "year") ||
        v.recurring.interval_count !== 1
      ) throw new Error("price_mapping_mismatch");
      p.provider_product_id = id(v.product);
      return v.id;
    }
    const productId = this.mode === "test"
      ? `nuthrick_${p.plan_id.replaceAll("-", "")}`
      : `nuthrick_live_${p.plan_id.replaceAll("-", "")}`;
    try {
      this.assertObject(await this.stripe.products.retrieve(productId));
    } catch (e) {
      if (!missing(e)) throw e;
      await this.stripe.products.create({ id: productId, name: p.plan_name }, {
        idempotencyKey: `nuthrick:${this.mode}:product:${p.plan_id}`,
      });
    }
    const price = await this.stripe.prices.create({
      product: productId,
      currency: p.currency.toLowerCase(),
      unit_amount: p.amount,
      recurring: { interval: p.interval === "monthly" ? "month" : "year" },
      lookup_key: p.fingerprint,
      metadata: { nuthrick_plan: p.plan_id, nuthrick_interval: p.interval },
    }, { idempotencyKey: `nuthrick:${this.mode}:price:${p.fingerprint}` });
    this.assertObject(price);
    p.provider_product_id = id(price.product);
    return price.id;
  }
  async ensurePromotion(c: Campaign, p: Price | CreditPrice) {
    const priceMode = "mode" in p ? (p.mode ?? "test") : "test";
    if (priceMode !== this.mode) throw new Error("stripe_environment_mismatch");
    if ((c.mode ?? "test") !== this.mode) {
      throw new Error("stripe_environment_mismatch");
    }
    const params = couponFor(c, p);
    if (!params) return { couponId: null, endAt: null };
    const couponId = `nh_${this.mode === "live" ? "live_" : ""}${
      c.id.replaceAll("-", "")
    }_${c.version}_${p.fingerprint}`;
    try {
      const coupon = await this.stripe.coupons.retrieve(couponId);
      this.assertObject(coupon);
    } catch (e) {
      if (!missing(e)) throw e;
      const coupon = await this.stripe.coupons.create({
        id: couponId,
        name: c.name.slice(0, 40),
        ...params,
        metadata: { nuthrick_campaign: c.id, version: String(c.version) },
      }, { idempotencyKey: `nuthrick:${this.mode}:coupon:${couponId}` });
      this.assertObject(coupon);
    }
    const b = financialBenefit(c.benefits)!;
    return {
      couponId,
      endAt: b.duration.kind === "until" ? b.duration.until! : null,
    };
  }
  async createCheckout(i: CheckoutInput) {
    await this.checkoutReferences(i);
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
    }, { idempotencyKey: `nuthrick:${this.mode}:checkout:${i.intentId}` });
    this.assertObject(s);
    const url = safeHostedUrl(s.url, "checkout");
    if (!url) throw new Error("invalid_provider_url");
    return { id: s.id, url, expires_at: s.expires_at };
  }
  async getCheckout(sessionId: string) {
    const s = await this.stripe.checkout.sessions.retrieve(sessionId);
    this.assertObject(s);
    return { status: s.status ?? "open", subscriptionId: id(s.subscription) };
  }
  async ensureCreditPrice(p: CreditPrice) {
    if (this.mode !== "test") throw new Error("live_credit_purchases_disabled");
    const existing = await this.stripe.prices.list({
      lookup_keys: [p.fingerprint],
      limit: 1,
    });
    if (existing.data[0]) {
      const price = existing.data[0];
      this.assertObject(price);
      if (
        price.type !== "one_time" || price.unit_amount !== p.amount ||
        price.currency.toUpperCase() !== p.currency
      ) throw new Error("price_mapping_mismatch");
      return price.id;
    }
    const productId = `nuthrick_credit_${p.fingerprint}`;
    try {
      this.assertObject(await this.stripe.products.retrieve(productId));
    } catch (e) {
      if (!missing(e)) throw e;
      this.assertObject(
        await this.stripe.products.create({
          id: productId,
          name: `TEST · ${p.package_name}`,
          metadata: { nuthrick_package: p.package_id },
        }, {
          idempotencyKey:
            `nuthrick:${this.mode}:credit-product:${p.fingerprint}`,
        }),
      );
    }
    const price = await this.stripe.prices.create({
      product: productId,
      currency: p.currency.toLowerCase(),
      unit_amount: p.amount,
      lookup_key: p.fingerprint,
      metadata: {
        nuthrick_package: p.package_id,
        version: String(p.package_version),
        credits: String(p.credits),
        bonus: String(p.bonus_credits),
      },
    }, {
      idempotencyKey: `nuthrick:${this.mode}:credit-price:${p.fingerprint}`,
    });
    this.assertObject(price);
    return price.id;
  }
  async createCreditCheckout(i: CheckoutInput) {
    if (this.mode !== "test") throw new Error("live_credit_purchases_disabled");
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      customer: i.customerId,
      client_reference_id: i.owner,
      line_items: [{ price: i.priceId, quantity: 1 }],
      payment_method_types: ["card"],
      success_url: `${i.site}/app/credits?purchase=${i.intentId}`,
      cancel_url: `${i.site}/app/credits?checkout=cancelled`,
      expires_at: i.expiresAt,
      metadata: { nuthrick_intent: i.intentId, nuthrick_purchase: i.intentId },
      payment_intent_data: {
        metadata: { nuthrick_purchase: i.intentId, nuthrick_owner: i.owner },
      },
      ...(i.couponId ? { discounts: [{ coupon: i.couponId }] } : {}),
    }, {
      idempotencyKey: `nuthrick:${this.mode}:credit-checkout:${i.intentId}`,
    });
    this.assertObject(session);
    const url = safeHostedUrl(session.url, "checkout");
    if (!url) throw new Error("invalid_provider_url");
    return { id: session.id, url, expires_at: session.expires_at };
  }
  async getCreditPayment(checkoutId: string): Promise<CreditPayment> {
    if (this.mode !== "test") throw new Error("live_credit_purchases_disabled");
    const s = await this.stripe.checkout.sessions.retrieve(checkoutId, {
      expand: ["payment_intent.latest_charge"],
    });
    this.assertObject(s);
    if (s.mode !== "payment") throw new Error("invalid_payment_identity");
    const lines = await this.stripe.checkout.sessions.listLineItems(s.id, {
      limit: 2,
    });
    if (
      lines.has_more || lines.data.length !== 1 || lines.data[0].quantity !== 1
    ) throw new Error("invalid_payment_identity");
    const pi = s.payment_intent && typeof s.payment_intent === "object"
      ? s.payment_intent
      : null;
    const charge = pi?.latest_charge && typeof pi.latest_charge === "object"
      ? pi.latest_charge
      : null;
    if (pi) {
      this.assertObject(pi);
      if (
        id(pi.customer) !== id(s.customer) || pi.amount !== s.amount_total ||
        pi.currency !== s.currency
      ) throw new Error("invalid_payment_identity");
    }
    if (charge) {
      this.assertObject(charge);
      if (
        id(charge.customer) !== id(s.customer) ||
        id(charge.payment_intent) !== pi?.id
      ) throw new Error("invalid_payment_identity");
    }
    let refunded = 0, refundPending = false;
    if (pi) {
      for await (
        const refund of this.stripe.refunds.list({
          payment_intent: pi.id,
          limit: 100,
        })
      ) {
        if (
          refund.currency !== s.currency || id(refund.payment_intent) !== pi.id
        ) throw new Error("invalid_payment_identity");
        if (refund.status === "succeeded") refunded += refund.amount;
        if (
          refund.status === "pending" || refund.status === "requires_action"
        ) refundPending = true;
      }
    }
    const disputes = pi
      ? await this.stripe.disputes.list({ payment_intent: pi.id, limit: 100 })
      : null;
    const dispute =
      disputes?.data.find((d) =>
        !["won", "warning_closed"].includes(d.status)
      ) ?? disputes?.data[0];
    if (dispute) this.assertObject(dispute);
    const paid = s.status === "complete" &&
      (s.amount_total === 0 && s.payment_status === "no_payment_required" &&
          !pi ||
        s.payment_status === "paid" && pi?.status === "succeeded" &&
          pi.amount_received === s.amount_total && charge?.paid === true &&
          charge.captured === true);
    return {
      mode: s.mode,
      checkout_id: s.id,
      checkout_status: s.status ?? "open",
      purchase_id: s.metadata?.nuthrick_purchase ?? null,
      owner: s.client_reference_id,
      customer_id: id(s.customer),
      payment_id: pi?.id ?? null,
      charge_id: charge?.id ?? null,
      price_id: lines.data[0].price?.id ?? null,
      quantity: lines.data[0].quantity ?? 0,
      currency: s.currency?.toUpperCase() ?? "",
      amount_total: s.amount_total ?? -1,
      amount_paid: paid ? (pi?.amount_received ?? 0) : 0,
      paid,
      paid_at: paid ? iso(charge?.created ?? s.created) : null,
      payment_failed: !!pi?.last_payment_error,
      amount_refunded: refunded,
      refund_pending: refundPending,
      dispute_id: dispute?.id ?? null,
      dispute_status: dispute?.status ?? null,
      livemode: false,
    };
  }
  async findCheckout(customerId: string, intentId: string) {
    for await (
      const session of this.stripe.checkout.sessions.list({
        customer: customerId,
        limit: 100,
      })
    ) {
      this.assertObject(session);
      if (session.metadata?.nuthrick_intent === intentId) {
        return { id: session.id, status: session.status ?? "open" };
      }
    }
    return null;
  }
  async expireCheckout(sessionId: string) {
    const s = await this.stripe.checkout.sessions.expire(sessionId);
    this.assertObject(s);
  }
  async createCustomerPortal(customerId: string, site: string, key: string) {
    if (this.mode === "live") {
      if (!this.portalConfigurationId) {
        throw new Error("live_portal_not_configured");
      }
      const config = await this.stripe.billingPortal.configurations.retrieve(
        this.portalConfigurationId,
      );
      this.assertObject(config);
      if (
        !config.active || !config.features.payment_method_update.enabled ||
        !config.features.invoice_history.enabled ||
        !config.features.customer_update.enabled ||
        !config.features.subscription_cancel.enabled ||
        config.features.subscription_cancel.mode !== "at_period_end" ||
        config.features.subscription_update.enabled
      ) throw new Error("live_portal_policy_mismatch");
      const customer = await this.stripe.customers.retrieve(customerId);
      if (customer.deleted) throw new Error("customer_missing");
      this.assertObject(customer);
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        configuration: config.id,
        return_url: `${site}/app/my-plan`,
      }, { idempotencyKey: `nuthrick:live:portal:${key}` });
      const url = safeHostedUrl(session.url, "portal");
      if (!url) throw new Error("invalid_provider_url");
      return url;
    }
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
    }, { idempotencyKey: `nuthrick:${this.mode}:portal:${key}` });
    const url = safeHostedUrl(s.url, "portal");
    if (!url) throw new Error("invalid_provider_url");
    return url;
  }
  private invoice(v: Stripe.Invoice, preferredPrice?: string): InvoiceSnapshot {
    this.assertObject(v);
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
    this.assertObject(s);
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
      livemode: this.mode === "live",
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
      }, { idempotencyKey: `nuthrick:${this.mode}:schedule:create:${key}` });
    this.assertObject(schedule);
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
    }, { idempotencyKey: `nuthrick:${this.mode}:schedule:update:${key}` });
    return schedule.id;
  }
  async changeSubscription(
    subscriptionId: string,
    p: Price,
    timing: "immediate" | "period_end",
    key: string,
  ) {
    this.assertPrice(p);
    this.assertObject(await this.stripe.prices.retrieve(p.provider_price_id!));
    const s = await this.stripe.subscriptions.retrieve(subscriptionId);
    this.assertObject(s);
    if (s.status !== "active" || s.pending_update) {
      throw new Error("payment_pending");
    }
    if (timing === "immediate" && !s.schedule) {
      const result = await this.stripe.subscriptions.update(s.id, {
        items: [{ id: s.items.data[0].id, price: p.provider_price_id! }],
        payment_behavior: "pending_if_incomplete",
        proration_behavior: "always_invoice",
      }, { idempotencyKey: `nuthrick:${this.mode}:upgrade:${key}` });
      this.assertObject(result);
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
    this.assertObject(s);
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
    this.assertObject(s);
    if (immediately) {
      if (s.schedule) {
        await this.stripe.subscriptionSchedules.cancel(id(s.schedule)!, {
          invoice_now: false,
          prorate: false,
        }, { idempotencyKey: `nuthrick:${this.mode}:cancel-schedule:${key}` });
      } else {
        const r = await this.stripe.subscriptions.cancel(subscriptionId, {
          invoice_now: false,
          prorate: false,
        }, { idempotencyKey: `nuthrick:${this.mode}:cancel-now:${key}` });
        this.assertObject(r);
      }
    } else if (s.schedule) await this.schedule(s, key, { cancel: true });
    else {
      const r = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      }, { idempotencyKey: `nuthrick:${this.mode}:cancel:${key}` });
      this.assertObject(r);
    }
  }
  async resumeSubscription(subscriptionId: string, key: string) {
    const s = await this.stripe.subscriptions.retrieve(subscriptionId);
    this.assertObject(s);
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
      }, { idempotencyKey: `nuthrick:${this.mode}:resume:${key}` });
      this.assertObject(r);
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
    this.assertObject(e);
    const v = e.data.object as unknown as Record<string, unknown>;
    const parent = v.parent as {
      subscription_details?: { subscription?: unknown };
    } | undefined;
    let customerId = id(v.customer);
    let paymentId = e.type.startsWith("payment_intent.")
      ? String(v.id)
      : id(v.payment_intent);
    let checkoutId = e.type.startsWith("checkout.session.")
      ? String(v.id)
      : null;
    let creditReference =
      (v.metadata as Record<string, string> | undefined)?.nuthrick_purchase ??
        null;
    if (
      e.type.startsWith("refund.") || e.type.startsWith("charge.dispute.") ||
      e.type === "charge.refunded"
    ) {
      const chargeId = e.type === "charge.refunded"
        ? String(v.id)
        : id(v.charge);
      if (chargeId) {
        const charge = await this.stripe.charges.retrieve(chargeId);
        this.assertObject(charge);
        customerId = id(charge.customer);
        paymentId = id(charge.payment_intent);
      }
    }
    if (
      paymentId && !checkoutId && supportedEvents.has(e.type) &&
      !e.type.startsWith("invoice.")
    ) {
      const sessions = await this.stripe.checkout.sessions.list({
        payment_intent: paymentId,
        limit: 1,
      });
      const session = sessions.data[0];
      if (session) {
        this.assertObject(session);
        checkoutId = session.id;
        creditReference = session.metadata?.nuthrick_purchase ??
          creditReference;
      }
    }
    return {
      id: e.id,
      type: e.type,
      supported: supportedEvents.has(e.type),
      created: e.created,
      livemode: this.mode === "live",
      customer_id: customerId,
      payment_id: paymentId,
      credit_reference: creditReference,
      subscription_id: e.type.startsWith("customer.subscription.")
        ? String(v.id)
        : id(v.subscription) ?? id(parent?.subscription_details?.subscription),
      invoice_id: e.type.startsWith("invoice.") ? String(v.id) : null,
      checkout_id: checkoutId,
    };
  }
}
