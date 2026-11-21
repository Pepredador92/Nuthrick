import { createRef } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ClinicalBatchAI, useClinicalBatchProposal } from './ClinicalBatchAI';
import { ConsultationDrafts, type ConsultationDraftController } from './ConsultationDrafts';
import { clinicalBatchKey, clinicalBatchRevisionKey, clinicalBatchStages, type ClinicalBatchFeature } from '../../../../supabase/functions/_shared/clinical-batch';

const api = vi.hoisted(() => ({ sync: vi.fn(), run: vi.fn(), status: vi.fn(), review: vi.fn() }));
vi.mock('@/src/lib/supabase', () => ({ supabase: { rpc: api.sync } }));
vi.mock('@/src/services/ai', () => ({
  runAIRequest: api.run,
  getAIGenerationStatus: api.status,
  reviewClinicalAIBatch: api.review,
  AIRequestError: Error,
}));
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

function SavedPES() {
  const { proposal } = useClinicalBatchProposal('pes_diagnosis');
  return <span>{proposal ? String(proposal.output.problem) : 'Sin propuesta de PES'}</span>;
}

it('waits for the clinical review, saves each draft and recovers an interrupted stage without repeating it', async () => {
  const saved = { version: 0, answers: {} as Record<string, unknown> };
  const ledger = new Map<string, { generationId: string; status: string }>();
  let interrupted = false;
  api.sync.mockImplementation((_name, input) => {
    if (input.p_changes) {
      expect(Object.keys(input.p_changes).every(key => !key.startsWith('proposal:'))).toBe(true);
      Object.assign(saved.answers, input.p_changes);
      saved.version++;
    }
    const response = Promise.resolve({ data: structuredClone(saved) });
    return Object.assign(response, { abortSignal: () => response });
  });
  api.run.mockImplementation(async ({ feature, idempotencyKey, batchId }: {
    feature: ClinicalBatchFeature; idempotencyKey: string; batchId: string;
  }) => {
    const generationId = crypto.randomUUID();
    ledger.set(idempotencyKey, { generationId, status: 'succeeded' });
    const output = {
      pes_diagnosis: { problem: 'Borrador sintético', etiology: '' },
      consultation_support: { batchBasis: 'assessment', objectives: [{ goal: { outcome: 'Anota qué cambió' } }] },
      intervention_strategy: { batchBasis: 'assessment', strategies: [{ strategy: { title: 'Revisar el cambio' } }] },
      patient_instructions: { batchBasis: 'template', instructions: [{ text: 'Trae tus anotaciones.' }] },
    }[feature];
    const inputGenerations = clinicalBatchStages
      .slice(0, clinicalBatchStages.findIndex(stage => stage.feature === feature))
      .map(stage => (saved.answers[clinicalBatchKey(stage.feature)] as { generationId: string }).generationId);
    saved.answers[clinicalBatchKey(feature)] = { generationId, batchId, output, inputGenerations };
    saved.version++;
    if (!interrupted && feature === 'consultation_support') {
      interrupted = true;
      throw new Error('Se perdió la conexión al recibir la respuesta.');
    }
    return { generationId, status: 'succeeded' };
  });
  api.status.mockImplementation(async (key: string) => ledger.get(key) ?? null);
  const controller = createRef<ConsultationDraftController | null>();
  const review = vi.fn();
  const before = async () => true;
  const tree = (ready: boolean) => <ConsultationDrafts consultationId="batch-test" revision={1} controllerRef={controller} onSave={before}>
    <ClinicalBatchAI patientId="patient" consultationId="batch-test" revision={1} before={before} ready={ready} onReview={review} />
    <SavedPES />
  </ConsultationDrafts>;
  const view = render(tree(false));
  const start = await screen.findByRole('button', { name: 'Generar propuesta completa con IA' });
  expect(start).toBeDisabled();
  view.rerender(tree(true));
  fireEvent.click(start);
  await screen.findByText(/se pausó en objetivos/);
  expect(screen.getByText('Borrador sintético')).toBeInTheDocument();
  expect(api.run).toHaveBeenCalledTimes(2);
  view.unmount();

  render(tree(true));
  fireEvent.click(await screen.findByRole('button', { name: 'Comprobar y continuar' }));
  await screen.findByText('Propuesta completa. Revisa los cuatro borradores.');
  expect(screen.getByText(/Etiología pendiente/)).toBeVisible();
  expect(screen.getAllByText(/Borrador de valoración/)).toHaveLength(2);
  expect(screen.getByText(/Plantilla de valoración/)).toBeVisible();
  expect(api.run.mock.calls.map(([request]) => request.feature)).toEqual(clinicalBatchStages.map(stage => stage.feature));
  expect(new Set(api.run.mock.calls.map(([request]) => request.batchId)).size).toBe(1);
  expect(api.status).toHaveBeenCalledExactlyOnceWith(api.run.mock.calls[1][0].idempotencyKey);
  fireEvent.click(screen.getByRole('button', { name: 'Revisar Indicaciones' }));
  expect(review).toHaveBeenCalledExactlyOnceWith(4);
});

