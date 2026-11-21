import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ClinicalBatchAI, useClinicalBatchProposal } from './ClinicalBatchAI';
import { ConsultationDrafts, type ConsultationDraftController } from './ConsultationDrafts';
import { clinicalBatchKey, clinicalBatchStages, type ClinicalBatchFeature } from '../../../../supabase/functions/_shared/clinical-batch';

const api = vi.hoisted(() => ({ sync: vi.fn(), run: vi.fn(), status: vi.fn() }));
vi.mock('@/src/lib/supabase', () => ({ supabase: { rpc: api.sync } }));
vi.mock('@/src/services/ai', () => ({
  runAIRequest: api.run,
  getAIGenerationStatus: api.status,
  AIRequestError: Error,
}));

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
    saved.answers[clinicalBatchKey(feature)] = { generationId, batchId, output: { problem: 'Borrador sintético' } };
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
  expect(api.run.mock.calls.map(([request]) => request.feature)).toEqual(clinicalBatchStages.map(stage => stage.feature));
  expect(new Set(api.run.mock.calls.map(([request]) => request.batchId)).size).toBe(1);
  expect(api.status).toHaveBeenCalledExactlyOnceWith(api.run.mock.calls[1][0].idempotencyKey);
  fireEvent.click(screen.getByRole('button', { name: 'Revisar Indicaciones' }));
  expect(review).toHaveBeenCalledExactlyOnceWith(4);
});
