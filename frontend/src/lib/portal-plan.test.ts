// @vitest-environment node
import { describe, it, expect } from "vitest";
import { projectPortalPlan } from "../../../supabase/functions/agenda/portal-plan";
import { weeklyFixture } from "../../tests/fixtures/weeklyMenu";
import {
  patientPreparation,
  withPatientSubstitutions,
} from "@/src/features/diet-review/preparation";
import { foodUnitLabels } from "@/src/features/menu/units";
describe("published patient plan projection", () => {
  function fixture() {
    const f = weeklyFixture([1, 1, 3]);
    const option = f.menu.meal_options!.find(
      (o) => o.meal_time_id === "dinner",
    )!;
    option.entries.push(f.menu.meal_options![0].entries[0]);
    f.menu.week_plan = {
      schema_version: 1,
      days: [
        {
          day: "mon",
          assignments: [
            {
              meal_time_id: "dinner",
              option_id: option.id,
              option_snapshot: option,
              fixed: false,
            },
          ],
        },
      ],
    };
    const menu = withPatientSubstitutions(f.menu, f.foods);
    return {
      f,
      menu,
      raw: {
        versionNumber: 1,
        publishedAt: "2026-09-21",
        snapshot: {
          plan: { title: "Publicado", private: "SECRET" },
          patient: { id: "SECRET", email: "SECRET" },
          professional: { private: "SECRET" },
          prescription: {
            meal_distribution: f.distribution,
            energy_calculation: "SECRET",
          },
          calendar: menu.week_plan!.days,
        },
      },
    };
  }
  it("matches the existing compact preparation, quantities, water and substitutions without private fields", () => {
    const { menu, raw } = fixture();
    const expected = patientPreparation(
      menu.week_plan!.days[0].assignments[0].option_snapshot,
    );
    const result = projectPortalPlan(raw)!;
    const meal = result.days[0].meals[0];
    expect(meal.ingredients.map((i) => [i.name, i.amount, i.unit])).toEqual(
      expected.ingredients.map((i) => [
        i.name,
        i.amount,
        foodUnitLabels[i.unit],
      ]),
    );
    expect(meal.instructions).toEqual(expected.instructions.map((i) => i.text));
    expect(
      meal.ingredients.map((i) => i.alternatives.map((a) => a.name)),
    ).toEqual(
      expected.ingredients.map((i) => i.alternatives.map((a) => a.food.name)),
    );
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(JSON.stringify(result)).not.toContain("source_key");
    expect(meal.ingredients.some((i) => i.name.includes("Agua"))).toBe(true);
  });
  it("does not silently reinterpret invalid quantities or units", () => {
    const { raw, menu } = fixture();
    menu.week_plan!.days[0].assignments[0].option_snapshot.entries[0].quantity =
      -1;
    expect(() => projectPortalPlan(raw)).toThrow("invalid_plan");
  });
  it("keeps missing plans explicit", () =>
    expect(projectPortalPlan(null)).toBeNull());
});
