import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ClinicalInterventions } from "./ClinicalInterventions";
import { formatStrategyEditorText, readStrategyEditorText, type StrategyTextField } from '@/src/features/consultations/strategyEditorText';
import {approvedPes,smartPlan} from '@/src/test/clinicalFixtures';
import {
  emptyStrategy,
  type Strategy,
  type StrategyDocument,
} from "../../../../supabase/functions/_shared/interventions";
const api = vi.hoisted(() => ({
  workspace: vi.fn(),
  generate: vi.fn(),
  before: vi.fn(),
  batch: vi.fn(),
}));
vi.mock(
  "@/src/services/clinicalInterventions",
  () => ({ clinicalInterventions: api.workspace }),
);
vi.mock(
  "@/src/features/admin/AccessProvider",
  () => ({
    useAccess: () => ({
      data: {
        access: { allowed: true, values: { "ai.consultation_support": true } },
      },
    }),
  }),
);
vi.mock(
  "@/src/services/ai",
  () => ({
    runAIRequest: api.generate,
    getAIGenerationStatus: vi.fn(),
    AIRequestError: class extends Error {},
    aiMessages: {},
  }),
);
vi.mock("./ClinicalBatchAI", () => ({ useClinicalBatchProposal: api.batch }));
const pes = {
  ...approvedPes,
  approved_at: "2026-10-18T12:00:00Z",
  pesStatement: "PES sintético",
};
const workspace = {
  stamp: "synthetic",
  pes,
  objective: {
    approved_at: "2026-10-18T12:10:00Z",
    pes_approved_at: pes.approved_at,
    pes_statement: pes.pesStatement,
    smart_plan: smartPlan(),
  },
  items: [],
  facts: [],
};
const document = (): StrategyDocument => ({
  version: 1,
  pesApprovedAt: pes.approved_at,
  objectiveApprovedAt: workspace.objective.approved_at,
  generationId: "11111111-1111-4111-8111-111111111111",
  strategy: {
    ...emptyStrategy(),
    title: "Educación nutricional",
    action: "Practicar registro",
    evidence: Array.from(
      { length: 9 },
      (_, i) => ({
        source: `Objetivo aprobado · 1 · Componente ${i + 1}`,
        finding: String.fromCharCode(97 + i).repeat(2000),
      }),
    ),
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.before.mockResolvedValue(true);
  api.batch.mockReturnValue({});
  api.workspace.mockResolvedValue(workspace);
});
const strategyText = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Texto de la estrategia' });
function changeText<Field extends StrategyTextField>(field: Field, value: Strategy[Field]) {
  const parsed = readStrategyEditorText(strategyText().value);
  if ('issue' in parsed) throw new Error(parsed.issue);
  fireEvent.change(strategyText(), { target: { value: formatStrategyEditorText({ ...emptyStrategy(), ...parsed.fields, [field]: value }) } });
}
async function generate(output: unknown, guidance?: string) {
  api.generate.mockResolvedValue({ status: "succeeded", output });
  render(
    <ClinicalInterventions
      consultationId="c"
      patientId="p"
      revision={1}
      before={api.before}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Proponer estrategias con IA" }))
      .toBeEnabled()
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Proponer estrategias con IA" }),
  );
  if (guidance) fireEvent.change(screen.getByRole('textbox', { name: /Indicaciones para la IA/ }), { target: { value: guidance } });
  fireEvent.click(screen.getByRole('button', { name: 'Generar propuestas' }));
}
async function openSavedStrategy(name: RegExp = /Sesión para organizar comidas/) {
  fireEvent.click(await screen.findByRole('button', { name }));
}
function closeEditor() {
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar estrategia de intervención' }));
}
function openMoreActions() {
  fireEvent.click(screen.getByText('Más acciones'));
}
it("keeps a long objective proposal visible and sends all evidence when saving its edited draft", async () => {
  const doc = document();
  await generate({ strategies: [doc] });
  fireEvent.click(
    await screen.findByRole("button", { name: /Propuesta de IA/ }),
  );
  expect(screen.queryByText("Vista previa completa")).not.toBeInTheDocument();
  changeText("title", "Educación adaptada");
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await waitFor(() =>
    expect(api.workspace).toHaveBeenCalledWith(
      "c",
      1,
      "save",
      expect.objectContaining({
        document: expect.objectContaining({
          strategy: expect.objectContaining({
            title: "Educación adaptada",
            evidence: doc.strategy.evidence,
          }),
        }),
      }),
    )
  );
});
it.each([
  ["missing collection", {}],
  ["null collection", { strategies: null }],
  ["wrong collection", { strategies: {} }],
  ["unusable evidence", {
    strategies: [{
      ...document(),
      strategy: {
        ...document().strategy,
        evidence: [{
          source: "Objetivo aprobado · 1",
          finding: "x".repeat(4001),
        }],
      },
    }],
  }],
  ["mixed documents", { strategies: [document(), {}] }],
  ["oversized collection", {
    strategies: [document(), document(), document(), document()],
  }],
])(
  "explains incompatible AI output instead of silently dropping it: %s",
  async (_name, output) => {
    await generate(output);
    await screen.findByText(
      /La propuesta de IA llegó incompleta o con datos incompatibles/,
    );
    expect(screen.queryByText(/No hubo información suficiente/)).not
      .toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Propuesta de IA/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Crear estrategia" }),
    ).toBeEnabled();
  },
);
it("keeps a valid empty proposal distinct from an incompatible response", async () => {
  await generate({ strategies: [] });
  await screen.findByText(/No hubo información suficiente para proponer/);
  expect(screen.queryByText(/datos incompatibles/)).not.toBeInTheDocument();
});

