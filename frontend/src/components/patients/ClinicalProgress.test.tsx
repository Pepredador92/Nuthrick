import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ClinicalProgress } from "./ClinicalProgress";
import { listProgressReviews, listProgressSources, saveProgressReview } from "@/src/services/clinicalProgress";
import { originalProgress, type ProgressReview, type ProgressSource } from "@/src/features/progress/clinicalProgress";
import { emptyObjective } from "../../../../supabase/functions/_shared/objectives";
import type { Strategy } from "../../../../supabase/functions/_shared/interventions";
import type { Consultation, Patient } from "@/src/types/domain";

vi.mock("@/src/services/clinicalProgress", () => ({
  listProgressSources: vi.fn(),
  listProgressReviews: vi.fn(),
  saveProgressReview: vi.fn(),
}));
vi.mock("@/src/features/progress/exportProgress", () => ({
  downloadProgressPdf: vi.fn(async () => {}),
  downloadProgressWord: vi.fn(async () => {}),
}));

const patient = { id: "patient", professional_id: "professional", full_name: "Paciente de prueba" } as Patient;
const visit = { id: "next", consultation_type: "follow_up", sequence_number: 2, consultation_date: "2026-11-09T16:00:00Z" } as Consultation;
const initial: ProgressSource = {
  id: "initial",
  consultation_type: "initial",
  consultation_date: "2026-11-01T16:00:00Z",
  sequence_number: 1,
  revision: 1,
  current: true,
  objective: { version: 1, pesApprovedAt: "approved", goals: [
    { ...emptyObjective(), outcome: "Registrar los desayunos", target: "5 días", agreement: "patient" },
    { ...emptyObjective(), outcome: "Preparar el menú", target: "2 comidas", agreement: "patient" },
  ] },
  strategies: [
    { id: "first-strategy", strategy: { title: "Usar una libreta", action: "Anota al desayunar", goalIndexes: [0] } as Strategy },
    { id: "second-strategy", strategy: { title: "Planear compras", action: "Haz una lista", goalIndexes: [1] } as Strategy },
  ],
  instructions: [{ key: "first_actions", value: "Lleva el registro a tu próxima cita." }],
  legacy_objectives: [],
  latest_review: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listProgressSources).mockResolvedValue([initial]);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

