import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DietMacrosStep } from "./DietMacrosStep";
import type { NutritionPlan } from "@/src/types/domain";

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
  status: "draft",
  created_at: "2026-09-09T12:00:00Z",
  updated_at: "2026-09-09T12:00:00Z",
};

describe("DietMacrosStep", () => {
  it("starts empty, keeps percentages authoritative, and only enables continuation when it closes", () => {
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
});
