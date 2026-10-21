import {SaveConsultationDraftButton} from './ConsultationDrafts';
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import type { InterventionWorkspace } from "@/src/services/clinicalInterventions";
import {
  type StrategyDocument,
  strategyFields,
  strategyIssues,
  strategyRequiredFields,
} from "../../../../supabase/functions/_shared/interventions";
import {
  InterventionStrategyForm,
  strategyLabels,
  strategyStepIssues,
  strategyStepHasDetails,
  strategySteps,
} from "./InterventionStrategyForm";
import { ClinicalStatusBadge } from "./ClinicalTaskCard";

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
  const issues = strategyIssues(document.strategy);
  const complete = strategyRequiredFields.filter((field) =>
    document.strategy[field].trim()
  ).length + Number(linked && document.strategy.goalIndexes.length > 0);
  const saveLabel = busy ? "Guardando…" : clean ? "Listo" : "Guardar y cerrar";
  useEffect(() => {
    const element = dialog.current;
    const previous = globalThis.document.activeElement as HTMLElement | null;
    const overflow = globalThis.document.body.style.overflow;
    element?.showModal?.();
    globalThis.document.body.style.overflow = "hidden";
    title.current?.focus();
    return () => {
      if (element?.open) element.close?.();
      globalThis.document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  function goToStep(next: number) {
    setStep(next);
    onStepChange?.(next);
    requestAnimationFrame(() => {
      if (body.current) body.current.scrollTop = 0;
      heading.current?.focus();
    });
  }
  function showPending() {
    const next = !linked
      ? 0
      : strategySteps.findIndex((_, index) =>
        strategyStepIssues(document.strategy, index).length > 0
      );
    goToStep(Math.max(0, next));
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
                <div className="clinical-notice">
                  <p>
                    {issues.length
                      ? "Revisa estos requisitos para aprobar. Puedes guardar el borrador sin completarlos."
                      : "Para aprobar, vincula la estrategia al PES y a los objetivos vigentes aprobados."}
                  </p>
                  <button
                    type="button"
                    className="clinical-text-action mt-2"
                    disabled={busy}
                    onClick={showPending}
                  >
                    Ir al siguiente pendiente<ArrowRight size={15} />
                  </button>
                  <details className="clinical-approval-details">
                    <summary>Ver pendientes</summary>
                    <ul>
                      {!linked && (
                        <li>
                          Vinculación con el PES y los objetivos actuales
                        </li>
                      )}
                      {issues.map((key) => (
                        <li key={key}>{strategyLabels[key] ?? key}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )
              : (
                <p className="clinical-strategy-review-note">
                  Puedes aprobar con detalles pendientes. El acuerdo con la
                  persona y el inicio de ejecución se registran por separado.
                </p>
              )}
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
                  disabled={busy || !canApprove}
                  onClick={onApprove}
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
