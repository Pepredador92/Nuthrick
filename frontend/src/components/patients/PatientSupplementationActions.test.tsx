import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, expect, it, vi } from "vitest";
import { supplementProduct } from "../../../tests/fixtures/supplements";
import type { Consultation } from "@/src/types/domain";
import { PatientSupplementationActions } from "./PatientSupplementationActions";

const mocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), pdf: vi.fn(), products: vi.fn() }));
vi.mock("@/src/services/patientSupplementation", () => ({
  listPatientSupplementation: mocks.list, savePatientSupplementation: mocks.save,
}));
vi.mock("@/src/services/supplements", () => ({
  listSupplements: mocks.products, saveCustomSupplement: vi.fn(), archiveCustomSupplement: vi.fn(),
}));
vi.mock("@/src/features/supplements/exportSupplementation", () => ({ downloadSupplementationPdf: mocks.pdf }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

it("creates an independent prescription, links it to a visit and offers its PDF", async () => {
  mocks.products.mockResolvedValue([supplementProduct]);
  const patient = { id: "patient", professional_id: "professional", full_name: "Paciente de prueba" };
  const consultations = [{ id: "visit", consultation_type: "initial", consultation_date: "2026-11-20" }] as Consultation[];
  mocks.list.mockResolvedValue([]);
  mocks.save.mockImplementation(async (patientId, id, items, tags, consultationId) => {
    const record = { id, patient_id: patientId, items, tags, consultation_id: consultationId, created_at: "2026-11-25", updated_at: "2026-11-25" };
    mocks.list.mockResolvedValue([record]);
    return record;
  });
  const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
  const change = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
  function Supplementation() {
    const [inHistory, setInHistory] = useState(false);
    return inHistory ? <PatientSupplementationActions patient={patient} consultations={consultations} inHistory />
      : <PatientSupplementationActions patient={patient} consultations={consultations} onOpenHistory={() => setInHistory(true)} />;
  }
  render(<Supplementation />);
  click("Nueva suplementación");
  fireEvent.click(await screen.findByRole("button", { name: `Agregar ${supplementProduct.name}` }));
  change(`Cantidad diaria de ${supplementProduct.name}`, "1");
  change("Horario y reparto de las tomas", "Con el desayuno");
  change("Duración o fecha de revisión", "Durante 14 días");
  click("Confirmar indicación");
  expect(screen.getByLabelText("Vincular a una consulta (opcional)")).toHaveValue("");
  click("Guardar suplementación");
  await screen.findByRole("button", { name: "Editar" });
  expect(mocks.save).toHaveBeenLastCalledWith("patient", expect.any(String), expect.any(Array), [], null, undefined);
  click("Editar");
  change("Vincular a una consulta (opcional)", "visit");
  click("Guardar suplementación");
  await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith("patient", expect.any(String), expect.any(Array), [], "visit", "2026-11-25"));
  fireEvent.click(await screen.findByRole("button", { name: "Exportar indicaciones" }));
  click("Descargar PDF");
  await waitFor(() => expect(mocks.pdf).toHaveBeenCalledWith(patient, expect.objectContaining({ consultation_id: "visit" }), "current", expect.any(String)));
});
