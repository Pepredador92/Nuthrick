import {
  type BillingProvider,
  type Campaign,
  type CreditPrice,
  requireUUID,
} from "./domain.ts";
export type CreditPurchase = {
  id: string;
  package_id: string;
  provider_checkout_id: string | null;
  checkout_url: string | null;
  expires_at: string;
  campaign_snapshot: Campaign | null;
};
type Data = Record<string, unknown>;
type RPC = <T = Data>(action: string, data?: Data) => Promise<T>;
export async function creditAction(
  action: string,
  input: Data,
  owner: string,
  operationKey: string,
  rpc: RPC,
  getProvider: () => Promise<BillingProvider>,
  site: string,
) {
  const allowed = action === "credit_expire"
    ? ["action", "operation_key"]
    : ["action", "operation_key", "package_id", "code"];
  if (Object.keys(input).some((k) => !allowed.includes(k))) {
    throw new Error("invalid_input");
  }
  if (action === "credit_expire") {
    const ctx = await rpc<
      { purchase: CreditPurchase | null; customer_id: string | null }
    >("credit_context");
    if (!ctx.purchase) return { expired: true };
    const p = ctx.purchase, provider = await getProvider();
    const session = p.provider_checkout_id
      ? {
        id: p.provider_checkout_id,
        ...await provider.getCheckout(p.provider_checkout_id),
      }
      : ctx.customer_id
      ? await provider.findCheckout(ctx.customer_id, p.id)
      : null;
    if (session?.status === "complete") {
      throw new Error("checkout_payment_pending");
    }
    if (session?.status === "open") await provider.expireCheckout(session.id);
    if (!session && Date.parse(p.expires_at) > Date.now()) {
      throw new Error("credit_checkout_pending");
    }
    await rpc("credit_expired", { purchase_id: p.id });
    return { expired: true };
  }
  const request = {
    package_id: requireUUID(input.package_id),
    code: typeof input.code === "string" ? input.code.trim().slice(0, 40) : "",
    operation_key: operationKey,
  };
  if (action === "credit_preview") return rpc("credit_preview", request);
  const ctx = await rpc<
    { purchase: CreditPurchase; price: CreditPrice; customer_id: string | null }
  >("credit_prepare", request);
  if (Date.parse(ctx.purchase.expires_at) <= Date.now() + 60_000) {
    throw new Error("checkout_expired");
  }
  if (ctx.purchase.checkout_url) {
    return { id: ctx.purchase.id, url: ctx.purchase.checkout_url };
  }
  const provider = await getProvider();
  const customer = ctx.customer_id ?? await provider.createCustomer(owner);
  if (!ctx.customer_id) await rpc("customer_saved", { customer_id: customer });
  const price = await provider.ensureCreditPrice(ctx.price);
  await rpc("credit_price_saved", {
    price_mapping_id: ctx.price.id,
    price_id: price,
  });
  const promo = ctx.purchase.campaign_snapshot
    ? await provider.ensurePromotion(ctx.purchase.campaign_snapshot, ctx.price)
    : null;
  if (promo) {
    await rpc("credit_coupon_saved", {
      purchase_id: ctx.purchase.id,
      coupon_id: promo.couponId,
    });
  }
  const s = await provider.createCreditCheckout({
    owner,
    customerId: customer,
    priceId: price,
    intentId: ctx.purchase.id,
    couponId: promo?.couponId ?? undefined,
    site,
    expiresAt: Math.floor(Date.parse(ctx.purchase.expires_at) / 1000),
  });
  return rpc("credit_checkout_saved", {
    purchase_id: ctx.purchase.id,
    checkout_id: s.id,
    url: s.url,
    expires_at: s.expires_at,
  });
}
