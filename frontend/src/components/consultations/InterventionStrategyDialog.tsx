import {SaveConsultationDraftButton} from './ConsultationDrafts';
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eraser, Trash2, X } from "lucide-react";
import type { InterventionWorkspace } from "@/src/services/clinicalInterventions";
import {
  type StrategyDocument,
  strategyFields,
  strategyIssues,
  strategyRequiredFields,
} from "../../../../supabase/functions/_shared/interventions";
import {
  InterventionStrategyForm,
  strategyContextEligible,
  strategyLabels,
  strategyIssueMessages,
  strategyStepIssues,
  strategyStepHasDetails,
  strategySteps,
} from "./InterventionStrategyForm";
import { ClinicalStatusBadge } from "./ClinicalTaskCard";

function focusStrategyField(root: HTMLElement | null, field: string) {
  const group = root?.querySelector<HTMLElement>(`[data-strategy-field="${field}"]`);
  if (!group) return false;
  for (let parent = group.parentElement; parent && parent !== root; parent = parent.parentElement) {
    if (parent.tagName === "DETAILS") (parent as HTMLDetailsElement).open = true;
  }
  group.scrollIntoView?.({ block: "center", behavior: "smooth" });
  const input = group.querySelector<HTMLElement>("[data-strategy-prerequisite]") ?? group.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)");
  (input ?? group).focus();
  return true;
}

