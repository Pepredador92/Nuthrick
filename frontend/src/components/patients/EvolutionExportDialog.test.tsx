import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvolutionExportDialog } from "./EvolutionExportDialog";
const api = vi.hoisted(() => ({ pdf: vi.fn(), entitlement: vi.fn() }));
vi.mock("@/src/features/admin/api", () => ({ requireEntitlement: api.entitlement }));
vi.mock("@/src/features/evolution/exportEvolution", async (original) => ({ ...await original<object>(), downloadEvolutionPdf: api.pdf }));
vi.mock("@/src/services/longitudinalHistory", () => ({ loadLongitudinalHistory: async () => ({ consultations: [], series: Array.from({ length: 7 }, (_, index) => ({ id: `s${index}`, label: `Medición ${index + 1}`, category: "measurements", concept: "Medición", unit: "cm", sourceType: "manual_measurement", method: null, provenance: null, graphable: true, points: [{ consultation_id: "c1", consultation_date: "2026-09-01", raw_value: 10 + index, display_value: String(10 + index), unit: "cm", source_reference: {} }] })) }) }));
beforeEach(() => { vi.clearAllMocks(); api.pdf.mockResolvedValue(undefined); api.entitlement.mockResolvedValue(undefined); });
describe("evolution export selection", () => {
  it("passes all selected IDs and the approved comparison settings to the PDF", async () => {
    const references = { targetBmi: 22.5, gallagherSeriesIds: [] };
    const patient = { id: "patient", full_name: "Demostración", birth_date: "1992-06-10" };
    const professional = { fullName: "Profesional", logoUrl: "https://example.com/logo.png" };
    render(<EvolutionExportDialog patient={patient as never} onClose={vi.fn()} getProfessionalInfo={async () => professional} references={references}/>);
    await screen.findByText("7 gráficas seleccionadas");
    fireEvent.click(screen.getByRole("checkbox", { name: /Medición 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Exportar PDF" }));
    await waitFor(() => expect(api.pdf).toHaveBeenCalledOnce());
    expect(api.pdf.mock.calls[0][3]).toEqual({ seriesIds: ["s0", "s2", "s3", "s4", "s5", "s6"], references });
    expect(api.pdf.mock.calls[0][1]).toEqual(patient);
    expect(api.pdf.mock.calls[0][4]).toEqual(professional);
    expect(api.entitlement).toHaveBeenCalledWith("exports.advanced");
  });
  it("reports export errors and lets the professional retry", async () => {
    api.pdf.mockRejectedValue(new Error("No se pudo generar el documento."));
    render(<EvolutionExportDialog patient={{ id: "patient", full_name: "Demostración" } as never} onClose={vi.fn()} getProfessionalInfo={async () => ({ fullName: "Profesional" })}/>);
    await screen.findByText("7 gráficas seleccionadas");
    fireEvent.click(screen.getByRole("button", { name: "Exportar PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo generar el documento.");
    expect(screen.getByRole("button", { name: "Exportar PDF" })).toBeEnabled();
  });
});
