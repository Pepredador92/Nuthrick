import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { weeklyFixture } from "../../../tests/fixtures/weeklyMenu";
import { patientPreparation, withPatientSubstitutions } from "@/src/features/diet-review/preparation";
import { PatientPlanPreview } from "./PatientPlanPreview";

describe("patient meal preview", () => {
  it("renders one meal card with translated quantities, water and two selectable alternatives", () => {
    const fixture = weeklyFixture([1, 1, 3]);
    fixture.foods[fixture.foods.length - 1].name = "Avena";
    const option = fixture.menu.meal_options!.find(value => value.meal_time_id === "dinner")!;
    option.entries[0].quantity = 0.5;
    option.entries[0].exchange_contributions[0].portions = 0.5;
    fixture.menu.week_plan = { schema_version: 1, days: [{ day: "mon", assignments: [{ meal_time_id: "dinner", option_id: option.id, option_snapshot: option, fixed: false }] }] };
    const enriched = withPatientSubstitutions(fixture.menu, fixture.foods).week_plan!.days[0].assignments[0].option_snapshot;
    render(<PatientPlanPreview value={{ title: "Plan de prueba", patientName: "Paciente de prueba", days: [{ name: "Lunes", meals: [{ name: "Cena", time: "20:00", entries: option.entries, preparation: patientPreparation(enriched) }] }] }} />);
    const card = screen.getByRole("article");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(within(card).getByText("Ingredientes y cantidades")).toBeInTheDocument();
    expect(within(card).getByText("Pan integral")).toBeInTheDocument();
    expect(within(card).getByText("Bebida")).toBeInTheDocument();
    expect(within(card).getByText("Agua natural · vaso de 240 ml")).toBeInTheDocument();
    fireEvent.click(within(card).getByText("Puedes sustituir por"));
    expect(within(card).getByText("Tortilla de maíz")).toBeVisible();
    expect(within(card).getByText("Avena")).toBeVisible();
    expect(within(card).getAllByText("½ taza")).toHaveLength(3);
    expect(card.textContent).not.toContain("cup");
    expect(card.textContent).toContain("en lugar del alimento original");
  });
});
