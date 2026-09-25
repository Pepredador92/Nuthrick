import { supabase } from "@/src/lib/supabase";
import { billingError } from "./api";
export type CreditPackage = {
  id: string;
  code: string;
  name: string;
  description: string;
  credits: number;
  bonus_credits: number;
  price_amount: number;
  currency: string;
  active: boolean;
  internal_only: boolean;
  test_only: true;
  display_order: number;
  version: number;
  purchases?: number;
};
export type CreditPurchase = {
  id: string;
  professional_id?: string;
  professional_name?: string;
  package_name: string;
  credits_purchased: number;
  bonus_credits: number;
  amount_paid: number | null;
  expected_amount: number;
  currency: string;
  status: string;
  created_at: string;
  credited_at: string | null;
  refunded_amount: number;
  reversed_credits: number;
  promotion_code?: string | null;
};
export type MyCredits = {
  mode: "test";
  enabled: boolean;
  eligible: boolean;
  test_eligible: boolean;
  balances: {
    included: number;
    additional: number;
    available: number;
    debt: number;
    in_review: boolean;
    period_end?: string | null;
  };
  packages: CreditPackage[];
  purchases: CreditPurchase[];
  pending: {
    id: string;
    status: string;
    expires_at: string;
    url: string | null;
  } | null;
  history: {
    id: string;
    type: string;
    included_delta: number;
    purchased_delta: number;
    credit_purchase_id: string | null;
    created_at: string;
  }[];
};
export type CreditQuote = {
  amount: number;
  currency: string;
  credits: number;
  bonus: number;
  campaign: { code: string; name: string } | null;
};
export const creditNumber = (value: number) =>
  new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(value);
export const purchaseState = (state: string) => ({
  paid: "Completada",
  pending: "Pendiente",
  failed: "Pago no completado",
  cancelled: "Cancelada",
  refunded: "Reembolsada",
  partially_refunded: "Reembolso parcial",
  in_review: "En revisión",
}[state] ?? "Pendiente");
export async function getMyCredits(): Promise<MyCredits> {
  const { data, error } = await supabase.rpc("my_ai_credits");
  if (error) {
    throw new Error("No pudimos cargar tus créditos. Intenta de nuevo.");
  }
  return data;
}
export async function creditAdmin<T>(
  action: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc("ai_credit_admin_api", {
    p_action: action,
    p_data: input,
  });
  if (error) throw new Error(billingError(error.message));
  return data;
}
