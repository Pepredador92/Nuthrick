import { ArrowUp, Trash2 } from 'lucide-react';
import type { ObjectiveGoal } from '../../../../supabase/functions/_shared/objectives';
import { objectiveEditorFieldLabel, objectiveEditorFields, type ObjectiveEditorField } from '@/src/features/consultations/objectiveEditorText';
import { ClinicalStatusBadge } from './ClinicalTaskCard';

export type ObjectiveProposalEvidence = {
  evidence: { source: string; finding: string }[];
  references?: { title: string; url: string }[];
};

export type ObjectivePending = { label: string; field?: ObjectiveEditorField | 'sign' | 'agreement' };

export function objectivePendingFields(goal: ObjectiveGoal, signs: string[]): ObjectivePending[] {
  const pending: ObjectivePending[] = objectiveEditorFields.flatMap(field => {
    const label = objectiveEditorFieldLabel(field);
    if (goal[field].length > (field === 'etiology' ? 1500 : 400)) return [{ label: `Resume «${label}»`, field }];
    return goal[field].trim() ? [] : [{ label, field }];
  });
  if (!goal.sign.trim() || goal.sign.length > 2000 || !signs.includes(goal.sign)) {
    pending.push({ label: 'Signo o síntoma del PES', field: 'sign' });
  }
  if (goal.agreement !== 'patient' && goal.agreement !== 'caregiver') {
    pending.push({ label: 'Acuerdo con la persona', field: 'agreement' });
  }
  return pending;
}

export function ObjectiveGoalSummary({
  goal, index, active, approved, ready, fromAI, onOpen, onRemove, onMoveUp,
}: {
  goal: ObjectiveGoal;
  index: number;
  active: boolean;
  approved: boolean;
  ready: boolean;
  fromAI: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onMoveUp?: () => void;
}) {
  const status = approved ? 'approved' : ready ? 'complete' : 'progress';
  return <section className="smart-objective-card" data-selected={active} data-status={status}
    aria-label={`Objetivo ${index + 1}`}>
    <button type="button" className="smart-objective-select" aria-label={`Revisar objetivo ${index + 1}`}
      aria-pressed={active} onClick={onOpen}>
      <span className="smart-objective-name">{goal.outcome.trim() || `Objetivo ${index + 1}`}</span>
      <ClinicalStatusBadge status={status}>
        {approved ? 'Aprobado' : ready ? 'Listo para aprobar' : fromAI ? 'Borrador de IA' : 'Por revisar'}
      </ClinicalStatusBadge>
    </button>
    <div className="smart-objective-card-tools">
      {onMoveUp && <button type="button" onClick={onMoveUp} aria-label="Subir prioridad" title="Subir prioridad">
        <ArrowUp size={16} aria-hidden="true" />
      </button>}
      <button type="button" onClick={onRemove} aria-label={`Quitar objetivo ${index + 1}`} title={`Quitar objetivo ${index + 1}`}>
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  </section>;
}

export function ObjectiveGoalEditor({
  id, text, issue, goal, index, signs, approved, cause, grounding, pending, onPending, onText, onChange,
}: {
  id: string;
  text: string;
  issue?: string;
  goal: ObjectiveGoal;
  index: number;
  signs: string[];
  approved: boolean;
  cause?: string;
  grounding?: ObjectiveProposalEvidence;
  pending: ObjectivePending[];
  onPending: (field: ObjectivePending['field']) => void;
  onText: (text: string) => void;
  onChange: (fields: Partial<ObjectiveGoal>) => void;
}) {
  const staleSign = !!goal.sign && !signs.includes(goal.sign);
  const needsContext = !signs.includes(goal.sign);
  return <div className="smart-objective-editor" data-approved={approved}>
    <div className="smart-objective-editor-heading">
      <label htmlFor={id} className="smart-objective-title">Texto del objetivo</label>
      {approved && <ClinicalStatusBadge status="approved">Objetivo aprobado</ClinicalStatusBadge>}
    </div>
    {pending.length > 0 && <div className="smart-objective-pending" role="group" aria-label={`Campos pendientes del objetivo ${index + 1}`}>
      <p id={issue ? `${id}-issue` : undefined}>{issue ?? 'Completa estos campos para aprobar este objetivo.'}</p>
      {issue ? <button type="button" onClick={() => onPending(pending[0].field)}>Ir al texto</button> : <ul>
        {pending.map(({ field, label }) => <li key={field}><button type="button" onClick={() => onPending(field)}>{label}</button></li>)}
      </ul>}
    </div>}
    <textarea id={id} className="nuth-input smart-objective-text" rows={25}
      aria-label={`Texto del objetivo ${index + 1}`}
      aria-describedby={issue ? `${id}-issue` : undefined}
      aria-invalid={issue ? true : undefined}
      value={text} onChange={event => onText(event.target.value)} />
    <details className="clinical-support-details smart-objective-evidence">
      <summary>Vínculo con el PES y evidencia</summary>
      {cause && <p><strong>Etiología del PES</strong><br />{cause}</p>}
      <label className="clinical-goal-field smart-objective-sign">
        <span>Signo o síntoma del PES</span>
        <select id={`${id}-sign`} aria-label={`Signo o síntoma del PES · objetivo ${index + 1}`}
          className="nuth-input" value={goal.sign} onChange={event => onChange({ sign: event.target.value })}>
          <option value="">Selecciona qué evidencia reevaluarás</option>
          {staleSign && <option value={goal.sign}>{goal.sign} · revisar vigencia</option>}
          {signs.map(sign => <option key={sign} value={sign}>{sign}</option>)}
        </select>
        {needsContext && <small className="clinical-inline-warning">
          {signs.length ? 'Selecciona un signo del PES vigente.' : 'Registra y aprueba el PES para vincular su evidencia.'}
        </small>}
      </label>
      {!!grounding?.evidence.length && <ul className="consultation-context-facts">
        {grounding.evidence.map(({ source, finding }, i) => <li key={i}><strong>{source}</strong><p>{finding}</p></li>)}
      </ul>}
      {!!grounding?.references?.length && <ul className="smart-objective-references">
        {grounding.references.map(({ title, url }) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{title}</a></li>)}
      </ul>}
    </details>
    <label className="smart-objective-agreement" htmlFor={`${id}-agreement`}>
      <span>Acuerdo con la persona</span>
      <select id={`${id}-agreement`} aria-label={`Acuerdo · objetivo ${index + 1}`}
        className="nuth-input" value={goal.agreement}
        onChange={event => {
          const value = event.target.value;
          onChange({ agreement: value === 'patient' || value === 'caregiver' ? value : 'pending' });
        }}>
        <option value="pending">Por confirmar</option>
        <option value="patient">Acordado con el paciente</option>
        <option value="caregiver">Acordado con el cuidador</option>
      </select>
    </label>
  </div>;
}
