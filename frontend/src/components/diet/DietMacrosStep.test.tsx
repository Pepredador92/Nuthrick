import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DietMacrosStep } from "./DietMacrosStep";
import type { NutritionPlan } from "@/src/types/domain";
import { createMacroDistribution, patchMacroInput } from "@/src/features/macros/model";
import { supplementItem } from "../../../tests/fixtures/supplements";

const plan: NutritionPlan = {
  id: "plan",
  professional_id: "professional",
  patient_id: "patient",
  consultation_id: "consultation",
  title: "Plan nutricional",
  assigned_at: "2026-09-09",
  review_date: null,
  plan_type: null,
  category: null,
  target_calories: 2000,
  energy_calculation: null,
  macro_distribution: null,
  exchange_prescription: null,
  meal_distribution: null,
  diet_menu: null,
  status: "draft",
  created_at: "2026-09-09T12:00:00Z",
  updated_at: "2026-09-09T12:00:00Z",
};

describe("DietMacrosStep", () => {
  it("starts empty, keeps percentages authoritative, and allows continuation with missing nutrients", () => {
    const onContinue = vi.fn();
    render(
      <DietMacrosStep
        plan={plan}
        targetEnergyKcal={2000}
        energyReferenceWeightKg={80}
        onSave={async () => undefined}
        onDraftChange={() => undefined}
        onGoToEnergy={() => undefined}
        onContinue={onContinue}
      />,
    );

    expect(screen.getByRole("button", { name: "Continuar a equivalentes" })).toBeEnabled();
    expect(screen.getByLabelText("Valor de Carbohidratos")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("Valor de Carbohidratos"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Valor de Proteína"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Valor de Grasas"), { target: { value: "30" } });

    expect(screen.getByText("1,000")).toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: "Continuar a equivalentes" });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("requires a reference weight before g/kg can be selected", () => {
    render(
      <DietMacrosStep
        plan={plan}
        targetEnergyKcal={2000}
        energyReferenceWeightKg={null}
        onSave={async () => undefined}
        onDraftChange={() => undefined}
        onGoToEnergy={() => undefined}
        onContinue={() => undefined}
      />,
    );
    expect(screen.getAllByRole("option", { name: "g/kg" })[0]).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Peso de referencia"), { target: { value: "70" } });
    expect(screen.getAllByRole("option", { name: "g/kg" })[0]).not.toBeDisabled();
  });

  it("keeps mixed capture modes and shows food targets after subtracting supplements", () => {
    let distribution = createMacroDistribution(2000, 80);
    distribution = patchMacroInput(distribution, "CARBOHYDRATE", "percentage", 50);
    distribution = patchMacroInput(distribution, "PROTEIN", "grams_per_kg", 2);
    distribution = patchMacroInput(distribution, "FAT", "grams", 60);
    distribution.supplements = [supplementItem];
    const onDraftChange = vi.fn();
    render(<DietMacrosStep plan={{ ...plan, macro_distribution: distribution }} targetEnergyKcal={2000} energyReferenceWeightKg={80} onSave={async () => undefined} onDraftChange={onDraftChange} onGoToEnergy={vi.fn()} onContinue={vi.fn()} />);
    const table = screen.getByRole("table", { name: "Distribución de la meta diaria" });
    expect(within(table).getByRole("row", { name: "Proteína 135 g 25 g" })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: "Energía 1,880 kcal 120 kcal" })).toBeInTheDocument();
    expect(screen.getByText("Por encima del objetivo")).toHaveTextContent("180 kcal");
    expect(screen.getByRole("button", { name: "Continuar a equivalentes" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Peso de referencia"), { target: { value: "70" } });
    expect(within(table).getByRole("row", { name: "Proteína 115 g 25 g" })).toBeInTheDocument();
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ reference_weight_source: "manual", supplements: [supplementItem] }));
    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(screen.getByLabelText("Peso de referencia")).toHaveValue(80);
    expect(within(table).getByRole("row", { name: "Proteína 135 g 25 g" })).toBeInTheDocument();
  });
});
