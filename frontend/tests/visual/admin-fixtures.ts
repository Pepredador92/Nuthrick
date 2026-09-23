import type { Catalog, ProfessionalDetail } from "../../src/features/admin/api";
export const useAuth = () => ({
  user: { id: "local-admin" },
  loading: false,
  signOut: async () => {},
});
const entries = [
  ["patients", "Pacientes", "Clínica"],
  ["consultations", "Consultas", "Clínica"],
  ["consultation_design", "Diseño de consulta", "Clínica"],
  ["diet_workshop", "Taller de dietas", "Taller"],
  ["diet_library", "Biblioteca de dietas", "Taller"],
  ["public_profile", "Perfil público", "Paciente"],
  ["patient_superlink", "Superlink y mensajes", "Paciente"],
  ["exports", "Exportaciones", "Paciente"],
  ["agenda", "Agenda", "Agenda"],
  ["ai.recall_24h", "Recordatorio de 24 horas", "IA"],
  ["ai.pes", "Diagnóstico PES", "IA"],
  ["ai.diet_draft", "Borrador de dieta", "IA"],
  ["ai.credit_purchase", "Recarga de créditos (preparación)", "IA"],
  ["patients.limit", "Máximo de pacientes", "Límites"],
  ["consultations.monthly_limit", "Consultas por mes", "Límites"],
  ["ai.monthly_credits", "Créditos IA mensuales configurados", "Límites"],
];
const values = Object.fromEntries(
  entries.map(([key, , group]) => [
    key,
    group === "Límites"
      ? key === "ai.monthly_credits"
        ? 0
        : ("unlimited" as const)
      : group !== "IA",
  ]),
);
const catalog: Catalog = {
  entitlements: entries.map(([key, label, category], display_order) => ({
    key,
    label,
    category,
    display_order,
    value_type: category === "Límites" ? "limit" : "boolean",
  })),
  plans: [
    {
      id: "beta",
      code: "beta",
      name: "Nuthrick Beta",
      description: "Piloto SaaS con cero créditos IA incluidos.",
      active: true,
      display_order: 1,
      monthly_price: null,
      annual_price: null,
      currency: "MXN",
      values,
    },
    {
      id: "full",
      code: "full_access",
      name: "Nuthrick Full Access",
      description: "Acceso administrativo temporal.",
      active: true,
      display_order: 0,
      monthly_price: null,
      annual_price: null,
      currency: "MXN",
      values,
    },
  ],
};
const p: ProfessionalDetail = {
  id: "pilot",
  name: "José Pérez · Demo",
  email: "jose.piloto@example.test",
  created_at: "2026-09-23T12:00:00Z",
  last_activity: "2026-09-23T15:30:00Z",
  credits: 300,
  access: {
    plan_id: "beta",
    plan_name: "Nuthrick Beta",
    allowed: true,
    status: "trial",
    starts_at: "2026-09-23T12:00:00Z",
    ends_at: "2027-01-01T06:00:00Z",
    values,
    sources: Object.fromEntries(entries.map(([key]) => [key, "plan"])),
  },
  base_access: null,
  ai: {
    available: 300,
    included: 0,
    purchased: 300,
    consumed: 0,
    usage: [],
    ledger: [
      {
        type: "ADMIN_ADJUSTMENT",
        included_delta: 0,
        purchased_delta: 300,
        created_at: "2026-09-23T13:00:00Z",
      },
    ],
  },
  overrides: [],
  grants: [],
  audit: [
    {
      id: 1,
      action: "adjust_credits",
      actor: "Administrador",
      reason: "300 créditos de cortesía para el piloto",
      created_at: "2026-09-23T13:00:00Z",
    },
  ],
};
export const supabase = {
  rpc: async (name: string, args?: { p_action: string }) => ({
    error: null,
    data:
      name === "my_access"
        ? { is_admin: true, access: p.access }
        : ((
            {
              overview: { registered: 5, active: 2, trial: 3, suspended: 0 },
              catalog,
              professional: p,
              professionals: {
                items: [
                  p,
                  {
                    ...p,
                    id: "maria",
                    name: "María Rodríguez · Demo",
                    email: "maria.piloto@example.test",
                    credits: 0,
                  },
                ],
                total: 2,
              },
              audit: p.audit,
              ai_summary: { accounts: [p], usage: [] },
              codes: [
                {
                  id: "beta-code",
                  name: "Piloto de cinco profesionales",
                  plan_id: "beta",
                  duration_days: 90,
                  initial_ai_credits: 0,
                  max_redemptions: 5,
                  redeemed_count: 2,
                  starts_at: "2026-09-23T12:00:00Z",
                  expires_at: "2026-12-31T06:00:00Z",
                  active: true,
                },
              ],
            } as Record<string, unknown>
          )[args?.p_action ?? ""] ?? { saved: true }),
  }),
};
