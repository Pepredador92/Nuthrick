import type { AiOperations } from "../../src/features/admin/aiOperations";
export const aiOperationsFixture: AiOperations = {
  checked_at: new Date().toISOString(),
  registered: 14,
  active: 10,
  monthly_credits: 12500,
  included: 8450,
  purchased: 3100,
  reserved: 34,
  usd_per_credit: 0.01,
  settings: {
    balance_usd: 80,
    balance_at: new Date().toISOString(),
    coverage_days: 30,
    buffer_percent: 25,
    extra_credits: 2000,
    updated_at: new Date().toISOString(),
  },
  usage: {
    credits: 6200,
    cost_usd: 54.2,
    executions: 86,
    unsettled: 0,
    unsettled_usd: 0,
  },
  cost_since_balance: 4.2,
  unsettled_total: 0,
  unsettled_total_usd: 0,
  pending_payments: 1,
  assignment_issues: 0,
  webhook_issues: 0,
  sales: { count: 3, credits: 1800, mxn: 540 },
  plans: [
    { name: "Profesional", users: 5, monthly_credits: 10000 },
    { name: "Esencial", users: 3, monthly_credits: 0 },
    { name: "Piloto", users: 2, monthly_credits: 2500 },
  ],
  daily: Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - 29 + i);
    return {
      day: new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Mexico_City",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date),
      credits: 35 + ((i * 73) % 320),
      cost_usd: (35 + ((i * 73) % 320)) * 0.01,
      purchases: [4, 15, 24].includes(i) ? 600 : 0,
    };
  }),
  alerts: {
    unread: 1,
    items: [
      {
        id: "demo-alert",
        purchase_id: "demo-purchase",
        status: "paid",
        credited: true,
        amount: 18000,
        credits: 600,
        created_at: new Date().toISOString(),
        professional_id: "demo",
        professional_name: "Andrea Ríos · Demostración",
        is_read: false,
      },
    ],
  },
};