it("records two different results, edits plain text, and opens the original and the saved version", async () => {
  const { downloadProgressPdf, downloadProgressWord } = await import("@/src/features/progress/exportProgress");
  let review: ProgressReview;
  vi.mocked(saveProgressReview).mockImplementation(async (_patient, _source, visitId, id, document) => {
    review = { id, version: 1, review_consultation_id: visitId, review_consultation_date: visit.consultation_date, recorded_at: visit.consultation_date, document };
    vi.mocked(listProgressReviews).mockResolvedValue([review]);
    return review;
  });
  const { unmount } = render(<ClinicalProgress patient={patient} consultation={visit} />);
  fireEvent.click(screen.getByRole("button", { name: "Revisar progreso" }));
  const modal = within(screen.getByRole("dialog", { name: "Progreso del paciente" }));
  expect(await modal.findByText("Registrar los desayunos")).toBeVisible();
  fireEvent.click(modal.getByRole("button", { name: "Registrar avance del objetivo 1" }));
  fireEvent.click(modal.getByRole("button", { name: "Registrar avance del objetivo 2" }));
  const [first, second] = modal.getAllByLabelText("¿Qué avance hubo hacia el objetivo?");
  fireEvent.change(first, { target: { value: "partial" } });
  fireEvent.change(second, { target: { value: "achieved" } });
  const [firstResult, secondResult] = modal.getAllByLabelText("Resultado observado");
  fireEvent.change(firstResult, { target: { value: "3 de 5 días" } });
  fireEvent.change(secondResult, { target: { value: "2 de 2 comidas" } });
  fireEvent.click(modal.getByRole("button", { name: "Revisar aplicación de la estrategia 1" }));
  fireEvent.change(modal.getByLabelText("¿Se aplicó la estrategia?"), { target: { value: "applied" } });
  fireEvent.change(modal.getByLabelText("Texto del objetivo 1"), { target: { value: "Registrar los desayunos con horario" } });
  fireEvent.change(modal.getByLabelText("Texto de la estrategia 2"), { target: { value: "Revisar la lista antes de salir" } });
  fireEvent.change(modal.getByRole("textbox", { name: "Indicaciones de la consulta" }), { target: { value: "Lleva también un ejemplo del menú." } });
  fireEvent.click(modal.getByRole("button", { name: "Guardar revisión" }));
  expect(await modal.findByText("Revisión guardada en el historial.")).toBeVisible();

  expect(saveProgressReview).toHaveBeenCalledWith(patient.id, initial, visit.id, expect.any(String), expect.objectContaining({
    goals: [
      expect.objectContaining({ text: "Registrar los desayunos con horario", assessment: expect.objectContaining({ status: "partial", result: "3 de 5 días", visitId: visit.id }) }),
      expect.objectContaining({ assessment: expect.objectContaining({ status: "achieved", result: "2 de 2 comidas" }) }),
    ],
    strategies: [
      expect.objectContaining({ assessment: expect.objectContaining({ status: "applied" }) }),
      expect.objectContaining({ text: "Revisar la lista antes de salir", assessment: expect.objectContaining({ status: "unreviewed", date: null }) }),
    ],
    instructions: "Lleva también un ejemplo del menú.",
  }));

  fireEvent.click(modal.getByRole("button", { name: "Exportar Word" }));
  await waitFor(() => expect(downloadProgressWord).toHaveBeenCalledWith(patient, expect.anything(), review, review.document));
  fireEvent.click(modal.getByRole("button", { name: "Ver historial de revisiones" }));
  fireEvent.change(await modal.findByLabelText("Versión del registro"), { target: { value: "original" } });
  expect(modal.getByText(/Lleva el registro a tu próxima cita/)).toBeVisible();
  expect(modal.getByText("Usar una libreta")).toBeVisible();
  expect(modal.queryByRole("button", { name: "Editar acuerdos" })).not.toBeInTheDocument();

  fireEvent.click(modal.getByRole("button", { name: "Exportar PDF" }));
  const pdf = within(screen.getByRole("dialog", { name: "Exportar progreso del paciente" }));
  fireEvent.click(pdf.getByRole("radio", { name: /Tradicional formal/ }));
  fireEvent.click(pdf.getByRole("button", { name: "Descargar PDF" }));
  await waitFor(() => expect(downloadProgressPdf).toHaveBeenCalledWith(patient, expect.anything(), null, originalProgress(initial), "formal"));

  unmount();
  vi.mocked(listProgressSources).mockResolvedValue([{ ...initial, latest_review: review! }]);
  render(<ClinicalProgress patient={patient} />);
  expect(await screen.findByText(/Avance parcial · 3 de 5 días/)).toBeVisible();
  expect(screen.queryByText("Preparar el menú")).not.toBeInTheDocument();
});

it("keeps the previous assessment when a later visit only changes the instructions", async () => {
  const document = originalProgress(initial);
  document.goals[0].assessment = { status: "partial", result: "3 de 5 días", note: "Primera revisión", date: visit.consultation_date, visitId: visit.id };
  const source = { ...initial, latest_review: { id: "review", version: 1, recorded_at: visit.consultation_date, document, review_consultation_id: visit.id, review_consultation_date: visit.consultation_date } };
  const laterVisit = { ...visit, id: "later", sequence_number: 3, consultation_date: "2026-11-14T16:00:00Z" };
  vi.mocked(listProgressSources).mockResolvedValue([source]);
  vi.mocked(saveProgressReview).mockResolvedValue(source.latest_review);
  render(<ClinicalProgress patient={patient} consultation={laterVisit} />);
  fireEvent.click(screen.getByRole("button", { name: "Revisar progreso" }));
  const modal = within(screen.getByRole("dialog", { name: "Progreso del paciente" }));
  fireEvent.click(await modal.findByRole("button", { name: "Registrar avance del objetivo 1" }));
  expect(modal.getByLabelText("Resultado observado")).toHaveValue("");
  expect(modal.getByRole("button", { name: "Guardar revisión" })).toBeDisabled();
  fireEvent.change(modal.getByRole("textbox", { name: "Indicaciones de la consulta" }), { target: { value: "Lleva el menú." } });
  fireEvent.click(modal.getByRole("button", { name: "Guardar revisión" }));
  await waitFor(() => expect(saveProgressReview).toHaveBeenCalledWith(patient.id, source, laterVisit.id, expect.any(String), {
    ...document, instructions: "Lleva el menú.",
  }));
});

