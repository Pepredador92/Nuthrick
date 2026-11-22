import { useId, useRef, useState } from 'react';
import { ArrowRight, Check, Pencil } from 'lucide-react';
import { strategyIssues, type StrategyDocument } from '../../../../supabase/functions/_shared/interventions';
import type { InterventionWorkspace } from '@/src/services/clinicalInterventions';
import { formatStrategyEditorText, readStrategyEditorText, strategyFieldOffset } from '@/src/features/consultations/strategyEditorText';
import { InterventionStrategyForm, strategyIssueMessages, strategyLabels, StrategyProposalSources } from './InterventionStrategyForm';

export function InterventionStrategyEditor({
  document, workspace, text, busy, editable, hasDraft, linked, prerequisite, onEdit, onCancelEdit, onText,
  onChange, onSave, onApprove, onReviewPrerequisite,
}: {
  document: StrategyDocument;
  workspace: InterventionWorkspace | null;
  text?: string;
  busy: boolean;
  editable: boolean;
  hasDraft: boolean;
  linked: boolean;
  prerequisite?: string;
  onEdit: () => void;
  onCancelEdit: () => void;
  onText: (text: string) => void;
  onChange: (document: StrategyDocument) => void;
  onSave: () => void;
  onApprove: () => void;
  onReviewPrerequisite?: () => void;
}) {
  const id = useId();
  const container = useRef<HTMLElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [attempted, setAttempted] = useState(false);
  const strategy = document.strategy;
  const value = text ?? formatStrategyEditorText(strategy, editable);
  const parsed = editable ? readStrategyEditorText(value) : undefined;
  const textError = parsed && 'issue' in parsed ? parsed : undefined;
  const textIssue = textError?.issue;
  const issues = strategyIssues(strategy);
  const hasGoal = linked && strategy.goalIndexes.length > 0;
  const hasStructure = !textError || !!textError.field;
  const complete = Number(hasStructure && !!strategy.title.trim() && textError?.field !== 'title')
    + Number(hasStructure && !!strategy.action.trim() && textError?.field !== 'action') + Number(hasGoal);
  const firstIssue = textIssue ?? (issues.includes('title') ? strategyIssueMessages.title
    : issues.includes('action') ? strategyIssueMessages.action
    : prerequisite ?? (!hasGoal ? strategyIssueMessages.goalIndexes
    : issues[0] ? strategyIssueMessages[issues[0]] ?? strategyLabels[issues[0]] : undefined));

  function focusIssue(field: string) {
    const offset = strategyFieldOffset(value, field);
    if (field === 'text' || offset !== null) {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(offset ?? 0, offset ?? 0);
      return;
    }
    const group = container.current?.querySelector<HTMLElement>(`[data-strategy-field="${field}"]`);
    const details = group?.closest('details');
    if (details) details.open = true;
    (group?.querySelector<HTMLElement>('input, select, textarea') ?? group)?.focus();
  }

  function approve() {
    if (!firstIssue) {
      onApprove();
      return;
    }
    setAttempted(true);
    const field = textError ? textError.field ?? 'text' : issues.includes('title') ? 'title' : issues.includes('action') ? 'action'
      : prerequisite ? 'context' : !hasGoal ? 'goalIndexes' : issues[0];
    requestAnimationFrame(() => focusIssue(field));
  }

  return (
    <section ref={container} className="strategy-inline-editor" aria-label="Editor de estrategia">
      <label htmlFor={`${id}-text`}>Texto de la estrategia</label>
      {editable && <p id={`${id}-help`} className="strategy-editor-help">Edita la estrategia en este cuadro. Completa solo los detalles que apliquen.</p>}
      <textarea
        ref={textarea}
        id={`${id}-text`}
        className="strategy-editor-text nuth-input"
        rows={12}
        readOnly={busy || !editable}
        aria-invalid={attempted && !!textIssue || undefined}
        aria-describedby={editable ? `${id}-help${attempted && firstIssue ? ` ${id}-issue` : ''}` : undefined}
        value={value}
        onChange={event => onText(event.target.value)}
      />
      {!editable && <div className="strategy-editor-controls">
        <button type="button" className="nuth-button-secondary !text-xs" disabled={busy} onClick={() => {
          setAttempted(false);
          onEdit();
          requestAnimationFrame(() => textarea.current?.focus());
        }}><Pencil size={15} aria-hidden="true" />Editar estrategia</button>
      </div>}
      <InterventionStrategyForm document={document} workspace={workspace} disabled={busy || !editable} showErrors={attempted} onChange={onChange} />
      <StrategyProposalSources strategy={strategy} />
      {editable && !hasDraft && <div className="strategy-editor-controls">
        <button type="button" className="nuth-button-secondary !text-xs" disabled={busy} onClick={onCancelEdit}>Cerrar edición</button>
      </div>}
      {editable && hasDraft && <footer className="strategy-editor-footer">
        <div className="strategy-editor-approval">
          <progress value={complete} max={3} aria-label="Requisitos para aprobar la estrategia" />
          <span>{complete} de 3 requisitos</span>
        </div>
        {firstIssue && <div className="strategy-editor-pending" data-strategy-field="context" tabIndex={-1}>
          <p id={`${id}-issue`} role={attempted ? 'status' : undefined}>{firstIssue}</p>
          {prerequisite && onReviewPrerequisite && <button type="button" className="clinical-text-action" disabled={busy} onClick={onReviewPrerequisite}>
            {workspace?.pes ? 'Ir a objetivos' : 'Ir al diagnóstico PES'}<ArrowRight size={15} aria-hidden="true" />
          </button>}
        </div>}
        <div className="strategy-editor-controls">
          <button type="button" className="nuth-button-secondary !text-xs" disabled={busy} onClick={() => {
            if (textError) { setAttempted(true); focusIssue(textError.field ?? 'text'); }
            else onSave();
          }}>Guardar borrador</button>
          <button type="button" className="nuth-button !text-xs" disabled={busy} onClick={approve}>
            <Check size={15} aria-hidden="true" />Aprobar estrategia
          </button>
        </div>
      </footer>}
    </section>
  );
}
