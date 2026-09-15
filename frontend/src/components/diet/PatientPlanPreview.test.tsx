import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { weeklyFixture } from "../../../tests/fixtures/weeklyMenu";
import { patientPreparation, withPatientSubstitutions } from "@/src/features/diet-review/preparation";
import { PatientPlanPreview } from "./PatientPlanPreview";

describe("patient meal preview", () => {
  it("shows one compact list, then preparation and substitutions, without disclosures", () => {
    const fixture = weeklyFixture([1, 1, 3]);
    fixture.foods[fixture.foods.length - 1].name = "Avena";
    const option = fixture.menu.meal_options!.find(value => value.meal_time_id === "dinner")!;
    option.entries[0].quantity = 0.5;
    option.entries[0].exchange_contributions[0].portions = 0.5;
    option.entries.push(fixture.menu.meal_options![0].entries[0]);
    fixture.menu.week_plan = { schema_version: 1, days: [{ day: "mon", assignments: [{ meal_time_id: "dinner", option_id: option.id, option_snapshot: option, fixed: false }] }] };
    const enriched = withPatientSubstitutions(fixture.menu, fixture.foods).week_plan!.days[0].assignments[0].option_snapshot;
    const { container } = render(<PatientPlanPreview value={{ title: "Plan de prueba", patientName: "Paciente de prueba", days: [{ name: "Lunes", meals: [{ name: "Cena", time: "20:00", entries: option.entries, preparation: patientPreparation(enriched) }] }] }} />);
    const card = screen.getByRole("article");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    const ingredients = within(card).getByRole("list", { name: "Ingredientes de Cena" });
    expect(within(ingredients).getByText("½ taza · Pan integral")).toBeVisible();
    expect(within(ingredients).getByText(/Agua natural · vaso de 240 ml/)).toBeVisible();
    expect(within(ingredients).getByText(/Papaya fresca/)).toBeVisible();
    expect(within(card).getAllByRole("list")).toHaveLength(1);
    expect(within(card).getByText(/½ taza de Tortilla de maíz/)).toBeVisible();
    expect(within(card).getByText(/½ taza de Avena/)).toBeVisible();
    const preparation = within(card).getByLabelText("Preparación");
    const substitutions = within(card).getByLabelText("Sustituciones");
    expect(preparation).toBeVisible();
    expect(ingredients.compareDocumentPosition(preparation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preparation.compareDocumentPosition(substitutions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll("details, summary, button")).toHaveLength(0);
    expect(within(card).queryByText("Bebida")).not.toBeInTheDocument();
    expect(card.textContent).not.toContain("cup");
    expect(card.textContent).toContain("en lugar del alimento original");
  });
  it("keeps every day visible and does not show substitutions for other food groups", () => {
    const fixture = weeklyFixture([1, 1, 1]);
    const option = fixture.menu.meal_options![0];
    const preparation = patientPreparation(option);
    preparation.ingredients[0].alternatives = [{ food: preparation.ingredients[0].food!, amount: 1, unit: "cup", equivalents: 1, source_reference: null }];
    const meal = { name: "Desayuno", time: null, entries: option.entries, preparation };
    render(<PatientPlanPreview value={{ title: "Plan", patientName: "Paciente", days: [{ name: "Lunes", meals: [meal] }, { name: "Martes", meals: [meal] }] }} />);
    expect(screen.getByRole("region", { name: "Lunes" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Martes" })).toBeVisible();
    expect(screen.queryByLabelText("Sustituciones")).not.toBeInTheDocument();
  });
});
