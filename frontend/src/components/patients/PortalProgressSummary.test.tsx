import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortalContent, SharedResult } from "@/src/services/patientPortal";
import { PortalContentView } from "./PortalContentView";

const bmi: SharedResult = {
  id: "bmi",
  label: "Índice de masa corporal · IMC",
  unit: "kg/m²",
  method: "IMC",
  conceptCode: "bmi",
  points: [
    { consultationId: "first", date: "2026-07-18", value: "36.8", classificationLabel: "Obesidad grado II" },
    { consultationId: "last", date: "2026-08-01", value: "33.9", classificationLabel: "Obesidad grado I" },
  ],
  presentation: {
    classification: {
      label: "Obesidad grado I",
      origin: "Clasificación registrada",
      source: "Organización Mundial de la Salud · 2000",
      consultationId: "last",
      marker: 68,
      low: 10,
      high: 45,
      rules: [
        { id: "low", label: "Bajo peso", lower: null, upper: 18.5 },
        { id: "normal", label: "Peso normal", lower: 18.5, upper: 25 },
        { id: "over", label: "Sobrepeso / preobesidad", lower: 25, upper: 30 },
        { id: "one", label: "Obesidad grado I", lower: 30, upper: 35 },
        { id: "two", label: "Obesidad grado II", lower: 35, upper: 40 },
        { id: "three", label: "Obesidad grado III", lower: 40, upper: null },
      ],
    },
  },
};

const weight: SharedResult = {
  id: "weight",
  label: "Peso",
  unit: "kg",
  method: "Medición antropométrica",
  conceptCode: "weight",
  points: [
    { consultationId: "first", date: "2026-07-18", value: "100.2" },
    { consultationId: "last", date: "2026-08-01", value: "92.2" },
  ],
  presentation: {
    weightReference: {
      interval: { lower: 50.4, upper: 68.1, heightCm: 165 },
      recorded: { value: 68, method: "Registrado por el profesional" },
    },
  },
};

const content: PortalContent = { goal: "", instructions: "", consultations: [], results: [weight, bmi] };

describe("portal progress summary", () => {
  it("includes the weight reference card and the BMI classification card", () => {
    render(<PortalContentView content={content} section="results" showMethod />);

    expect(screen.getByRole("region", { name: "Resumen de composición corporal" })).toBeVisible();
    expect(screen.getByText("Tu evolución")).toBeVisible();
    expect(screen.getByText(/Intervalo por IMC adulto:/)).toHaveTextContent("50.4 a menos de 68.1 kg");
    expect(screen.getByText(/Talla registrada:/)).toHaveTextContent("165 cm · IMC 18.5 a <25 · OMS");
    expect(screen.getByRole("img", { name: /Índice de masa corporal · IMC: 33.9; Obesidad grado I/ })).toBeVisible();
    expect(screen.getAllByText("Obesidad grado I").length).toBeGreaterThan(0);
    expect(screen.getByText(/Clasificación registrada/)).toHaveTextContent("Organización Mundial de la Salud");
    expect(screen.getAllByText(/Historial · 2 consultas/)).toHaveLength(2);
  });

  it("does not expose reference methods or sources in the patient view", () => {
    render(<PortalContentView content={content} section="results" showMethod={false} />);

    expect(screen.queryByText(/Organización Mundial de la Salud/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Método registrado/)).not.toBeInTheDocument();
    expect(screen.queryByText(/· OMS/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Obesidad grado I").length).toBeGreaterThan(0);
  });
});
