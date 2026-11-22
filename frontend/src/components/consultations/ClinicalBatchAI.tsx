import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ClipboardList, MessageSquareText, Route, Target } from 'lucide-react';
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
import { hasUsablePesEtiology } from '../../../../supabase/functions/_shared/pes';
import { useConsultationDraft, useConsultationDraftContext } from './ConsultationDrafts';
import { ClinicalBatchChanges, clinicalBatchNeedsReview } from './ClinicalBatchChanges';
import './ClinicalBatchAI.css';

const batchKey = 'clinical-batch';
const collections: Partial<Record<ClinicalBatchFeature, string>> = {
  consultation_support: 'objectives',
  intervention_strategy: 'strategies',
  patient_instructions: 'instructions',
};
const stageIcons = {
  pes_diagnosis: ClipboardList,
  consultation_support: Target,
  intervention_strategy: Route,
  patient_instructions: MessageSquareText,
};
type BatchRun = {
  id: string;
  attempts: Partial<Record<ClinicalBatchFeature, string>>;
  completed: Partial<Record<ClinicalBatchFeature, string>>;
};
type BatchActivity = { phase: 'saving' } | { phase: 'checking' | 'generating'; feature: ClinicalBatchFeature };
type BatchPause = { batchId?: string; feature?: ClinicalBatchFeature; detail: string };

function getBatchProposal(values: Record<string, unknown>, run: BatchRun, feature: ClinicalBatchFeature) {
  const proposal = values[clinicalBatchKey(feature)] as ClinicalBatchProposal | undefined;
  return proposal?.batchId === run.id && proposal.generationId && proposal.output ? proposal : undefined;
}

function getSavedBatchProposal(values: Record<string, unknown>, run: BatchRun, feature: ClinicalBatchFeature) {
  const proposal = getBatchProposal(values, run, feature);
  return proposal && run.completed[feature] === proposal.generationId ? proposal : undefined;
}

function hasEmptyCollection(feature: ClinicalBatchFeature, proposal: ClinicalBatchProposal) {
  const key = collections[feature];
  const items = key && proposal.output[key];
  return Array.isArray(items) && items.length === 0;
}

function proposalNote(feature: ClinicalBatchFeature, proposal: ClinicalBatchProposal, run: BatchRun) {
  if (clinicalBatchNeedsReview(proposal, feature, run.completed)) return 'Cambió un borrador anterior. Por revisar.';
  if (hasEmptyCollection(feature, proposal)) return 'Sin propuesta disponible';
  if (proposal.output.batchBasis === 'template') return 'Plantilla de valoración';
  if (proposal.output.batchBasis === 'assessment') return 'Borrador de valoración';
  if (feature === 'pes_diagnosis' && !hasUsablePesEtiology(proposal.output.etiology)) return 'Etiología pendiente';
}

export function useClinicalBatchProposal(feature: ClinicalBatchFeature) {
  const context = useConsultationDraftContext();
  const run = context?.values[batchKey] as BatchRun | null | undefined;
  const [reviewed, setReviewed] = useConsultationDraft<string | null>(`batch-reviewed:${feature}`, null);
  const proposal = run && context ? getBatchProposal(context.values, run, feature) : undefined;
  return {
    proposal: proposal && run?.completed[feature] === proposal.generationId ? proposal : undefined,
    stale: !!(proposal && run && clinicalBatchNeedsReview(proposal, feature, run.completed)),
    reviewed,
    markReviewed: setReviewed,
  };
}

