import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { loadPatientAgreements } from "@/src/services/consultations";
import { PortalConsultationInstructions } from "./PortalConsultationInstructions";

vi.mock("@/src/services/consultations", () => ({ loadPatientAgreements: vi.fn() }));
const consultations = [
  { id: "recent", consultation_date: "2026-10-20" },
  { id: "earlier", consultation_date: "2026-10-01" },
];
const onApply = vi.fn();
const props = { patientId: "patient", consultations, currentText: "", onApply, disabled: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadPatientAgreements).mockResolvedValue({ revision: 1, text: "Indicaciones guardadas." });
});

it("ignores a delayed response from the previous consultation", async () => {
  let finishPrevious!: (value: { revision: number; text: string }) => void;
  vi.mocked(loadPatientAgreements).mockImplementation(async (_patient, consultation) => consultation === "recent"
    ? new Promise((resolve) => { finishPrevious = resolve; })
    : { revision: 2, text: "Indicaciones de la consulta elegida." });
  render(<PortalConsultationInstructions {...props} />);
  fireEvent.change(screen.getByLabelText("Consulta de origen de las indicaciones"), { target: { value: "earlier" } });
  await screen.findByText("Indicaciones de la consulta elegida.");
  await act(async () => { finishPrevious({ revision: 1, text: "Indicaciones anteriores que llegaron tarde." }); });
  expect(screen.queryByText("Indicaciones anteriores que llegaron tarde.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Agregar al borrador del Superlink" }));
  expect(onApply).toHaveBeenCalledExactlyOnceWith("Indicaciones de la consulta elegida.");
});

it("retries a failed read without changing the shared instructions", async () => {
  vi.mocked(loadPatientAgreements).mockRejectedValueOnce(new Error("unavailable"));
  render(<PortalConsultationInstructions {...props} currentText="Texto que ya se comparte." />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByText("Indicaciones guardadas.");
  expect(loadPatientAgreements).toHaveBeenCalledTimes(2);
  expect(onApply).not.toHaveBeenCalled();
});

it("explains when there are no finalized consultations or saved instructions", async () => {
  const { rerender } = render(<PortalConsultationInstructions {...props} consultations={[]} />);
  expect(screen.getByText(/cuando finalices una consulta/)).toBeVisible();
  expect(loadPatientAgreements).not.toHaveBeenCalled();
  vi.mocked(loadPatientAgreements).mockResolvedValue({ revision: 1, text: "" });
  rerender(<PortalConsultationInstructions {...props} />);
  expect(await screen.findByText(/Esta consulta no tiene indicaciones guardadas/)).toBeVisible();
  expect(screen.queryByRole("button", { name: /Agregar al borrador/ })).not.toBeInTheDocument();
});

it("keeps long instructions intact and prevents adding content beyond the portal limit", async () => {
  const text = "a".repeat(11995) + "FINAL";
  vi.mocked(loadPatientAgreements).mockResolvedValue({ revision: 1, text });
  const { rerender } = render(<PortalConsultationInstructions {...props} currentText="Texto previo." />);
  expect(await screen.findByText(text)).toHaveTextContent(/FINAL$/);
  expect(screen.getByRole("alert")).toHaveTextContent("12,000");
  expect(screen.getByRole("button", { name: "Agregar al borrador del Superlink" })).toBeDisabled();
  rerender(<PortalConsultationInstructions {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Agregar al borrador del Superlink" }));
  expect(onApply).toHaveBeenCalledExactlyOnceWith(text);
});
