import { describe, expect, it } from "vitest";
import { createExchangePrescription, setExchangePortions } from "@/src/features/exchanges/model";
import type { ExchangeGroupCode, ExchangePrescription } from "@/src/types/domain";
import {
  addMealTime,
  applyMealDistributionSuggestion,
  calculateDistributionStatus,
  calculateGroupDistribution,
  calculateMealNutrition,
  calculateRemainingExchanges,
  confirmMealDistribution,
  createMealDistribution,
  exchangeInventoryChangedSinceConfirmation,
  moveMealTime,
  portionsAssignedToMeal,
  reconcileMealDistribution,
  removeMealTime,
  setDistributedPortions,
  suggestMealDistribution,
  sumMealNutrition,
  updateMealTime,
} from "./model";

const targets = { energy_kcal: 2000, carbohydrate_g: 250, protein_g: 100, fat_g: 60 };
const ids = () => {
  let index = 0;
  return () => `meal-${++index}`;
};
const inventory = (values: Partial<Record<ExchangeGroupCode, number>> = {}): ExchangePrescription => {
  let result = createExchangePrescription(targets);
  for (const [code, portions] of Object.entries(values)) result = setExchangePortions(result, targets, code as ExchangeGroupCode, portions ?? 0);
  return result;
};

describe("meal distribution model", () => {
  it("creates five editable default meal times with stable ids", () => {
    const value = createMealDistribution(ids());
    expect(value.meal_times.map((meal) => meal.display_name)).toEqual(["Desayuno", "Colación 1", "Comida", "Colación 2", "Cena"]);
    expect(new Set(value.meal_times.map((meal) => meal.id)).size).toBe(5);
    expect(value.status).toBe("not_started");
  });

  it("adds, renames, schedules and reorders meal times without using names as ids", () => {
    let value = createMealDistribution(ids());
    value = addMealTime(value, "Preentreno", "17:30", "pre");
    value = updateMealTime(value, "pre", { display_name: "Postentreno", time: "18:45" });
    value = moveMealTime(value, "pre", -1);
    expect(value.meal_times.at(-2)).toMatchObject({ id: "pre", display_name: "Postentreno", time: "18:45", meal_type: "SNACK" });
  });

  it("removes an empty meal and returns its assigned portions to pending when it has data", () => {
    const exchange = inventory({ VEGETABLES: 2 });
    let value = createMealDistribution(ids());
    const breakfast = value.meal_times[0].id;
    value = setDistributedPortions(value, "VEGETABLES", breakfast, 2);
    expect(portionsAssignedToMeal(value, breakfast)).toBe(2);
    value = removeMealTime(value, breakfast);
    expect(calculateRemainingExchanges(value.distribution, exchange, "VEGETABLES")).toEqual({ available: 2, assigned: 0, remaining: 2 });
  });

  it("accepts non-negative decimals and calculates assigned, remaining and excess", () => {
    const exchange = inventory({ CEREALS_NO_FAT: 5 });
    let value = createMealDistribution(ids());
    value = setDistributedPortions(value, "CEREALS_NO_FAT", value.meal_times[0].id, 2.25);
    value = setDistributedPortions(value, "CEREALS_NO_FAT", value.meal_times[2].id, 3.5);
    expect(calculateGroupDistribution(value.distribution, "CEREALS_NO_FAT")).toBe(5.75);
    expect(calculateRemainingExchanges(value.distribution, exchange, "CEREALS_NO_FAT").remaining).toBe(-0.75);
    expect(calculateDistributionStatus(value.distribution, exchange).excess).toBe(1);
  });

  it("derives nutrition by meal from the official exchange catalog", () => {
    let value = createMealDistribution(ids());
    const meal = value.meal_times[0].id;
    value = setDistributedPortions(value, "VEGETABLES", meal, 2);
    value = setDistributedPortions(value, "FRUITS", meal, 1);
    expect(calculateMealNutrition(value.distribution, meal)).toEqual({ meal_time_id: meal, energy_kcal: 110, carbohydrate_g: 23, protein_g: 4, fat_g: 0 });
  });

  it("proposes a deterministic distribution and preserves every group total exactly", () => {
    const exchange = inventory({ VEGETABLES: 5, FRUITS: 4, CEREALS_NO_FAT: 8, LEGUMES: 1, AOA_LOW_FAT: 4.5, MILK_SKIM: 2, FATS_NO_PROTEIN: 4 });
    const value = createMealDistribution(ids());
    const first = suggestMealDistribution(value, exchange);
    const second = suggestMealDistribution(value, exchange);
    expect(first.distribution).toEqual(second.distribution);
    for (const group of exchange.groups) expect(calculateGroupDistribution(first.distribution, group.group_code)).toBe(group.portions);
    expect(first.distribution.every((entry) => entry.portions >= 0)).toBe(true);
  });

  it("avoids fragmenting one legume exchange across every meal", () => {
    const exchange = inventory({ LEGUMES: 1 });
    const proposal = suggestMealDistribution(createMealDistribution(ids()), exchange);
    expect(proposal.distribution.filter((entry) => entry.group_code === "LEGUMES")).toHaveLength(1);
    expect(proposal.distribution[0].portions).toBe(1);
  });

  it("adapts proposals to custom meal structures", () => {
    const exchange = inventory({ CEREALS_NO_FAT: 3 });
    let value = createMealDistribution(ids());
    while (value.meal_times.length > 2) value = removeMealTime(value, value.meal_times[1].id);
    value = updateMealTime(value, value.meal_times[0].id, { display_name: "Preentreno", meal_type: "SNACK" });
    value = updateMealTime(value, value.meal_times[1].id, { display_name: "Cena", meal_type: "DINNER" });
    const proposal = suggestMealDistribution(value, exchange);
    expect(new Set(proposal.distribution.map((entry) => entry.meal_time_id))).toEqual(new Set(value.meal_times.map((meal) => meal.id)));
    expect(calculateGroupDistribution(proposal.distribution, "CEREALS_NO_FAT")).toBe(3);
  });

  it("applies or discards a proposal without marking it ready", () => {
    const exchange = inventory({ FRUITS: 3 });
    const value = createMealDistribution(ids());
    const proposal = suggestMealDistribution(value, exchange);
    expect(value.distribution).toEqual([]);
    const applied = applyMealDistributionSuggestion(value, proposal);
    expect(applied.status).toBe("editing");
    expect(applied.suggestion_metadata).toMatchObject({ source: "automatic", algorithm: "MEAL_DISTRIBUTION_V1" });
  });

  it("confirms only a complete distribution and saves the exchange snapshot", () => {
    const exchange = inventory({ VEGETABLES: 2, FRUITS: 1 });
    let value = createMealDistribution(ids());
    value = setDistributedPortions(value, "VEGETABLES", value.meal_times[2].id, 2);
    expect(confirmMealDistribution(value, exchange).status).toBe("editing");
    value = setDistributedPortions(value, "FRUITS", value.meal_times[0].id, 1);
    const confirmed = confirmMealDistribution(value, exchange);
    expect(confirmed.status).toBe("ready");
    expect(confirmed.confirmed_at).toEqual(expect.any(String));
    expect(confirmed.source_exchange_snapshot?.groups.find((group) => group.group_code === "VEGETABLES")?.portions).toBe(2);
  });

  it("returns a confirmed distribution to editing after a manual modification", () => {
    const exchange = inventory({ FRUITS: 1 });
    let value = createMealDistribution(ids());
    value = setDistributedPortions(value, "FRUITS", value.meal_times[0].id, 1);
    value = confirmMealDistribution(value, exchange);
    value = setDistributedPortions(value, "FRUITS", value.meal_times[0].id, 0.5);
    expect(value).toMatchObject({ status: "editing", confirmed_at: null });
  });

  it("preserves assignments and exposes pending or excess when the exchange inventory changes", () => {
    let exchange = inventory({ CEREALS_NO_FAT: 8, FRUITS: 3 });
    let value = createMealDistribution(ids());
    value = applyMealDistributionSuggestion(value, suggestMealDistribution(value, exchange));
    value = confirmMealDistribution(value, exchange);
    exchange = setExchangePortions(exchange, targets, "CEREALS_NO_FAT", 7);
    exchange = setExchangePortions(exchange, targets, "FRUITS", 4);
    const reconciled = reconcileMealDistribution(value, exchange);
    expect(reconciled.distribution).toEqual(value.distribution);
    expect(reconciled.status).toBe("editing");
    expect(exchangeInventoryChangedSinceConfirmation(reconciled, exchange)).toBe(true);
    expect(calculateDistributionStatus(reconciled.distribution, exchange)).toMatchObject({ pending: 1, excess: 1 });
  });

  it("keeps a zeroed group visible as an excess while assignments remain", () => {
    let exchange = inventory({ MILK_SKIM: 2 });
    let value = createMealDistribution(ids());
    value = setDistributedPortions(value, "MILK_SKIM", value.meal_times[0].id, 2);
    exchange = setExchangePortions(exchange, targets, "MILK_SKIM", 0);
    const group = calculateDistributionStatus(value.distribution, exchange).groups.find((item) => item.group_code === "MILK_SKIM");
    expect(group).toMatchObject({ available: 0, assigned: 2, state: "excess" });
  });

  it("conserves total kcal and macros when every exchange is fully distributed", () => {
    const exchange = inventory({ VEGETABLES: 5, FRUITS: 4, CEREALS_NO_FAT: 8, LEGUMES: 1, AOA_LOW_FAT: 5, MILK_SKIM: 2, FATS_NO_PROTEIN: 4 });
    const value = createMealDistribution(ids());
    const proposal = suggestMealDistribution(value, exchange);
    const totals = sumMealNutrition(proposal.derived_meal_totals);
    expect(totals.energy_kcal).toBeCloseTo(exchange.derived_totals.energy_kcal, 8);
    expect(totals.carbohydrate_g).toBeCloseTo(exchange.derived_totals.carbohydrate_g, 8);
    expect(totals.protein_g).toBeCloseTo(exchange.derived_totals.protein_g, 8);
    expect(totals.fat_g).toBeCloseTo(exchange.derived_totals.fat_g, 8);
  });
});