const fullDocument = (): StrategyDocument => ({
  ...document(),
  strategy: {
    ...emptyStrategy(),
    title: "Sesión para organizar comidas",
    action: "Practicar opciones con la persona",
    etiologyLink: "Aborda la falta de orientación",
    method: "Ejercicio con ejemplos habituales",
    frequency: "Una sesión",
    duration: "Durante la consulta",
    startDate: "En esta consulta",
    responsible: "Nutriólogo",
    executor: "Nutriólogo y paciente",
    adaptations: "Usar recursos disponibles",
    monitoring: "Comprobar opciones explicadas",
    reviewAt: "Próxima consulta",
    adjustmentCriteria: "Si aparecen nuevas barreras",
    educationTopic: "Organización de comidas",
    materials: "Ejemplos",
    comprehensionCheck: "Explicar una opción",
    goalIndexes: [0],
    agreement: "patient" as const,
  },
});
function approvedItem(doc = fullDocument()) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    draft: null,
    approved: {
      document: doc,
      version: 1,
      approvedAt: "2026-10-20",
      goals: [],
    },
    version: 1,
    updated_at: "current",
    state: "approved",
    requiresReview: false,
    execution: {},
    history: [],
  };
}
function mount(overrides = {}) {
  return render(
    <ClinicalInterventions
      consultationId="c"
      patientId="p"
      revision={1}
      before={api.before}
      {...overrides}
    />,
  );
}
it("opens patient instructions without passing professional strategy text", async () => {
  api.workspace.mockResolvedValue({ ...workspace, items: [approvedItem()] });
  const onOpenInstructions = vi.fn();
  mount({ onOpenInstructions });
  await openSavedStrategy();
  fireEvent.click(screen.getByText("Ejecución y acciones"));
  fireEvent.click(await screen.findByRole("button", { name: "Ir a indicaciones" }));
  expect(onOpenInstructions).toHaveBeenCalledExactlyOnceWith();
});
it("requests the consultation closing flow when taking an approved food strategy to the workshop", async () => {
  const doc = fullDocument();
  doc.strategy.category = "food";
  doc.strategy.route = "oral";
  api.workspace.mockResolvedValue({ ...workspace, items: [approvedItem(doc)] });
  const onOpenWorkshop = vi.fn();
  mount({ onOpenWorkshop });
  await openSavedStrategy();
  fireEvent.click(screen.getByText("Ejecución y acciones"));
  fireEvent.click(await screen.findByRole("button", { name: "Llevar al Taller de dietas" }));
  expect(onOpenWorkshop).toHaveBeenCalledOnce();
  expect(screen.queryByRole("link", { name: "Llevar al Taller de dietas" })).not.toBeInTheDocument();
});
it('keeps draft objectives out of strategy approval requirements and routes to the actual prerequisite',async()=>{
  const doc=fullDocument();doc.objectiveApprovedAt='draft:saved-goals';
  api.workspace.mockResolvedValue({...workspace,objective:null,
    planningObjective:{...workspace.objective,approved_at:doc.objectiveApprovedAt},
    items:[{...approvedItem(doc),draft:doc,approved:null,state:'draft'}],
  });
  const navigate=vi.fn();mount({onReviewPrerequisite:navigate});
  await openSavedStrategy();
  fireEvent.click(await screen.findByRole('button',{name:'Aprobar estrategia'}));
  const editor=within(screen.getByRole('region', {name:'Editor de estrategia'}));
  expect(editor.getByText('2 de 3 requisitos')).toBeVisible();
  expect(editor.getByText('Aprueba los objetivos SMART vinculados a este PES.')).toBeVisible();
  fireEvent.click(editor.getByRole('button',{name:'Ir a objetivos'}));
  expect(navigate).toHaveBeenCalledWith(2);
  expect(api.workspace.mock.calls.some(call=>call[2]==='approve')).toBe(false);
});
it('promotes a strategy against the exact approved draft and restores its approved state after remount',async()=>{
  const doc=fullDocument();doc.objectiveApprovedAt='draft:exact-plan';
  let saved:ReturnType<typeof approvedItem>|undefined;
  api.workspace.mockImplementation(async(_c,_r,action='read',data)=>{
    if(action==='approve') saved=approvedItem(data.document);
    return {...workspace,planningObjective:{...workspace.objective,approved_at:'draft:exact-plan'},
      items:saved?[saved]:[{...approvedItem(doc),draft:doc,approved:null,state:'draft'}]};
  });
  const first=mount();
  await openSavedStrategy();
  fireEvent.click(await screen.findByRole('button',{name:'Aprobar estrategia'}));
  await screen.findByText('Estrategia aprobada.');
  expect(api.workspace).toHaveBeenLastCalledWith('c',1,'approve',expect.objectContaining({document:expect.objectContaining({objectiveApprovedAt:workspace.objective.approved_at})}));
  expect(screen.getByText('Aprobada')).toBeVisible();
  expect(screen.queryByRole('button',{name:'Aprobar estrategia'})).not.toBeInTheDocument();
  first.unmount();
  sessionStorage.setItem('intervention-drafts:c:1',JSON.stringify({[saved!.id]:{document:doc,expectedUpdatedAt:'current'}}));
  mount();
  await screen.findByText('Aprobada');
  expect(screen.queryByText('Lista para aprobar')).not.toBeInTheDocument();
  expect(screen.queryByText(/faltan requisitos/)).not.toBeInTheDocument();
  expect(sessionStorage.getItem('intervention-drafts:c:1')).toBeNull();
});
it('binds an explicitly selected current objective without requiring a separate link button',async()=>{
  const doc=fullDocument();doc.objectiveApprovedAt='old-approval';
  api.workspace.mockResolvedValue({...workspace,items:[{...approvedItem(doc),draft:doc,approved:null,state:'draft'}]});
  mount();
  await openSavedStrategy();
  fireEvent.click(await screen.findByRole('button',{name:'Aprobar estrategia'}));
  const editor=within(screen.getByRole('region', {name:'Editor de estrategia'}));
  const goal=editor.getAllByRole('checkbox')[0];expect(goal).not.toBeChecked();
  fireEvent.click(goal);expect(editor.getByText('3 de 3 requisitos')).toBeVisible();
  expect(editor.queryByRole('button',{name:'Vincular a los objetivos actuales'})).not.toBeInTheDocument();
  expect(api.workspace.mock.calls.some(call=>call[2]==='approve')).toBe(false);
});
it("preserves text and optional details when switching between manual strategies", async () => {
  mount();
  await waitFor(() => expect(api.workspace).toHaveBeenCalled());
  const addStrategy = screen.getByRole('button', { name: 'Crear estrategia' });
  fireEvent.click(addStrategy);
  changeText('title', 'Coordinar la atención');
  fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'coordination' } });
  const editor = within(screen.getByRole('region', { name: 'Editor de estrategia' }));
  expect(editor.getAllByRole('textbox')).toEqual([strategyText()]);
  expect(strategyText().value).toContain('Aplicación y recursos');
  expect(strategyText().value).toContain('Con quién se coordinará:');
  changeText('coordinationReason', 'Revisar la atención conjunta');
  changeText('frequency', 'En la siguiente visita');
  closeEditor();
  fireEvent.click(addStrategy);
  expect(strategyText().value).not.toContain('Coordinar la atención');
  closeEditor();
  fireEvent.click(screen.getByRole('button', { name: /Coordinar la atención/ }));
  expect(strategyText().value).toContain('Coordinar la atención');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
  await screen.findByText(/Borrador guardado/);
  expect(api.workspace).toHaveBeenLastCalledWith(
    "c",
    1,
    "save",
    expect.objectContaining({
      document: expect.objectContaining({
        strategy: expect.objectContaining({
          title: "Coordinar la atención",
          category: "coordination",
          coordinationReason: "Revisar la atención conjunta",
          frequency: "En la siguiente visita",
        }),
      }),
    }),
  );
});
it("keeps the draft editor open when saving the consultation fails", async () => {
  mount();
  await waitFor(() => expect(api.workspace).toHaveBeenCalled());
  fireEvent.click(
    screen.getByRole("button", { name: "Crear estrategia" }),
  );
  changeText("title", "Conservar este borrador");
  api.before.mockResolvedValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }));
  await screen.findByText("Guarda la consulta antes de continuar.");
  expect(strategyText().value).toContain("Conservar este borrador");
  expect(sessionStorage.getItem("intervention-drafts:c:1")).toContain(
    "Conservar este borrador",
  );
  expect(api.workspace).toHaveBeenCalledOnce();
});
it("allows approving an AI strategy with agreement pending and never starts execution automatically", async () => {
  const doc = fullDocument();
  doc.strategy.agreement = "pending";
  doc.strategy.evidence = [{ source: 'Objetivo aprobado', finding: 'Reconocer opciones para la jornada laboral.' }];
  await generate({ strategies: [doc] });
  fireEvent.click(
    await screen.findByRole("button", { name: /Propuesta de IA/ }),
  );
  expect(within(screen.getByRole('dialog')).getByText('Propuesta de IA')).toBeVisible();
  expect(strategyText().value).toContain('Estado del acuerdo: Pendiente de conversar');
  expect(strategyText().value).toContain('Tema o habilidad: Organización de comidas');
  expect(strategyText().value).toContain('Materiales y apoyos: Ejemplos');
  expect(strategyText().value).toContain('Frecuencia: Una sesión');
  expect(screen.getByText('Datos que usó la IA')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Aprobar estrategia' }));
  await screen.findByText('Estrategia aprobada.');
  expect(api.workspace).toHaveBeenLastCalledWith(
    "c",
    1,
    "approve",
    expect.objectContaining({
      document: expect.objectContaining({
        strategy: expect.objectContaining({ agreement: "pending", educationTopic: 'Organización de comidas', materials: 'Ejemplos' }),
      }),
    }),
  );
  expect(api.workspace.mock.calls.some((call) => call[2] === "start")).toBe(
    false,
  );
  expect(api.generate).toHaveBeenCalledOnce();
});
it("blocks approval when the strategy is linked to earlier objective approvals", async () => {
  const doc = fullDocument();
  doc.objectiveApprovedAt = "previous";
  api.workspace.mockResolvedValue({
    ...workspace,
    items: [{
      ...approvedItem(doc),
      approved: null,
      draft: doc,
      state: "draft",
    }],
  });
  mount();
  await openSavedStrategy();
  const approve = await screen.findByRole('button', { name: 'Aprobar estrategia' });
  const goal = within(screen.getByRole('group', { name: /Objetivos que apoya/ })).getByRole('checkbox');
  expect(goal).not.toBeChecked();
  fireEvent.click(approve);
  await waitFor(() => expect(goal).toHaveFocus());
  expect(goal).toBeVisible();
  expect(api.workspace.mock.calls.some(call=>call[2]==='approve')).toBe(false);
  expect(api.workspace).toHaveBeenCalledOnce();
});
it("allows reviewing an approved strategy without creating a draft or changing its approval", async () => {
  const item = approvedItem();
  api.workspace.mockResolvedValue({ ...workspace, items: [item] });
  mount();
  await openSavedStrategy();
  expect(strategyText().value).toContain(item.approved.document.strategy.title);
  expect(strategyText()).toHaveAttribute('readonly');
  fireEvent.click(screen.getByRole('button', { name: 'Editar estrategia' }));
  expect(strategyText()).not.toHaveAttribute('readonly');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar edición' }));
  expect(strategyText()).toHaveAttribute('readonly');
  expect(sessionStorage.getItem("intervention-drafts:c:1")).toBeNull();
  expect(api.workspace).toHaveBeenCalledOnce();
  closeEditor();
  expect(screen.getByText("Aprobada")).toBeVisible();
});
it("keeps execution registration explicit and available after approval", async () => {
  const item = approvedItem();
  api.workspace.mockImplementation(async (_c, _r, action = "read", data) => ({
    ...workspace,
    items: action === "start"
      ? [{
        ...item,
        state: "executing",
        execution: { startDate: data.startDate, executor: data.executor },
      }]
      : [item],
  }));
  mount();
  await openSavedStrategy();
  fireEvent.click(screen.getByText("Ejecución y acciones"));
  fireEvent.click(screen.getByRole("button", { name: "Registrar inicio" }));
  fireEvent.change(screen.getByLabelText("Fecha de inicio"), {
    target: { value: "2026-10-20" },
  });
  fireEvent.change(screen.getByLabelText("Responsable de ejecución"), {
    target: { value: "Profesional tratante" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Registrar" }),
  );
  await waitFor(() => expect(screen.getAllByText("En ejecución").length).toBeGreaterThan(0));
  expect(api.workspace).toHaveBeenLastCalledWith(
    "c",
    1,
    "start",
    expect.objectContaining({
      executor: "Profesional tratante",
      startDate: "2026-10-20",
      expectedUpdatedAt: "current",
    }),
  );
});
it("keeps read-only strategies available for consultation without editing or execution controls", async () => {
  api.workspace.mockResolvedValue({ ...workspace, items: [approvedItem()] });
  mount({ readOnly: true });
  await openSavedStrategy();
  expect(screen.queryByRole("button", { name: "Editar estrategia" })).not
    .toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Proponer estrategias con IA" }))
    .not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Ejecución y acciones"));
  expect(screen.queryByRole("button", { name: "Registrar inicio" })).not
    .toBeInTheDocument();
  expect(strategyText().value).toContain('Practicar opciones con la persona');
  expect(strategyText()).toHaveAttribute('readonly');
});

it('restores text with a missing heading and keeps it out of approval until corrected', async () => {
  const first = mount();
  await waitFor(() => expect(api.workspace).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Crear estrategia' }));
  const incomplete = 'Texto pendiente de organizar.\nMañana retomar esta versión.';
  fireEvent.change(strategyText(), { target: { value: incomplete } });
  fireEvent.click(screen.getByRole('button', { name: 'Aprobar estrategia' }));
  expect(screen.getByRole('status')).toHaveTextContent(/Conserva los encabezados/);
  expect(api.workspace).toHaveBeenCalledOnce();
  first.unmount();
  mount();
  await openSavedStrategy(/Nueva estrategia/);
  expect(strategyText()).toHaveValue(incomplete);
  openMoreActions();
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar campos' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Limpiar los campos de la estrategia' })).getByRole('button', { name: 'Limpiar campos' }));
  expect(strategyText().value).toContain('Acción concreta');
  expect(strategyText().value).not.toContain(incomplete);
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar borrador' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Eliminar este borrador' })).getByRole('button', { name: 'Eliminar borrador' }));
  await screen.findByText('Borrador eliminado.');
  expect(screen.queryByRole('textbox', { name: 'Texto de la estrategia' })).not.toBeInTheDocument();
});