it('compares an alternate PES, flags dependent drafts and confirms cleaning the batch', async () => {
  const batchId = 'batch', first = 'pes-first', alternate = 'pes-alternate';
  const key = clinicalBatchKey('pes_diagnosis'), revisionKey = clinicalBatchRevisionKey('pes_diagnosis');
  const original = { problem: 'Primer diagnóstico', etiology: 'Causa inicial', signsSymptoms: ['Dato inicial'] };
  const saved = { version: 3, answers: {
    'clinical-batch': { id: batchId, attempts: {}, completed: { pes_diagnosis: first, consultation_support: 'goals' } },
    [key]: { batchId, generationId: first, output: original, inputGenerations: [] },
    [clinicalBatchKey('consultation_support')]: { batchId, generationId: 'goals', output: { objectives: [] }, inputGenerations: [first] },
  } as Record<string, unknown> };
  api.sync.mockImplementation((_name, input) => {
    if (input.p_changes) {
      Object.assign(saved.answers, input.p_changes);
      saved.version++;
    }
    const result = Promise.resolve({ data: structuredClone(saved) });
    return Object.assign(result, { abortSignal: () => result });
  });
  api.run.mockImplementation(async () => {
    saved.answers[revisionKey] = { batchId, generationId: alternate, revises: first, inputGenerations: [],
      output: { ...original, problem: 'Diagnóstico ajustado' } };
    saved.version++;
    return { status: 'succeeded', generationId: alternate };
  });
  api.review.mockImplementation(async (_id, _revision, _batch, action) => {
    if (action.type === 'accept') {
      saved.answers[key] = saved.answers[revisionKey];
      delete saved.answers[revisionKey];
      saved.answers['clinical-batch'] = { id: batchId, attempts: {}, completed: { pes_diagnosis: alternate, consultation_support: 'goals' } };
    } else if (action.type === 'clear') {
      saved.answers = { 'clinical-batch': null };
    }
    saved.version++;
  });
  const controller = createRef<ConsultationDraftController | null>();
  const before = async () => true;
  render(<ConsultationDrafts consultationId="batch-changes-test" revision={1} controllerRef={controller} onSave={before}>
    <ClinicalBatchAI patientId="patient" consultationId="batch-changes-test" revision={1} before={before} ready onReview={vi.fn()} />
    <SavedPES />
  </ConsultationDrafts>);
  fireEvent.click(await screen.findByRole('button', { name: 'Regenerar Diagnóstico PES' }));
  const dialog = within(await screen.findByRole('dialog', { name: /Volver a generar/ }));
  fireEvent.change(dialog.getByLabelText('¿Qué quieres cambiar?'), { target: { value: 'Prioriza lo observado hoy.' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Generar nueva propuesta' }));
  await dialog.findByText('Nueva propuesta');
  expect(dialog.getByText(/Primer diagnóstico relacionado/)).toBeInTheDocument();
  expect(screen.getByText('Primer diagnóstico')).toBeInTheDocument();
  expect(api.run).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    feature: 'pes_diagnosis', revisionOf: first, clinicalFeedback: 'Prioriza lo observado hoy.',
  }));
  fireEvent.click(dialog.getByRole('button', { name: 'Usar nueva propuesta' }));
  await screen.findByText('Por revisar', { exact: false });
  expect(screen.getByText('Diagnóstico ajustado', { exact: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar borradores de IA' }));
  const clear = within(await screen.findByRole('dialog', { name: 'Limpiar borradores de IA' }));
  fireEvent.click(clear.getByRole('button', { name: /^Cerrar$/ }));
  expect(api.review).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar borradores de IA' }));
  fireEvent.click(clear.getByRole('button', { name: 'Confirmar limpieza' }));
  await screen.findByRole('button', { name: 'Generar propuesta completa con IA' });
  expect(screen.getByText('Sin propuesta de PES')).toBeInTheDocument();
  expect(api.run).toHaveBeenCalledTimes(1);
});
