import { supabase } from "@/src/lib/supabase";
export type AiAlert = {
  id: string;
  purchase_id: string;
  status: string;
  credited: boolean;
  amount: number;
  credits: number;
  created_at: string;
  professional_id: string;
  professional_name: string;
  is_read: boolean;
};
export type AiOperations = {
  checked_at: string;
  registered: number;
  active: number;
  monthly_credits: number;
  included: number;
  purchased: number;
  reserved: number;
  usd_per_credit: number | null;
  settings: {
    balance_usd: number | null;
    balance_at: string | null;
    coverage_days: number;
    buffer_percent: number;
    extra_credits: number;
    updated_at: string;
  };
  usage: {
    credits: number;
    cost_usd: number;
    executions: number;
    unsettled: number;
    unsettled_usd: number;
  };
  cost_since_balance: number;
  unsettled_total: number;
  unsettled_total_usd: number;
  pending_payments: number;
  assignment_issues: number;
  webhook_issues: number;
  sales: { count: number; credits: number; mxn: number };
  plans: { name: string; users: number; monthly_credits: number }[];
  daily: {
    day: string;
    credits: number;
    cost_usd: number;
    purchases: number;
  }[];
  alerts: { unread: number; items: AiAlert[] };
};
export async function aiOperations<T = AiOperations>(
  action = "overview",
  data: Record<string, unknown> = {},
): Promise<T> {
  const response = await supabase.rpc("admin_ai_operations", {
    p_action: action,
    p_data: data,
  });
  if (response.error)
    throw new Error(
      "No pudimos actualizar el control de IA. Intenta de nuevo.",
    );
  return response.data;
}
/** Estimates use the larger observed/configured conversion and retain existing obligations. */
export function reserveEstimate(data: AiOperations, now = Date.now()) {
  const settings = data.settings;
  const observed =
    data.usage.credits > 0 ? data.usage.cost_usd / data.usage.credits : 0;
  const unit =
    data.usd_per_credit === null
      ? null
      : Math.max(data.usd_per_credit, observed);
  const exposure = data.included + data.purchased;
  const planCredits =
    (data.monthly_credits * settings.coverage_days) / 30 + data.purchased;
  const salesCredits = Math.max(
    settings.extra_credits,
    (data.sales.credits * settings.coverage_days) / 30,
  );
  const usageUsd = (data.usage.cost_usd / 30) * settings.coverage_days;
  const base =
    unit === null
      ? null
      : Math.max(exposure * unit, planCredits * unit, usageUsd);
  const recommended =
    base === null || unit === null
      ? null
      : (base + salesCredits * unit + data.unsettled_total_usd) *
        (1 + settings.buffer_percent / 100);
  const balance =
    settings.balance_usd === null
      ? null
      : Math.max(0, settings.balance_usd - data.cost_since_balance);
  const stale =
    settings.balance_at === null ||
    now - Date.parse(settings.balance_at) > 7 * 86400000;
  const gap =
    balance === null || recommended === null
      ? null
      : Math.max(0, recommended - balance);
  const capacityCredits =
    balance === null || unit === null || unit <= 0 ? null : balance / unit;
  const dailyCostUsd = data.usage.cost_usd / 30;
  return {
    unit,
    exposure,
    planCredits,
    salesCredits,
    usageUsd,
    base,
    recommended,
    balance,
    stale,
    gap,
    capacityCredits,
    dailyCostUsd,
  };
}
