import { supabase } from "@/src/lib/supabase";
import type { Access } from "../admin/api";
export type Interval = "monthly" | "annual";
export type Benefit = {
  type:
    | "percentage_discount"
    | "fixed_discount"
    | "free_period"
    | "custom_price"
    | "initial_ai_credits"
    | "temporary_entitlement"
    | "plan_upgrade";
  amount?: number;
  entitlement?: string;
  value?: boolean | number | "unlimited";
  plan_id?: string;
  duration: {
    kind: "invoice" | "months" | "until" | "forever";
    months?: number;
    until?: string;
  };
};
export type Campaign = {
  id: string;
  version: number;
  code: string;
  name: string;
  audience: string;
  audience_note: string;
  visibility: "private" | "public";
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  eligible_plan_ids: string[];
  intervals: Interval[];
  benefits: Benefit[];
  max_redemptions: number | null;
  max_per_professional: number;
  new_customers_only: boolean;
  fallback: string;
  plan_names?: string[];
  redeemed: number;
  reserved: number;
  redemptions?: {
    id: string;
    professional_name: string;
    professional_id: string;
    subscription_id: string;
    redeemed_at: string;
    audience: string;
  }[];
  mappings?: {
    version: number;
    provider_coupon_id: string | null;
    price_mapping_id: string;
    end_at: string | null;
  }[];
};
export type Payment = {
  provider_invoice_id: string;
  professional_name?: string;
  professional_id?: string;
  plan_name?: string;
  amount_paid: number;
  amount_due: number;
  currency: string;
  status: string;
  issued_at: string;
  paid_at: string | null;
  hosted_url: string | null;
  provider?: string;
};
export type Subscription = {
  id: string;
  professional_id: string;
  professional_name?: string;
  plan_name: string;
  plan_id: string;
  interval: Interval;
  amount: number;
  currency: string;
  state: string;
  period_start: string;
  period_end: string;
  paid_through: string | null;
  cancel_at_period_end: boolean;
  grace_until: string | null;
  manual_hold: boolean;
  pending_plan_id: string | null;
  pending_plan_name?: string | null;
  pending_interval: Interval | null;
  provider: string;
  campaign_id: string | null;
  campaign_snapshot: Campaign | null;
  last_payment?: string | null;
  provider_subscription_id: string;
};
export type MyBilling = {
  mode: "test";
  enabled: boolean;
  test_eligible: boolean;
  access: Access;
  subscription: Subscription | null;
  payments: Payment[];
  credits: { included: number; additional: number; period_end?: string | null };
};
export type Preview = {
  price: { amount: number; currency: string };
  campaign: {
    name: string;
    code: string;
    benefits: Benefit[];
    fallback: string;
  } | null;
};
export const money = (cents: number, currency = "MXN") =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const dateLabel = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value))
    : "—";
export const intervalLabel = (value: Interval) =>
  value === "monthly" ? "mes" : "año";
