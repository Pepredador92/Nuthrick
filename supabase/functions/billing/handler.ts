import {
  type BillingProvider,
  type Campaign,
  changeTiming,
  financialBenefit,
  type Price,
  requireUUID,
} from "./domain.ts";
import { creditAction, type CreditPurchase } from "./credit-handler.ts";
type Data = Record<string, unknown>;
type Intent = {
  id: string;
  professional_id: string;
  provider_session_id: string | null;
  expires_at: string;
  url: string | null;
  campaign_snapshot: Campaign | null;
};
type LocalSubscription = {
  provider_subscription_id: string;
  cancel_at_period_end: boolean;
  state: string;
};
export type BillingDependencies = {
  authenticate: (token: string) => Promise<string | null>;
  rpc: <T = Data>(action: string, data: Data) => Promise<T>;
  provider: () => Promise<BillingProvider>;
  site: string;
};
// Only these public codes may cross the boundary; provider payloads and credentials never do.
const publicErrors = new Set([
  "credit_package_unavailable",
  "credit_payment_minimum",
  "credit_purchase_not_allowed",
  "credit_checkout_pending",
  "credit_checkout_rate_limited",
  "promotion_package_ineligible",
  "invalid_input",
  "unauthorized",
  "admin_required",
  "confirmation_required",
  "billing_busy",
  "billing_lease_expired",
  "test_checkout_unavailable",
  "internal_access_protected",
  "manual_access_protected",
  "plan_unavailable",
  "price_not_configured",
  "price_mapping_mismatch",
  "promotion_unavailable",
  "promotion_expired",
  "promotion_plan_ineligible",
  "promotion_interval_ineligible",
  "promotion_limit_reached",
  "promotion_already_used",
  "promotion_new_customers_only",
  "invalid_promotion_price",
  "invalid_benefit",
  "checkout_pending",
  "checkout_expired",
  "checkout_payment_pending",
  "operation_already_used",
  "operation_mismatch",
  "subscription_exists",
  "subscription_missing",
  "customer_missing",
  "same_plan",
  "subscription_change_unavailable",
  "payment_pending",
  "invalid_signature",
  "live_mode_forbidden",
  "stripe_test_configuration_required",
  "stripe_account_configuration_required",
  "stripe_account_mismatch",
  "billing_not_configured",
]);
function errorCode(e: unknown) {
  const message = e instanceof Error ? e.message : "";
  return publicErrors.has(message) ? message : "billing_unavailable";
}
async function body(req: Request, max: number) {
  if (Number(req.headers.get("content-length")) > max) {
    throw new Error("invalid_input");
  }
  const reader = req.body?.getReader();
  if (!reader) return "";
  let bytes = 0;
  const parts: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > max) {
      await reader.cancel();
      throw new Error("invalid_input");
    }
    parts.push(value);
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const p of parts) {
    all.set(p, offset);
    offset += p.length;
  }
  return new TextDecoder().decode(all);
}
export function createBillingHandler(deps: BillingDependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    const headers = {
      "content-type": "application/json",
      "cache-control": "no-store",
      "vary": "Origin",
      ...(origin === deps.site
        ? {
          "access-control-allow-origin": origin,
          "access-control-allow-headers":
            "authorization, x-client-info, apikey, content-type",
          "access-control-allow-methods": "POST, OPTIONS",
        }
        : {}),
    };
    const reply = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers });
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: origin === deps.site ? 204 : 403,
        headers,
      });
    }
    if (req.method !== "POST") {
      return reply({ error: "method_not_allowed" }, 405);
    }
    const webhook = new URL(req.url).pathname.endsWith("/billing/webhook");
    let owner: string | null = null;
    let locked = false;
    let claimedEventId: string | null = null;
    const lockKey = crypto.randomUUID();
    const rpc = <T = Data>(action: string, data: Data = {}) =>
      deps.rpc<T>(action, { owner, lock_key: lockKey, ...data });
    try {
      if (webhook) {
        const raw = await body(req, 262144);
        const signature = req.headers.get("stripe-signature");
        if (!signature) throw new Error("invalid_signature");
        const provider = await deps.provider();
        const event = await provider.handleWebhook(raw, signature);
        if (!event.supported || !event.customer_id) {
          return reply({ ignored: true });
        }
        const ctx = await rpc<
          {
            owner?: string;
            replay?: boolean;
            ignored?: boolean;
            intent: Intent | null;
            managed_subscription: boolean;
            credit_purchase?: CreditPurchase | null;
          }
        >("claim_event", {
          event_id: event.id,
          type: event.type,
          created: event.created,
          customer_id: event.customer_id,
          subscription_id: event.subscription_id,
          checkout_id: event.checkout_id,
          livemode: event.livemode,
          payment_id: event.payment_id,
          credit_reference: event.credit_reference,
        });
        if (ctx.replay || ctx.ignored) return reply(ctx);
        owner = ctx.owner!;
        locked = true;
        claimedEventId = event.id;
        if (ctx.credit_purchase) {
          const purchase = ctx.credit_purchase;
          const checkoutId = purchase.provider_checkout_id ??
            event.checkout_id ??
            (await provider.findCheckout(event.customer_id, purchase.id))?.id;
          if (!checkoutId) throw new Error("checkout_payment_pending");
          const payment = await provider.getCreditPayment(checkoutId);
          return reply(
            await rpc("credit_apply", {
              event_id: event.id,
              purchase_id: purchase.id,
              payment,
            }),
          );
        }
        let subscriptionId = event.subscription_id;
        const invoice = event.invoice_id
          ? await provider.getInvoice(event.invoice_id)
          : null;
        subscriptionId ??= invoice?.subscription_id ?? null;
        let checkoutState: string | undefined;
        if (event.checkout_id) {
          const checkout = await provider.getCheckout(event.checkout_id);
          subscriptionId ??= checkout.subscriptionId;
          checkoutState = checkout.status;
        }
        if (!subscriptionId) {
          return reply(
            await rpc("event_done", {
              event_id: event.id,
              checkout_id: event.checkout_id,
              checkout_state: checkoutState,
            }),
          );
        }
        let subscription = await provider.getSubscription(subscriptionId);
        if (
          !ctx.managed_subscription && subscription.intent_id !== ctx.intent?.id
        ) return reply(await rpc("event_done", { event_id: event.id }));
        const financial = ctx.intent?.campaign_snapshot &&
          financialBenefit(ctx.intent.campaign_snapshot.benefits);
        if (
          financial?.duration.kind === "until" &&
          ["active", "trial"].includes(subscription.status) &&
          !subscription.pending_update
        ) {
          await provider.endDiscountAt(
            subscription.id,
            financial.duration.until!,
            ctx.intent!.id,
          );
          subscription = await provider.getSubscription(subscription.id);
        }
        return reply(
          await rpc("apply", { event_id: event.id, subscription, invoice }),
        );
      }
      if (origin && origin !== deps.site) {
        return reply({ error: "origin_not_allowed" }, 403);
      }
      const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)
        ?.[1];
      if (!bearer) throw new Error("unauthorized");
      const actor = await deps.authenticate(bearer);
      if (!actor) throw new Error("unauthorized");
      const input = JSON.parse(await body(req, 16384)) as Data;
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("invalid_input");
      }
      const action = input.action;
      if (
        typeof action !== "string" ||
        ![
          "checkout",
          "credit_checkout",
          "credit_preview",
          "credit_expire",
          "preview",
          "expire_checkout",
          "portal",
          "change",
          "cancel",
          "resume",
          "cancel_now",
          "sync_prices",
        ].includes(action)
      ) throw new Error("invalid_input");
      owner = action === "cancel_now"
        ? requireUUID(input.professional_id)
        : actor;
      const operationKey = action === "preview"
        ? undefined
        : requireUUID(input.operation_key);
      const planRequest = () => ({
        plan_id: requireUUID(input.plan_id),
        interval: input.interval === "monthly" || input.interval === "annual"
          ? input.interval
          : (() => {
            throw new Error("invalid_input");
          })(),
        code: typeof input.code === "string"
          ? input.code.trim().slice(0, 40)
          : "",
      });
      if (action === "cancel_now" || action === "sync_prices") {
        await rpc("authorize_admin", { actor });
      }
      await rpc("lock");
      locked = true;
      if (typeof action === "string" && action.startsWith("credit_")) {
        return reply(
          await creditAction(
            action,
            input,
            owner,
            operationKey!,
            rpc,
            deps.provider,
            deps.site,
          ),
        );
      }
      if (action === "sync_prices") {
        const prices = await rpc<Price[]>("price_catalog", { actor });
        const provider = await deps.provider();
        for (const price of prices) {
          const priceId = await provider.ensurePrice(price);
          await rpc("price_saved", {
            price_mapping_id: price.id,
            price_id: priceId,
          });
        }
        return reply(
          await rpc("price_sync_done", { actor, operation_key: operationKey }),
        );
      }
      if (action === "preview") {
        return reply(await rpc("preview", planRequest()));
      }
      if (action === "checkout") {
        const ctx = await rpc<
          { intent: Intent; price: Price; customer_id: string | null }
        >("prepare_checkout", {
          ...planRequest(),
          operation_key: operationKey,
        });
        if (Date.parse(ctx.intent.expires_at) <= Date.now() + 60_000) {
          throw new Error("checkout_expired");
        }
        if (ctx.intent.url) {
          return reply({ url: ctx.intent.url, id: ctx.intent.id });
        }
        const provider = await deps.provider();
        const customerId = ctx.customer_id ??
          await provider.createCustomer(owner);
        if (!ctx.customer_id) {
          await rpc("customer_saved", { customer_id: customerId });
        }
        const priceId = await provider.ensurePrice(ctx.price);
        await rpc("price_saved", {
          price_mapping_id: ctx.price.id,
          price_id: priceId,
        });
        const promo = ctx.intent.campaign_snapshot
          ? await provider.ensurePromotion(
            ctx.intent.campaign_snapshot,
            ctx.price,
          )
          : null;
        if (promo) {
          await rpc("promotion_saved", {
            intent_id: ctx.intent.id,
            coupon_id: promo.couponId,
            end_at: promo.endAt,
          });
        }
        const session = await provider.createCheckout({
          owner,
          customerId,
          priceId,
          intentId: ctx.intent.id,
          couponId: promo?.couponId ?? undefined,
          site: deps.site,
          expiresAt: Math.floor(Date.parse(ctx.intent.expires_at) / 1000),
        });
        return reply(
          await rpc("checkout_saved", {
            intent_id: ctx.intent.id,
            session_id: session.id,
            url: session.url,
            expires_at: session.expires_at,
          }),
        );
      }
      if (action === "expire_checkout") {
        const ctx = await rpc<
          {
            intent: Intent | null;
            customer: { provider_customer_id: string | null };
          }
        >("context");
        if (!ctx.intent) return reply({ expired: true });
        const provider = await deps.provider();
        const session = ctx.intent.provider_session_id
          ? {
            id: ctx.intent.provider_session_id,
            ...await provider.getCheckout(ctx.intent.provider_session_id),
          }
          : ctx.customer.provider_customer_id
          ? await provider.findCheckout(
            ctx.customer.provider_customer_id,
            ctx.intent.id,
          )
          : null;
        if (session?.status === "complete") {
          throw new Error("checkout_payment_pending");
        }
        if (session?.status === "open") {
          await provider.expireCheckout(session.id);
        }
        // An ambiguous provider call can still finish after a lease expires. Its fixed
        // Checkout deadline must pass before releasing a reservation with no session ID.
        if (
          !session && ctx.customer.provider_customer_id &&
          Date.parse(ctx.intent.expires_at) > Date.now()
        ) throw new Error("checkout_pending");
        return reply(
          await rpc("checkout_expired", { intent_id: ctx.intent.id }),
        );
      }
      const request: Data = action === "change"
        ? planRequest()
        : action === "cancel_now"
        ? { confirmation: input.confirmation, reason: input.reason }
        : {};
      const ctx = await rpc<
        {
          replay?: boolean;
          result?: Data;
          subscription: LocalSubscription;
          current_price: Price;
          target_price: Price | null;
          customer_id: string;
        }
      >("prepare_operation", {
        actor,
        operation_key: operationKey,
        action,
        request,
      });
      if (ctx.replay) return reply(ctx.result);
      const provider = await deps.provider();
      let result: Data = { requested: true };
      if (action === "portal") {
        result = {
          url: await provider.createCustomerPortal(
            ctx.customer_id,
            deps.site,
            operationKey!,
          ),
        };
      } else if (action === "change") {
        const price = ctx.target_price!;
        price.provider_price_id = await provider.ensurePrice(price);
        await rpc("price_saved", {
          price_mapping_id: price.id,
          price_id: price.provider_price_id,
        });
        const timing = changeTiming(
          ctx.current_price.rank,
          ctx.current_price.interval,
          price,
        );
        const changed = await provider.changeSubscription(
          ctx.subscription.provider_subscription_id,
          price,
          timing,
          operationKey!,
        );
        result = { requested: true, timing, schedule_id: changed.scheduleId };
      } else if (action === "resume") {
        await provider.resumeSubscription(
          ctx.subscription.provider_subscription_id,
          operationKey!,
        );
      } else {await provider.cancelSubscription(
          ctx.subscription.provider_subscription_id,
          action === "cancel_now",
          operationKey!,
        );}
      // Access only changes through the verified webhook branch above.
      return reply(
        await rpc("operation_saved", {
          actor,
          operation_key: operationKey,
          result,
        }),
      );
    } catch (e) {
      const code = e instanceof SyntaxError ? "invalid_input" : errorCode(e);
      if (claimedEventId && locked && owner) {
        try {
          await rpc("event_failed", { event_id: claimedEventId, code });
        } catch {
          /* Keep the original retryable failure if the lease expired. */
        }
      }
      const status = code === "unauthorized"
        ? 401
        : code === "invalid_signature"
        ? 400
        : code === "admin_required" || code === "credit_purchase_not_allowed"
        ? 403
        : code === "credit_checkout_rate_limited"
        ? 429
        : code === "billing_busy" || code === "billing_lease_expired" ||
            code === "billing_unavailable" || code === "billing_not_configured"
        ? 503
        : 409;
      return reply({ error: code }, status);
    } finally {
      if (locked && owner) {
        try {
          await rpc("unlock");
        } catch { /* A completed webhook already released its lease. */ }
      }
    }
  };
}
