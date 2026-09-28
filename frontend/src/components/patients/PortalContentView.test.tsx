import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PortalContent } from "@/src/services/patientPortal";
import { PortalContentView } from "./PortalContentView";

const content: PortalContent = { goal: "", instructions: "", consultations: [], results: [{
  id: "weight", label: "Peso", unit: "kg", method: "Método clínico privado",
  points: [
    { consultationId: "last", date: "2026-09-20", value: "92" },
    { consultationId: "first", date: "2026-08-01", value: "100" },
  ],
}] };

describe("patient charts and publication preview", () => {
  it("shows only the shared series, charts, neutral changes and chronological value history", () => {
    render(<PortalContentView content={content} section="results" showMethod={false} />);
    expect(screen.getByRole("img", { name: /Gráfica de evolución de Peso/ })).toBeVisible();
    expect(screen.getByText("−8 kg")).toBeVisible();
    expect(screen.queryByText("Método clínico privado")).not.toBeInTheDocument();
    expect(screen.queryByText("IMC")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Ver historial de valores"));
    const rows = within(screen.getByRole("table", { name: "Historial de Peso" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("100 kg");
    expect(rows[2]).toHaveTextContent("92 kg");
  });
  it("lets keyboard/mobile users explore a consultation and supports tapping a chart point", () => {
    const { container } = render(<PortalContentView content={content} section="results" showMethod={false} />);
    const select = screen.getByRole("combobox", { name: "Consulta de Peso" });
    const options = within(select).getAllByRole("option");
    const selected = container.querySelector('[aria-live="polite"]')!;
    expect(selected).toHaveTextContent("92 kg");
    fireEvent.change(select, { target: { value: (options[0] as HTMLOptionElement).value } });
    expect(selected).toHaveTextContent("100 kg");
    fireEvent.pointerDown(container.querySelectorAll('circle[fill="transparent"]')[1]);
    expect(selected).toHaveTextContent("92 kg");
  });
  it("shows the same chart in the professional preview and removes it when no longer shared", () => {
    const { rerender } = render(<PortalContentView content={content} />);
    expect(screen.getByRole("img", { name: /Gráfica de evolución de Peso/ })).toBeVisible();
    expect(screen.getByText("Método: Método clínico privado")).toBeVisible();
    rerender(<PortalContentView content={{ ...content, results: [] }} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("Peso")).not.toBeInTheDocument();
    expect(screen.getByText("Tus resultados aparecerán cuando tu nutriólogo los comparta.")).toBeVisible();
  });
  it("shows a starting point for one measurement and retains textual results without a false chart", () => {
    render(<PortalContentView content={{ ...content, results: [
      { ...content.results[0], points: content.results[0].points.slice(0, 1) },
      { id: "text", label: "Observación", method: "", unit: "", points: [{ consultationId: "first", date: "2026-08-01", value: "Estable" }] },
    ] }} section="results" showMethod={false} />);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByText(/Tu punto de partida/)).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Observación" })).queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Estable", { selector: ".portal-result-value" })).toBeVisible();
  });
  it("expresses percentage changes as percentage points without assigning a clinical judgment", () => {
    render(<PortalContentView content={{ ...content, results: [{ ...content.results[0], label: "Grasa corporal", unit: "%", points: [
      { consultationId: "first", date: "2026-08-01", value: "30" },
      { consultationId: "last", date: "2026-09-20", value: "28" },
    ] }] }} section="results" showMethod={false} />);
    expect(screen.getByText("−2 puntos porcentuales")).toBeVisible();
    expect(screen.queryByText(/saludable|normal|mejoraste/i)).not.toBeInTheDocument();
  });
  it("does not repeat the unit when it is already present in the published value", () => {
    render(<PortalContentView content={{ ...content, results: [{ ...content.results[0], points: [{ consultationId: "last", date: "2026-09-20", value: "87,4 kg" }] }] }} section="results" showMethod={false} />);
    expect(screen.getByText("87,4 kg", { selector: ".portal-result-value" })).toBeVisible();
    expect(screen.queryByText(/kg kg/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Gráfica de evolución de Peso/ })).toBeVisible();
  });
});
