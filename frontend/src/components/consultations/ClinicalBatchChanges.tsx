import { Fragment, type ReactNode, useId, useRef, useState } from 'react';
import { AIButton } from '@/src/components/ai/AIControls';
import { AIRequestError, getAIGenerationStatus, reviewClinicalAIBatch, runAIRequest } from '@/src/services/ai';
import { composePesStatement } from '@/src/features/consultations/clinicalCopilot';
import { composeObjective, type ObjectiveGoal } from '../../../../supabase/functions/_shared/objectives';
import { isStrategyDocument, strategySummary } from '../../../../supabase/functions/_shared/interventions';
import {
  clinicalBatchKey, clinicalBatchRevisionKey, clinicalBatchStages,
  type ClinicalBatchFeature, type ClinicalBatchProposal,
} from '../../../../supabase/functions/_shared/clinical-batch';
import { ClinicalTaskDialog } from './ClinicalTaskDialog';
import { useConsultationDraftContext } from './ConsultationDrafts';

type RevisionRequest = { key: string; revises: string; batchId: string; feedback: string };
const requestKey = (feature: ClinicalBatchFeature) => `batch-revision-request:${feature}`;

export function clinicalBatchNeedsReview(
  proposal: ClinicalBatchProposal,
  feature: ClinicalBatchFeature,
  completed: Partial<Record<ClinicalBatchFeature, string>>,
) {
  const stageIndex = clinicalBatchStages.findIndex(stage => stage.feature === feature);
  return clinicalBatchStages.slice(0, stageIndex).some(({ feature }, index) =>
    completed[feature] !== proposal.inputGenerations?.[index]
  );
}

function proposalText(feature: ClinicalBatchFeature, proposal: ClinicalBatchProposal) {
  const { output } = proposal;
  if (feature === 'pes_diagnosis' && typeof output.problem === 'string' && typeof output.etiology === 'string' && Array.isArray(output.signsSymptoms)) {
    const parts = {
      problem: output.problem, etiology: output.etiology,
      signsSymptoms: output.signsSymptoms.filter((sign): sign is string => typeof sign === 'string'),
    };
    return composePesStatement(parts) || [
      parts.problem && `Problema\n${parts.problem}`,
      parts.etiology && `Etiología\n${parts.etiology}`,
      parts.signsSymptoms.length > 0 && `Signos y síntomas\n${parts.signsSymptoms.join('\n')}`,
    ].filter(Boolean).join('\n\n');
  }
  if (feature === 'consultation_support' && Array.isArray(output.objectives)) {
    return output.objectives.map((item: { goal?: ObjectiveGoal; text?: string }) => item.goal ? composeObjective(item.goal) : item.text).filter(Boolean).join('\n\n');
  }
  if (feature === 'intervention_strategy' && Array.isArray(output.strategies)) {
    return output.strategies.filter(isStrategyDocument).map(({ strategy }) => [strategy.title, strategySummary(strategy)].filter(Boolean).join('\n')).join('\n\n');
  }
  if (feature === 'patient_instructions' && Array.isArray(output.instructions)) {
    return output.instructions.map((item: { text?: string }) => item.text).filter(Boolean).join('\n\n');
  }
  return '';
}

export type ClinicalBatchAction = { label: string; disabled: boolean; open: () => void };

