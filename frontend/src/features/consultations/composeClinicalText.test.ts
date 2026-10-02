import { describe, expect, it } from "vitest";
import {
  appendComposedText,
  composeInterviewDraft,
  composePatientInstructions,
} from "./composeClinicalText";

describe("clinical text composition", () => {
  it("organizes only recorded interview answers without interpreting them", () => {
    expect(
      composeInterviewDraft("indicator_progress", {
        changes_since_last: "Caminó tres días",
        progress_perception: "Más energía",
        symptoms_changes: "",
        indicators_reviewed: ["energía", "glucosa"],
        medical_history_status: "Sin cambios",
      }),
    ).toBe(
      "En el seguimiento se registró lo siguiente:\n• Cambios desde la consulta anterior: Caminó tres días\n• Progreso referido: Más energía\n• Indicadores revisados: energía; glucosa",
    );
  });

  it("leaves a draft empty when there is no source data", () => {
    expect(composeInterviewDraft("first_actions", {})).toBe("");
  });

  it("organizes patient instructions from professional-entered values only", () => {
    expect(
      composePatientInstructions({
        action: "Incluye una colación por la tarde.",
        timing: "En los días con jornada larga",
        alternative: "Puedes llevar una fruta.",
        review: "Hablaremos de qué opción te resultó más práctica.",
      }),
    ).toBe(
      "Tus indicaciones\n• Qué harás: Incluye una colación por la tarde.\n• Cuándo: En los días con jornada larga\n• Si se te complica: Puedes llevar una fruta.\n• En la próxima consulta: Hablaremos de qué opción te resultó más práctica.",
    );
  });

  it("preserves existing notes and does not append a duplicate", () => {
    expect(appendComposedText("Nota previa", "Plan acordado")).toBe(
      "Nota previa\n\nPlan acordado",
    );
    expect(appendComposedText("Plan acordado", "plan acordado")).toBe(
      "Plan acordado",
    );
  });
});
