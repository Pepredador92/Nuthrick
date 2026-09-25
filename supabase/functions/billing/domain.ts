export type Interval = "monthly" | "annual";
export type BillingState =
  | "trial"
  | "active"
  | "grace"
  | "suspended"
  | "cancelled";
export type Duration = {
  kind: "invoice" | "months" | "until" | "forever";
  months?: number;
  until?: string;
};
export type Benefit = {
  type:
    | "percentage_discount"
    | "fixed_discount"
    | "free_period"
    | "custom_price"
    | "initial_ai_credits"
    | "bonus_ai_credits"
    | "temporary_entitlement"
    | "plan_upgrade";
  amount?: number;
  entitlement?: string;
  value?: boolean | number | "unlimited";
  plan_id?: string;
  duration: Duration;
};
export type Campaign = {
  target?: "subscription" | "ai_credit_package";
  eligible_package_ids?: string[];
  id: string;
  code: string;
  name: string;
  version: number;
  benefits: Benefit[];
  audience: string;
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  eligible_plan_ids: string[];
  intervals: Interval[];
  max_redemptions: number | null;
  max_per_professional: number;
  new_customers_only: boolean;
  visibility: "private" | "public";
};
export type Price = {
  id: string;
  plan_id: string;
  plan_name: string;
  interval: Interval;
  amount: number;
  currency: string;
  rank: number;
  provider_price_id: string | null;
  fingerprint: string;
};
export type CreditPrice = {
  id: string;
  package_id: string;
  package_name: string;
  package_version: number;
  credits: number;
  bonus_credits: number;
  amount: number;
  currency: string;
  fingerprint: string;
  provider_price_id: string | null;
};
export type CreditPayment = {
  mode: string;
  checkout_id: string;
  checkout_status: string;
  purchase_id: string | null;
  owner: string | null;
  customer_id: string | null;
  payment_id: string | null;
  charge_id: string | null;
  price_id: string | null;
  quantity: number;
  currency: string;
  amount_total: number;
  amount_paid: number;
  paid: boolean;
  paid_at: string | null;
  payment_failed: boolean;
  amount_refunded: number;
  refund_pending: boolean;
  dispute_id: string | null;
  dispute_status: string | null;
  livemode: false;
};
export type CollectionState =
  | "active"
  | "trial"
  | "payment_due"
  | "unpaid"
  | "incomplete"
  | "paused"
  | "ended";