it('shows a saved batch proposal on entry without requesting a new generation', async () => {
  const document = fullDocument();
  const markReviewed = vi.fn();
  api.batch.mockImplementation(feature => feature === 'intervention_strategy' ? {
    proposal: { generationId: document.generationId, output: { strategies: [document] } },
    markReviewed,
  } : {});
  mount();
  fireEvent.click(await screen.findByRole('button', { name: /Propuesta de IA/ }));
  expect(markReviewed).toHaveBeenCalledWith(document.generationId);
  expect(strategyText().value).toContain(document.strategy.action);
  expect(api.generate).not.toHaveBeenCalled();
});

it('approves a strategy when the optional text sections were removed', async () => {
  mount();
  await screen.findByText('PES y objetivos de referencia');
  fireEvent.click(screen.getByRole('button', { name: 'Crear estrategia' }));
  fireEvent.change(strategyText(), {
    target: { value: 'Nombre de la estrategia\nPracticar con ejemplos\n\nAcción concreta\nRevisar dos alternativas durante la sesión.' },
  });
  fireEvent.click(within(screen.getByRole('group', { name: /Objetivos que apoya/ })).getByRole('checkbox'));
  expect(screen.getByText('3 de 3 requisitos')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Aprobar estrategia' }));
  await screen.findByText('Estrategia aprobada.');
  expect(api.workspace).toHaveBeenLastCalledWith('c', 1, 'approve', expect.objectContaining({
    document: expect.objectContaining({ strategy: expect.objectContaining({
      title: 'Practicar con ejemplos', action: 'Revisar dos alternativas durante la sesión.', goalIndexes: [0],
      method: '', etiologyLink: '', adaptations: '', monitoring: '',
    }) }),
  }));
});

it('restores an earlier draft with its hand-edited text, resources, agreement and references in the same editor', async () => {
  const doc = fullDocument();
  Object.assign(doc.strategy, {
    category: 'food',
    route: 'oral',
    referenceIds: ['academy-intervention', 'academy-monitoring'],
    referenceTitle: 'Protocolo acordado en el equipo',
    referenceUrl: 'https://example.com/protocolo',
    referenceNotes: 'Acuerdo discutido en la consulta de prueba.',
    referenceVersion: '2026',
  });
  const id = approvedItem(doc).id;
  const action = 'Practicar opciones\nAplicación y recursos\nRepasar el ejemplo elegido';
  const previousText = `Nombre de la estrategia\n${doc.strategy.title}\n\nAcción concreta\n${action}`;
  sessionStorage.setItem('intervention-drafts:c:1', JSON.stringify({
    [id]: { document: doc, expectedUpdatedAt: null, text: previousText },
  }));
  mount();
  await openSavedStrategy();
  expect(strategyText().value).toContain('Vía de administración: Oral');
  expect(strategyText().value).toContain('Estado del acuerdo: Acordado con la persona');
  expect(strategyText().value).toContain('Guía o protocolo utilizado: Protocolo acordado en el equipo');
  expect(strategyText().value).toContain('Academy · Nutrition Intervention');
  expect(screen.queryByRole('link', { name: /Nutrition Intervention/ })).not.toBeInTheDocument();
  fireEvent.change(strategyText(), { target: { value: strategyText().value
    .replace('Materiales y apoyos: Ejemplos', 'Materiales y apoyos: Lista de alternativas\nUn ejemplo de práctica')
    .replace('Estado del acuerdo: Acordado con la persona', 'Estado del acuerdo: Acordado con cuidador o representante'),
  } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
  await screen.findByText(/Borrador guardado/);
  expect(api.workspace).toHaveBeenLastCalledWith('c', 1, 'save', expect.objectContaining({
    document: expect.objectContaining({ generationId: doc.generationId, strategy: expect.objectContaining({
      action, route: 'oral', agreement: 'caregiver', duration: doc.strategy.duration,
      materials: 'Lista de alternativas\nUn ejemplo de práctica', referenceIds: doc.strategy.referenceIds,
      referenceUrl: doc.strategy.referenceUrl, referenceNotes: doc.strategy.referenceNotes, evidence: doc.strategy.evidence,
    }) }),
  }));
});

it('sends the indicated changes for group generation and keeps the card summary compact', async () => {
  const proposal = document();
  await generate({ strategies: [proposal] }, '  Prioriza los recursos ya disponibles.  ');
  const card = await screen.findByRole('button', { name: /Propuesta de IA.*Educación nutricional/ });
  expect(api.generate).toHaveBeenCalledWith(expect.objectContaining({
    strategyFeedback: 'Prioriza los recursos ya disponibles.',
  }));
  expect(screen.queryByText('Datos que usó la IA')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(card);
  openMoreActions();
  fireEvent.click(screen.getByRole('button', { name: 'Descartar propuesta' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Descartar esta propuesta' }))
    .getByRole('button', { name: 'Descartar propuesta' }));
  expect(screen.queryByRole('button', { name: /Propuesta de IA.*Educación nutricional/ })).not.toBeInTheDocument();
  expect(api.workspace.mock.calls.every(call => call[2] === undefined)).toBe(true);
});

it('regenerates only the selected strategy and waits for the user to choose before editing', async () => {
  const item = approvedItem();
  const other = { ...approvedItem(), id: '33333333-3333-4333-8333-333333333333' };
  other.approved.document.strategy.title = 'Otra estrategia existente';
  api.workspace.mockResolvedValue({ ...workspace, items: [item, other] });
  const alternative = fullDocument();
  alternative.strategy.title = 'Ensayar con ejemplos de casa';
  api.generate.mockResolvedValue({ generationId: 'alternative', status: 'succeeded', output: {
    strategies: [alternative], strategyRevisionId: item.id,
  } });
  mount();
  await openSavedStrategy();

  async function regenerate() {
    openMoreActions();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar con IA' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Indicaciones para la IA/ }),
      { target: { value: 'Usa ejemplos de casa.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generar alternativa' }));
    await screen.findByRole('dialog', { name: 'Comparar estrategia' });
  }
  await regenerate();
  expect(api.generate).toHaveBeenCalledWith(expect.objectContaining({
    strategyFeedback: 'Usa ejemplos de casa.',
    strategyRevision: { id: item.id, title: item.approved.document.strategy.title,
      action: item.approved.document.strategy.action, method: item.approved.document.strategy.method },
  }));
  const comparison = within(screen.getByRole('dialog', { name: 'Comparar estrategia' }));
  expect(comparison.getByText(/Ensayar con ejemplos de casa/)).toBeVisible();
  fireEvent.click(comparison.getByRole('button', { name: 'Conservar versión actual' }));
  expect(strategyText().value).toContain(item.approved.document.strategy.title);
  expect(strategyText()).toHaveAttribute('readonly');
  expect(api.workspace.mock.calls.every(call => call[2] === undefined)).toBe(true);

  await regenerate();
  fireEvent.click(screen.getByRole('button', { name: 'Usar como borrador' }));
  expect(strategyText().value).toContain('Ensayar con ejemplos de casa');
  expect(strategyText()).not.toHaveAttribute('readonly');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
  await screen.findByText(/Borrador guardado/);
  expect(api.workspace).toHaveBeenLastCalledWith('c', 1, 'save', expect.objectContaining({
    id: item.id, expectedUpdatedAt: item.updated_at, document: alternative,
  }));
  expect(screen.getByRole('button', { name: /Otra estrategia existente/ })).toBeVisible();
});
