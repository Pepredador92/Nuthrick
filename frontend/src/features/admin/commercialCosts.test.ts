import { expect, it } from "vitest";
import {
  configuredCreditCost,
  defaultCostAssumptions as a,
  estimateCommercialCosts,
} from "./commercialCosts";
const monthly = {
  price: 349,
  credits: 50,
  months: 1,
  recurring: true,
  usdPerCredit: 0.01,
};
it("includes payment, recurring billing and tax on fees separately", () => {
  const cost = estimateCommercialCosts(monthly, a)!;
  expect(cost).toMatchObject({
    payments: 15.56,
    billing: 2.44,
    feeVat: 2.88,
    stripe: 20.88,
    ai: 9.25,
    margin: 318.87,
  });
  expect(estimateCommercialCosts({ ...monthly, price: 299 }, a)!.margin).toBe(
    271.36,
  );
});
it("annual charges one fixed fee and budgets twelve credit allocations", () => {
  const cost = estimateCommercialCosts(
    { ...monthly, price: 3490, months: 12 },
    a,
  )!;
  expect(cost.credits).toBe(600);
  expect(cost.ai).toBe(111);
  expect(cost.payments).toBe(128.64);
});
it("one-time packages include bonus credits and do not include Billing", () => {
  const cost = estimateCommercialCosts({
    ...monthly,
    price: 99,
    credits: 120,
    recurring: false,
  }, a)!;
  expect(cost.billing).toBe(0);
  expect(cost.ai).toBe(22.2);
  expect(cost.stripe).toBe(7.61);
});
it("handles missing cost, zero credits, losses and invalid inputs without inventing profit", () => {
  expect(estimateCommercialCosts({ ...monthly, usdPerCredit: null }, a))
    .toBeNull();
  expect(
    estimateCommercialCosts({ ...monthly, credits: 0, usdPerCredit: null }, a)
      ?.ai,
  ).toBe(0);
  expect(estimateCommercialCosts({ ...monthly, price: 1 }, a)!.margin)
    .toBeLessThan(0);
  expect(estimateCommercialCosts({ ...monthly, price: 0 }, a)).toMatchObject({
    stripe: 0,
    marginPercent: null,
  });
  expect(estimateCommercialCosts({ ...monthly, price: null }, a)).toBeNull();
  expect(estimateCommercialCosts(monthly, { ...a, mxnPerUsd: NaN })).toBeNull();
  expect(estimateCommercialCosts(monthly, { ...a, mxnPerUsd: 0 })).toBeNull();
});
it("reads the most conservative configured unit cost, with no hardcoded conversion", () => {
  expect(configuredCreditCost(null)).toBeNull();
  expect(
    configuredCreditCost({
      checked_at: "now",
      features: [{ feature: "a", usd_per_credit: .01, pricing_version: "1" }, {
        feature: "b",
        usd_per_credit: .02,
        pricing_version: "1",
      }],
    }),
  ).toBe(.02);
});
