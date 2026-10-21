import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, createRoutesFromElements, Link, Outlet, Route, RouterProvider, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationPage } from "./ConsultationPage";
import { withWorkflowSections } from '@/src/features/consultations/consultationWorkflow';
import { approvedPes, objectiveWorkspace, smartPlan } from '@/src/test/clinicalFixtures';
import { composeObjective, type ObjectivePlan } from '../../../supabase/functions/_shared/objectives';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  discard: vi.fn(),
  finish: vi.fn(),
  adopt: vi.fn(),
  begin: vi.fn(),
  listConsultations: vi.fn(),
  getSnapshot: vi.fn(),
  reopen: vi.fn(),
  updateDate: vi.fn(),
  ensure: vi.fn(),
  objective: vi.fn(),
  clinical: vi.fn(),
  generate: vi.fn(),
  interventions: vi.fn(),
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
    </Route>,
  ), { initialEntries: previous ? [previous, entry] : [entry] });
  return { ...render(<RouterProvider router={router} />), router };
};
async function openModule(name: string) {
  fireEvent.click(await screen.findByRole('button', { name }));
  await waitFor(() => expect(screen.getByRole('button', { name })).toHaveAttribute('aria-current', 'page'));
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.clearAllMocks();
  window.sessionStorage.clear();
  mocks.save.mockResolvedValue(undefined);
  mocks.answerState={version:0,answers:{}};
  mocks.draftState={version:0,answers:{}};
  mocks.discard.mockResolvedValue(undefined);
  mocks.finish.mockResolvedValue(fixtures.c);
  fixtures.c.status = "draft";
  mocks.listConsultations.mockResolvedValue([fixtures.c]);
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
  it('clears saved PES answers and keeps them empty after reopening and reloading', async () => {
    const cleared = { pes_problem: '', pes_etiology: '', pes_evidence: '', pes_statement: '' };
    mocks.answerState.answers = { note: 'Conservar entrevista', pes_problem: 'Problema anterior', pes_etiology: 'Causa anterior', pes_evidence: 'Evidencia anterior', pes_statement: 'Problema anterior relacionado con Causa anterior, evidenciado por Evidencia anterior.' };
    const first = mount();
    await screen.findByRole('heading', { name: 'Apertura de prueba' });
    await openModule('Revisión clínica, PES y objetivos');
    fireEvent.click(screen.getByRole('button', { name: /PES Formula el diagnóstico/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar PES escrito' }));
    expect(screen.getByLabelText('Problema')).toHaveValue('Problema anterior');
    fireEvent.click(screen.getByRole('button', { name: 'Descartar y limpiar' }));
    await screen.findByText('PES descartado y campos limpios.');
    expect(mocks.answerState.answers).toMatchObject({ ...cleared, note: 'Conservar entrevista' });
    expect(screen.queryByText(/Problema anterior relacionado con/)).not.toBeInTheDocument();
    if (!screen.queryByLabelText('Problema')) fireEvent.click(screen.getByRole('button', { name: 'Redactar PES manualmente' }));
    for (const label of ['Problema', 'Etiología', 'Signos y síntomas']) expect(screen.getByLabelText(label)).toHaveValue('');
    first.unmount();
    mount();
    await openModule('Revisión clínica, PES y objetivos');
    fireEvent.click(screen.getByRole('button', { name: /PES Formula el diagnóstico/ }));
    if (!screen.queryByLabelText('Problema')) fireEvent.click(await screen.findByRole('button', { name: 'Redactar PES manualmente' }));
    for (const label of ['Problema', 'Etiología', 'Signos y síntomas']) expect(screen.getByLabelText(label)).toHaveValue('');
    expect(mocks.answerState.answers).toMatchObject({ ...cleared, note: 'Conservar entrevista' });
  });
  it('preserves saved PES text when clearing fails and allows retrying', async () => {
    const answers = { note: 'Conservar entrevista', pes_problem: 'Problema anterior', pes_etiology: 'Causa anterior', pes_evidence: 'Evidencia anterior', pes_statement: 'Problema anterior relacionado con Causa anterior, evidenciado por Evidencia anterior.' };
    mocks.answerState.answers = { ...answers };
    mount();
    await screen.findByRole('heading', { name: 'Apertura de prueba' });
    await openModule('Revisión clínica, PES y objetivos');
    fireEvent.click(screen.getByRole('button', { name: /PES Formula el diagnóstico/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar PES escrito' }));
    mocks.save.mockRejectedValue(new Error('Sin conexión'));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar y limpiar' }));
    await screen.findByText(/No pudimos limpiar el PES guardado/);
    expect(screen.getByLabelText('Problema')).toHaveValue(answers.pes_problem);
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Redactar PES manualmente' })).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByRole('heading', { name: 'Un objetivo a la vez' });
    expect(screen.getByRole('button', { name: 'Agregar objetivo' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Proponer objetivos con IA' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Redactar PES manualmente' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByRole('heading', { name: 'Del objetivo a la acción' });
    expect(screen.getByRole('button', { name: 'Proponer estrategias con IA' })).toBeEnabled();
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
    await screen.findByRole('heading', { name: 'Un objetivo a la vez' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Proponer objetivos con IA' })).toBeEnabled());
    expect(mocks.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Proponer objetivos con IA' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar y revisar' }));
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ feature: 'consultation_support', patientId: 'patient', consultationId: 'draft', revision: 1 }));
    expect(mocks.save.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
    expect(screen.getByLabelText('Acuerdo · objetivo 1')).toHaveValue('pending');
    expect(screen.getByRole('button', { name: 'Aprobar objetivos' })).toBeDisabled();
    expect(mocks.objective.mock.calls.every(args => args.length === 2)).toBe(true);
    fireEvent.change(screen.getByLabelText('Resultado esperado · objetivo 1'), { target: { value: 'Resultado revisado por el profesional' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y cerrar' }));
    await screen.findByText('Borrador guardado. Puedes continuar y revisarlo después.');
    expect(savedPlan?.goals[0]).toMatchObject({ outcome: 'Resultado revisado por el profesional', agreement: 'pending', sign: approvedPes.signsSymptoms });
    expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'draft' }), expect.objectContaining({ revision: 1 }), expect.objectContaining({ treatment_objective: composeObjective(savedPlan!.goals[0]) }));
    fireEvent.click(screen.getByRole('button', { name: /Estrategia Define las acciones y responsables/ }));
    expect(await screen.findByRole('button', { name: 'Proponer estrategias con IA' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Objetivos Acuerda/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar objetivo 1' }));
    fireEvent.change(await screen.findByLabelText('Acuerdo · objetivo 1'), { target: { value: 'patient' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar revisión del objetivo' }));
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
    expect(screen.getByRole("link", { name: "Taller de dietas" })).toHaveAttribute(
      "href",
      "/app/diet-workshop?patientId=patient&consultationId=draft",
    );
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
    await screen.findByRole('heading',{name:'Un objetivo a la vez'});
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
      await screen.findByRole("heading", { name: "Un objetivo a la vez" });
      if (objective) {
        await waitFor(()=>expect(screen.getByRole('button',{name:'Agregar objetivo'})).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: 'Agregar objetivo' }));
        fireEvent.change(await screen.findByLabelText('Resultado esperado · objetivo 1'), { target: { value: objective } });
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar revisión del objetivo' }));
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
  it("saves an unapproved PES and restores its editor from the server after returning", async () => {
    const first=mount();
    await screen.findByRole("heading", { name: "Apertura de prueba" });
    await openModule("Revisión clínica, PES y objetivos");
    fireEvent.click(await screen.findByRole("button", { name: /PES Formula el diagnóstico/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Redactar PES manualmente" }));
    fireEvent.change(screen.getByLabelText("Problema"), { target: { value: "Propuesta escrita por revisar" } });
    await openModule("Entrevista");
    const dialog = await requestExit();
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar borrador y salir" }));
    await screen.findByRole('heading',{name:'Mensajes del paciente'});
    first.unmount();sessionStorage.clear();mount();
    await screen.findByRole('heading',{name:'Apertura de prueba'});
    await openModule('Revisión clínica, PES y objetivos');
    fireEvent.click(await screen.findByRole('button',{name:/PES Formula el diagnóstico/}));
    expect(await screen.findByLabelText('Problema')).toHaveValue('Propuesta escrita por revisar');
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
