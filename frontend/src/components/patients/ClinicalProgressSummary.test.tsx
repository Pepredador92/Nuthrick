import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClinicalProgressSummary } from "./ClinicalProgressSummary";
import { classificationSummary, historicalClassification } from "@/src/features/evolution/clinicalSummary";
import references from "@/src/features/interpretations/references.json";
import type { Interpretation } from "@/src/features/interpretations/types";
import type { LongitudinalSeries } from "@/src/features/evolution/longitudinal";
const reference = references.find((item) => item.resultCode === "bmi")!;
const interpretation = { state: "classified", resultCode: "bmi", unit: "kg/m²", consultationId: "one", interpretedAt: "2026-09-01T12:00:00Z", reason: "", candidates: [], value: 27, rule: reference.rules.find((rule) => rule.lower === 25)!, reference, context: { age: 30, pregnant: false } } as Interpretation;
const series: LongitudinalSeries = { id: "bmi", label: "IMC", concept: "IMC", conceptCode: "bmi", category: "calculations", unit: "kg/m²", sourceType: "calculation", method: "IMC", provenance: null, graphable: true, points: [{ consultation_id: "one", consultation_date: "2026-09-01T12:00:00Z", raw_value: 27, display_value: "27", unit: "kg/m²", source_reference: {}, interpretation }] };
describe("clinical progress summary", () => {
  it("uses the stored classification and its reference for the scale and history", () => {
    render(<ClinicalProgressSummary series={[series]} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(`IMC: 27; ${interpretation.rule!.label}`);
    expect(screen.getByText(/Clasificación registrada/)).toHaveTextContent("Organización Mundial de la Salud");
    const scale = historicalClassification(series.points[0])!;
    expect(scale.reference).toBe(reference);
    const matchedBand = scale.bands.find((band) => band.rule.id === interpretation.rule!.id)!;
    expect(scale.marker).toBeGreaterThanOrEqual(matchedBand.left);
    expect(scale.marker).toBeLessThan(matchedBand.left + matchedBand.width);
  });
  it("shows body fat without inventing a classification or reference weight", () => {
    render(<ClinicalProgressSummary series={[{ ...series, id: "fat", label: "Grasa corporal", conceptCode: "body_fat_percentage", unit: "%", points: [{ ...series.points[0], interpretation: null, unit: "%" }] }]} />);
    expect(screen.getByText("27 %")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/Peso de referencia/)).not.toBeInTheDocument();
  });
  it("keeps a dated historical scale when the latest visit lacks classification context", () => {
    const pending = { ...series.points[0], consultation_id: "two", consultation_date: "2026-09-15T12:00:00Z", raw_value: 26, display_value: "26", interpretation: { ...interpretation, state: "missing_context", value: 26, rule: null, reason: "Falta: situación de gestación.", context: { age: 30, pregnant: null } } } as LongitudinalSeries["points"][number];
    const withPending = { ...series, points: [...series.points, pending] };
    render(<ClinicalProgressSummary series={[withPending]} />);
    expect(screen.getByText("26 kg/m²")).toBeInTheDocument();
    expect(screen.getByText(/Sin clasificación en esta consulta/)).toHaveTextContent("Falta: situación de gestación.");
    expect(screen.getByText(/Última clasificación registrada/)).toHaveTextContent(/1 sept? 2026 · 27 kg\/m²/);
    expect(screen.getByRole("img")).toHaveAccessibleName(/IMC: 27; Sobrepeso \/ preobesidad; última clasificación registrada el 1 sept? 2026/);
    const summary = classificationSummary(withPending, [withPending]);
    expect(summary.current?.classification).toBeNull();
    expect(summary.displayed?.point).toBe(series.points[0]);
    expect(summary.isHistorical).toBe(true);
    expect(pending.interpretation?.context.pregnant).toBeNull();
  });
  it("explains missing context without drawing a scale when no visit is classified", () => {
    const missing = { ...series, points: [{ ...series.points[0], interpretation: { ...interpretation, state: "missing_context", rule: null, reason: "Falta: situación de gestación.", context: { age: 30, pregnant: null } } }] } as LongitudinalSeries;
    render(<ClinicalProgressSummary series={[missing]} />);
    expect(screen.getByText(/Sin clasificación en esta consulta/)).toHaveTextContent("Falta: situación de gestación.");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/Última clasificación registrada/)).not.toBeInTheDocument();
  });
  it("compares only a recorded reference linked to the same visit", () => {
    render(<ClinicalProgressSummary series={[{ ...series, id: "weight", label: "Peso", conceptCode: "weight", points: [{ ...series.points[0], raw_value: 80, display_value: "80", unit: "kg", interpretation: null, referenceWeight: { value: 65, method: "Registrado por el profesional" } }] }]} />);
    expect(screen.getByText("Peso de referencia registrado: 65 kg")).toBeInTheDocument();
    expect(screen.getByText("Peso actual: 80 kg")).toBeInTheDocument();
  });
});
