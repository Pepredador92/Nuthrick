import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SomatochartCard } from "./EvolutionCharts";
import type { LongitudinalSeries } from "@/src/features/evolution/longitudinal";

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
    expect(screen.getByText("20-sep")).toBeInTheDocument();
    expect(screen.getByText("X -0.8 · Y 2.7")).toBeInTheDocument();
  });
});
