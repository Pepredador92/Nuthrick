import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientEvolutionCharts, SomatochartCard } from "./EvolutionCharts";
import type { LongitudinalSeries } from "@/src/features/evolution/longitudinal";

const api = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/src/services/longitudinalHistory", () => ({ loadLongitudinalHistory: api.load }));
beforeEach(() => vi.clearAllMocks());

const series: LongitudinalSeries = {
  id: "somatochart",
  label: "Somatocarta",
  category: "calculations",
  concept: "Somatocarta",
  unit: "coordenadas",
  sourceType: "calculation",
  method: "Heath-Carter",
  provenance: "Heath-Carter · v2",
  visualization: "somatochart",
  graphable: true,
  points: [
    {
      consultation_id: "one",
      consultation_date: "2026-09-01T12:00:00Z",
      raw_value: -1.2,
      display_value: "-1.2",
      unit: "coordenadas",
      source_reference: {},
      coordinates: { x: -1.2, y: 3.4 },
    },
    {
      consultation_id: "two",
      consultation_date: "2026-09-20T12:00:00Z",
      raw_value: -0.8,
      display_value: "-0.8",
      unit: "coordenadas",
      source_reference: {},
      coordinates: { x: -0.8, y: 2.7 },
    },
  ],
};

describe("SomatochartCard", () => {
  it("shows the three visual regions and keeps persisted coordinates visible", () => {
    render(<SomatochartCard series={series} />);

    expect(screen.getByRole("img", { name: "Somatocarta de evolución Heath-Carter" })).toBeInTheDocument();
    expect(screen.getByText("ENDOMORFIA")).toBeInTheDocument();
    expect(screen.getByText("MESOMORFIA")).toBeInTheDocument();
    expect(screen.getByText("ECTOMORFIA")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Regiones de la somatocarta" })).toHaveTextContent("Adiposidad relativa");
    expect(screen.getByRole("list", { name: "Consultas de la somatocarta" })).toHaveTextContent("2026");
    expect(screen.getAllByText("X -0.8 · Y 2.7")[0]).toBeInTheDocument();
  });
});

describe("patient evolution gallery", () => {
  it("shows every stored series, with search and category filters", async () => {
    const entries = Array.from({ length: 6 }, (_, index) => ({ ...series, id: String(index), label: `Medición ${index + 1}`, visualization: "line", category: index === 5 ? "bioimpedance" : "measurements", points: series.points.map((point) => ({ ...point, raw_value: 70, display_value: "70", unit: "kg" })) }));
    api.load.mockResolvedValue({ consultations: [], series: entries });
    render(<PatientEvolutionCharts patientId="patient" onOpenEvolution={vi.fn()} />);
    expect(await screen.findByText(/6 gráficas disponibles/)).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(6);
    fireEvent.change(screen.getByLabelText("Tipo de registro"), { target: { value: "bioimpedance" } });
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img")).toHaveAccessibleName("Gráfica de evolución de Medición 6");
    fireEvent.change(screen.getByLabelText("Tipo de registro"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Buscar una gráfica"), { target: { value: "Medición 4" } });
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });
});
