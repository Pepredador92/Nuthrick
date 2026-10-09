import { describe, it, expect, vi } from "vitest";
vi.mock("@/src/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));
import { reserveEstimate, type AiOperations } from "./aiOperations";
const sample = (): AiOperations => ({
  checked_at: "2026-10-08",
  registered: 10,
  active: 10,
  monthly_credits: 10000,
  included: 2000,
  purchased: 500,
  reserved: 20,
  usd_per_credit: 0.01,
  settings: {
    balance_usd: 50,
    balance_at: "2026-10-08T12:00:00Z",
    coverage_days: 30,
    buffer_percent: 25,
    extra_credits: 1000,
    updated_at: "2026-10-08",
  },
  usage: {
    credits: 1000,
    cost_usd: 5,
    executions: 20,
    unsettled: 0,
    unsettled_usd: 0,
  },
  cost_since_balance: 2,
  unsettled_total: 0,
  unsettled_total_usd: 0,
  pending_payments: 0,
  assignment_issues: 0,
  webhook_issues: 0,
  sales: { count: 1, credits: 500, mxn: 100 },
  plans: [],
  daily: [],
  alerts: { unread: 0, items: [] },
});
describe("IA operating reserve", () => {
  it("backs monthly allocations plus purchased credits and extra sales with a margin", () => {
    const r = reserveEstimate(sample(), Date.parse("2026-10-08T18:00Z"));
    expect(r.recommended).toBe(143.75);
    expect(r.balance).toBe(48);
    expect(r.gap).toBe(95.75);
    expect(r.stale).toBe(false);
  });
  it("does not mistake missing conversion or unreconciled balance for zero", () => {
    const d = sample();
    d.usd_per_credit = null;
    d.settings.balance_usd = null;
    d.settings.balance_at = null;
    const r = reserveEstimate(d);
    expect(r.recommended).toBeNull();
    expect(r.gap).toBeNull();
    expect(r.balance).toBeNull();
    expect(r.stale).toBe(true);
  });
  it("backs existing credits when they exceed current subscriptions and uses higher observed cost", () => {
    const d = sample();
    d.included = 20000;
    d.usage.cost_usd = 20;
    d.unsettled_total_usd = 3;
    const r = reserveEstimate(d);
    expect(r.unit).toBe(0.02);
    expect(r.recommended).toBe((20500 * 0.02 + 1000 * 0.02 + 3) * 1.25);
  });
  it("uses the higher recent sales rate and warns about old balance without implying live coverage", () => {
    const d = sample();
    d.sales.credits = 3000;
    d.cost_since_balance = 100;
    const r = reserveEstimate(d, Date.parse("2026-10-17T18:00Z"));
    expect(r.salesCredits).toBe(3000);
    expect(r.balance).toBe(0);
    expect(r.stale).toBe(true);
  });
});

describe("provider balance credit capacity", () => {
  it("converts a $4.59 balance without adding user wallets", () => {
    const data = sample();
    data.settings.balance_usd = 4.59;
    data.cost_since_balance = 0;
    expect(reserveEstimate(data).capacityCredits).toBeCloseTo(459);
  });
  it("deducts recorded spending and uses the conservative observed rate", () => {
    const data = sample();
    data.usage.cost_usd = 20;
    expect(reserveEstimate(data).capacityCredits).toBe(2400);
    data.cost_since_balance = 100;
    expect(reserveEstimate(data).capacityCredits).toBe(0);
  });
  it("keeps unavailable balance or conversion unknown", () => {
    const data = sample();
    data.settings.balance_usd = null;
    expect(reserveEstimate(data).capacityCredits).toBeNull();
    data.settings.balance_usd = 4.59;
    data.usd_per_credit = null;
    expect(reserveEstimate(data).capacityCredits).toBeNull();
  });
});