export function ClinicalBatchStageRevision({ feature, ...props }: {
  feature: ClinicalBatchFeature; patientId: string; consultationId: string; revision: number;
  blocked: boolean; before: () => Promise<boolean>;
}) {
  const checkpoint = useConsultationDraftContext();
  const run = checkpoint?.values[batchKey] as BatchRun | null | undefined;
  if (!checkpoint || !run || !clinicalBatchStages.every(({ feature }) => getSavedBatchProposal(checkpoint.values, run, feature))) return null;
  return <ClinicalBatchChanges {...props} batchId={run.id} completed={run.completed} featureOnly={feature} />;
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
  const [activity, setActivity] = useState<BatchActivity | null>(null);
  const [pause, setPause] = useState<BatchPause | null>(null);
  const currentPause = pause?.batchId === run?.id ? pause : null;
  const [changing, setChanging] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const restricted = ['pes', 'consultation_support', 'patient_instructions'].some(
    feature => data && !canUseFeature(data.access, `ai.${feature}`),
  );
  const stages = clinicalBatchStages.map(stage => ({
    ...stage,
    proposal: checkpoint && run ? getSavedBatchProposal(checkpoint.values, run, stage.feature) : undefined,
  }));
  const total = stages.length;
  const completeCount = stages.filter(({ proposal }) => proposal).length;
  const pendingStage = stages.find(({ proposal }) => !proposal);
  const finished = !pendingStage;
  const savedIds = Object.fromEntries(stages.flatMap(({ feature, proposal }) => proposal ? [[feature, proposal.generationId]] : []));

  async function generate() {
    if (!checkpoint || !ready || restricted || finished || lock.current || changing) return;
    const controller = checkpoint;
    lock.current = true;
    setActivity({ phase: 'saving' });
    setPause(null);
    let batchId = run?.id;
    let currentFeature: ClinicalBatchFeature | undefined;
    try {
      if (!(await before())) throw new Error('Guarda la consulta antes de generar.');
      if (!mounted.current) return;
      let values = await controller.refresh();
      const existing = values[batchKey] as BatchRun | null | undefined;
      if (run && existing?.id !== run.id) throw new AIRequestError('context_changed');
      let saved = existing ?? { id: crypto.randomUUID(), attempts: {}, completed: {} };
      batchId = existing?.id;
      async function saveRun(next: BatchRun) {
        batchId = next.id;
        setRun(next);
        if (!(await controller.flush())) throw new Error('No pudimos guardar el avance. Revisa el guardado y vuelve a intentarlo.');
        saved = next;
      }
      for (const { feature } of clinicalBatchStages) {
        if (!mounted.current) return;
        if (getSavedBatchProposal(values, saved, feature)) continue;
        currentFeature = feature;
        if (saved.completed[feature]) {
          throw new Error('El borrador figura como guardado, pero no pudimos recuperarlo. Actualiza la revisión y comprueba el avance de nuevo.');
        }
        let attempt = saved.attempts[feature];
        setActivity({ phase: attempt ? 'checking' : 'generating', feature });
        const prior = attempt ? await getAIGenerationStatus(attempt) : null;
        if (!mounted.current) return;
        let generationId: string;
        if (prior?.status === 'succeeded') {
          generationId = prior.generationId;
        } else {
          if (prior && !['failed', 'invalid_output'].includes(prior.status)) {
            throw new Error('La solicitud anterior sigue pendiente. Usa «Comprobar y continuar» cuando esté lista.');
          }
          if (!attempt || prior) {
            attempt = crypto.randomUUID();
            await saveRun({ ...saved, attempts: { ...saved.attempts, [feature]: attempt } });
          }
          if (!mounted.current) return;
          setActivity({ phase: 'generating', feature });
          const result = await runAIRequest({
            feature, patientId, consultationId, revision, idempotencyKey: attempt, batchId: saved.id,
            ...(feature === 'consultation_support' ? { objectiveTextStyle: 'patient_v1' as const } : {}),
          });
          if (result.status !== 'succeeded') throw new AIRequestError('provider_outcome_unknown');
          generationId = result.generationId;
        }
        if (!mounted.current) return;
        values = await controller.refresh();
        if (!mounted.current) return;
        const refreshed = values[batchKey] as BatchRun | null | undefined;
        if (refreshed?.id !== saved.id || refreshed.attempts[feature] !== attempt) throw new AIRequestError('context_changed');
        if (getBatchProposal(values, refreshed, feature)?.generationId !== generationId) {
          throw new Error('La generación terminó. Usa «Comprobar y continuar» para recuperar el borrador guardado.');
        }
        await saveRun({ ...refreshed, completed: { ...refreshed.completed, [feature]: generationId } });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Vuelve a intentar la etapa pendiente.';
      if (mounted.current) setPause({ batchId, feature: currentFeature, detail });
    } finally {
      lock.current = false;
      if (mounted.current) setActivity(null);
    }
  }

  if (!checkpoint) return null;
  const activeStage = activity && 'feature' in activity ? stages.find(stage => stage.feature === activity.feature) : undefined;
  const pausedStage = stages.find(stage => stage.feature === currentPause?.feature);
  const resuming = !!(pendingStage && (run?.attempts[pendingStage.feature] || run?.completed[pendingStage.feature]));
  const progressMessage = activity?.phase === 'saving' ? 'Guardando la consulta…'
    : activeStage ? `${activity?.phase === 'checking' ? 'Comprobando' : 'Generando'} · ${activeStage.label}…`
    : finished ? stages.some(({ feature, proposal }) => proposal && hasEmptyCollection(feature, proposal))
      ? 'Generación terminada. Revisa los borradores disponibles.'
      : 'Propuesta completa. Revisa los cuatro borradores.'
    : run && !currentPause && pendingStage ? `Puedes continuar desde ${pendingStage.label}.` : '';

  return <section className="clinical-ai-batch" aria-labelledby="clinical-ai-batch-title">
    <header className="clinical-ai-batch-header">
      <div>
        <h3 id="clinical-ai-batch-title">Propuesta clínica con IA</h3>
        <p>Genera y guarda un borrador a la vez. Puedes revisar cada etapa en cuanto esté lista. Usa créditos según el consumo real.</p>
      </div>
      {!finished && <AIButton
        className="clinical-ai-batch-button"
        state={activity && activity.phase === 'generating' ? 'generating' : 'idle'}
        disabled={!!activity || !ready || restricted || changing}
        title={restricted ? 'Tu acceso necesita IA para las cuatro etapas' : undefined}
        onClick={() => void generate()}
      >
        {activity?.phase === 'saving' ? 'Guardando…' : activity?.phase === 'checking' ? 'Comprobando…'
          : run ? 'Comprobar y continuar' : 'Generar propuesta completa con IA'}
      </AIButton>}
    </header>
    {!ready && !finished && !activity && <p className="clinical-ai-batch-hint">Confirma los datos disponibles para continuar.</p>}
    <div className="clinical-ai-batch-progress">
      <div role="status">
        <strong>{completeCount} de {total} etapas guardadas</strong>
        {progressMessage && <p>{progressMessage}</p>}
      </div>
      <progress aria-label="Etapas guardadas de la propuesta con IA" max={total} value={completeCount} />
    </div>
    <ol className="clinical-ai-batch-cards" aria-label="Etapas de la propuesta" role="list">
      {stages.map(({ feature, label, proposal }, index) => {
        const Icon = stageIcons[feature];
        const note = proposal && run ? proposalNote(feature, proposal, run) : undefined;
        const working = activeStage?.feature === feature;
        const pending = !activity && pendingStage?.feature === feature;
        const stopped = !activity && pausedStage?.feature === feature;
        const state = proposal ? 'saved' : working ? 'working' : stopped || (pending && resuming) ? 'paused' : 'waiting';
        return <li key={feature} data-stage={feature} data-state={state} aria-current={working ? 'step' : undefined}>
          <div className="clinical-ai-batch-card-heading">
            <span className="clinical-ai-batch-icon"><Icon size={17} aria-hidden="true" /></span>
            <h4>{label}</h4>
          </div>
          <p className="clinical-ai-batch-card-status">
            {proposal ? <><Check size={14} aria-hidden="true" /> Guardado</>
              : working ? activity?.phase === 'checking' ? 'Comprobando' : 'Generando'
              : stopped ? 'Pausado' : pending && resuming ? 'Por comprobar' : 'En espera'}
          </p>
          {note && <p className="clinical-ai-batch-card-note">{note}</p>}
          {proposal && <button type="button" className="clinical-ai-batch-review" aria-label={`Revisar ${label}`} onClick={() => onReview(index + 1)}>
            Revisar <ArrowRight size={14} aria-hidden="true" />
          </button>}
        </li>;
      })}
    </ol>
    {currentPause && <p className="clinical-ai-batch-pause" role="alert">
      {pausedStage && <strong>La propuesta se pausó en {pausedStage.feature === 'pes_diagnosis' ? 'diagnóstico PES' : pausedStage.label.toLowerCase()}. </strong>}
      {currentPause.detail}
    </p>}
    {run && <ClinicalBatchChanges patientId={patientId} consultationId={consultationId} revision={revision}
      batchId={run.id} completed={savedIds} blocked={!!activity} before={before} onBusy={setChanging} />}
  </section>;
}
