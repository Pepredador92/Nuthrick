import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, createRoutesFromElements, Link, Outlet, Route, RouterProvider, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationPage } from "./ConsultationPage";
import { withWorkflowSections } from '@/src/features/consultations/consultationWorkflow';
import { approvedPes, objectiveWorkspace, smartPlan } from '@/src/test/clinicalFixtures';
import { composeObjective, emptyObjective, type ObjectivePlan } from '../../../supabase/functions/_shared/objectives';
import { clinicalBatchKey } from '../../../supabase/functions/_shared/clinical-batch';
import { formatObjectiveEditorText, readObjectiveEditorText } from "@/src/features/consultations/objectiveEditorText";
import { formatPesEditorText } from '@/src/features/consultations/pesEditorText';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  discard: vi.fn(),
  resetClinicalPlan: vi.fn(),
  finish: vi.fn(),
  adopt: vi.fn(),
  begin: vi.fn(),
  listConsultations: vi.fn(),
  listPatientNotes: vi.fn(),
  createPatientNote: vi.fn(),
  updatePatientNote: vi.fn(),
  deletePatientNote: vi.fn(),
  getSnapshot: vi.fn(),
  reopen: vi.fn(),
  updateDate: vi.fn(),
  ensure: vi.fn(),
  objective: vi.fn(),
  clinical: vi.fn(),
  generate: vi.fn(),
  interventions: vi.fn(),
  agenda: vi.fn(),
  progressSources: vi.fn(),
  answerState: {version:0,answers:{} as Record<string,unknown>},
  draftState: {version:0,answers:{} as Record<string,unknown>},
}));
vi.mock("@/src/lib/supabase", () => ({supabase:{rpc:(name:string,args:Record<string,unknown>)=>{
  if(name==='sync_consultation_drafts' && args.p_changes) {
    mocks.draftState={version:mocks.draftState.version+1,answers:{...mocks.draftState.answers,...args.p_changes as Record<string,unknown>}};
  }
  const request=Promise.resolve({data: name==='sync_consultation_drafts'?structuredClone(mocks.draftState):null,error:null});
  return Object.assign(request,{abortSignal:()=>request});
}}}));
vi.mock("@/src/services/clinicalCopilot", async (original) => ({
  ...(await original<object>()),
  clinicalObjective: mocks.objective,
  clinicalWorkspace: mocks.clinical,
}));
vi.mock("@/src/services/ai", async (original) => ({
  ...(await original<object>()),
  runAIRequest: mocks.generate,
}));
vi.mock("@/src/services/clinicalInterventions", () => ({ clinicalInterventions: mocks.interventions }));
vi.mock("@/src/services/agenda", async (original) => ({
  ...await original<typeof import("@/src/services/agenda")>(),
  agendaApi: mocks.agenda,
}));
vi.mock("@/src/services/clinicalProgress", () => ({ listProgressSources: mocks.progressSources }));
const fixtures = vi.hoisted(() => {
  const c = {
    id: "draft",
    patient_id: "patient",
    consultation_type: "initial",
    sequence_number: 0,
    status: "draft",
    consultation_date: "2026-09-02T12:00:00Z",
  };
  const snapshot = {
    id: "snapshot",
    template_id: "template",
    template_name: "Entrevista",
    template_version: 2,
    revision: 1,
    structure: {
      consultation_type: "initial",
      sections: [
        {
          section_key: "opening",
          title: "Apertura de prueba",
          questions: [
            {
              question_key: "note",
              label: "Detalle breve de prueba",
              question_type: "short_text",
              configuration: {},
              is_required: false,
              response_area: "patient_reported",
            },
          ],
        },
        {
          section_key: "closure",
          title: "Cierre de prueba",
          questions: [
            {
              question_key: "review",
              label: "Confirmación de prueba",
              question_type: "select",
              configuration: { options: ["Revisado", "Pendiente"] },
              is_required: true,
              response_area: "professional_assessment",
            },
          ],
        },
      ],
    },
  };
  return {
    c,
    snapshot,
    template: {
      template: {
        id: "template",
        name: "Entrevista",
        description: "Plantilla inicial configurada por el profesional.",
        estimated_duration_minutes: 45,
        display_order: 0,
        version: 2,
        is_system: true,
        template_key: "system_initial_v2",
        consultation_type: "initial",
      },
      sections: [],
      questions: [],
    },
    sportsTemplate: {
      template: {
        id: "sports-template",
        name: "Consulta inicial deportiva",
        description: "Evaluación enfocada en actividad y rendimiento.",
        estimated_duration_minutes: 60,
        display_order: 1,
        version: 1,
        is_system: false,
        is_default: false,
        is_active: true,
        template_key: "personal-sports",
        consultation_type: "initial",
      },
      sections: [],
      questions: [],
    },
  };
});
vi.mock("@/src/services/patients", () => ({
  getPatient: async () => ({ id: "patient", full_name: "Paciente de prueba" }),
  listConsultations: mocks.listConsultations,
  listPatientNotes: mocks.listPatientNotes,
  createPatientNote: mocks.createPatientNote,
  updatePatientNote: mocks.updatePatientNote,
  deletePatientNote: mocks.deletePatientNote,
}));
vi.mock("@/src/services/consultations", () => ({
  loadActiveTemplate: async () => fixtures.template,
  loadSystemTemplate: async () => fixtures.template,
  ensureSnapshot: mocks.ensure,
  prepareConsultationWorkflow: async (snapshot: typeof fixtures.snapshot) => ({ ...snapshot, structure: withWorkflowSections(snapshot.structure as never) }),
  getSnapshot: mocks.getSnapshot,
  listAvailableSystemTemplates: async (type: string) =>
    type === "initial"
      ? [fixtures.template, fixtures.sportsTemplate]
      : [
          {
            ...fixtures.template,
            template: {
              ...fixtures.template.template,
              id: "follow-up-template",
              name: "Seguimiento",
              template_key: "system_follow_up_v1",
              consultation_type: "follow_up",
            },
          },
        ],
  listAvailableTemplates: async (type: string) =>
    type === "initial"
      ? [fixtures.template, fixtures.sportsTemplate]
      : [
          {
            ...fixtures.template,
            template: {
              ...fixtures.template.template,
              id: "follow-up-template",
              name: "Seguimiento",
              description: "Seguimiento configurado.",
              consultation_type: "follow_up",
            },
          },
        ],
  loadTemplateById: async () => fixtures.template,
  reopenConsultationForEdit: mocks.reopen,
  beginConsultation: mocks.begin,
  updateConsultationDate: mocks.updateDate,
  listAnswers: async () => [],
  saveAnswers: mocks.save,
  syncConsultationAnswers: async (_id:string, revision:number, request?:{changes:Record<string,unknown>}) => {
    if(request) {
      await mocks.save(fixtures.c,{...fixtures.snapshot,revision},request.changes);
      mocks.answerState={version:mocks.answerState.version+1,answers:{...mocks.answerState.answers,...request.changes}};
    }
    return structuredClone(mocks.answerState);
  },
  discardConsultationDraft: mocks.discard,
  resetConsultationClinicalPlan: mocks.resetClinicalPlan,
  finishConsultation: mocks.finish,
  adoptTemplate: mocks.adopt,
}));
vi.mock("@/src/components/consultations/SnapshotHistory", () => ({
  SnapshotHistory: () => null,
}));
vi.mock('@/src/services/foodCatalog', () => ({ listFoodItems: async () => [], createCustomFood: vi.fn() }));

vi.mock("@/src/components/consultations/ConsultationMeasurements", async () => {
  const { useEffect, useState } = await import("react");
  return { ConsultationMeasurements: ({ onPendingChange }: { onPendingChange: (pending: boolean) => void }) => {
    const [value, setValue] = useState("");
    const [pending, setPending] = useState(false);
    useEffect(() => onPendingChange(pending), [pending, onPendingChange]);
    return <section><input aria-label="Peso de prueba" value={value} onChange={(e) => { setValue(e.target.value); setPending(true); }} /><button onClick={() => setPending(false)}>Guardar medición de prueba</button></section>;
  } };
});
vi.mock("@/src/components/consultations/LaboratoryReports", async () => {
  const { useEffect, useState } = await import("react");
  return { LaboratoryReports: ({ onPendingChange }: { onPendingChange: (pending: boolean) => void }) => {
    const [pending, setPending] = useState(false);
    useEffect(() => onPendingChange(pending), [pending, onPendingChange]);
    return <button onClick={() => setPending(true)}>Editar laboratorio de prueba</button>;
  } };
});