export function ClinicalBatchChanges({ patientId, consultationId, revision, batchId, completed, blocked, before, onBusy, featureOnly, renderAction }: {
  patientId: string;
  consultationId: string;
  revision: number;
  batchId: string;
  completed: Partial<Record<ClinicalBatchFeature, string>>;
  blocked: boolean;
  before: () => Promise<boolean>;
  onBusy?: (busy: boolean) => void;
  featureOnly?: ClinicalBatchFeature;
  renderAction?: (action: ClinicalBatchAction) => ReactNode;
}) {
  const checkpoint = useConsultationDraftContext();
  const id = useId();
  const [dialog, setDialog] = useState<ClinicalBatchFeature | 'clear' | null>(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  if (!checkpoint) return null;
  const controller = checkpoint;
  const feature = dialog === 'clear' ? null : dialog;

  function readProposal(feature: ClinicalBatchFeature, fresh: Record<string, unknown> = controller.values, candidate = false) {
    const proposal = fresh[candidate ? clinicalBatchRevisionKey(feature) : clinicalBatchKey(feature)] as ClinicalBatchProposal | undefined;
    return proposal?.batchId === batchId ? proposal : undefined;
  }
  function readAttempt(feature: ClinicalBatchFeature, fresh: Record<string, unknown> = controller.values) {
    const attempt = fresh[requestKey(feature)] as RevisionRequest | undefined;
    return attempt?.batchId === batchId ? attempt : undefined;
  }
  const previous = feature && readProposal(feature);
  const request = feature && readAttempt(feature);
  const candidate = feature && !request ? readProposal(feature, controller.values, true) : undefined;
  const candidateStale = feature && candidate && clinicalBatchNeedsReview(candidate, feature, completed);
  const label = clinicalBatchStages.find(stage => stage.feature === feature)?.label ?? '';
  const alternateText = feature && candidate ? proposalText(feature, candidate) : '';

  function open(next: ClinicalBatchFeature | 'clear') {
    setFeedback(next === 'clear' ? '' : readAttempt(next)?.feedback ?? '');
    setMessage('');
    setDialog(next);
  }

  async function act(work: () => Promise<void>) {
    if (lock.current || blocked) return;
    lock.current = true;
    setBusy(true);
    onBusy?.(true);
    setMessage('');
    try { await work(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos guardar este cambio.'); }
    finally { lock.current = false; setBusy(false); onBusy?.(false); }
  }

  function generate() {
    if (!feature || !previous) return;
    const stage = feature, original = previous;
    void act(async () => {
      const existing = readAttempt(stage);
      if (existing) {
        const status = await getAIGenerationStatus(existing.key);
        if (status?.status === 'succeeded') {
          const saved = readProposal(stage, await controller.refresh(), true);
          if (saved?.generationId !== status.generationId) throw new Error('La solicitud terminó. Comprueba de nuevo para recuperar la propuesta.');
        } else if (status && status.status !== 'failed' && status.status !== 'invalid_output') {
          throw new AIRequestError('provider_outcome_unknown');
        } else if (status) {
          setMessage('La solicitud anterior terminó sin una propuesta disponible. Puedes generar otra.');
        }
        if (status) {
          controller.set(requestKey(stage), null);
          if (!await controller.flush()) throw new Error('No pudimos guardar el estado de la solicitud.');
          return;
        }
      }
      const instructions = existing?.feedback ?? feedback.trim();
      if (!instructions) return;
      if (!await before()) throw new Error('Guarda la consulta antes de volver a generar.');
      const fresh = await controller.refresh();
      if (readProposal(stage, fresh)?.generationId !== original.generationId || readProposal(stage, fresh, true)) {
        throw new AIRequestError('context_changed');
      }
      const freshAttempt = readAttempt(stage, fresh);
      if (freshAttempt && freshAttempt.key !== existing?.key) throw new AIRequestError('provider_outcome_unknown');
      const retry = existing ?? { key: crypto.randomUUID(), revises: original.generationId, feedback: instructions, batchId };
      if (retry.revises !== original.generationId) throw new AIRequestError('context_changed');
      controller.set(requestKey(stage), retry);
      if (!await controller.flush()) throw new Error('Guarda el avance antes de generar la propuesta.');
      try {
        const result = await runAIRequest({
          consultationId, patientId, revision, batchId, feature: stage, idempotencyKey: retry.key,
          revisionOf: retry.revises, clinicalFeedback: retry.feedback,
          ...(stage === 'consultation_support' ? { objectiveTextStyle: 'patient_v1' } : {}),
        });
        if (result.status !== 'succeeded' || readProposal(stage, await controller.refresh(), true)?.generationId !== result.generationId) {
          throw new AIRequestError('provider_outcome_unknown');
        }
        controller.set(requestKey(stage), null);
        if (!await controller.flush()) throw new Error('No pudimos guardar el estado de la solicitud.');
      } catch (error) {
        if (error instanceof AIRequestError && !['provider_outcome_unknown', 'service_unavailable'].includes(error.code)) {
          controller.set(requestKey(stage), null);
          await controller.flush();
        }
        throw error;
      }
    });
  }

  function confirm(type: 'clear' | 'accept' | 'discard') {
    if (type !== 'clear' && (!feature || !candidate || (type === 'accept' && candidateStale))) return;
    const action: Parameters<typeof reviewClinicalAIBatch>[3] = type === 'clear'
      ? { type }
      : { type, feature: feature!, generationId: candidate!.generationId };
    void act(async () => {
      if (!await controller.flush()) throw new Error('Guarda el avance antes de continuar.');
      await reviewClinicalAIBatch(consultationId, revision, batchId, action);
      await controller.refresh();
      setDialog(null);
    });
  }

  return <>
    <div className="clinical-batch-change-actions">
      {clinicalBatchStages.filter(stage => completed[stage.feature] && (!featureOnly || stage.feature === featureOnly)).map(stage => {
        const label = readProposal(stage.feature, controller.values, true) || readAttempt(stage.feature)
            ? featureOnly ? 'Revisar nueva propuesta' : `Revisar nueva propuesta · ${stage.label}`
            : featureOnly ? 'Volver a generar con indicaciones' : `Regenerar ${stage.label}`;
        const action = { label, disabled: blocked || busy, open: () => open(stage.feature) };
        return renderAction ? <Fragment key={stage.feature}>{renderAction(action)}</Fragment>
          : <button key={stage.feature} type="button" data-stage={stage.feature} className="nuth-button-secondary !text-xs" disabled={action.disabled} onClick={action.open}>{label}</button>;
      })}
      {!featureOnly && <button type="button" data-intent="clear" className="nuth-button-secondary !text-xs" disabled={blocked || busy} onClick={() => open('clear')}>Limpiar borradores de IA</button>}
    </div>
    <ClinicalTaskDialog
      open={dialog !== null} busy={busy} onClose={() => setDialog(null)}
      title={dialog === 'clear' ? 'Limpiar borradores de IA' : `Volver a generar · ${label}`}
      description={dialog === 'clear'
        ? 'Retira la propuesta completa y sus sugerencias pendientes. Los textos que ya incorporaste se gestionan desde su editor.'
        : 'Indica qué necesitas ajustar. Podrás comparar las dos propuestas antes de elegir. Cada generación usa créditos según el consumo real.'}
      footer={<>
        <button type="button" className="nuth-button-secondary" disabled={busy} onClick={() => setDialog(null)}>Cerrar</button>
        {dialog === 'clear'
          ? <button type="button" className="nuth-button" disabled={busy} onClick={() => confirm('clear')}>Confirmar limpieza</button>
          : candidate ? <>
            <button type="button" className="nuth-button-secondary" disabled={busy} onClick={() => confirm('discard')}>Conservar anterior</button>
            <button type="button" className="nuth-button" disabled={busy || !!candidateStale || !alternateText.trim()} onClick={() => confirm('accept')}>Usar nueva propuesta</button>
          </> : <AIButton state={busy ? 'generating' : 'idle'} disabled={!request && !feedback.trim()} onClick={generate}>
            {request ? 'Comprobar solicitud' : 'Generar nueva propuesta'}
          </AIButton>}
      </>}
    >
      {dialog === 'clear' && <ul className="clinical-ai-batch-stages">{clinicalBatchStages.filter(stage => completed[stage.feature]).map(stage => <li key={stage.feature}>{stage.label}</li>)}</ul>}
      {feature && previous && (candidate ? <div className="clinical-batch-comparison">
        <section><h3>Propuesta anterior</h3><p>{proposalText(feature, previous) || 'Sin texto disponible.'}</p></section>
        <section><h3>Nueva propuesta</h3><p>{alternateText || 'La IA no encontró información suficiente para redactar esta sección.'}</p></section>
      </div> : <div>
        <label htmlFor={id}>¿Qué quieres cambiar?</label>
        <textarea id={id} className="nuth-input clinical-batch-feedback" rows={4} maxLength={1200}
          value={feedback} onChange={event => setFeedback(event.target.value)} readOnly={busy || !!request} />
      </div>)}
      {candidateStale && <p role="status">Cambió un paso anterior. Conserva el borrador y vuelve a generar con los datos actuales.</p>}
      {message && <p role="alert">{message}</p>}
    </ClinicalTaskDialog>
  </>;
}