export type SubscriptionSnapshot = {
  id: string;
  intent_id: string | null;
  customer_id: string;
  price_id: string;
  status: CollectionState;
  provider_status: string;
  period_start: string;
  period_end: string;
  anchor: string;
  cancel_at_period_end: boolean;
  schedule_id: string | null;
  latest_invoice: InvoiceSnapshot | null;
  pending_update: boolean;
  livemode: false;
};
export type InvoiceSnapshot = {
  id: string;
  subscription_id: string;
  customer_id: string;
  status: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  created: string;
  paid_at: string | null;
  period_start: string;
  period_end: string;
  hosted_url: string | null;
  price_id: string | null;
};
export type VerifiedEvent = {
  payment_id?: string | null;
  credit_reference?: string | null;
  id: string;
  supported: boolean;
  type: string;
  created: number;
  customer_id: string | null;
  subscription_id: string | null;
  invoice_id: string | null;
  checkout_id: string | null;
  livemode: false;
};
export type CheckoutInput = {
  owner: string;
  customerId: string;
  priceId: string;
  intentId: string;
  couponId?: string;
  site: string;
  expiresAt: number;
};
export interface BillingProvider {
  readonly name: string;
  readonly mode: "test";
  createCustomer(owner: string): Promise<string>;
  ensurePrice(price: Price): Promise<string>;
  ensureCreditPrice(price: CreditPrice): Promise<string>;
  createCreditCheckout(
    input: CheckoutInput,
  ): Promise<{ id: string; url: string; expires_at: number }>;
  getCreditPayment(checkoutId: string): Promise<CreditPayment>;
  ensurePromotion(
    campaign: Campaign,
    price: Price | CreditPrice,
  ): Promise<{ couponId: string | null; endAt: string | null }>;
  createCheckout(
    input: CheckoutInput,
  ): Promise<{ id: string; url: string; expires_at: number }>;
  getCheckout(
    id: string,
  ): Promise<{ status: string; subscriptionId: string | null }>;
  expireCheckout(id: string): Promise<void>;
  findCheckout(
    customerId: string,
    intentId: string,
  ): Promise<{ id: string; status: string } | null>;
  createCustomerPortal(
    customerId: string,
    site: string,
    key: string,
  ): Promise<string>;
  getSubscription(id: string): Promise<SubscriptionSnapshot>;
  changeSubscription(
    id: string,
    price: Price,
    timing: "immediate" | "period_end",
    key: string,
  ): Promise<{ scheduleId: string | null }>;
  cancelSubscription(
    id: string,
    immediately: boolean,
    key: string,
  ): Promise<void>;
  resumeSubscription(id: string, key: string): Promise<void>;
  handleWebhook(raw: string, signature: string): Promise<VerifiedEvent>;
  getInvoice(id: string): Promise<InvoiceSnapshot>;
  endDiscountAt(id: string, until: string, key: string): Promise<string | null>;
}
export const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function requireUUID(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new Error("invalid_input");
  }
  return value;
}
export function safeHostedUrl(
  value: unknown,
  kind: "checkout" | "portal" | "invoice",
): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    const host = {
      checkout: "checkout.stripe.com",
      portal: "billing.stripe.com",
      invoice: "invoice.stripe.com",
    }[kind];
    return u.protocol === "https:" && u.hostname === host && !u.username &&
        !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function assertTestSecret(secret: string) {
  if (!/^sk_test_[A-Za-z0-9]+$/.test(secret)) {
    throw new Error("stripe_test_configuration_required");
  }
}
export function assertTestObject(value: { livemode?: boolean }) {
  if (value.livemode !== false) throw new Error("live_mode_forbidden");
}
export function financialBenefit(benefits: Benefit[]) {
  return benefits.find((b) =>
    ["percentage_discount", "fixed_discount", "free_period", "custom_price"]
      .includes(b.type)
  );
}
export function couponFor(
  campaign: Campaign,
  price: Pick<Price, "amount" | "currency">,
) {
  const b = financialBenefit(campaign.benefits);
  if (!b) return null;
  const percent = b.type === "free_period"
    ? 100
    : b.type === "percentage_discount"
    ? b.amount
    : undefined;
  const amount = b.type === "custom_price"
    ? price.amount - Math.round((b.amount ?? NaN) * 100)
    : b.type === "fixed_discount"
    ? Math.round((b.amount ?? NaN) * 100)
    : undefined;
  if (
    percent !== undefined &&
    (!Number.isFinite(percent) || percent <= 0 || percent > 100)
  ) throw new Error("invalid_benefit");
  if (
    amount !== undefined &&
    (!Number.isSafeInteger(amount) || amount <= 0 || amount > price.amount)
  ) throw new Error("invalid_promotion_price");
  return {
    ...(percent !== undefined
      ? { percent_off: percent }
      : { amount_off: amount, currency: price.currency.toLowerCase() }),
    duration: b.duration.kind === "invoice"
      ? "once" as const
      : b.duration.kind === "months"
      ? "repeating" as const
      : "forever" as const,
    ...(b.duration.kind === "months"
      ? { duration_in_months: b.duration.months! }
      : {}),
  };
}
export function changeTiming(
  currentRank: number,
  currentInterval: Interval,
  target: Price,
): "immediate" | "period_end" {
  return target.rank > currentRank && target.interval === currentInterval
    ? "immediate"
    : "period_end";
}