function TestNavigation() {
  const navigate = useNavigate();
  return <><nav aria-label="Navegación de prueba"><Link to="/app/patients">Pacientes</Link><Link to="/app/messages">Mensajes</Link><button onClick={() => navigate('/app/messages')}>Abrir mensaje</button></nav><Outlet /></>;
}
const mount = (entry = "/app/patients/patient/consultations/draft", previous?: string) => {
  const router = createMemoryRouter(createRoutesFromElements(
    <Route element={<TestNavigation />}>
      <Route path="/app/patients/:patientId/consultations/new" element={<ConsultationPage />} />
      <Route path="/app/patients/:patientId/consultations/:consultationId" element={<ConsultationPage />} />
      <Route path="/app/patients/patient" element={<h1>Ficha guardada</h1>} />
      <Route path="/app/patients" element={<h1>Lista de pacientes</h1>} />
      <Route path="/app/messages" element={<h1>Mensajes del paciente</h1>} />
      <Route path="/app/diet-workshop" element={<h1>Taller de dietas preparado</h1>} />
    </Route>,
  ), { initialEntries: previous ? [previous, entry] : [entry] });
  return { ...render(<RouterProvider router={router} />), router };
};
const pesTextName = 'Texto del diagnóstico PES';
const emptyPesText = formatPesEditorText({ problem: '', etiology: '', signsSymptoms: [] });
function editObjectiveOutcome(outcome: string) {
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Texto del objetivo 1' });
  const parsed = readObjectiveEditorText(input.value);
  if (!('fields' in parsed)) throw new Error(parsed.issue);
  fireEvent.change(input, { target: { value: formatObjectiveEditorText({ ...emptyObjective(), ...parsed.fields, outcome }) } });
}
async function openModule(name: string) {
  fireEvent.click(await screen.findByRole('button', { name }));
  await waitFor(() => expect(screen.getByRole('button', { name })).toHaveAttribute('aria-current', 'page'));
}
async function openInstructions() {
  await openModule('Revisión clínica, PES y objetivos');
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Pasos de la revisión clínica' })).getByRole('button', { name: /Indicaciones/ }));
  return screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'Texto para el paciente' });
}
async function openFollowup() {
  const steps = "Pasos de la revisión clínica";
  if (!screen.queryByRole("navigation", { name: steps })) await openModule("Revisión clínica, PES y objetivos");
  fireEvent.click(within(screen.getByRole("navigation", { name: steps })).getByRole("button", { name: /Seguimiento/ }));
  return screen.findByRole("region", { name: "Seguimiento" });
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.save.mockResolvedValue(undefined);
  mocks.answerState={version:0,answers:{}};
  mocks.draftState={version:0,answers:{}};
  mocks.agenda.mockResolvedValue({ appointments: [] });
  mocks.progressSources.mockResolvedValue([]);
  mocks.discard.mockResolvedValue(undefined);
  mocks.finish.mockResolvedValue(fixtures.c);
  fixtures.c.status = "draft";
  mocks.listConsultations.mockResolvedValue([fixtures.c]);
  mocks.listPatientNotes.mockResolvedValue([]);
  mocks.begin.mockResolvedValue(fixtures.c);
  mocks.getSnapshot.mockResolvedValue(fixtures.snapshot);
  mocks.reopen.mockResolvedValue({ ...fixtures.c, status: "draft" });
  mocks.updateDate.mockImplementation(async (_id: string, date: string) => ({
    ...fixtures.c,
    id: _id,
    consultation_type: _id === "follow-up-draft" ? "follow_up" : fixtures.c.consultation_type,
    consultation_date: `${date}T12:00:00.000Z`,
  }));
  mocks.ensure.mockResolvedValue(fixtures.snapshot);
  mocks.objective.mockResolvedValue({ stamp: 's', facts: [], pes: null, objective: null, target: null });
  mocks.interventions.mockResolvedValue({ stamp: 's', facts: [], pes: null, objective: null, items: [] });
  mocks.clinical.mockResolvedValue({ stamp: 's', readiness: { interview: false, objective: false, anthropometry: false, laboratories: false }, records: {} });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

describe("consultation save and review workflow", () => {
  it('confirms a full clinical restart, remounts clean editors, and keeps the current interview', async () => {
    const interview = 'Respuesta que debe conservarse';
    const diagnosis = 'Patrón anterior que se va a limpiar';
    mocks.answerState = { version: 4, answers: { note: interview, pes_problem: diagnosis } };
    mocks.draftState = { version: 3, answers: { 'followup-note': 'Plan previo de seguimiento' } };
    mocks.resetClinicalPlan.mockImplementation(async () => {
      mocks.answerState = { version: 8, answers: { note: interview } };
      mocks.draftState = { version: 9, answers: { navigation: { module: 'clinical', active: 0, clinicalStage: 0 } } };
      return mocks.answerState;
    });
    sessionStorage.setItem('clinical-pending:draft:pes_diagnosis', 'pending-before-reset');
    mount();
    await openModule('Revisión clínica, PES y objetivos');
    const button = await screen.findByRole('button', { name: 'Reiniciar revisión clínica' });
    fireEvent.click(button);
    const confirm = within(await screen.findByRole('dialog', { name: 'Reiniciar revisión clínica' }));
    fireEvent.click(confirm.getByRole('button', { name: 'Cancelar' }));
    expect(mocks.resetClinicalPlan).not.toHaveBeenCalled();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar y reiniciar' }));
    expect(await screen.findByText(/Revisión clínica reiniciada/)).toBeVisible();
    expect(mocks.resetClinicalPlan).toHaveBeenCalledExactlyOnceWith('draft', 1, 4, expect.any(Number));
    expect(sessionStorage.getItem('clinical-pending:draft:pes_diagnosis')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Revisión clínica' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    const pes = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: pesTextName });
    expect(pes.value).not.toContain(diagnosis);
    await openModule('Entrevista');
    expect(await screen.findByDisplayValue(interview)).toBeVisible();
  });

  it('keeps the confirmation and the previous work if the clinical restart cannot be saved', async () => {
    mocks.resetClinicalPlan.mockRejectedValue(new Error('La consulta cambió en otra pestaña.'));
    mount();
    await openModule('Revisión clínica, PES y objetivos');
    fireEvent.click(await screen.findByRole('button', { name: 'Reiniciar revisión clínica' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Reiniciar revisión clínica' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Limpiar y reiniciar' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('La consulta cambió en otra pestaña.');
    expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });

  it("books the next visit for the current patient without closing the consultation or losing the follow-up note", async () => {
    const start = "2099-10-01T16:00:00.000Z", end = "2099-10-01T17:00:00.000Z";
    const appointment = {
      id: "next-appointment", patient_id: "patient", starts_at: start, ends_at: end,
      timezone: "America/Mexico_City", modality: "online", status: "confirmed", professional_name: "Nutrióloga de prueba",
    };
    const options = {
      timezone: appointment.timezone, duration: 60, minimumNoticeMinutes: 0, horizonDays: 365,
      options: [{ modality: "online", location_id: null, label: "En línea" }],
    };
    let booked = false;
    mocks.agenda.mockImplementation(async (operation) => {
      if (operation === "appointment_options") return options;
      if (operation === "appointment_availability") return {
        day: "2099-10-01", today: "2099-10-01", lastDay: "2099-12-31", weekdays: [0,1,2,3,4,5,6],
        timezone: appointment.timezone, slots: [{ start, end }], connectionError: false,
      };
      if (operation === "appointment_create") { booked = true; return appointment; }
      return { appointments: booked ? [appointment] : [] };
    });
    const first = mount();
    const followup = within(await openFollowup());
    expect(await followup.findByText(/Cuando haya acuerdos de una consulta anterior/)).toBeVisible();
    expect(mocks.agenda).toHaveBeenCalledWith("appointment_list", { patientId: "patient" }, true);
    const note = "Revisar cómo le resultó organizar sus comidas.";
    const input = followup.getByRole("textbox", { name: /Nota para la próxima revisión/ });
    fireEvent.change(input, { target: { value: note } });
    await followup.findByText(/Los objetivos y las estrategias que apruebes/);
    fireEvent.click(followup.getByRole("button", { name: "Guardar seguimiento" }));
    expect(await followup.findByText("Seguimiento guardado.")).toBeVisible();
    expect(mocks.draftState.answers["followup-note"]).toBe(note);
    expect(mocks.agenda).not.toHaveBeenCalledWith("appointment_create", expect.anything(), true);

    fireEvent.click(await followup.findByRole("button", { name: "Agendar próxima cita" }));
    const modal = within(screen.getByRole("dialog", { name: "Agendar cita" }));
    expect(await modal.findByRole("button", { name: "Agendar cita" })).toBeDisabled();
    fireEvent.click(await modal.findByRole("button", { name: /10:00/ }));
    fireEvent.click(modal.getByRole("button", { name: "Agendar cita" }));
    await modal.findByRole("heading", { name: "Cita agendada" });
    expect(mocks.agenda).toHaveBeenCalledWith("appointment_create", {
      operationKey: expect.any(String), patientId: "patient", start,
      modality: "online", locationId: null, allowOutsideSchedule: false,
    }, true);
    expect(mocks.finish).not.toHaveBeenCalled();
    fireEvent.click(modal.getByRole("button", { name: "Cerrar" }));
    expect(followup.getByText("Agendada")).toBeVisible();
    expect(followup.queryByRole("button", { name: "Agendar próxima cita" })).not.toBeInTheDocument();
    expect(input).toHaveValue(note);
    expect(first.router.state.location.pathname).toBe("/app/patients/patient/consultations/draft");

    first.unmount();
    mount();
    const resumed = within(await openFollowup());
    expect(await resumed.findByText("Agendada")).toBeVisible();
    expect(resumed.getByRole("textbox", { name: /Nota para la próxima revisión/ })).toHaveValue(note);
    expect(resumed.getByText("Seguimiento guardado.")).toBeVisible();
  });
  it('keeps handwritten instructions in the working draft until the professional approves them', async () => {
    const original = 'Prepara la opción que acordamos.';
    const intended = 'Ten a mano la lista que hicimos.\n\nEn tu próxima consulta veremos qué opción te resultó práctica.';
    mocks.answerState.answers = { first_actions: original };
    const first = mount();
    const textarea = await openInstructions();
    expect(textarea).toHaveValue(original);
    fireEvent.click(screen.getByRole('button', { name: 'Editar indicaciones' }));
    fireEvent.change(textarea, { target: { value: intended } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await screen.findByText('Borrador guardado.');
    expect(mocks.answerState.answers.first_actions).toBe(original);
    expect(mocks.draftState.answers['instructions-editor']).toMatchObject({ text: intended });
    first.unmount();
    mount();
    expect(await openInstructions()).toHaveValue(intended);
    mocks.save.mockRejectedValueOnce(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar indicaciones' }));
    await screen.findByText('No pudimos guardar la aprobación. Tu texto sigue aquí.');
    expect(mocks.answerState.answers.first_actions).toBe(original);
    expect(screen.getByRole('textbox', { name: 'Texto para el paciente' })).toHaveValue(intended);
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar indicaciones' }));
    await screen.findByText('Aprobadas', { selector: '.clinical-status-badge' });
    expect(mocks.answerState.answers.first_actions).toBe(intended);
    expect(screen.getByRole('textbox', { name: 'Texto para el paciente' })).toHaveAttribute('readonly');
  });

  it('opens existing batch instructions and reviews regeneration without replacing the draft', async () => {
    const original = 'Escribe qué opción te resultó práctica.';
    const revised = 'Lleva la lista que preparaste y señala qué alternativa probaste.';
    const evidence = [{ source: 'Estrategia aprobada', finding: 'Revisar las opciones acordadas en consulta.' }];
    mocks.draftState.answers = {
      'clinical-batch': { id: 'batch', attempts: {}, completed: { patient_instructions: 'initial' } },
      [clinicalBatchKey('patient_instructions')]: { batchId: 'batch', generationId: 'initial', output: { instructions: [{ text: original, evidence }] } },
    };
    mocks.generate.mockResolvedValue({ generationId: 'revised', status: 'succeeded', output: { instructions: [{ text: revised, evidence }] } });
    mount();
    const textarea = await openInstructions();
    await waitFor(() => expect(textarea).toHaveValue(original));
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.answerState.answers.first_actions).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar con IA' }));
    fireEvent.click(await screen.findByText('Revisar otra propuesta de IA'));
    expect(textarea).toHaveValue(original);
    fireEvent.click(screen.getByRole('button', { name: 'Usar este texto' }));
    expect(textarea).toHaveValue(revised);
    expect(mocks.answerState.answers.first_actions).toBeUndefined();
  });

  it('retains separate answer keys in a customized instructions editor and keeps professional notes private', async () => {
    const snapshot = structuredClone(fixtures.snapshot);
    const question = snapshot.structure.sections[0].questions[0];
    snapshot.structure.sections.push({ section_key: 'custom', title: 'Mi guion', questions: [
      { ...question, question_key: 'first_actions', label: 'Primeros pasos', question_type: 'long_text' },
      { ...question, question_key: 'recommendations', label: 'Para la próxima consulta', question_type: 'long_text' },
      { ...question, question_key: 'professional_notes', label: 'Mi nota interna', question_type: 'long_text' },
    ] });
    mocks.getSnapshot.mockResolvedValue(snapshot);
    mocks.answerState.answers = { first_actions: 'Texto vigente', recommendations: 'Trae tu lista.', professional_notes: 'Información interna' };
    mount();
    const textarea = await openInstructions();
    expect(textarea).toHaveValue('Indicaciones acordadas\nTexto vigente\n\nRecomendaciones\nTrae tu lista.');
    expect(textarea.value).not.toContain('Información interna');
    fireEvent.click(screen.getByRole('button', { name: 'Editar indicaciones' }));
    fireEvent.change(textarea, { target: { value: '## Primeros pasos\nUsa la lista acordada.\n\n## Para la próxima consulta\nTrae la nota del ejercicio.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar indicaciones' }));
    await screen.findByText('Aprobadas', { selector: '.clinical-status-badge' });
    expect(mocks.answerState.answers).toMatchObject({ first_actions: 'Usa la lista acordada.', recommendations: 'Trae la nota del ejercicio.', professional_notes: 'Información interna' });
  });
  it("opens notes independently of the steps and saves a note linked to the visit", async () => {
    const content = "Pudo mantener el horario de comida.";
    mocks.createPatientNote.mockResolvedValue({
      id: "saved-note", content, consultation_id: "draft", updated_at: "2026-11-20T12:00:00Z",
    });
    mount("/app/patients/patient/consultations/draft");
    await openModule("Mediciones");
    const button = screen.getByRole("button", { name: "Notas" });
    expect(screen.getByRole("navigation", { name: "Módulos de la consulta" })).not.toContainElement(button);
    fireEvent.click(button);
    const modal = screen.getByRole("dialog", { name: "Notas de la consulta" });
    const input = within(modal).getByRole("textbox", { name: "Nueva nota" });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: content } });
    fireEvent.click(within(modal).getByRole("button", { name: "Cerrar notas" }));
    expect(button).toHaveFocus();
    await openModule("Revisión clínica, PES y objetivos");
    fireEvent.click(button);
    expect(input).toHaveValue(content);
    await within(modal).findByText("Aún no hay notas de esta consulta.");
    fireEvent.click(within(modal).getByRole("button", { name: "Guardar nota" }));
    await within(modal).findByText(content);
    expect(mocks.createPatientNote).toHaveBeenCalledWith("patient", content, "draft");
    expect(mocks.listPatientNotes).toHaveBeenCalledWith("patient", "draft");
    expect(input).toHaveValue("");
  });
  it("edits and confirms deletion of a consultation note without losing the new-note text", async () => {
    const note = { id: "saved-note", content: "Nota original", consultation_id: "draft", updated_at: "2026-11-20T12:00:00Z" };
    mocks.listPatientNotes.mockResolvedValue([note]);
    mocks.updatePatientNote.mockResolvedValue({ ...note, content: "Nota corregida" });
    mocks.deletePatientNote.mockResolvedValue(undefined);
    mount("/app/patients/patient/consultations/draft");
    fireEvent.click(await screen.findByRole("button", { name: "Notas" }));
    const dialog = within(screen.getByRole("dialog", { name: "Notas de la consulta" }));
    fireEvent.change(dialog.getByRole("textbox", { name: "Nueva nota" }), { target: { value: "Otra nota en curso" } });
    fireEvent.click(await dialog.findByRole("button", { name: "Editar nota 1" }));
    const edit = dialog.getByRole("textbox", { name: "Editar nota" });
    expect(edit).toHaveValue("Nota original");
    fireEvent.change(edit, { target: { value: "Nota corregida" } });
    fireEvent.click(dialog.getByRole("button", { name: "Guardar cambios" }));
    await dialog.findByText("Nota corregida");
    expect(mocks.updatePatientNote).toHaveBeenCalledExactlyOnceWith("saved-note", "Nota corregida");
    expect(dialog.getByRole("textbox", { name: "Nueva nota" })).toHaveValue("Otra nota en curso");
    fireEvent.click(dialog.getByRole("button", { name: "Eliminar nota 1" }));
    fireEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
    expect(mocks.deletePatientNote).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "Eliminar nota 1" }));
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar eliminación" }));
    await dialog.findByText("Nota eliminada del historial del paciente.");
    expect(mocks.deletePatientNote).toHaveBeenCalledExactlyOnceWith("saved-note");
    expect(dialog.queryByText("Nota corregida")).not.toBeInTheDocument();
  });
  it('clears saved PES answers and keeps them empty after reopening and reloading', async () => {
    const cleared = { pes_problem: '', pes_etiology: '', pes_evidence: '', pes_statement: '' };
    mocks.answerState.answers = { note: 'Conservar entrevista', pes_problem: 'Problema anterior', pes_etiology: 'Causa anterior', pes_evidence: 'Evidencia anterior', pes_statement: 'Problema anterior relacionado con Causa anterior, evidenciado por Evidencia anterior.' };
    const first = mount();
    await screen.findByRole('heading', { name: 'Apertura de prueba' });
    await openModule('Revisión clínica, PES y objetivos');
    fireEvent.click(screen.getByRole('button', { name: /PES Formula el diagnóstico/ }));
    expect(screen.getByRole('textbox', { name: pesTextName })).toHaveValue('Problema\nProblema anterior\n\nEtiología\nCausa anterior\n\nSignos y síntomas\nEvidencia anterior');
    fireEvent.click(screen.getByRole('button', { name: 'Descartar y limpiar' }));
    await screen.findByText('PES descartado y campos limpios.');
    expect(mocks.answerState.answers).toMatchObject({ ...cleared, note: 'Conservar entrevista' });
    expect(screen.queryByText(/Problema anterior relacionado con/)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: pesTextName })).toHaveValue(emptyPesText);
    first.unmount();
    mount();
    await openModule('Revisión clínica, PES y objetivos');
    fireEvent.click(screen.getByRole('button', { name: /PES Formula el diagnóstico/ }));
    expect(screen.getByRole('textbox', { name: pesTextName })).toHaveValue(emptyPesText);
    expect(mocks.answerState.answers).toMatchObject({ ...cleared, note: 'Conservar entrevista' });
  });
  it('preserves saved PES text when clearing fails and allows retrying', async () => {
    const answers = { note: 'Conservar entrevista', pes_problem: 'Problema anterior', pes_etiology: 'Causa anterior', pes_evidence: 'Evidencia anterior', pes_statement: 'Problema anterior relacionado con Causa anterior, evidenciado por Evidencia anterior.' };
    mocks.answerState.answers = { ...answers };
    mount();
    await screen.findByRole('heading', { name: 'Apertura de prueba' });
    await openModule('Revisión clínica, PES y objetivos');
    fireEvent.click(screen.getByRole('button', { name: /PES Formula el diagnóstico/ }));
    mocks.save.mockRejectedValue(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar y limpiar' }));
    await screen.findByText(/No pudimos limpiar el PES guardado/);
    expect(screen.getByRole('textbox', { name: pesTextName })).toHaveValue('Problema\nProblema anterior\n\nEtiología\nCausa anterior\n\nSignos y síntomas\nEvidencia anterior');
    expect(mocks.answerState.answers).toEqual(answers);
    mocks.save.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar y limpiar' }));
    await screen.findByText('PES descartado y campos limpios.');
    expect(mocks.answerState.answers).toMatchObject({ note: answers.note, pes_problem: '', pes_etiology: '', pes_evidence: '', pes_statement: '' });
  });
  it('keeps a recovered legacy draft pending review across reloads',async()=>{
    sessionStorage.setItem('nuthrick:consultation-workspace:draft',JSON.stringify({active:0,module:'interview',values:{note:'Texto recuperado'},scrollY:0,updatedAt:'2026-10-19T12:00:00Z'}));
    const first=mount();await screen.findByText(/Recuperamos un borrador de la versión anterior/);
    expect(screen.getByLabelText(/detalle breve de prueba/i)).toHaveValue('Texto recuperado');
    expect(JSON.parse(sessionStorage.getItem('nuthrick:consultation-workspace:draft')!).requiresReview).toBe(true);
    first.unmount();mount();await screen.findByText(/Recuperamos un borrador de la versión anterior/);
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Conservar mis cambios y sincronizar'}));
    await waitFor(()=>expect(mocks.save).toHaveBeenCalledOnce());
    expect(screen.getByLabelText(/detalle breve de prueba/i)).toHaveValue('Texto recuperado');
    await waitFor(()=>expect(screen.queryByRole('button',{name:'Conservar mis cambios y sincronizar'})).not.toBeInTheDocument());
  });
  it('offers independent recall and clinical decisions in a follow-up while keeping them out of the interview', async () => {
    mocks.getSnapshot.mockResolvedValue({ ...fixtures.snapshot, structure: { ...fixtures.snapshot.structure, consultation_type: 'follow_up' } });
    mocks.listConsultations.mockResolvedValue([{ ...fixtures.c, consultation_type: 'follow_up' }]);
    mount();
    await screen.findByRole('heading', { name: 'Apertura de prueba' });
    expect(within(screen.getByRole('navigation', { name: 'Secciones de la entrevista' })).queryByText(/Recordatorio|PES|Objetivos/)).not.toBeInTheDocument();
    await openModule('Recordatorio de 24 horas');
    expect(screen.getByRole('button', { name: 'Capturar recordatorio' })).toBeVisible();
    fireEvent.click(screen.getByText('Registro detallado del día y preguntas de apoyo'));
    expect(screen.getByRole('button', { name: 'Agregar alimento o bebida' })).toBeVisible();
    expect(screen.getByText('Sigue: Mediciones')).toBeVisible();
    await openModule('Revisión clínica, PES y objetivos');
    expect(screen.getByRole('heading', { name: 'Revisión clínica' })).toBeVisible();
    expect(screen.queryByLabelText('Redacción PES')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByRole('textbox', { name: pesTextName })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByRole('heading', { name: 'Objetivos SMART' });
    expect(screen.getByRole('button', { name: 'Agregar objetivo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Proponer objetivos con IA' })).toBeDisabled();
    expect(screen.queryByRole('textbox', { name: pesTextName })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    const strategies = await screen.findByRole('region', { name: 'Estrategias de intervención' });
    await waitFor(() => expect(within(strategies).getByRole('button', { name: 'Proponer estrategias con IA' })).toBeEnabled());
    expect(within(strategies).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('requires saving measurement edits before entering the clinical proposal step', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Apertura de prueba' });
    await openModule('Mediciones');
    fireEvent.change(screen.getByLabelText('Peso de prueba'), { target: { value: '87.6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisión clínica, PES y objetivos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Guarda las mediciones');
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mediciones' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar medición de prueba' }));
    await openModule('Revisión clínica, PES y objetivos');
    expect(screen.getByRole('heading', { name: 'Revisión clínica' })).toBeVisible();
  });

  it('keeps an unconfirmed recall on screen and blocks closing until its changes are confirmed', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Apertura de prueba' });
    await openModule('Recordatorio de 24 horas');
    fireEvent.click(screen.getByRole('button', { name: 'Capturar recordatorio' }));
    fireEvent.change(screen.getByLabelText('Texto capturado'), { target: { value: 'Dos huevos y tres tortillas.' } });
    await openModule('Entrevista');
    await openModule('Recordatorio de 24 horas');
    expect(screen.getByLabelText('Texto capturado')).toHaveValue('Dos huevos y tres tortillas.');
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cierre de consulta' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox'));
    expect(within(dialog).getByRole('status')).toHaveTextContent('Recordatorio de 24 horas');
    expect(within(dialog).getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled();
  });

  it("generates SMART goals, saves the reviewed plan and enables strategies only after explicit approval", async () => {
    let savedPlan: ObjectivePlan | undefined;
    let approved = false;
    mocks.objective.mockImplementation(async (_c, _r, action = 'read', _stamp, _key, plan) => {
      if (action === 'save' || action === 'approve') savedPlan = structuredClone(plan);
      if (action === 'approve') approved = true;
      return objectiveWorkspace(savedPlan, approved);
    });
    mocks.interventions.mockImplementation(async () => ({ stamp: 'current', facts: [], pes: approvedPes, objective: objectiveWorkspace(savedPlan, approved).objective, items: [] }));
    const goal = { ...smartPlan().goals[0], agreement: 'pending' };
    mocks.generate.mockResolvedValue({ generationId: 'g', status: 'succeeded', output: { objectives: [{ goal, evidence: [{ source: 'PES actual aprobado · Etiología', finding: approvedPes.etiology }] }] } });
    mount();
    fireEvent.change(await screen.findByLabelText('Detalle breve de prueba'), { target: { value: 'Historia revisada' } });
    await openModule('Revisión clínica, PES y objetivos');
    fireEvent.click(screen.getByRole('button', { name: /Objetivos Acuerda/ }));
    await screen.findByRole('heading', { name: 'Objetivos SMART' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Proponer objetivos con IA' })).toBeEnabled());
    expect(mocks.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Proponer objetivos con IA' }));
    await screen.findByRole('textbox', { name: 'Texto del objetivo 1' });
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ feature: 'consultation_support', patientId: 'patient', consultationId: 'draft', revision: 1 }));
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
    expect(screen.getByLabelText('Acuerdo · objetivo 1')).toHaveValue('pending');
    expect(screen.getByRole('button', { name: 'Aprobar objetivos' })).toBeDisabled();
    expect(mocks.objective.mock.calls.every(args => args.length === 2)).toBe(true);
    editObjectiveOutcome('Resultado revisado por el profesional');
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Texto del objetivo 1' }).value).toContain('Resultado revisado por el profesional');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await screen.findByText('Borrador guardado. Puedes continuar y revisarlo después.');
    expect(savedPlan?.goals[0]).toMatchObject({ outcome: 'Resultado revisado por el profesional', agreement: 'pending', sign: approvedPes.signsSymptoms });
    expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'draft' }), expect.objectContaining({ revision: 1 }), expect.objectContaining({ treatment_objective: composeObjective(savedPlan!.goals[0]) }));
    fireEvent.click(screen.getByRole('button', { name: /Estrategia Define las acciones y responsables/ }));
    expect(await screen.findByRole('button', { name: 'Proponer estrategias con IA' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Objetivos Acuerda/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar objetivo 1' }));
    fireEvent.change(await screen.findByLabelText('Acuerdo · objetivo 1'), { target: { value: 'patient' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar objetivos' }));
    await screen.findByText('Objetivos aprobados para seguimiento.');
    expect(mocks.objective).toHaveBeenLastCalledWith('draft', 1, 'approve', 'current', 'treatment_objective', savedPlan);
    fireEvent.click(screen.getByRole('button', { name: /Estrategia Define las acciones y responsables/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Proponer estrategias con IA' })).toBeEnabled());
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it("respects the saved custom label even for a canonical question key", async () => {
    const question=fixtures.snapshot.structure.sections[0].questions[0];
    const previous={...question};
    question.question_key="main_reason";
    question.label="Mi pregunta personalizada de apertura";
    try {
      mount();
      expect(await screen.findByLabelText("Mi pregunta personalizada de apertura")).toBeInTheDocument();
      expect(screen.queryByText("¿Qué te trae a consulta el día de hoy?")).not.toBeInTheDocument();
    } finally { Object.assign(question,previous); }
  });
  it("reopens a cancelled consultation before loading it for editing", async () => {
    fixtures.c.status = "cancelled";
    mocks.reopen.mockResolvedValue({ ...fixtures.c, status: "draft" });
    mount();
    expect(
      await screen.findByRole("heading", { name: "Apertura de prueba" }),
    ).toBeInTheDocument();
    expect(mocks.reopen).toHaveBeenCalledWith("draft");
  });
  it("offers the longitudinal evolution module alongside interview, measurements and laboratories", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    expect(screen.getByRole("button", { name: "Entrevista" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mediciones" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Laboratorios" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evolución" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Taller de dietas" })).toBeEnabled();
  });

  it("restores the exact section and unsaved answer after a remount", async () => {
    const first = mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.change(screen.getByLabelText(/detalle breve de prueba/i), {
      target: { value: "Respuesta todavía local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByRole("heading", { name: "Cierre de prueba" });
    first.unmount();

    mount();
    expect(
      await screen.findByRole("heading", { name: "Cierre de prueba" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByLabelText(/detalle breve de prueba/i)).toHaveValue(
      "Respuesta todavía local",
    );
  });
  it("requires resolving an existing draft before starting another consultation type", async () => {
    mocks.begin.mockResolvedValue({
      ...fixtures.c,
      id: "follow-up-draft",
      consultation_type: "follow_up",
    });
    mocks.getSnapshot.mockResolvedValue(null);
    mount("/app/patients/patient/consultations/new");
    await screen.findByRole("heading", {
      name: "¿Qué tipo de consulta vas a iniciar?",
    });
    expect(screen.getByText("Tienes un borrador abierto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Consulta inicial/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Consulta de seguimiento/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Eliminar borrador" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Consulta de seguimiento/ }));
    expect(await screen.findByRole("dialog", { name: "Elige un diseño de seguimiento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Seguimiento.*Duración aproximada/ })).not.toBeInTheDocument();
    expect(mocks.begin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar borrador para empezar otra" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar eliminación" }));
    await waitFor(() => expect(mocks.discard).toHaveBeenCalledWith("draft"));
    mocks.listConsultations.mockResolvedValue([]);
    fireEvent.click(await screen.findByRole("button", { name: /Seguimiento.*Duración aproximada/ }));
    expect(
      await screen.findByRole("heading", { name: "Apertura de prueba" }),
    ).toBeInTheDocument();
    expect(mocks.begin).toHaveBeenCalledWith("patient", "follow_up");
  });

  it("resumes an existing draft without changing its consultation date", async () => {
    mount("/app/patients/patient/consultations/new");
    await screen.findByRole("heading", {
      name: "¿Qué tipo de consulta vas a iniciar?",
    });
    expect(screen.getByRole("button", { name: "Reanudar borrador" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reanudar borrador" }));
    expect(
      await screen.findByRole("heading", { name: "Apertura de prueba" }),
    ).toBeInTheDocument();
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.updateDate).not.toHaveBeenCalled();
  });
  it("starts a consultation from a professional template id and renders its snapshot", async () => {
    mocks.listConsultations.mockResolvedValueOnce([]);
    mocks.getSnapshot.mockResolvedValue(null);
    mocks.ensure.mockImplementation(async (_consultation, loaded) => ({
      ...fixtures.snapshot,
      template_id: loaded.template.id,
      template_name: loaded.template.name,
      template_version: loaded.template.version,
      structure: {
        consultation_type: "initial",
        sections: [
          {
            section_key: "training",
            title: "Entrenamiento",
            questions: [
              {
                question_key: "training_days",
                label: "¿Cuántos días entrenas por semana?",
                question_type: "number",
                configuration: {},
                is_required: false,
                response_area: "patient_reported",
              },
            ],
          },
        ],
      },
    }));
    mount("/app/patients/patient/consultations/new");
    await screen.findByRole("heading", {
      name: "¿Qué tipo de consulta vas a iniciar?",
    });
    fireEvent.click(screen.getByRole("button", { name: /Consulta inicial/ }));
    expect(await screen.findByRole("dialog", { name: "Elige un diseño de consulta inicial" })).toBeInTheDocument();
    const systemOption = screen.getByRole("button", { name: /Entrevista.*45 min/ });
    expect(systemOption).toHaveClass("consultation-template-choice-system");
    expect(systemOption).toHaveTextContent("NOM-004-SSA3-2012");
    expect(systemOption).toHaveTextContent("NOM-043-SSA2-2012");
    expect(systemOption).toHaveTextContent("NOM-008-SSA3-2017");
    expect(screen.getByRole("button", { name: /Consulta inicial deportiva.*60 min/ })).toHaveClass("consultation-template-choice-personal");
    expect(screen.getByText("60 min")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Consulta inicial deportiva.*60 min/ }));
    expect(
      await screen.findByRole("heading", { name: "Entrenamiento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("¿Cuántos días entrenas por semana?"),
    ).toBeInTheDocument();
    expect(mocks.ensure).toHaveBeenCalledWith(
      expect.objectContaining({ id: "draft" }),
      expect.objectContaining({
        template: expect.objectContaining({ id: "sports-template" }),
      }),
    );
  });
  it("saves the most recent keystroke before changing sections", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.change(screen.getByLabelText(/detalle breve de prueba/i), {
      target: { value: "Respuesta recién escrita" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByRole("heading", { name: "Cierre de prueba" });
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "draft" }),
      expect.objectContaining({ revision: 1 }),
      { note: "Respuesta recién escrita" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(
      await screen.findByLabelText(/detalle breve de prueba/i),
    ).toHaveValue("Respuesta recién escrita");
  });
  it("uses the section cards to navigate through the existing save flow", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.change(screen.getByLabelText(/detalle breve de prueba/i), {
      target: { value: "Respuesta desde tarjeta" },
    });
    const sections = screen.getByRole("navigation", {
      name: "Secciones de la entrevista",
    });
    fireEvent.click(within(sections).getByRole("button", { name: /Cierre de prueba/ }));
    expect(await screen.findByRole("heading", { name: "Cierre de prueba" })).toBeInTheDocument();
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "draft" }),
      expect.objectContaining({ revision: 1 }),
      { note: "Respuesta desde tarjeta" },
    );
  });
  it("preserves answers and permits navigation after a failed background save", async () => {
    mocks.save.mockRejectedValue(new Error("Sin conexión. Vuelve a intentar."));
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.change(screen.getByLabelText(/detalle breve de prueba/i), {
      target: { value: "No perder" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión");
    expect(
      screen.getByRole("heading", { name: "Cierre de prueba" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Siguiente'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Anterior'}));
    await screen.findByRole('heading',{name:'Apertura de prueba'});
    expect(screen.getByLabelText(/detalle breve de prueba/i)).toHaveValue(
      "No perder",
    );
  });
  it('keeps module and clinical navigation available during an unresolved save',async()=>{
    let release!:()=>void;
    mocks.save.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
    mount();fireEvent.change(await screen.findByLabelText(/detalle breve de prueba/i),{target:{value:'Último cambio'}});
    fireEvent.click(screen.getByRole('button',{name:'Siguiente'}));
    await screen.findByRole('heading',{name:'Cierre de prueba'});
    await waitFor(()=>expect(mocks.save).toHaveBeenCalledOnce());
    expect(screen.getByRole('button',{name:'Siguiente'})).toBeEnabled();
    await openModule('Revisión clínica, PES y objetivos');
    fireEvent.click(screen.getByRole('button',{name:'Objetivos Acuerda la intervención'}));
    await screen.findByRole('heading',{name:'Objetivos SMART'});
    expect(screen.getByRole('button',{name:'Proponer objetivos con IA'})).toBeDisabled();
    await act(async()=>release());
    await openModule('Entrevista');fireEvent.click(screen.getByRole('button',{name:'Anterior'}));
    await screen.findByRole('heading',{name:'Apertura de prueba'});
    expect(screen.getByLabelText(/detalle breve de prueba/i)).toHaveValue('Último cambio');
  });
  it('ends a hung save after its deadline and retries without losing the local draft',async()=>{
    mount();await screen.findByRole('heading',{name:'Apertura de prueba'});
    vi.useFakeTimers();
    try {
      mocks.save.mockImplementationOnce(()=>new Promise(()=>{}));
      fireEvent.change(screen.getByLabelText(/detalle breve de prueba/i),{target:{value:'Conservar este texto'}});
      await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Guardar'}));await Promise.resolve();});
      await act(async()=>{await vi.advanceTimersByTimeAsync(20000);});
      expect(screen.getByRole('alert')).toHaveTextContent('tardó demasiado');
      expect(screen.getByRole('button',{name:'Siguiente'})).toBeEnabled();
      expect(screen.getByLabelText(/detalle breve de prueba/i)).toHaveValue('Conservar este texto');
      expect(JSON.parse(sessionStorage.getItem('nuthrick:consultation-workspace:draft')!).values.note).toBe('Conservar este texto');
      fireEvent.change(screen.getByLabelText(/detalle breve de prueba/i),{target:{value:'Último cambio mientras está sin conexión'}});
      await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
      expect(mocks.save).toHaveBeenCalledOnce();
      mocks.save.mockResolvedValue(undefined);
      await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Reintentar guardado'}));await Promise.resolve();});
      expect(screen.queryByRole('button',{name:'Reintentar guardado'})).not.toBeInTheDocument();
      expect(screen.getByRole('button',{name:'Guardar'})).toBeEnabled();
      expect(screen.getByLabelText(/detalle breve de prueba/i)).toHaveValue('Último cambio mientras está sin conexión');
    } finally {vi.useRealTimers();}
  });
  it("closes from measurements after saving, preserving the form when switching tabs", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.change(await screen.findByRole("combobox", { name: /Confirmación de prueba/ }), { target: { value: "Revisado" } });
    await openModule("Mediciones");
    fireEvent.change(screen.getByLabelText("Peso de prueba"), { target: { value: "87.6" } });
    await openModule("Entrevista");
    await openModule("Mediciones");
    expect(screen.getByLabelText("Peso de prueba")).toHaveValue("87.6");
    fireEvent.click(screen.getByRole("button", { name: "Revisar cierre de consulta" }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(within(dialog).getByRole("button", { name: "Confirmar cierre" })).toBeDisabled();
    expect(mocks.finish).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Volver a la consulta" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Guardar medición de prueba" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar cierre de consulta" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar cierre" }));
    expect(await screen.findByRole("heading", { name: "Ficha guardada" })).toBeInTheDocument();
    expect(mocks.finish).toHaveBeenCalledOnce();
  });
  it("can close after adopting an updated interview", async () => {
    const previousVersion = fixtures.template.template.version;
    fixtures.template.template.version = 3;
    mocks.adopt.mockResolvedValue({ ...fixtures.snapshot, template_version: 3, revision: 2 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      mount();
      fireEvent.click(await screen.findByRole("button", { name: "Usar entrevista actualizada" }));
      await screen.findByText(/Entrevista actualizada\. Las respuestas anteriores/);
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      fireEvent.change(await screen.findByRole("combobox", { name: /Confirmación de prueba/ }), { target: { value: "Revisado" } });
      await openModule("Mediciones");
      fireEvent.click(screen.getByRole("button", { name: "Revisar cierre de consulta" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("checkbox"));
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar cierre" }));
      expect(await screen.findByRole("heading", { name: "Ficha guardada" })).toBeInTheDocument();
      expect(mocks.finish).toHaveBeenCalledOnce();
    } finally {
      fixtures.template.template.version = previousVersion;
      confirm.mockRestore();
    }
  });
  it("returns to the required answer when closing from another tab", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    await openModule("Mediciones");
    fireEvent.click(screen.getByRole("button", { name: "Revisar cierre de consulta" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar cierre" }));
    expect(await screen.findByRole("heading", { name: "Cierre de prueba" })).toBeVisible();
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it("blocks closure with uncommitted laboratory edits even from another tab", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    await openModule("Laboratorios");
    fireEvent.click(screen.getByRole("button", { name: "Editar laboratorio de prueba" }));
    await openModule("Entrevista");
    fireEvent.click(screen.getByRole("button", { name: "Revisar cierre de consulta" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(within(dialog).getByRole("status")).toHaveTextContent("Laboratorios");
    expect(within(dialog).getByRole("button", { name: "Confirmar cierre" })).toBeDisabled();
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it("requires review and catches missing required responses before closing", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.change(screen.getByLabelText("Ir a una sección"), {
      target: { value: "2" },
    });
    await screen.findByRole("heading", { name: "Revisa lo conversado" });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cierre de consulta' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Confirmar cierre' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cierre' }));
    await screen.findByRole("heading", { name: "Cierre de prueba" });
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(screen.getByText("Falta responder.")).toBeInTheDocument();
  });
  it.each(["Mejorar adherencia al plan.", ""])("saves the initial treatment objective and closes safely (%s)", async (objective) => {
    const section = {
      section_key: "treatment_objective",
      title: "Objetivo del tratamiento nutricional",
      questions: [{
        question_key: "treatment_objective",
        label: "Objetivo acordado con el paciente",
        help_text: "Define en una frase clara el objetivo acordado con el paciente.",
        question_type: "long_text",
        configuration: { max_length: 2000 },
        is_required: false,
        response_area: "professional_assessment",
      }],
    };
    fixtures.snapshot.structure.sections.push(section);
    try {
      mount();
      await screen.findByRole("heading", { name: "Apertura de prueba" });
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      await screen.findByRole("heading", { name: "Cierre de prueba" });
      fireEvent.change(screen.getByRole("combobox", { name: /Confirmación de prueba/ }), { target: { value: "Revisado" } });
      await openModule("Revisión clínica, PES y objetivos");
      fireEvent.click(screen.getByRole('button', { name: /Objetivos Acuerda/ }));
      await screen.findByRole("heading", { name: "Objetivos SMART" });
      if (objective) {
        await waitFor(()=>expect(screen.getByRole('button',{name:'Agregar objetivo'})).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: 'Agregar objetivo' }));
        editObjectiveOutcome(objective);
            fireEvent.click(screen.getByRole('button', { name: 'Guardar consulta' }));
        await waitFor(()=>expect(mocks.draftState.answers['objective:treatment_objective']).toEqual(expect.objectContaining({goals:[expect.objectContaining({outcome:objective})]})));
      }
      fireEvent.click(screen.getByRole('button', { name: 'Revisar cierre de consulta' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('checkbox'));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cierre' }));
      await waitFor(() => expect(mocks.finish).toHaveBeenCalledOnce());
      if (objective) expect(mocks.save).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ treatment_objective: objective }));
      expect(mocks.objective.mock.calls.some(args => args[2] === 'approve')).toBe(false);
    } finally {
      fixtures.snapshot.structure.sections.pop();
    }
  });
  it("closes after saving and reviewing, without requiring optional blank notes", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByRole("heading", { name: "Cierre de prueba" });
    fireEvent.change(
      screen.getByRole("combobox", { name: /Confirmación de prueba/ }),
      { target: { value: "Revisado" } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revisar cierre de consulta' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cierre' }));
    await waitFor(() => expect(mocks.finish).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("heading", { name: "Ficha guardada" }),
    ).toBeInTheDocument();
  });
});

const exitTitle = "¿Qué quieres hacer con esta consulta?";
const workshopCloseTitle = "Cerrar consulta y abrir el Taller de dietas";
async function requestWorkshop() {
  const button = await screen.findByRole("button", { name: "Taller de dietas" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  return screen.findByRole("dialog", { name: workshopCloseTitle });
}

describe("closing a consultation before the diet workshop", () => {
  it("saves the last answer, requires review and waits for a successful closure before opening the same consultation in the workshop", async () => {
    mocks.answerState.answers = { review: "Revisado" };
    let resolveFinish!: (value: typeof fixtures.c) => void;
    mocks.finish.mockImplementationOnce(() => new Promise(resolve => { resolveFinish = resolve; }));
    const { router } = mount();
    fireEvent.change(await screen.findByLabelText("Detalle breve de prueba"), { target: { value: "Último cambio antes del Taller" } });
    const dialog = await requestWorkshop();
    expect(screen.queryByRole("dialog", { name: exitTitle })).not.toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Cerrar y abrir el Taller" });
    expect(confirm).toBeDisabled();
    expect(mocks.finish).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.finish).toHaveBeenCalledOnce());
    expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: "draft" }), expect.anything(), { note: "Último cambio antes del Taller" });
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.finish.mock.invocationCallOrder[0]);
    expect(router.state.location.pathname).toBe("/app/patients/patient/consultations/draft");
    expect(within(dialog).getByRole("button", { name: "Cerrando…" })).toBeDisabled();
    await act(async () => { resolveFinish({ ...fixtures.c, status: "completed" }); });
    await screen.findByRole("heading", { name: "Taller de dietas preparado" });
    expect(router.state.location.pathname + router.state.location.search).toBe("/app/diet-workshop?patientId=patient&consultationId=draft");
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("nuthrick:consultation-workspace:draft")).toBeNull();
  });

  it("cancels the workshop destination and requires a fresh review for a normal closure", async () => {
    mocks.answerState.answers = { review: "Revisado" };
    mount();
    const workshopDialog = await requestWorkshop();
    fireEvent.click(within(workshopDialog).getByRole("checkbox"));
    fireEvent.click(within(workshopDialog).getAllByRole("button", { name: "Volver a la consulta" })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.discard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar cierre de consulta" }));
    const dialog = await screen.findByRole("dialog", { name: "Cerrar entrevista" });
    expect(within(dialog).getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar cierre" }));
    await screen.findByRole("heading", { name: "Ficha guardada" });
    expect(screen.queryByRole("heading", { name: "Taller de dietas preparado" })).not.toBeInTheDocument();
  });

  it("keeps the consultation open when the closing review is dismissed with Escape", async () => {
    const { router } = mount();
    const dialog = await requestWorkshop();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app/patients/patient/consultations/draft");
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.discard).not.toHaveBeenCalled();
  });

  it.each(["save", "finish"] as const)("preserves the consultation and the workshop destination when %s fails, then allows retrying", async failure => {
    mocks.answerState.answers = { review: "Revisado" };
    const { router } = mount();
    fireEvent.change(await screen.findByLabelText("Detalle breve de prueba"), { target: { value: "Conservar al fallar" } });
    const dialog = await requestWorkshop();
    if (failure === "save") mocks.save.mockRejectedValue(new Error("No hay conexión para guardar"));
    else mocks.finish.mockRejectedValueOnce(new Error("No pudimos cerrar la consulta"));
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar y abrir el Taller" }));
    await within(dialog).findByRole("alert");
    expect(router.state.location.pathname).toBe("/app/patients/patient/consultations/draft");
    expect(screen.getByLabelText("Detalle breve de prueba")).toHaveValue("Conservar al fallar");
    expect(sessionStorage.getItem("nuthrick:consultation-workspace:draft")).not.toBeNull();
    if (failure === "save") expect(mocks.finish).not.toHaveBeenCalled();
    mocks.save.mockResolvedValue(undefined);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar y abrir el Taller" }));
    await screen.findByRole("heading", { name: "Taller de dietas preparado" });
    expect(router.state.location.search).toBe("?patientId=patient&consultationId=draft");
    expect(mocks.discard).not.toHaveBeenCalled();
  });

  it("returns to a missing required answer and opens the workshop only after correcting it and reviewing again", async () => {
    const { router } = mount();
    let dialog = await requestWorkshop();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar y abrir el Taller" }));
    await screen.findByRole("heading", { name: "Cierre de prueba" });
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/app/patients/patient/consultations/draft");
    fireEvent.change(screen.getByRole("combobox", { name: /Confirmación de prueba/ }), { target: { value: "Revisado" } });
    dialog = await requestWorkshop();
    expect(within(dialog).getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar y abrir el Taller" }));
    await screen.findByRole("heading", { name: "Taller de dietas preparado" });
  });

  it.each(["Mediciones", "Laboratorios", "Recordatorio de 24 horas"])("protects unconfirmed changes in %s before closing for the workshop", async moduleName => {
    mocks.answerState.answers = { review: "Revisado" };
    mount();
    await openModule(moduleName);
    if (moduleName === "Mediciones") fireEvent.change(screen.getByLabelText("Peso de prueba"), { target: { value: "72.5" } });
    else if (moduleName === "Laboratorios") fireEvent.click(screen.getByRole("button", { name: "Editar laboratorio de prueba" }));
    else {
      fireEvent.click(screen.getByRole("button", { name: "Capturar recordatorio" }));
      fireEvent.change(screen.getByLabelText("Texto capturado"), { target: { value: "Recordatorio por confirmar" } });
    }
    const dialog = await requestWorkshop();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(within(dialog).getByRole("button", { name: "Cerrar y abrir el Taller" })).toBeDisabled();
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Taller de dietas preparado" })).not.toBeInTheDocument();
  });
});

async function requestExit() {
  fireEvent.click(screen.getByRole("button", { name: "Abrir mensaje" }));
  return screen.findByRole("dialog", { name: exitTitle });
}

describe("consultation exit decisions", () => {
  it("asks even with no edits and allows continuing the consultation", async () => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    fireEvent.click(screen.getByRole("link", { name: "Pacientes" }));
    const dialog = await screen.findByRole("dialog", { name: exitTitle });
    expect(screen.queryByRole("heading", { name: "Lista de pacientes" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Continuar en la consulta" }));
    expect(screen.queryByRole("dialog", { name: exitTitle })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Apertura de prueba" })).toBeInTheDocument();
    expect(mocks.discard).not.toHaveBeenCalled();
  });
  it("saves the last keystroke before opening a message", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText(/detalle breve de prueba/i), { target: { value: "Respuesta recién escrita" } });
    const dialog = await requestExit();
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar borrador y salir" }));
    await screen.findByRole("heading", { name: "Mensajes del paciente" });
    expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: "draft" }), expect.anything(), { note: "Respuesta recién escrita" });
    expect(mocks.discard).not.toHaveBeenCalled();
  });
  it("asks after autosave has finished", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText(/detalle breve de prueba/i), { target: { value: "Ya guardado" } });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce(), { timeout: 3500 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("link", { name: "Mensajes" }));
    expect(await screen.findByRole("dialog", { name: exitTitle })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mensajes del paciente" })).not.toBeInTheDocument();
  });
  it("blocks browser Back and preserves the requested destination", async () => {
    const { router } = mount(undefined, "/app/patients");
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    await act(async () => { await router.navigate(-1); });
    const dialog = await screen.findByRole("dialog", { name: exitTitle });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar borrador y salir" }));
    await screen.findByRole("heading", { name: "Lista de pacientes" });
    expect(router.state.location.pathname).toBe("/app/patients");
  });
  it("discards only this consultation and clears its local recovery copy", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText(/detalle breve de prueba/i), { target: { value: "Descartar esto" } });
    sessionStorage.setItem("nuthrick:consultation-workspace:other", "other draft");
    const dialog = await requestExit();
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar consulta y salir" }));
    await screen.findByRole("heading", { name: "Mensajes del paciente" });
    expect(mocks.discard).toHaveBeenCalledExactlyOnceWith("draft");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("nuthrick:consultation-workspace:draft")).toBeNull();
    expect(sessionStorage.getItem("nuthrick:consultation-workspace:other")).toBe("other draft");
  });
  it("waits for an in-flight save before discarding", async () => {
    let resolveSave!: () => void;
    mocks.save.mockImplementationOnce(() => new Promise<void>(resolve => { resolveSave = resolve; }));
    mount();
    fireEvent.change(await screen.findByLabelText(/detalle breve de prueba/i), { target: { value: "Guardado en curso" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    const dialog = await requestExit();
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar consulta y salir" }));
    expect(mocks.discard).not.toHaveBeenCalled();
    await act(async () => { resolveSave(); });
    await screen.findByRole("heading", { name: "Mensajes del paciente" });
    expect(mocks.discard).toHaveBeenCalledExactlyOnceWith("draft");
  });
  it.each(["save", "discard"] as const)("keeps the form open and allows retry when %s fails", async action => {
    if (action === "save") mocks.save.mockRejectedValueOnce(new Error("Sin conexión"));
    else mocks.discard.mockRejectedValueOnce(new Error("Sin conexión"));
    mount();
    fireEvent.change(await screen.findByLabelText(/detalle breve de prueba/i), { target: { value: "Conservar si falla" } });
    const dialog = await requestExit();
    const label = action === "save" ? "Guardar borrador y salir" : "Eliminar consulta y salir";
    fireEvent.click(within(dialog).getByRole("button", { name: label }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mensajes del paciente" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/detalle breve de prueba/i)).toHaveValue("Conservar si falla");
    fireEvent.click(within(dialog).getByRole("button", { name: label }));
    await screen.findByRole("heading", { name: "Mensajes del paciente" });
  });
  it.each(["Mediciones", "Laboratorios", "Recordatorio de 24 horas"])("protects pending edits in %s", async moduleName => {
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    await openModule(moduleName);
    if (moduleName === "Mediciones") fireEvent.change(screen.getByLabelText("Peso de prueba"), { target: { value: "72.5" } });
    else if (moduleName === "Laboratorios") fireEvent.click(screen.getByRole("button", { name: "Editar laboratorio de prueba" }));
    else {
      fireEvent.click(screen.getByRole("button", { name: "Capturar recordatorio" }));
      fireEvent.change(screen.getByLabelText("Texto capturado"), { target: { value: "Desayuno por revisar" } });
    }
    await openModule("Entrevista");
    const dialog = await requestExit();
    expect(within(dialog).getByRole("button", { name: "Guardar borrador y salir" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Revisar cambios pendientes" }));
    expect(screen.queryByRole("dialog", { name: exitTitle })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: moduleName })).toHaveAttribute("aria-current", "page");
    if (moduleName === "Mediciones") expect(screen.getByLabelText("Peso de prueba")).toHaveValue("72.5");
    if (moduleName === "Recordatorio de 24 horas") expect(screen.getByLabelText("Texto capturado")).toHaveValue("Desayuno por revisar");
  });
  it("warns on refresh even with no pending autosave", async () => {
    const { unmount } = mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    unmount();
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
  it("leaves the type chooser freely before starting a consultation", async () => {
    mount("/app/patients/patient/consultations/new");
    await screen.findByRole("heading", { name: "¿Qué tipo de consulta vas a iniciar?" });
    fireEvent.click(screen.getByRole("link", { name: "Mensajes" }));
    await screen.findByRole("heading", { name: "Mensajes del paciente" });
    expect(mocks.begin).not.toHaveBeenCalled();
  });
  it("keeps an existing draft when deletion is cancelled", async () => {
    mount("/app/patients/patient/consultations/new");
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar borrador" }));
    const dialog = await screen.findByRole("dialog", { name: "¿Eliminar este borrador?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Conservar borrador" }));
    expect(screen.getByRole("button", { name: "Reanudar borrador" })).toBeInTheDocument();
    expect(mocks.discard).not.toHaveBeenCalled();
  });
});

describe("consultation exit edge cases", () => {
  it('restores a saved clarification and completes the PES in the same editor without the legacy measurement inputs', async () => {
    const question = '¿Desde cuándo se presenta la dificultad para preparar las comidas?';
    const title = 'Dificultad para organizar las comidas';
    const answer = 'Empezó al cambiar de turno hace tres semanas.';
    const checkFields = { ...fixtures.snapshot, structure: { ...fixtures.snapshot.structure, sections: [
      ...fixtures.snapshot.structure.sections,
      { section_key: 'measurements', title: 'Mediciones e indicadores', questions: [
        { question_key: 'measurement_notes', label: 'Notas de medición e indicadores', question_type: 'long_text', configuration: {}, is_required: false, response_area: 'professional_assessment' },
        { question_key: 'indicator_progress', label: 'Interpretación profesional de la evolución', question_type: 'long_text', configuration: {}, is_required: false, response_area: 'professional_assessment' },
      ] },
    ] } };
    mocks.getSnapshot.mockResolvedValue(checkFields);
    mocks.draftState.answers = { pes: {
      problem: title, etiology: '', signsSymptoms: ['Cambio en los horarios de comida'],
      pesStatement: '', evidence: [], missingContext: [question], uncertainties: [],
    } };
    const openPes = async () => {
      if (!screen.queryByRole('navigation', { name: 'Pasos de la revisión clínica' })) {
        await openModule('Revisión clínica, PES y objetivos');
      }
      fireEvent.click(within(screen.getByRole('navigation', { name: 'Pasos de la revisión clínica' })).getByRole('button', { name: /^PES / }));
      return screen.findByRole('textbox', { name: question });
    };
    const first = mount();
    fireEvent.change(await openPes(), { target: { value: answer } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await screen.findByText('Borrador guardado.');
    first.unmount();
    window.sessionStorage.clear();

    mount();
    expect(await openPes()).toHaveValue(answer);
    expect(screen.queryByText('Notas de medición e indicadores')).not.toBeInTheDocument();
    expect(screen.queryByText('Interpretación profesional de la evolución')).not.toBeInTheDocument();
    const updated = { problem: title, etiology: 'cambio reciente de turno referido', signsSymptoms: ['Cambio en los horarios de comida'],
      evidence: [], missingContext: [], uncertainties: [], completedWithClarifications: true };
    mocks.generate.mockResolvedValueOnce({ generationId: 'completion-pes', status: 'succeeded', output: updated });
    const complete = screen.getByRole('button', { name: 'Completar PES con IA' });
    await waitFor(() => expect(complete).toBeEnabled());
    fireEvent.click(complete);
    await screen.findByText('PES actualizado. Revisa el texto antes de aprobarlo.');
    expect(screen.getByRole('textbox', { name: pesTextName })).toHaveValue(formatPesEditorText(updated));
    expect(screen.queryByRole('heading', { name: 'Datos por confirmar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprobar PES' })).toBeEnabled();
    expect(mocks.clinical.mock.calls.some(args => args[2] === 'pes')).toBe(false);
  });

  it('opens a saved batch PES directly in the editor and preserves its source after saving edits', async () => {
    const generationId = 'pes-from-batch';
    const batchId = 'saved-batch';
    const source = { source: 'Entrevista', finding: 'Horarios de comida anotados' };
    let record: { approved_at: string; evidence: typeof source[] } | undefined;
    mocks.clinical.mockImplementation(async (_id, _revision, kind, payload) => {
      if (kind === 'pes') {
        record = { approved_at: '2026-11-21T00:00:00Z', evidence: payload.evidence };
        mocks.answerState = { version: mocks.answerState.version + 1, answers: {
          ...mocks.answerState.answers,
          pes_problem: payload.problem, pes_etiology: payload.etiology,
          pes_evidence: payload.signsSymptoms.join('\n'), pes_statement: payload.pesStatement,
        } };
      }
      return { stamp: 's', readiness: { interview: true }, records: record ? { pes: record } : {} };
    });
    mocks.draftState.answers = {
      'clinical-batch': { id: batchId, attempts: {}, completed: { pes_diagnosis: generationId } },
      [clinicalBatchKey('pes_diagnosis')]: {
        batchId, generationId,
        output: { problem: 'Patrón de comidas irregular', etiology: '', signsSymptoms: ['Horarios variables'], evidence: [source], missingContext: ['Confirmar la causa'], uncertainties: [] },
      },
    };
    const first = mount();
    await openModule('Revisión clínica, PES y objetivos');
    fireEvent.click(screen.getByRole('button', { name: 'Revisar Diagnóstico PES' }));
    expect(await screen.findByRole('textbox', { name: pesTextName })).toHaveValue('Problema\nPatrón de comidas irregular\n\nEtiología\n\n\nSignos y síntomas\nHorarios variables');
    expect(screen.getAllByRole('textbox', { name: pesTextName })).toHaveLength(1);
    expect(screen.getByText('Borrador de IA')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Aprobar PES' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Etiología' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: pesTextName })).toHaveFocus());
    const editedPesText = 'PROBLEMA:\nPatrón de comidas irregular\n\nEtiología\nBarrera de horario confirmada\n\n\nSignos y síntomas\nHorarios variables';
    fireEvent.change(screen.getByRole('textbox', { name: pesTextName }), { target: { value: editedPesText } });
    expect(screen.getByText('Borrador de IA editado')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await screen.findByText('Borrador guardado.');
    expect(mocks.draftState.answers).toMatchObject({
      pes: { etiology: 'Barrera de horario confirmada', evidence: [source], editorText: editedPesText },
      'generation:pes_diagnosis': generationId,
    });
    expect(mocks.clinical.mock.calls.some(args => args[2] === 'pes')).toBe(false);

    first.unmount();
    sessionStorage.clear();
    const second = mount();
    await openModule('Revisión clínica, PES y objetivos');
    expect(await screen.findByRole('textbox', { name: pesTextName })).toHaveValue(editedPesText);
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar PES' }));
    await waitFor(() => expect(mocks.clinical).toHaveBeenCalledWith('draft', 1, 'pes', expect.objectContaining({
      problem: 'Patrón de comidas irregular', etiology: 'Barrera de horario confirmada', signsSymptoms: ['Horarios variables'],
      pesStatement: 'Patrón de comidas irregular relacionado con Barrera de horario confirmada, evidenciado por Horarios variables.',
      evidence: [source], evidenceReviewed: true,
    }), generationId));
    const approvedBadge = await screen.findByText('PES aprobado', { exact: true });
    const card = approvedBadge.closest('[data-approved="true"]')!;
    expect(within(card as HTMLElement).getByRole('textbox', { name: pesTextName })).toHaveAttribute('readonly');
    expect(within(card as HTMLElement).getByRole('textbox', { name: pesTextName })).toHaveValue(editedPesText);
    await waitFor(() => expect(mocks.draftState.answers['pes-approved-text']).toMatchObject({ text: editedPesText }));

    second.unmount();
    sessionStorage.clear();
    mount();
    await openModule('Revisión clínica, PES y objetivos');
    await screen.findByText('PES aprobado', { exact: true });
    expect(screen.getByRole('textbox', { name: pesTextName })).toHaveValue(editedPesText);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("saves an unapproved PES and restores its editor from the server after returning", async () => {
    const first=mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    await openModule("Revisión clínica, PES y objetivos");
    fireEvent.click(await screen.findByRole("button", { name: /PES Formula el diagnóstico/ }));
    const text = formatPesEditorText({ problem: "Propuesta escrita por revisar", etiology: "", signsSymptoms: [] });
    fireEvent.change(screen.getByRole("textbox", { name: pesTextName }), { target: { value: text } });
    await openModule("Entrevista");
    const dialog = await requestExit();
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar borrador y salir" }));
    await screen.findByRole('heading',{name:'Mensajes del paciente'});
    first.unmount();sessionStorage.clear();mount();
    await screen.findByRole('heading',{name:'Apertura de prueba'});
    await openModule('Revisión clínica, PES y objetivos');
    fireEvent.click(await screen.findByRole('button',{name:/PES Formula el diagnóstico/}));
    expect(await screen.findByRole('textbox', { name: pesTextName })).toHaveValue(text);
    expect(mocks.clinical.mock.calls.some(args=>args[2]==='pes')).toBe(false);
  });
  it("preserves a reopened clinical history instead of offering deletion", async () => {
    mocks.listConsultations.mockResolvedValue([{ ...fixtures.c, draft_discard_protected: true }]);
    mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    const dialog = await requestExit();
    expect(within(dialog).queryByRole("button", { name: "Eliminar consulta y salir" })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/conserva un historial previo/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar borrador y salir" }));
    await screen.findByRole("heading", { name: "Mensajes del paciente" });
    expect(mocks.discard).not.toHaveBeenCalled();
  });
  it("saves a changed consultation date before leaving", async () => {
    mount();
    fireEvent.change(await screen.findByLabelText("Fecha de consulta"), { target: { value: "2026-09-01" } });
    const dialog = await requestExit();
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar borrador y salir" }));
    await screen.findByRole("heading", { name: "Mensajes del paciente" });
    expect(mocks.updateDate).toHaveBeenCalledWith("draft", "2026-09-01", undefined);
  });
  it("holds navigation while the first draft creation request is pending", async () => {
    let resolveStart!: (value: typeof fixtures.c) => void;
    mocks.listConsultations.mockResolvedValue([]);
    mocks.begin.mockImplementationOnce(() => new Promise<typeof fixtures.c>(resolve => { resolveStart = resolve; }));
    mount("/app/patients/patient/consultations/new");
    fireEvent.click(await screen.findByRole("button", { name: /Consulta inicial/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Entrevista.*Duración aproximada/ }));
    await waitFor(() => expect(mocks.begin).toHaveBeenCalledOnce());
    const dialog = await requestExit();
    expect(within(dialog).getByRole("button", { name: "Guardar borrador y salir" })).toBeDisabled();
    await act(async () => { resolveStart(fixtures.c); });
    const readyDialog = await screen.findByRole("dialog", { name: exitTitle });
    await waitFor(() => expect(within(readyDialog).getByRole("button", { name: "Guardar borrador y salir" })).toBeEnabled());
    fireEvent.click(within(readyDialog).getByRole("button", { name: "Guardar borrador y salir" }));
    await screen.findByRole("heading", { name: "Mensajes del paciente" });
    expect(mocks.begin).toHaveBeenCalledOnce();
  });
});
