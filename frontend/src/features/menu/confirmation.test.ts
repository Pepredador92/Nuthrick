import { describe, expect, it } from "vitest";
import { weeklyFixture } from "../../../tests/fixtures/weeklyMenu";
import { commitOptionEdits, confirmOption, evaluateMealConfirmationStatus, MEAL_CONFIRMATION_TOLERANCE, optionIsEligible, projectOptions } from "./options";
import { updateMenuEntryQuantity } from "./model";

function caseWith(covered: number) {
  const fixture = weeklyFixture([1, 1, 1]);
  const option = fixture.menu.meal_options![0];
  fixture.distribution.distribution[0].portions = 3;
  option.status = "draft";
  option.confirmed_at = null;
  option.entries[0].quantity = covered;
  option.entries[0].exchange_contributions[0].portions = covered;
  return { ...fixture, option };
}

describe("meal-option confirmation margin", () => {
  it("uses one 0.5 eq limit for exact, small excess and small deficit", () => {
    expect(MEAL_CONFIRMATION_TOLERANCE).toBe(0.5);
    for (const [covered, status, difference] of [
      [3, "exact", 0],
      [3.2, "within_tolerance", 0.2],
      [2.7, "within_tolerance", -0.3],
      [2.5, "within_tolerance", -0.5],
      [3.5, "within_tolerance", 0.5],
    ] as const) {
      const { menu, distribution, option } = caseWith(covered);
      expect(evaluateMealConfirmationStatus(menu, distribution, option)).toMatchObject({
        status, canConfirm: true, requiresExplicitConfirmation: false,
        deviations: [expect.objectContaining({ group_code: "FRUITS", required: 3, covered, difference })],
      });
    }
  });

  it("shows signed deviations outside the limit without structurally blocking confirmation", () => {
    for (const [covered, difference] of [[3.6, 0.6], [2.4, -0.6], [4, 1]] as const) {
      const { menu, distribution, option } = caseWith(covered);
      expect(evaluateMealConfirmationStatus(menu, distribution, option)).toMatchObject({
        status: "outside_tolerance", canConfirm: true, requiresExplicitConfirmation: true,
        deviations: [expect.objectContaining({ difference, within_tolerance: false })],
      });
    }
  });

  it("compares every group independently, including a previously unprescribed group", () => {
    const { menu, distribution, option } = caseWith(3);
    distribution.distribution.push({ meal_time_id: "breakfast", group_code: "CEREALS_NO_FAT", portions: 2 });
    const cereal = structuredClone(menu.meal_options!.find(item => item.meal_time_id === "dinner")!.entries[0]);
    cereal.id = "breakfast-cereal";
    cereal.quantity = 2.3;
    cereal.exchange_contributions[0].portions = 2.3;
    option.entries.push(cereal);
    expect(evaluateMealConfirmationStatus(menu, distribution, option)).toMatchObject({
      status: "within_tolerance", deviations: [
        expect.objectContaining({ group_code: "FRUITS", difference: 0 }),
        expect.objectContaining({ group_code: "CEREALS_NO_FAT", difference: 0.3 }),
      ],
    });
    cereal.quantity = 2.6;
    cereal.exchange_contributions[0].portions = 2.6;
    expect(evaluateMealConfirmationStatus(menu, distribution, option).status).toBe("outside_tolerance");
    distribution.distribution.pop();
    cereal.quantity = 0.05;
    cereal.exchange_contributions[0].portions = 0.05;
    expect(evaluateMealConfirmationStatus(menu, distribution, option)).toMatchObject({
      status: "within_tolerance", deviations: [
        expect.objectContaining({ group_code: "FRUITS", difference: 0 }),
        expect.objectContaining({ group_code: "CEREALS_NO_FAT", required: 0, difference: 0.05 }),
      ],
    });
  });

  it("rounds floating-point noise at the exact tolerance boundary", () => {
    const { menu, distribution, option } = caseWith(3.5000000001);
    expect(evaluateMealConfirmationStatus(menu, distribution, option)).toMatchObject({
      status: "within_tolerance", deviations: [expect.objectContaining({ difference: 0.5 })],
    });
  });

  it("keeps structural errors blocked, including invalid amounts and exclusions", () => {
    const { menu, distribution, option, foods } = caseWith(3);
    for (const amount of [Number.NaN, -1, 0]) {
      option.entries[0].quantity = amount;
      expect(evaluateMealConfirmationStatus(menu, distribution, option)).toMatchObject({ status: "invalid", canConfirm: false });
    }
    option.entries[0].quantity = 3;
    option.entries[0].exchange_contributions[0].portions = Number.NaN;
    expect(evaluateMealConfirmationStatus(menu, distribution, option).status).toBe("invalid");
    option.entries[0].exchange_contributions[0].portions = 3;
    menu.food_preferences = { [foods[0].id]: "exclude" };
    expect(evaluateMealConfirmationStatus(menu, distribution, option).status).toBe("invalid");
    delete menu.food_preferences;
    distribution.distribution[0].portions = Number.NaN;
    expect(evaluateMealConfirmationStatus(menu, distribution, option).status).toBe("invalid");
  });

  it("records a normal or deviating confirmation without changing the prescription, and invalidates edits", () => {
    for (const [covered, kind] of [[3, "exact"], [3.2, "within_tolerance"], [4, "with_deviation"]] as const) {
      const { menu, distribution, option } = caseWith(covered);
      const prescription = structuredClone(distribution);
      if (kind === "with_deviation") expect(confirmOption(menu, distribution, option.id)).toBe(menu);
      const confirmed = confirmOption(menu, distribution, option.id, kind === "with_deviation");
      const saved = confirmed.meal_options![0];
      expect(saved).toMatchObject({ status: "confirmed", confirmation_kind: kind });
      expect(optionIsEligible(confirmed, distribution, saved)).toBe(true);
      expect(distribution).toEqual(prescription);
      expect(saved.entries[0].quantity).toBe(covered);
      const selection = { breakfast: option.id };
      const editedProjection = updateMenuEntryQuantity(projectOptions(confirmed, distribution, selection), distribution, saved.entries[0].id, covered + 1);
      const edited = commitOptionEdits(confirmed, editedProjection, distribution, selection, "breakfast");
      expect(edited.meal_options![0]).toMatchObject({ status: "draft", confirmation_kind: undefined });
    }
  });
});
