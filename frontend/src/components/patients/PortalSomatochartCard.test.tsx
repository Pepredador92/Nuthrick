import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortalContent, SharedResult } from "@/src/services/patientPortal";
import { PortalContentView } from "./PortalContentView";

const somato: SharedResult = {
  id: "calculation:somatochart_coordinates:somatochart_coordinates:Heath-Carter:2:coordenadas",
  label: "Coordenadas de somatocarta",
  unit: "coordenadas",
  method: "Heath-Carter · v2",
  points: [
    { consultationId: "last", date: "2026-09-20", value: "X: -0.8 · Y: 2.7" },
    { consultationId: "first", date: "2026-08-01", value: "X: -1.2 · Y: 3.4" },
  ],
};

const content = (result = somato): PortalContent => ({
  goal: "",
  instructions: "",
  consultations: [],
  results: [result],
});

describe("patient somatochart", () => {
  it("reuses the professional profile chart with patient-safe content", () => {
    render(<PortalContentView content={content()} section="results" showMethod={false} />);

    const svg = screen.getByRole("img", { name: "Somatocarta de evolución Heath-Carter" });
    expect(svg).toHaveAttribute("viewBox", "0 0 560 400");
    expect(svg.textContent).toContain("MESOMORFIA");
    expect(svg.textContent).toContain("ENDOMORFIA");
    expect(svg.textContent).toContain("ECTOMORFIA");
    expect(screen.getByRole("list", { name: "Consultas de la somatocarta" })).toHaveTextContent("ago 2026");
    expect(screen.getByRole("list", { name: "Consultas de la somatocarta" })).toHaveTextContent("sep 2026");
    expect(screen.queryByText(/Método:/)).not.toBeInTheDocument();
    expect(svg.textContent).not.toContain("X = ectomorfia");
    expect(svg.textContent).not.toContain("X -0.8");
    expect(screen.queryByText(/Coordenadas Heath-Carter guardadas/)).not.toBeInTheDocument();
  });

  it("keeps the historical points in chronological order and numbers them", () => {
    render(<PortalContentView content={content()} section="results" showMethod={false} />);

    const history = screen.getByRole("list", { name: "Consultas de la somatocarta" });
    const items = Array.from(history.querySelectorAll("li"));
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1");
    expect(items[0]).toHaveTextContent("ago 2026");
    expect(items[1]).toHaveTextContent("2");
    expect(items[1]).toHaveTextContent("sep 2026");
  });

  it("renders a single valid point and gives a clear state when no coordinate pair is available", () => {
    const { rerender } = render(
      <PortalContentView
        content={content({ ...somato, points: [somato.points[0], { ...somato.points[1], value: "-1.2" }] })}
        section="results"
        showMethod={false}
      />,
    );
    expect(screen.getByRole("img", { name: "Somatocarta de evolución Heath-Carter" })).toBeVisible();
    expect(screen.getByRole("list", { name: "Consultas de la somatocarta" })).toHaveTextContent("sep 2026");
    expect(screen.getByRole("list", { name: "Consultas de la somatocarta" })).not.toHaveTextContent("ago 2026");

    rerender(
      <PortalContentView
        content={content({ ...somato, points: [{ ...somato.points[0], value: "-0.8" }] })}
        section="results"
        showMethod={false}
      />
    );
    expect(screen.queryByRole("img", { name: "Somatocarta de evolución Heath-Carter" })).not.toBeInTheDocument();
    expect(screen.getByText(/dos coordenadas y una fecha válida/)).toBeVisible();
  });

  it("keeps the professional metadata in the owner preview only", () => {
    render(<PortalContentView content={content()} section="results" showMethod />);

    expect(screen.getByText("Datos calculados")).toBeVisible();
    expect(screen.getByText(/coordenadas · Heath-Carter · v2/)).toBeVisible();
    expect(screen.getByText(/Coordenadas Heath-Carter guardadas/)).toBeVisible();
  });
});
