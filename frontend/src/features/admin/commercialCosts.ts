export type CostAssumptions = {
  mxnPerUsd: number;
  paymentsPercent: number;
  fixedMxn: number;
  billingPercent: number;
  feeVatPercent: number;
};
export type CostConfig = {
  checked_at: string;
  features: {
    feature: string;
    usd_per_credit: number | null;
    pricing_version: string | null;
  }[];
};
export const defaultCostAssumptions: CostAssumptions = {
  mxnPerUsd: 18.5,
  paymentsPercent: 3.6,
  fixedMxn: 3,
  billingPercent: 0.7,
  feeVatPercent: 16,
};
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function estimateCommercialCosts(input: {
  price: number | null;
  credits: number;
  months: number;
  recurring: boolean;
  usdPerCredit: number | null;
}, a: CostAssumptions) {
  if (
    input.price === null || !Number.isFinite(input.price) || input.price < 0 ||
    !Number.isFinite(input.credits) || input.credits < 0 ||
    !Number.isInteger(input.months) || input.months < 1 ||
    Object.values(a).some((v) => !Number.isFinite(v) || v < 0) ||
    a.mxnPerUsd <= 0 ||
    [a.paymentsPercent, a.billingPercent, a.feeVatPercent].some((v) =>
      v > 100
    ) ||
    (input.credits > 0 &&
      (input.usdPerCredit === null || !Number.isFinite(input.usdPerCredit) ||
        input.usdPerCredit <= 0))
  ) return null;
  const price = cents(input.price);
  const payments = price > 0
    ? cents(price * a.paymentsPercent / 100 + a.fixedMxn)
    : 0;
  const billing = input.recurring ? cents(price * a.billingPercent / 100) : 0;
  const feeVat = cents((payments + billing) * a.feeVatPercent / 100);
  const stripe = cents(payments + billing + feeVat);
  const credits = input.credits * input.months;
  const ai = cents(credits * (input.usdPerCredit ?? 0) * a.mxnPerUsd);
  const margin = cents(price - stripe - ai);
  return {
    price,
    payments,
    billing,
    feeVat,
    stripe,
    credits,
    ai,
    margin,
    marginPercent: price > 0 ? margin / price * 100 : null,
  };
}
// The highest configured unit cost avoids understating costs if features diverge.
export function configuredCreditCost(config: CostConfig | null) {
  if (
    !config?.features.length ||
    config.features.some((f) =>
      f.usd_per_credit === null || !Number.isFinite(f.usd_per_credit) ||
      f.usd_per_credit <= 0
    )
  ) return null;
  return Math.max(...config.features.map((f) => f.usd_per_credit!));
}
