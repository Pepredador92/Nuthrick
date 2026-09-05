import React from "react";
import { createRoot } from "react-dom/client";
import { CalculationCatalog } from "../../src/components/consultations/CalculationCatalog";
import {
  extendInterpretationContext,
  interpretResult,
} from "../../src/features/interpretations/engine";
import references from "../../src/features/interpretations/references.json";
import type { InterpretationReference } from "../../src/features/interpretations/types";
import type { CalculationEvaluation } from "../../src/features/calculations/engine";
import "./style.css";

// Synthetic values only. This harness imports the real result UI and interpretation engine.
const rows = [
  ["bmi", "IMC", "index", 27.8, "kg/m²", "27.8"],
  ["waist_hip_ratio", "Índice cintura-cadera", "index", 0.92, "razón", "0.92"],
  ["waist_height_ratio", "Índice cintura-talla", "index", 0.52, "razón", "0.52"],
  ["body_fat_jp7_siri", "Jackson & Pollock 7 + Siri", "body_fat", 20.9, "%", "20.9"],
  ["body_fat_jp3_siri", "Jackson & Pollock 3 + Siri", "body_fat", 15.5, "%", "15.5"],
  ["density_jackson_pollock_7", "Jackson & Pollock 7", "density", 1.05117, "g/cm³", "1.05117"],
  ["somatotype_endomorphy", "Endomorfia · Heath-Carter", "somatotype", 3, "componente", "3.0"],
  ["somatotype_mesomorphy", "Mesomorfia · Heath-Carter", "somatotype", 5, "componente", "5.0"],
  ["somatotype_ectomorphy", "Ectomorfia · Heath-Carter", "somatotype", 1, "componente", "1.0"],
  ["somatochart_coordinates", "Coordenadas de somatocarta · Heath-Carter", "somatotype", -2, "coordenadas", "X -2.0 · Y 6.0"],
] as const;

const somatotypeDependencies = {
  somatotype_endomorphy: 3,
  somatotype_mesomorphy: 5,
  somatotype_ectomorphy: 1,
};
const evaluations: CalculationEvaluation[] = rows.map(
  ([code, name, category, value, unit, displayedResult]) => ({
    item: {
      code,
      name,
      category,
      method_version: "1.0.0",
      status: "implemented",
      display_order: 1,
      definition: {
        catalogVersion: 1,
        resultKey: code,
        resultName:
          code === "density_jackson_pollock_7" ? "Densidad corporal" : name,
        methodName: name,
        summary: "Datos sintéticos para comprobar la presentación.",
        unit,
        decimalPlaces: 2,
        inputs: [],
        dependencies:
          code === "somatochart_coordinates"
            ? Object.keys(somatotypeDependencies)
            : [],
        references: [],
        limitations: "Ejemplo de verificación visual.",
      },
    },
    state: "calculated",
    inputState: "complete",
    implementationState: "implemented",
    inputs: [],
    automaticInputs: [],
    measurementInputs: [],
    rawResult: value,
    displayedResult,
    resultValues:
      code === "somatochart_coordinates" ? { x: -2, y: 6 } : undefined,
    availableCount: 0,
    requiredCount: 0,
    availableMeasurementCount: 0,
    requiredMeasurementCount: 0,
    missingLabels: [],
    missingMeasurementIdsOutsideWorkspace: [],
    dependencyResults:
      code === "somatochart_coordinates" ? somatotypeDependencies : {},
    dependencyLabels: [],
    dependencyStates: [],
  }),
);
const baseContext = {
  age: 34,
  sex: "male",
  pregnant: false,
  bmi: 27.8,
};
const interpretations = Object.fromEntries(
  evaluations.map((evaluation) => [
    evaluation.item.code,
    interpretResult(
      evaluation.item.code,
      evaluation.rawResult!,
      evaluation.item.definition.unit,
      extendInterpretationContext(baseContext, evaluation.dependencyResults),
      references as InterpretationReference[],
      "synthetic",
    ),
  ]),
);
createRoot(document.getElementById("root")!).render(
  <main style={{ maxWidth: 1100, margin: "auto", padding: 16 }}>
    <CalculationCatalog
      evaluations={evaluations}
      interpretations={interpretations}
      adding={false}
      onAddMissing={() => {}}
    />
  </main>,
);
