import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortalContent, SharedResult } from "@/src/services/patientPortal";
import { somatoProjection } from "@/src/features/evolution/somatochart";
import { PortalContentView } from "./PortalContentView";

const somato: SharedResult = { id: "calculation:somatochart_coordinates:somatochart_coordinates:Heath-Carter:2:coordenadas", label: "Coordenadas de somatocarta", unit: "coordenadas", method: "Heath-Carter · v2", points: [
  { consultationId: "last", date: "2026-09-20", value: "X: -0.8 · Y: 2.7" },
  { consultationId: "first", date: "2026-08-01", value: "X: -1.2 · Y: 3.4" },
] };
const content = (result = somato): PortalContent => ({ goal: "", instructions: "", consultations: [], results: [result] });

describe("patient somatochart", () => {
  it("uses the clinical chart projection and displays numbered historical points without formulas", () => {
    const { container } = render(<PortalContentView content={content()} section="results" showMethod={false} />);
    const svg = screen.getByRole("img", { name: "Somatocarta de evolución Heath-Carter" });
    expect(within(svg).getByText("Endomorfia")).toBeInTheDocument();
    expect(within(svg).getByText("Mesomorfia")).toBeInTheDocument();
    expect(within(svg).getByText("Ectomorfia")).toBeInTheDocument();
    const projection = somatoProjection([{ x: -1.2, y: 3.4 }, { x: -0.8, y: 2.7 }], 400, 350, 26);
    const targets = svg.querySelectorAll('circle[fill="transparent"]');
    expect(Number(targets[0].getAttribute("cx"))).toBeCloseTo(projection.x(-1.2));
    expect(Number(targets[0].getAttribute("cy"))).toBeCloseTo(projection.y(3.4));
    expect(Number(targets[1].getAttribute("cx"))).toBeCloseTo(projection.x(-0.8));
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent("20 sep 2026");
    expect(screen.queryByText(/X:|2 ×|Método:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Gráfica de evolución de Coordenadas/ })).not.toBeInTheDocument();
  });
  it("supports date selection with keyboard/mobile controls and tapping the point", () => {
    const { container } = render(<PortalContentView content={content()} section="results" showMethod={false} />);
    const select = screen.getByRole("combobox", { name: "Consulta de la somatocarta" });
    const options = within(select).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Consulta 1 · 1 ago 2026");
    expect(options[1]).toHaveTextContent("Consulta 2 · 20 sep 2026");
    fireEvent.change(select, { target: { value: (options[0] as HTMLOptionElement).value } });
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent("1 ago 2026");
    fireEvent.pointerDown(container.querySelector('circle[fill="transparent"]')!);
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent("20 sep 2026");
  });
  it("renders one point and keeps incomplete records visible in history without plotting a scalar X", () => {
    render(<PortalContentView content={content({ ...somato, points: [somato.points[0], { ...somato.points[1], value: "-1.2" }] })} section="results" showMethod={false} />);
    expect(screen.getByRole("img")).toBeVisible();
    expect(screen.getByText(/Este es tu primer punto disponible/)).toBeVisible();
    fireEvent.click(screen.getByText("Ver consultas de la somatocarta"));
    const rows = within(screen.getByRole("table", { name: "Historial de la somatocarta" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("No disponible");
    expect(rows[2]).toHaveTextContent("2");
  });
  it("keeps coinciding consultation points selectable", () => {
    const { container } = render(<PortalContentView content={content({ ...somato, points: somato.points.map((point) => ({ ...point, value: "X: 0 · Y: 0" })) })} section="results" showMethod={false} />);
    expect(container.querySelectorAll('circle[fill="transparent"]')).toHaveLength(2);
    const select = screen.getByRole("combobox", { name: "Consulta de la somatocarta" });
    fireEvent.change(select, { target: { value: (within(select).getAllByRole("option")[0] as HTMLOptionElement).value } });
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent("1 ago 2026");
  });
  it("shows the publication preview and removes the chart when it is no longer shared", () => {
    const { rerender } = render(<PortalContentView content={content()} />);
    expect(screen.getByRole("img")).toBeVisible();
    expect(screen.getByText("Método: Heath-Carter · v2")).toBeVisible();
    rerender(<PortalContentView content={{ ...content(), results: [] }} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("shows a clear empty state when only a scalar was published", () => {
    render(<PortalContentView content={content({ ...somato, points: [{ ...somato.points[0], value: "-0.8" }] })} section="results" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/vuelve a publicar este resultado/)).toBeVisible();
  });
});
