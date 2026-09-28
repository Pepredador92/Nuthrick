import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PortalHomeSummary } from "./PortalHomeSummary";
import { portalAction } from "@/src/services/patientPortal";

vi.mock("@/src/services/patientPortal", () => ({
  portalAction: vi.fn(),
}));

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-25T18:00:00Z"));
  vi.mocked(portalAction).mockResolvedValue({
    plan: {
      title: "Plan publicado",
      versionNumber: 2,
      publishedAt: "2026-09-20T12:00:00Z",
      days: [{
        name: "Viernes",
        meals: [{
          name: "Desayuno",
          time: "08:00",
          title: "Avena con fruta",
          ingredients: [{ name: "Avena", amount: 1, unit: "taza", alternatives: [] }],
          instructions: [],
        }],
      }],
    },
  });
});

describe("PortalHomeSummary", () => {
  it("shows an actionable patient summary without clinical calculation metadata", async () => {
    const onOpenTab = vi.fn();
    render(<PortalHomeSummary access={{ session: "session" }} view={{
      patientName: "Paciente",
      professional: { name: "Profesional", title: null },
      shared: { goal: "Sentirme mejor", instructions: "Toma agua", results: [{ id: "weight", label: "Peso", unit: "kg", method: "Fórmula interna", points: [{ consultationId: "c1", date: "2026-09-20", value: "70" }] }], consultations: [] },
      revision: 1,
      publishedAt: "2026-09-20T12:00:00Z",
      unread: 1,
    }} onOpenTab={onOpenTab} />);

    expect(await screen.findByText("Avena con fruta")).toBeVisible();
    expect(screen.getByText("Sentirme mejor")).toBeVisible();
    expect(screen.getByText("Tienes 1 mensaje nuevo de tu nutriólogo.")).toBeVisible();
    expect(screen.queryByText("Fórmula interna")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Gráfica de evolución de Peso/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Ver todas mis gráficas" }));
    expect(onOpenTab).toHaveBeenCalledWith("results");
  });
  it("features a published somatochart in the patient guide", async () => {
    render(<PortalHomeSummary access={{ session: "session" }} view={{
      patientName: "Paciente", professional: { name: "Profesional", title: null }, revision: 1, publishedAt: null, unread: 0,
      shared: { goal: "", instructions: "", consultations: [], results: [{ id: "calculation:somatochart_coordinates:somatochart_coordinates:Heath-Carter:2:coordenadas", label: "Coordenadas de somatocarta", unit: "coordenadas", method: "Heath-Carter", points: [{ consultationId: "c1", date: "2026-09-20", value: "X: -1.2 · Y: 3.4" }] }] },
    }} onOpenTab={vi.fn()} />);
    expect(await screen.findByText("Avena con fruta")).toBeVisible();
    expect(screen.getByRole("img", { name: "Somatocarta de evolución Heath-Carter" })).toBeVisible();
    expect(screen.queryByText("Método: Heath-Carter")).not.toBeInTheDocument();
  });
});