it("adds agreements after a new patient's first consultation closes, even when it closed empty", async () => {
  const blank = { ...initial, objective: null, strategies: [], instructions: [] };
  vi.mocked(listProgressSources).mockResolvedValue([]);
  const { rerender } = render(<ClinicalProgress patient={patient} consultationsRevision="none" />);
  expect(await screen.findByText(/Aquí aparecerán los objetivos/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Ver progreso" }));
  const modal = within(screen.getByRole("dialog", { name: "Progreso del paciente" }));
  expect(await modal.findByText(/Aún no hay acuerdos/)).toBeVisible();
  expect(modal.queryByRole("button", { name: "Editar acuerdos" })).not.toBeInTheDocument();
  fireEvent.click(modal.getByRole("button", { name: "Cerrar progreso" }));

  vi.mocked(listProgressSources).mockResolvedValue([blank]);
  vi.mocked(saveProgressReview).mockImplementation(async (_patient, _source, visitId, id, document) => ({
    id, version: 1, review_consultation_id: visitId, review_consultation_date: null, recorded_at: visit.consultation_date, document,
  }));
  rerender(<ClinicalProgress patient={patient} consultationsRevision="closed" />);
  fireEvent.click(screen.getByRole("button", { name: "Ver progreso" }));
  const reopened = within(screen.getByRole("dialog", { name: "Progreso del paciente" }));
  fireEvent.click(await reopened.findByRole("button", { name: "Editar acuerdos" }));
  fireEvent.click(reopened.getByRole("button", { name: "Agregar objetivo" }));
  fireEvent.click(reopened.getByRole("button", { name: "Agregar estrategia" }));
  expect(reopened.getByRole("button", { name: "Guardar revisión" })).toBeDisabled();
  fireEvent.change(reopened.getByLabelText("Texto del objetivo 1"), { target: { value: "Preparar desayunos" } });
  fireEvent.change(reopened.getByLabelText("Texto de la estrategia 1"), { target: { value: "Preparar la fruta la noche anterior" } });
  fireEvent.click(reopened.getByRole("checkbox", { name: "Preparar desayunos" }));
  fireEvent.change(reopened.getByRole("textbox", { name: "Indicaciones de la consulta" }), { target: { value: "Registrar tres días." } });
  fireEvent.click(reopened.getByRole("button", { name: "Guardar revisión" }));
  expect(await reopened.findByText("Revisión guardada en el historial.")).toBeVisible();
  const document = vi.mocked(saveProgressReview).mock.calls[0][4];
  expect(document.strategies[0].goalIds).toEqual([document.goals[0].id]);
  expect(document.instructions).toBe("Registrar tres días.");
  fireEvent.click(reopened.getByRole("button", { name: "Cerrar progreso" }));
  expect(screen.getByRole("button", { name: /Preparar desayunos.*Sin revisar/ })).toBeVisible();
});

it("removes agreements without transferring an assessment to a different objective or altering history", async () => {
  const base = originalProgress(initial);
  base.goals[0].assessment = { ...base.goals[0].assessment, status: "partial", result: "3 de 5 días" };
  base.goals[1].assessment = { ...base.goals[1].assessment, status: "no_progress", result: "Pendiente" };
  const prior = { id: "prior", version: 1, recorded_at: visit.consultation_date, review_consultation_id: visit.id, review_consultation_date: visit.consultation_date, document: base };
  vi.mocked(listProgressSources).mockResolvedValue([{ ...initial, latest_review: prior }]);
  vi.mocked(saveProgressReview).mockImplementation(async (_patient, _source, _visit, id, document) => {
    const next = { ...prior, id, version: 2, document };
    vi.mocked(listProgressReviews).mockResolvedValue([next, prior]);
    return next;
  });
  render(<ClinicalProgress patient={patient} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver progreso" }));
  const modal = within(screen.getByRole("dialog", { name: "Progreso del paciente" }));
  fireEvent.click(await modal.findByRole("button", { name: "Editar acuerdos" }));
  fireEvent.click(modal.getByRole("button", { name: "Quitar objetivo 1" }));
  fireEvent.click(modal.getByRole("button", { name: "Quitar estrategia 2" }));
  expect(modal.getByRole("checkbox", { name: "Preparar el menú" })).not.toBeChecked();
  fireEvent.click(modal.getByRole("checkbox", { name: "Preparar el menú" }));
  fireEvent.change(modal.getByRole("textbox", { name: "Indicaciones de la consulta" }), { target: { value: " " } });
  fireEvent.click(modal.getByRole("button", { name: "Guardar revisión" }));
  expect(await modal.findByText("Revisión guardada en el historial.")).toBeVisible();
  const document = vi.mocked(saveProgressReview).mock.calls[0][4];
  expect(document).toEqual({
    goals: [base.goals[1]],
    strategies: [{ ...base.strategies[0], goalIds: [base.goals[1].id] }],
    instructions: "",
  });
  expect(modal.getByText("No hay indicaciones en esta versión.")).toBeVisible();
  fireEvent.click(modal.getByRole("button", { name: "Ver historial de revisiones" }));
  fireEvent.change(await modal.findByLabelText("Versión del registro"), { target: { value: prior.id } });
  expect(modal.getByText("3 de 5 días")).toBeVisible();
  expect(modal.getByText("Planear compras")).toBeVisible();
});

it("keeps the draft after failed saves, retries without duplicating, and asks before discarding", async () => {
  vi.mocked(saveProgressReview)
    .mockRejectedValueOnce(new Error("No pudimos guardar la revisión. Tu texto sigue en pantalla."))
    .mockImplementationOnce(async (_patient, _source, visitId, id, document) => ({
      id, version: 1, review_consultation_id: visitId, review_consultation_date: null, recorded_at: visit.consultation_date, document,
    }));
  render(<ClinicalProgress patient={patient} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver progreso" }));
  const modal = within(screen.getByRole("dialog", { name: "Progreso del paciente" }));
  fireEvent.click(await modal.findByRole("button", { name: "Editar acuerdos" }));
  fireEvent.change(modal.getByRole("textbox", { name: "Indicaciones de la consulta" }), { target: { value: "Texto para conservar" } });
  fireEvent.click(modal.getByRole("button", { name: "Cerrar progreso" }));
  fireEvent.click(modal.getByRole("button", { name: "Seguir editando" }));
  fireEvent.click(modal.getByRole("button", { name: "Guardar revisión" }));
  expect(await modal.findByRole("alert")).toHaveTextContent("Tu texto sigue en pantalla");
  expect(modal.getByRole("textbox", { name: "Indicaciones de la consulta" })).toHaveValue("Texto para conservar");
  fireEvent.click(modal.getByRole("button", { name: "Guardar revisión" }));
  await modal.findByText("Revisión guardada en el historial.");
  expect(vi.mocked(saveProgressReview).mock.calls[0]).toEqual(vi.mocked(saveProgressReview).mock.calls[1]);
  fireEvent.click(modal.getByRole("button", { name: "Editar acuerdos" }));
  fireEvent.click(modal.getByRole("button", { name: "Quitar objetivo 1" }));
  fireEvent.click(modal.getByRole("button", { name: "Cerrar progreso" }));
  fireEvent.click(modal.getByRole("button", { name: "Descartar cambios y cerrar" }));
  expect(screen.queryByRole("dialog", { name: "Progreso del paciente" })).toBeNull();
  expect(screen.getByRole("button", { name: /Registrar los desayunos/ })).toBeVisible();
  expect(saveProgressReview).toHaveBeenCalledTimes(2);
});

it("offers older consultations on the third visit and excludes future visits", async () => {
  const legacy: ProgressSource = { ...initial, id: visit.id, consultation_type: "follow_up", sequence_number: 2,
    consultation_date: visit.consultation_date, objective: null, strategies: [], instructions: [],
    legacy_objectives: [{
      key: "next_objectives", value: "Objetivo manual de la segunda cita",
      question: { question_key: "next_objectives", label: "Objetivo", question_type: "long_text", configuration: {}, is_required: false, response_area: "professional_assessment" },
    }],
  };
  const third = { ...visit, id: "third", sequence_number: 3, consultation_date: "2026-11-14T16:00:00Z" };
  const future = { ...legacy, id: "future", consultation_date: "2026-11-20T16:00:00Z", sequence_number: 4 };
  vi.mocked(listProgressSources).mockResolvedValue([future, legacy, initial]);
  render(<ClinicalProgress patient={patient} consultation={third} />);
  fireEvent.click(screen.getByRole("button", { name: "Revisar progreso" }));
  const modal = within(screen.getByRole("dialog", { name: "Progreso del paciente" }));
  expect(await modal.findByText("Objetivo manual de la segunda cita")).toBeVisible();
  expect(modal.getAllByRole("option")).toHaveLength(2);
  fireEvent.change(modal.getByLabelText("Consulta de origen"), { target: { value: "initial:1" } });
  expect(modal.getByText("Registrar los desayunos")).toBeVisible();
  expect(modal.queryByText("Objetivo manual de la segunda cita")).not.toBeInTheDocument();
});
