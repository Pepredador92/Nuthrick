import { supabase } from "@/src/lib/supabase";

export type EntitlementValue = boolean | number | "unlimited";
export type Access = {
  plan_id: string | null;
  plan_name: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  allowed: boolean;
  read_only?: boolean;
  arrangement?: string;
  patient_usage?: {
    active: number;
    limit: number | "unlimited";
    over_limit: boolean;
  };
  values: Record<string, EntitlementValue>;
  sources: Record<string, string>;
};
export type MyAccess = { is_admin: boolean; access: Access };
export type Entitlement = {
  key: string;
  label: string;
  category: string;
  value_type: "boolean" | "limit";
  display_order: number;
};
export type Plan = {
  id?: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  internal_only?: boolean;
  credits_provisional?: boolean;
  display_order: number;
  monthly_price: number | null;
  annual_price: number | null;
  currency: string;
  updated_at?: string;
  values: Record<string, EntitlementValue>;
};
export type Catalog = { entitlements: Entitlement[]; plans: Plan[] };
export type Professional = {
  id: string;
  name: string;
  email: string;
  created_at: string;
  last_activity: string | null;
  onboarding_completed?: boolean;
  access: Access;
  credits: number;
};
export type Usage = { feature: string; executions: number; credits: number };
export type Audit = {
  id: number;
  action: string;
  actor: string;
  reason: string | null;
  created_at: string;
};
export type Override = {
  id: string;
  entitlement_key: string;
  value: EntitlementValue;
  starts_at: string;
  ends_at: string | null;
};
export type Grant = {
  id: string;
  plan_id: string;
  starts_at: string;
  ends_at: string | null;
  grant_kind?: "courtesy" | "founder";
};
export type ProfessionalDetail = Professional & {
  base_access: {
    billing_interval?: "manual" | "monthly" | "annual";
    plan_id: string;
    status: string;
    starts_at: string;
    ends_at: string | null;
  } | null;
  overrides: Override[];
  grants: Grant[];
  audit: Audit[];
  ai: {
    available: number;
    included: number;
    purchased: number;
    consumed: number;
    usage: Usage[];
    ledger: {
      type: string;
      included_delta: number;
      purchased_delta: number;
      created_at: string;
    }[];
  };
};
export type AccessCode = {
  id?: string;
  name: string;
  plan_id: string;
  access_kind?: "trial" | "founder";
  duration_days: number | null;
  initial_ai_credits: number;
  max_redemptions: number;
  redeemed_count: number;
  starts_at: string;
  expires_at: string;
  active: boolean;
};
const messages: Record<string, string> = {
  finite_monthly_credits_required:
    "Define una cantidad finita de créditos mensuales.",
  commercial_end_required: "Indica el vencimiento del período mensual o anual.",
  unsettled_period:
    "Hay créditos incluidos reservados. Completa su conciliación antes de renovar.",
  admin_required: "Acceso denegado. Esta cuenta no administra Nuthrick.",
  reason_required: "Escribe un motivo administrativo.",
  stale_revision: "El plan cambió en otra sesión. Recarga antes de guardar.",
  inactive_plan: "Selecciona un plan activo.",
  insufficient_unreserved_credits:
    "El retiro supera los créditos disponibles sin reservas.",
  idempotency_conflict: "Esta operación ya fue registrada con otros datos.",
  reactivation_required: "Reactiva la cuenta antes de otorgar una cortesía.",
  assign_plan_first: "Asigna primero un plan a la cuenta.",
  invalid_adjustment:
    "Usa un importe distinto de cero, con hasta tres decimales.",
  code_already_redeemed: "Esta cuenta ya utilizó el código.",
  code_unavailable: "El código no está disponible.",
};
export async function adminRequest<T>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const result = await supabase.rpc("admin_api", {
    p_action: action,
    p_data: data,
  });
  if (result.error)
    throw new Error(
      messages[result.error.message] ??
        "No se pudo guardar o consultar. Revisa los datos y vuelve a intentarlo.",
    );
  return result.data as T;
}
export async function fetchMyAccess(): Promise<MyAccess> {
  const { data, error } = await supabase.rpc("my_access");
  if (error || !data?.access || typeof data.is_admin !== "boolean")
    throw new Error("No pudimos verificar el acceso de tu cuenta.");
  return data as MyAccess;
}
export function canUseFeature(
  access: Access | null | undefined,
  key: string,
): boolean {
  return (
    access?.allowed === true && !access.read_only && access.values[key] === true
  );
}
export function canReadFeature(
  access: Access | null | undefined,
  key: string,
): boolean {
  return access?.allowed === true && access.values[key] === true;
}
export const accessMessages: Record<string, string> = {
  patients_limit_reached:
    "Has alcanzado el límite de pacientes activos de tu plan. Archiva un paciente para liberar cupo o consulta los planes disponibles.",
  consultations_limit_reached:
    "Has alcanzado el límite de consultas de este período.",
  account_read_only:
    "Tu cuenta está en modo de consulta. Puedes revisar tu información, pero no guardar cambios ni generar con IA.",
  entitlement_required:
    "Esta función no está incluida en tu acceso. Consulta los planes disponibles.",
  library_tier_required:
    "La biblioteca completa está disponible en Profesional.",
};
export const arrangementLabels: Record<string, string> = {
  manual: "Administrativo",
  monthly: "Mensual",
  annual: "Anual",
  courtesy: "Cortesía temporal",
  founder: "Founder · permanente",
};
export function getLimit(
  access: Access | null | undefined,
  key: string,
): number | "unlimited" {
  const value = access?.allowed ? access.values[key] : 0;
  return value === "unlimited" || (typeof value === "number" && value >= 0)
    ? value
    : 0;
}
export const statusLabels: Record<string, string> = {
  active: "Activo",
  trial: "En prueba",
  grace: "Período de gracia",
  suspended: "Suspendido",
  cancelled: "Cancelado",
  expired: "Vencido",
  scheduled: "Programado",
  unassigned: "Sin acceso",
};
export const featureLabels: Record<string, string> = {
  recall_24h: "R24h",
  pes_diagnosis: "PES",
  diet_draft: "Taller",
  diet_workshop: "Taller anterior",
  core_check: "Prueba técnica",
  consultation_summary: "Resumen",
};
export const actionLabels: Record<string, string> = {
  save_plan: "Plan actualizado",
  set_access: "Acceso asignado",
  grant_access: "Cortesía otorgada",
  grant_founder: "Acceso Founder otorgado",
  allocate_credits: "Créditos mensuales asignados",
  commercial_catalog_configured: "Catálogo comercial configurado",
  suspend: "Cuenta suspendida",
  reactivate: "Cuenta reactivada",
  set_override: "Excepción creada",
  revoke_override: "Excepción retirada",
  revoke_grant: "Cortesía retirada",
  adjust_credits: "Ajuste de créditos",
  code_redeemed: "Código utilizado",
  save_code: "Código actualizado",
  legacy_preserved: "Acceso previo conservado",
  admin_bootstrap: "Administrador inicial",
};
export function dateLabel(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Sin vencimiento";
}
export function valueLabel(value: EntitlementValue | undefined) {
  return value === "unlimited"
    ? "Sin límite"
    : value === true
      ? "Incluido"
      : value === false
        ? "No incluido"
        : String(value ?? 0);
}

export async function requireEntitlement(key: string): Promise<void> {
  const { error } = await supabase.rpc("require_entitlement", { p_key: key });
  if (error)
    throw new Error(
      accessMessages[error.message] ??
        "Esta función no está incluida en el acceso de tu cuenta.",
    );
}
