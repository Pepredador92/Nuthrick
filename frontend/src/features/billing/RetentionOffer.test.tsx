import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RetentionOffer, type RetentionOfferData } from "./RetentionOffer";

const offer: RetentionOfferData = {
  eligible: true, current: false, amount: 14900, currency: "MXN", duration_days: 90, cycle_days: 30,
  starts_at: null, ends_at: null, patient_ids: [],
  patients: Array.from({ length: 6 }, (_, i) => ({ id: `patient-${i}`, name: `Paciente ${i + 1}` })),
};
it("requires review, limits selection to five and submits the actual selected patients", () => {
  const confirm = vi.fn();
  render(<RetentionOffer offer={offer} busy={false} onConfirm={confirm} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver Respaldo y elegir pacientes" }));
  expect(screen.getByRole("button", { name: "Programar Respaldo" })).toBeDisabled();
  for (let i = 1; i <= 5; i++) fireEvent.click(screen.getByRole("checkbox", { name: `Paciente ${i}` }));
  expect(screen.getByRole("checkbox", { name: "Paciente 6" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Revisé mis pacientes/ }));
  fireEvent.click(screen.getByRole("button", { name: "Programar Respaldo" }));
  expect(confirm).toHaveBeenCalledWith(offer.patients.slice(0, 5).map(patient => patient.id));
});
it("keeps selected patients while searching and requires reviewing a changed selection", () => {
  render(<RetentionOffer offer={offer} busy={false} onConfirm={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver Respaldo y elegir pacientes" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Paciente 1" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Revisé mis pacientes/ }));
  fireEvent.change(screen.getByLabelText("Buscar pacientes para Respaldo"), { target: { value: "Paciente 6" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Paciente 6" }));
  expect(screen.getByText("2 de 5 pacientes elegidos")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Programar Respaldo" })).toBeDisabled();
});
it("cannot modify the selection while recovering an unfinished billing request", () => {
  render(<RetentionOffer offer={{ ...offer, retry_operation_key: "pending", patient_ids: ["patient-0"] }} busy={false} onConfirm={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver Respaldo y elegir pacientes" }));
  expect(screen.getByRole("checkbox", { name: "Paciente 1" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Paciente 1" })).toBeDisabled();
});
