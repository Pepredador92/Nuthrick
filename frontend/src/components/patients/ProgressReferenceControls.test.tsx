import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressReferenceControls } from "./ProgressReferenceControls";
import { ClinicalProgressSummary } from "./ClinicalProgressSummary";
import { interpretResult } from "@/src/features/interpretations/engine";
import { emptyProgressReferences } from "@/src/features/evolution/progressReferences";
import type { LongitudinalSeries } from "@/src/features/evolution/longitudinal";
const series = [{ id: "fat", category: "bioimpedance", concept: "Grasa", sourceType: "bioimpedance_device", method: null, provenance: null, graphable: true, label: "Grasa · equipo A", conceptCode: "body_fat_percentage_device", unit: "%", points: [{ consultation_id: "a", consultation_date: "2026-09-01", raw_value: 30, display_value: "30", unit: "%", source_reference: {}, interpretation: interpretResult("body_fat_percentage", 30, "%", { age: 30, sex: "female", pregnant: false, bmi: 27 }, [], "a"), heightCm: 170 }] }] as LongitudinalSeries[];
describe("progress reference controls", () => {
  it("normalizes target decimals and reflects changes from the shared report options", () => {
    const entries = [{ ...series[0], id: "weight", conceptCode: "weight", label: "Peso", unit: "kg" }];
    function Example() {
      const [value, onChange] = useState(emptyProgressReferences);
      return <><ProgressReferenceControls series={entries} value={value} onChange={onChange}/><output>{value.targetBmi}</output><button onClick={() => onChange({ ...value, targetBmi: 24 })}>Cambiar desde exportación</button></>;
    }
    render(<Example/>);
    const input = screen.getByLabelText("IMC objetivo individual (opcional)");
    fireEvent.change(input, { target: { value: "22,5" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("22.5");
    expect(screen.getByRole("status")).toHaveTextContent("22.5");
    fireEvent.click(screen.getByText("Cambiar desde exportación"));
    expect(input).toHaveValue("24");
    fireEvent.change(input, { target: { value: "inválido" } });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
  it("applies and removes the optional reference in the observable summary", () => {
    function Example() {
      const [value, onChange] = useState(emptyProgressReferences);
      return <><ProgressReferenceControls series={series} value={value} onChange={onChange}/><ClinicalProgressSummary series={series} references={value}/></>;
    }
    render(<Example/>);
    fireEvent.click(screen.getByText("Referencias para esta comparación y el PDF"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Aplicar Gallagher a Grasa · equipo A" }));
    expect(screen.getByRole("img")).toHaveAccessibleName(/Dentro de referencia/);
    expect(screen.getByText(/Comparación orientativa del informe/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
