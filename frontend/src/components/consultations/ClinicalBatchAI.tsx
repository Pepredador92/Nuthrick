import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { AIButton } from '@/src/components/ai/AIControls';
import { useAccess } from '@/src/features/admin/AccessProvider';
import { canUseFeature } from '@/src/features/admin/api';
import { AIRequestError, getAIGenerationStatus, runAIRequest } from '@/src/services/ai';
import {
  clinicalBatchKey,
  clinicalBatchStages,
  type ClinicalBatchFeature,
  type ClinicalBatchProposal,
} from '../../../../supabase/functions/_shared/clinical-batch';
import { useConsultationDraft, useConsultationDraftContext } from './ConsultationDrafts';
import './ClinicalBatchAI.css';

const batchKey = 'clinical-batch';
const collections: Partial<Record<ClinicalBatchFeature, string>> = {
  consultation_support: 'objectives',
  intervention_strategy: 'strategies',
  patient_instructions: 'instructions',
};
type BatchRun = {
  id: string;
  attempts: Partial<Record<ClinicalBatchFeature, string>>;
  completed: Partial<Record<ClinicalBatchFeature, string>>;
};

function getBatchProposal(values: Record<string, unknown>, run: BatchRun, feature: ClinicalBatchFeature) {
  const proposal = values[clinicalBatchKey(feature)] as ClinicalBatchProposal | undefined;
  return proposal?.batchId === run.id && proposal.generationId && proposal.output ? proposal : undefined;
}

export function useClinicalBatchProposal(feature: ClinicalBatchFeature) {
  const context = useConsultationDraftContext();
  const run = context?.values[batchKey] as BatchRun | null | undefined;
  const [reviewed, setReviewed] = useConsultationDraft<string | null>(`batch-reviewed:${feature}`, null);
  const proposal = run && context ? getBatchProposal(context.values, run, feature) : undefined;
  return {
    proposal: proposal && run?.completed[feature] === proposal.generationId ? proposal : undefined,
    reviewed,
    markReviewed: setReviewed,
  };
}

export function ClinicalBatchAI({ patientId, consultationId, revision, ready, before, onReview }: {
  patientId: string;
  consultationId: string;
  revision: number;
  ready: boolean;
  before: () => Promise<boolean>;
  onReview: (stage: number) => void;
}) {
  const checkpoint = useConsultationDraftContext();
  const { data } = useAccess();
  const [run, setRun] = useConsultationDraft<BatchRun | null>(batchKey, null);
  const [active, setActive] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const restricted = ['pes', 'consultation_support', 'patient_instructions'].some(
    feature => data && !canUseFeature(data.access, `ai.${feature}`),
  );
  const completeCount = clinicalBatchStages.filter(({ feature }) => run?.completed[feature]).length;
  const finished = completeCount === clinicalBatchStages.length;
  const hasEmptyStage = finished && run && checkpoint && clinicalBatchStages.some(({ feature }) => {
    const output = getBatchProposal(checkpoint.values, run, feature)?.output;
    const key = collections[feature];
    const items = key && output?.[key];
    return !output || (Array.isArray(items) && items.length === 0);
  });

  async function generate() {
    if (!checkpoint || !ready || restricted || finished || lock.current) return;
    const controller = checkpoint;
    lock.current = true;
    setActive('Guardando la consulta…');
    setMessage('');
    let stageLabel = '';
    try {
      if (!(await before())) throw new Error('Guarda la consulta antes de generar.');
      let values = await controller.refresh();
      let saved = (values[batchKey] as BatchRun | undefined) ?? { id: crypto.randomUUID(), attempts: {}, completed: {} };
      async function saveRun(next: BatchRun) {
        setRun(next);
        if (!(await controller.flush())) throw new Error('No pudimos guardar el avance. Revisa el guardado y vuelve a intentarlo.');
        saved = next;
      }
      for (const { feature, label } of clinicalBatchStages) {
        if (!mounted.current) return;
        stageLabel = label;
        if (saved.completed[feature] && getBatchProposal(values, saved, feature)?.generationId === saved.completed[feature]) continue;
        setActive(`Generando · ${label}…`);
        let attempt = saved.attempts[feature];
        const prior = attempt ? await getAIGenerationStatus(attempt) : null;
        let generationId: string;
        if (prior?.status === 'succeeded') {
          generationId = prior.generationId;
        } else {
          if (prior && !['failed', 'invalid_output'].includes(prior.status)) {
            throw new Error('La solicitud anterior sigue pendiente. Usa «Comprobar y continuar» cuando esté lista.');
          }
          if (!mounted.current) return;
          if (!attempt || prior) {
            attempt = crypto.randomUUID();
            await saveRun({ ...saved, attempts: { ...saved.attempts, [feature]: attempt } });
          }
          if (!mounted.current) return;
          const result = await runAIRequest({
            feature, patientId, consultationId, revision, idempotencyKey: attempt, batchId: saved.id,
            ...(feature === 'consultation_support' ? { objectiveTextStyle: 'patient_v1' as const } : {}),
          });
          if (result.status !== 'succeeded') throw new AIRequestError('provider_outcome_unknown');
          generationId = result.generationId;
        }
        if (!mounted.current) return;
        values = await controller.refresh();
        if (getBatchProposal(values, saved, feature)?.generationId !== generationId) {
          throw new Error('La generación terminó. Usa «Comprobar y continuar» para recuperar el borrador guardado.');
        }
        await saveRun({ ...saved, completed: { ...saved.completed, [feature]: generationId } });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Vuelve a intentar la etapa pendiente.';
      if (mounted.current) setMessage(stageLabel ? `La propuesta se pausó en ${stageLabel === 'Diagnóstico PES' ? 'diagnóstico PES' : stageLabel.toLowerCase()}. ${detail}` : detail);
    } finally {
      lock.current = false;
      if (mounted.current) setActive(null);
    }
  }

  if (!checkpoint) return null;
  return <section className="clinical-ai-batch" aria-label="Propuesta completa con IA">
    {!finished && <>
      <AIButton
        className="clinical-ai-batch-button"
        state={active ? 'generating' : 'idle'}
        disabled={!ready || restricted}
        title={restricted ? 'Tu acceso necesita IA para los cuatro pasos' : undefined}
        onClick={() => void generate()}
      >
        {run ? 'Comprobar y continuar' : 'Generar propuesta completa con IA'}
      </AIButton>
      <p>Genera borradores de PES, objetivos, estrategias e indicaciones. Revísalos en cada paso. Usa créditos según el consumo real.</p>
      {!ready && <p>Confirma los datos disponibles para comenzar.</p>}
    </>}
    <p role="status" aria-live="polite">
      {active || (finished
        ? hasEmptyStage ? 'Generación terminada. Revisa los borradores disponibles.' : 'Propuesta completa. Revisa los cuatro borradores.'
        : run && `${completeCount} de ${clinicalBatchStages.length} pasos guardados.`)}
    </p>
    {run && <ul className="clinical-ai-batch-stages">
      {clinicalBatchStages.map(({ feature, label }, index) => <li key={feature}>
        {run.completed[feature]
          ? <button type="button" className="clinical-text-action" onClick={() => onReview(index + 1)}>{`Revisar ${label}`}<ArrowRight size={14} aria-hidden="true" /></button>
          : <span>{label}</span>}
      </li>)}
    </ul>}
    {message && <p role="alert">{message}</p>}
  </section>;
}
