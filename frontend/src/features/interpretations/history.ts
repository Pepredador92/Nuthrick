import type { CalculationDefinition } from "@/src/features/calculations/catalog";
import type { CalculationEvaluation } from "@/src/features/calculations/engine";
import type { Interpretation } from "./types";

export type SavedCalculationResult = {
  id: string;
  consultation_id: string;
  calculation_code: string;
  result_key: string;
  method_name: string;
  method_version: string;
  raw_result: number;
  displayed_result: string;
  unit: string;
  input_snapshot: Record<
    string,
    { value: string; source: string; label: string; unit?: string }
  >;
  dependency_snapshot: Record<string, number>;
  result_values: Record<string, number>;
  definition_snapshot: CalculationDefinition;
  interpretation_snapshot: Interpretation | null;
};

/** Saved consultation values and contracts are authoritative until the professional edits. */
export function restoreSavedCalculations(
  evaluations: CalculationEvaluation[],
  saved: SavedCalculationResult[],
): CalculationEvaluation[] {
  const byCode = new Map(evaluations.map((e) => [e.item.code, e]));
  const restored = saved.map((r): CalculationEvaluation => {
    const inputs = r.definition_snapshot.inputs.map((input) => {
      const snapshot = r.input_snapshot[input.key];
      const value = snapshot?.value;
      return {
        ...input,
        available: value !== undefined,
        value:
          value !== undefined && Number.isFinite(Number(value))
            ? Number(value)
            : value,
        unit: snapshot?.unit,
      };
    });
    const current = byCode.get(r.calculation_code);
    return {
      item: {
        code: r.calculation_code,
        name: r.method_name,
        category: current?.item.category ?? "other",
        method_version: r.method_version,
        status: "implemented",
        definition: r.definition_snapshot,
        display_order: current?.item.display_order ?? 999,
      },
      state: "calculated",
      inputState: "complete",
      implementationState: "implemented",
      inputs,
      rawResult: r.raw_result,
      displayedResult: r.displayed_result,
      resultValues: r.result_values,
      availableCount: inputs.length,
      requiredCount: inputs.length,
      availableMeasurementCount: inputs.filter(
        (i) => i.source === "consultation_measurement",
      ).length,
      requiredMeasurementCount: inputs.filter(
        (i) => i.source === "consultation_measurement",
      ).length,
      automaticInputs: inputs.filter(
        (i) => i.source === "patient_record" || i.source === "patient_derived",
      ),
      measurementInputs: inputs.filter(
        (i) => i.source === "consultation_measurement",
      ),
      missingLabels: [],
      missingMeasurementIdsOutsideWorkspace: [],
      dependencyResults: r.dependency_snapshot,
      dependencyLabels: r.definition_snapshot.dependencies,
      dependencyStates: r.definition_snapshot.dependencies.map((code) => ({
        code,
        label:
          saved.find((s) => s.calculation_code === code)?.method_name ?? code,
        implementationState: "implemented",
        inputState: "complete",
        resultAvailable: r.dependency_snapshot[code] !== undefined,
      })),
    };
  });
  const codes = new Set(saved.map((s) => s.calculation_code));
  return [
    ...restored,
    ...evaluations
      .filter((e) => !codes.has(e.item.code))
      .map((e) =>
        e.state === "calculated"
          ? {
              ...e,
              state: "partial" as const,
              rawResult: undefined,
              displayedResult: undefined,
              resultValues: undefined,
            }
          : e,
      ),
  ];
}