export function InterventionStrategyDialog(
  {
    id,
    document,
    workspace,
    initialStep,
    busy,
    message,
    linked,
    clean,
    alreadyApproved,
    canApprove,
    initialApprovalAttempt = false,
    approvalContextMessage,
    onReviewPrerequisite,
    onClear,
    onRemove,
    removeLabel,
    onChange,
    onClose,
    onSave,
    onApprove,
    onStepChange,
  }: {
    id: string;
    document: StrategyDocument;
    workspace: InterventionWorkspace | null;
    initialStep: number;
    busy: boolean;
    message: string;
    linked: boolean;
    clean: boolean;
    alreadyApproved: boolean;
    canApprove: boolean;
    initialApprovalAttempt?: boolean;
    approvalContextMessage?: string;
    onReviewPrerequisite?: () => void;
    onClear?: () => void;
    onRemove?: () => void;
    removeLabel?: string;
    onChange: (document: StrategyDocument) => void;
    onClose: () => void;
    onSave: () => void;
    onApprove: () => void;
    onStepChange?: (step:number) => void;
  },
) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(initialStep);
  const [attempted, setAttempted] = useState(initialApprovalAttempt);
  const issues = strategyIssues(document.strategy);
  const eligibleContext = strategyContextEligible(workspace);
  const initialFocus = useRef(initialApprovalAttempt ? (!linked ? "context" : issues[0]) : undefined);
  const completedTextRequirements = strategyRequiredFields.filter((field) =>
    document.strategy[field].trim()
  ).length;
  const hasLinkedGoal = linked && document.strategy.goalIndexes.length > 0;
  const complete = completedTextRequirements + Number(hasLinkedGoal);
  const saveLabel = busy ? "Guardando…" : clean ? "Listo" : "Guardar y cerrar";
  useEffect(() => {
    const element = dialog.current;
    const previous = globalThis.document.activeElement as HTMLElement | null;
    const pageStyle = element?.ownerDocument.body.style;
    const overflow = pageStyle?.overflow ?? "";
    element?.showModal?.();
    pageStyle?.setProperty("overflow", "hidden");
    title.current?.focus();
    const frame = requestAnimationFrame(() => {
      if (initialFocus.current) focusStrategyField(element, initialFocus.current);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (element?.open) element.close?.();
      pageStyle?.setProperty("overflow", overflow);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  function goToStep(next: number, field?: string) {
    setStep(next);
    onStepChange?.(next);
    requestAnimationFrame(() => {
      if (field && focusStrategyField(dialog.current, field)) return;
      if (body.current) body.current.scrollTop = 0;
      heading.current?.focus();
    });
  }
  function showPending(field = !linked ? "context" : issues[0]) {
    if (!field) return;
    setAttempted(true);
    const next = strategySteps.findIndex((item) => (item.keys as readonly string[]).includes(field));
    goToStep(Math.max(0, next), field);
  }
  function approve() {
    setAttempted(true);
    if (!canApprove) { showPending(); return; }
    onApprove();
  }
  return (
    <dialog
      ref={dialog}
      className="clinical-objective-dialog clinical-strategy-dialog clinical-objectives-workspace"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-help`}
      open={typeof HTMLDialogElement === "undefined" ||
        !HTMLDialogElement.prototype.showModal}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="clinical-objective-dialog-shell">
        <header className="clinical-objective-dialog-heading">
          <div>
            <p className="nuth-eyebrow">Estrategia de intervención</p>
            <h2 ref={title} id={`${id}-title`} tabIndex={-1}>
              Revisa y aprueba la estrategia
            </h2>
            <p id={`${id}-help`}>
              Para aprobar, completa el nombre, la acción concreta y al menos un
              objetivo vinculado. Los demás detalles son opcionales. Puedes
              guardar un borrador en cualquier momento.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Cerrar revisión de la estrategia"
          >
            <X size={21} aria-hidden="true" />
          </button>
        </header>
        <nav
          className="clinical-objective-stepper clinical-strategy-stepper"
          aria-label="Pasos de la estrategia"
        >
          {strategySteps.map((item, index) => {
            const optional = index >= 2;
            const hasDetails = strategyStepHasDetails(document.strategy, index);
            const done = (!optional || hasDetails) &&
              !strategyStepIssues(document.strategy, index).length &&
              (index !== 0 || linked);
            return (
              <button
                key={item.title}
                type="button"
                disabled={busy}
                aria-current={step === index ? "step" : undefined}
                aria-controls={`${id}-panel`}
                data-complete={done}
                onClick={() => goToStep(index)}
              >
                <span aria-hidden="true">
                  {done ? <Check size={15} /> : index + 1}
                </span>
                <span>{item.title}</span>
                <span className="sr-only">
                  {done ? "Completo" : optional ? "Opcional" : "Pendiente"}
                </span>
              </button>
            );
          })}
        </nav>
        <div ref={body} className="clinical-objective-dialog-body">
          <div className="clinical-goal-progress">
            <span>Paso {step + 1} de {strategySteps.length}</span>
            <progress
              value={complete}
              max={3}
              aria-label="Requisitos para aprobar la estrategia"
            />
            <span>{complete} de 3 requisitos</span>
          </div>
          <ul className="clinical-strategy-requirements" aria-label="Requisitos para aprobar">
            <li data-complete={!!document.strategy.title.trim()}>
              {document.strategy.title.trim() ? "✓" : "○"} Nombre de la estrategia
            </li>
            <li data-complete={!!document.strategy.action.trim()}>
              {document.strategy.action.trim() ? "✓" : "○"} Acción concreta
            </li>
            <li data-complete={hasLinkedGoal}>
              {hasLinkedGoal ? "✓" : "○"} {!eligibleContext
                ? "Objetivos aprobados para el PES vigente"
                : !linked
                ? "Estrategia vinculada a las aprobaciones vigentes"
                : document.strategy.goalIndexes.length
                ? "Objetivo vigente seleccionado"
                : "Al menos un objetivo seleccionado"}
            </li>
          </ul>
          <section
            className="clinical-objective-step"
            id={`${id}-panel`}
            aria-labelledby={`${id}-step`}
          >
            <h3 ref={heading} tabIndex={-1} id={`${id}-step`}>
              {strategySteps[step].heading}
            </h3>
            <p>{strategySteps[step].description}</p>
            <div className="clinical-objective-step-fields">
              <InterventionStrategyForm
                document={document}
                workspace={workspace}
                disabled={busy}
                step={step}
                showErrors={attempted}
                onChange={onChange}
              />
            </div>
            {step === strategySteps.length - 1 && (
              <>
                <details className="clinical-objective-preview">
                  <summary>Ver estrategia completa</summary>
                  <dl className="clinical-strategy-detail-fields">
                    {strategyFields.filter((field) => document.strategy[field])
                      .map((field) => (
                        <div key={field}>
                          <dt>{strategyLabels[field]}</dt>
                          <dd>{document.strategy[field]}</dd>
                        </div>
                      ))}
                  </dl>
                </details>
              </>
            )}
            {issues.length > 0 || !linked
              ? (
                <div className="clinical-notice" data-strategy-field={!linked ? "context" : undefined} tabIndex={-1}>
                  <p>
                    {issues.length
                      ? "Revisa estos requisitos para aprobar. Puedes guardar el borrador sin completarlos."
                      : approvalContextMessage ?? "Para aprobar, vincula la estrategia al PES y a los objetivos vigentes aprobados."}
                  </p>
                  <button
                    type="button"
                    className="clinical-text-action mt-2"
                    disabled={busy}
                    onClick={() => showPending()}
                  >
                    Ir al siguiente pendiente<ArrowRight size={15} />
                  </button>
                  <div className="clinical-approval-details">
                    <ul aria-label="Pendientes para aprobar">
                      {!linked && (
                        <li>
                          {approvalContextMessage ?? "Vinculación con el PES y los objetivos actuales"}
                          {onReviewPrerequisite && <button type="button" className="clinical-text-action" data-strategy-prerequisite disabled={busy} onClick={onReviewPrerequisite}>{workspace?.pes ? "Ir a objetivos" : "Ir al diagnóstico PES"}<ArrowRight size={15}/></button>}
                        </li>
                      )}
                      {issues.map((key) => (
                        <li key={key}><button type="button" className="clinical-text-action" disabled={busy} onClick={() => showPending(key)}>{strategyIssueMessages[key] ?? strategyLabels[key] ?? key}<ArrowRight size={15}/></button></li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
              : (
                <p className="clinical-strategy-review-note">
                  Puedes aprobar con detalles pendientes. El acuerdo con la
                  persona y el inicio de ejecución se registran por separado.
                </p>
              )}
            {(onClear || onRemove) && <div className="clinical-strategy-editor-actions">
              {onClear && <button type="button" className="clinical-text-action" disabled={busy} onClick={onClear}><Eraser size={15}/>Limpiar campos</button>}
              {onRemove && <button type="button" className="clinical-text-action" disabled={busy} onClick={onRemove}><Trash2 size={15}/>{removeLabel}</button>}
            </div>}
          </section>
          {message && <p role="status" className="clinical-notice">{message}
          </p>}
        </div>
        <footer className="clinical-objective-dialog-footer">
          <SaveConsultationDraftButton/>
          <button
            type="button"
            className="clinical-text-action"
            disabled={busy}
            onClick={() => step > 0 ? goToStep(step - 1) : onClose()}
          >
            {step > 0 && <ArrowLeft size={15} aria-hidden="true" />}
            {step > 0 ? "Volver" : "Continuar después"}
          </button>
          <div>
            <button
              type="button"
              className="nuth-button-secondary"
              disabled={busy}
              onClick={onSave}
            >
              {saveLabel}
            </button>
            {step < strategySteps.length - 1
              ? (
                <button
                  type="button"
                  className="nuth-button-secondary"
                  disabled={busy}
                  onClick={() => goToStep(step + 1)}
                >
                  Continuar<ArrowRight size={15} aria-hidden="true" />
                </button>
              )
              : null}
            {alreadyApproved
              ? (
                <ClinicalStatusBadge status="approved">
                  Aprobada
                </ClinicalStatusBadge>
              )
              : (
                <button
                  type="button"
                  className="nuth-button"
                  disabled={busy || !!workspace?.archived}
                  onClick={approve}
                >
                  {busy ? "Guardando…" : "Aprobar estrategia"}
                </button>
              )}
          </div>
        </footer>
      </div>
    </dialog>
  );
}
