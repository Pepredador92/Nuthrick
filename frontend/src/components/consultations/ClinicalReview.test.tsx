import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ConsultationSnapshot } from "@/src/types/domain";
import { ClinicalReview } from "./ClinicalReview";

const api = vi.hoisted(() => ({
  objective: vi.fn(),
  workspace: vi.fn(),
  before: vi.fn(),
  status: vi.fn(),
  open: vi.fn(),
}));
vi.mock(
  "@/src/services/clinicalCopilot",
  () => ({
    clinicalObjective: api.objective,
    clinicalWorkspace: api.workspace,
  }),
);
const snapshot: ConsultationSnapshot = {
  id: "snapshot",
  consultation_id: "c",
  patient_id: "p",
  professional_id: "owner",
  template_id: null,
  template_name: "Entrevista",
  template_version: 1,
  revision: 1,
  created_at: "2026-10-19",
  structure: {
    consultation_type: "initial",
    sections: [{
      section_key: "interview",
      title: "Entrevista",
      questions: [{
        question_key: "note",
        label: "Motivo de consulta",
        question_type: "long_text",
        configuration: {},
        is_required: false,
        response_area: "patient_reported",
      }],
    }],
  },
};
const props = {
  consultationId: "c",
  snapshot,
  active: true,
  before: api.before,
  onStatusChange: api.status,
  onOpenModule: api.open,
};
beforeEach(() => {
  vi.clearAllMocks();
  api.before.mockResolvedValue(true);
  api.objective.mockResolvedValue({ facts: [] });
  api.workspace.mockResolvedValue({ records: {} });
});

it("marks a source only by explicit review and removes its mark when the answers change", async () => {
  const view = render(
    <ClinicalReview {...props} values={{ note: "Ordenar las comidas" }} />,
  );
  await screen.findByText("0 de 1 fuente revisada");
  expect(api.status).toHaveBeenLastCalledWith("pending");
  fireEvent.click(screen.getByRole("button", { name: /Lo conversado/ }));
  fireEvent.click(screen.getByRole("button", { name: "Marcar como revisado" }));
  expect(screen.getByRole("button", { name: "Revisado · quitar marca" }))
    .toHaveAttribute("aria-pressed", "true");
  expect(api.status).toHaveBeenLastCalledWith("complete");
  expect(api.objective).toHaveBeenCalledExactlyOnceWith("c", 1);
  view.rerender(
    <ClinicalReview {...props} values={{ note: "Información actualizada" }} />,
  );
  expect(screen.getByRole("button", { name: "Marcar como revisado" }))
    .toHaveAttribute("aria-pressed", "false");
  expect(api.status).toHaveBeenLastCalledWith("pending");
});

it("keeps missing optional sources neutral and links back to their capture step", async () => {
  render(<ClinicalReview {...props} values={{}} />);
  await screen.findByText("Sin fuentes disponibles");
  fireEvent.click(screen.getByRole("button", { name: /Alimentación del día/ }));
  expect(screen.queryByRole("button", { name: "Marcar como revisado" })).not
    .toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ir al recordatorio" }));
  expect(api.open).toHaveBeenCalledWith("recall");
  expect(api.status).not.toHaveBeenCalledWith("complete");
});

it("invalidates a source check after refreshing changed measurements", async () => {
  const fact = {
    source: "Antropometría · Peso",
    finding: "70 kg",
    origin: "measurement",
    metric_code: "weight",
    numeric_value: 70,
    unit: "kg",
    method: "Captura directa",
    consultation_date: "2026-10-19",
  };
  api.objective.mockResolvedValue({ facts: [fact] });
  render(<ClinicalReview {...props} values={{}} />);
  await screen.findByText("0 de 1 fuente revisada");
  fireEvent.click(
    screen.getByRole("button", { name: /Mediciones y estudios/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Marcar como revisado" }));
  expect(api.status).toHaveBeenLastCalledWith("complete");
  api.objective.mockResolvedValue({
    facts: [{ ...fact, finding: "71 kg", numeric_value: 71 }],
  });
  fireEvent.click(screen.getByRole("button", { name: "Actualizar revisión" }));
  await waitFor(() => expect(api.status).toHaveBeenLastCalledWith("pending"));
  expect(screen.getByRole("button", { name: "Marcar como revisado" }))
    .toHaveAttribute("aria-pressed", "false");
  expect(api.before).toHaveBeenCalledOnce();
});