export const stateLabel = (
  value: string,
) => ({
  trial: "Prueba",
  active: "Activa",
  grace: "Pago pendiente · período de gracia",
  suspended: "Suspendida · solo lectura",
  cancelled: "Cancelada",
}[value] ?? "Pendiente");
const messages: Record<string, string> = {
  unauthorized: "Inicia sesión para continuar.",
  admin_required: "Esta cuenta no tiene permisos de administración.",
  invalid_input: "Revisa los datos ingresados.",
  test_checkout_unavailable:
    "La contratación de prueba está habilitada solo para las cuentas de prueba autorizadas.",
  billing_not_configured: "Stripe Test aún está en configuración.",
  stripe_test_configuration_required: "Stripe Test aún está en configuración.",
  stripe_account_mismatch:
    "La cuenta del proveedor no coincide. Contacta a administración.",
  billing_busy:
    "Hay otra operación en curso. Espera un momento y vuelve a intentar.",
  billing_lease_expired: "La operación tardó demasiado. Vuelve a intentar.",
  checkout_pending:
    "Tienes un checkout pendiente. Cancélalo antes de elegir otra opción.",
  checkout_expired:
    "Tu checkout venció. Libera la sesión pendiente y vuelve a elegir.",
  checkout_payment_pending:
    "El pago ya se envió. Espera su confirmación en Mi plan.",
  subscription_exists: "Ya tienes una suscripción. Cámbiala desde Mi plan.",
  internal_access_protected:
    "Tu acceso especial se administra directamente en Nuthrick. Contacta a administración para cambiarlo.",
  manual_access_protected:
    "Tu acceso tiene un ajuste administrativo. Contacta a administración.",
  promotion_unavailable: "El código no existe o está desactivado.",
  promotion_expired: "El código está fuera de vigencia.",
  promotion_plan_ineligible: "El código no aplica al plan elegido.",
  promotion_interval_ineligible: "El código no aplica a esta modalidad.",
  promotion_limit_reached: "La promoción alcanzó su máximo de usos.",
  promotion_already_used: "Ya utilizaste o reservaste este código.",
  promotion_new_customers_only:
    "Esta promoción es solo para nuevas suscripciones.",
  invalid_promotion_price:
    "El beneficio no corresponde al precio de este plan.",
  invalid_benefit: "Revisa el beneficio de la promoción.",
  invalid_duration: "Revisa la duración del beneficio.",
  free_period_requires_monthly:
    "Los meses gratis o la gratuidad hasta una fecha requieren modalidad mensual. Para anual, elige una factura completa.",
  invalid_promotion_plans: "Elige al menos un plan público activo.",
  invalid_entitlement_value: "Revisa el valor del permiso temporal.",
  duplicate_benefit: "Hay beneficios repetidos.",
  one_financial_benefit:
    "Usa un solo beneficio de precio y añade los beneficios de acceso o créditos que necesites.",
  stale_revision:
    "La promoción cambió en otra sesión. Recarga antes de guardar.",
  code_immutable: "El código no puede cambiar después de crear la campaña.",
  confirmation_required:
    "Escribe CANCELAR AHORA y un motivo de al menos 8 caracteres.",
  subscription_change_unavailable:
    "Espera a que tu suscripción esté activa y sin cancelación pendiente.",
  payment_pending: "Resuelve el pago pendiente antes de cambiar el plan.",
  same_plan: "Ya tienes ese plan y modalidad.",
  subscription_missing: "No hay una suscripción que se pueda modificar.",
  customer_missing: "Todavía no tienes un cliente de pago.",
  operation_already_used: "Actualiza la página y vuelve a intentar.",
  operation_mismatch: "Actualiza la página antes de realizar otra operación.",
};
export function billingError(code: string) {
  return messages[code] ??
    "No pudimos completar la operación. Intenta de nuevo.";
}
export async function billingAction<T = Record<string, unknown>>(
  action: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("billing", {
    body: { action, ...input },
  });
  if (error) {
    let code = "billing_unavailable";
    try {
      const payload = await error.context?.json();
      code = payload?.error ?? code;
    } catch { /* Network failure has no response body. */ }
    throw new Error(billingError(code));
  }
  if (data?.error) throw new Error(billingError(data.error));
  return data as T;
}
export async function billingAdmin<T>(
  action: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc("billing_admin_api", {
    p_action: action,
    p_data: input,
  });
  if (error) throw new Error(billingError(error.message));
  return data as T;
}
export async function getMyBilling(): Promise<MyBilling> {
  const { data, error } = await supabase.rpc("my_billing");
  if (error) throw new Error("No pudimos cargar tu suscripción.");
  return data as MyBilling;
}
export function hostedUrl(
  value: unknown,
  kind: "checkout" | "portal" | "invoice",
) {
  try {
    if (typeof value !== "string") return null;
    const url = new URL(value);
    return url.protocol === "https:" &&
        url.hostname ===
          ({
            checkout: "checkout.stripe.com",
            portal: "billing.stripe.com",
            invoice: "invoice.stripe.com",
          }[kind]) &&
        !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function goHosted(value: unknown, kind: "checkout" | "portal") {
  const url = hostedUrl(value, kind);
  if (!url) throw new Error("No pudimos validar el enlace de pago.");
  window.location.assign(url);
}
export function benefitLabel(b: Benefit) {
  return ({
    percentage_discount: `${b.amount}% de descuento`,
    fixed_discount: `${money((b.amount ?? 0) * 100)} de descuento`,
    custom_price: `${money((b.amount ?? 0) * 100)} por período contratado`,
    free_period: "Período sin costo",
    initial_ai_credits: `${b.amount} créditos IA iniciales`,
    temporary_entitlement: `Permiso temporal: ${b.entitlement}`,
    plan_upgrade: "Mejora temporal de plan",
  }[b.type]);
}
export function durationLabel(b: Benefit) {
  if (b.type === "initial_ai_credits") return "Una sola asignación";
  return b.duration.kind === "months"
    ? `${b.duration.months} meses`
    : b.duration.kind === "until"
    ? `Hasta ${dateLabel(b.duration.until)}`
    : b.duration.kind === "forever"
    ? "Sin fecha de término"
    : "Una factura";
}
export function checkoutAmount(price: number, benefits: Benefit[] = []) {
  const b = benefits.find((x) =>
    ["percentage_discount", "fixed_discount", "custom_price", "free_period"]
      .includes(x.type)
  );
  if (!b) return price;
  return b.type === "free_period"
    ? 0
    : b.type === "custom_price"
    ? Math.round((b.amount ?? 0) * 100)
    : b.type === "fixed_discount"
    ? Math.max(0, price - Math.round((b.amount ?? 0) * 100))
    : Math.round(price * (1 - (b.amount ?? 0) / 100));
}
