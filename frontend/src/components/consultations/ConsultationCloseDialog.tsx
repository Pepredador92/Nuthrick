import { useEffect, useRef, useState } from "react";
import { ClipboardList, Salad, X } from "lucide-react";
import { consultationCloseFields, emptyValue, type Answers } from "@/src/features/consultations/questionnaire";
import type { ConsultationSnapshotStructure } from "@/src/types/domain";
import { QuestionField } from "./QuestionField";

export type ConsultationCloseDestination = "history" | "workshop";

type ConsultationCloseDialogProps = {
  sections: ConsultationSnapshotStructure["sections"];
  values: Answers;
  busy: boolean;
  saving: boolean;
  reviewed: boolean;
  blockedBy: string[];
  error: string;
  onChange: (key: string, value: unknown) => void;
  onSave: () => Promise<boolean>;
  onReview: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: (destination: ConsultationCloseDestination) => void;
};

export function ConsultationCloseDialog({
  sections, values, busy, saving, reviewed, blockedBy, error,
  onChange, onSave, onReview, onCancel, onConfirm,
}: ConsultationCloseDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reviewInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<ReadonlySet<string>>(() => new Set());
  const [saved, setSaved] = useState(false);
  const pending = consultationCloseFields(sections, values, editing);
  const issues = pending.flatMap(section => section.fields.flatMap(field => field.issues));
  const hasMissing = issues.some(issue => issue.kind === "missing");
  const hasInvalid = issues.some(issue => issue.kind === "invalid");
  const canClose = reviewed && !busy && !saving && !blockedBy.length && !hasInvalid;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (saved && !pending.length) reviewInput.current?.focus();
  }, [saved, pending.length]);

  async function savePending() {
    if (await onSave()) {
      setEditing(new Set());
      setSaved(true);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="close-consultation-title"
      onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-3xl border border-[#dfe5e1] bg-white text-[#173d36] shadow-xl backdrop:bg-[#173d36]/40"
    >
      <div className="grid max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto]">
        <header className="flex items-start justify-between gap-4 border-b border-[#dfe5e1] px-5 py-4 sm:px-7">
          <h2 id="close-consultation-title" className="text-xl font-semibold">Cerrar consulta</h2>
          <button autoFocus type="button" aria-label="Volver a la consulta" disabled={busy} className="rounded-lg p-2 hover:bg-[#edf5ef]" onClick={onCancel}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain px-5 py-4 sm:px-7">
          {pending.length > 0 && (
            <section aria-labelledby="close-consultation-pending" className="mb-4 space-y-3">
              <h3 id="close-consultation-pending" className="text-sm font-semibold">Pendientes del guion de esta consulta</h3>
              {hasMissing && (
                <p className="rounded-xl bg-[#fff9e9] px-3 py-2 text-sm text-[#775527]">
                  Hay datos obligatorios sin completar. Puedes guardarlos aquí o cerrar con estos pendientes.
                </p>
              )}
              {hasInvalid && <p className="text-sm text-[#963f32]">Corrige o borra los valores fuera del rango permitido antes de cerrar.</p>}
              <fieldset disabled={busy} className="space-y-3">
                {pending.map(section => (
                  <div key={section.key} className="space-y-3 rounded-xl border border-[#dfe5e1] p-3">
                    <h4 className="text-xs font-semibold text-[#60766a]">{section.title}</h4>
                    {section.fields.map(({ question, issues: fieldIssues }) => {
                      const key = question.question_key;
                      return (
                        <QuestionField key={key} question={question} value={values[key]}
                          errors={emptyValue(values[key]) ? [] : fieldIssues.map(issue => issue.message)}
                          onChange={value => {
                            setSaved(false);
                            setEditing(keys => new Set(keys).add(key));
                            onChange(key, value);
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </fieldset>
              <button type="button" className="nuth-button-secondary" disabled={busy || saving || !editing.size} onClick={() => void savePending()}>
                Guardar respuestas
              </button>
            </section>
          )}
          {saved && <p role="status" className="mb-4 text-sm">Respuestas guardadas.</p>}
          {blockedBy.length > 0 && (
            <p role="status" className="mb-4 rounded-xl bg-[#fff9e9] px-3 py-2 text-sm text-[#775527]">
              Guarda primero los cambios de {blockedBy.join(", ")}. Puedes volver a esta ventana después.
            </p>
          )}
          <p className="mb-3 text-sm text-[#60766a]">Las propuestas clínicas que estén en borrador se guardarán como borradores privados.</p>
          <label className="flex items-start gap-3 rounded-xl bg-[#edf5ef] p-3 text-sm leading-6">
            <input ref={reviewInput} type="checkbox" checked={reviewed} disabled={busy} onChange={event => onReview(event.target.checked)} className="mt-1 shrink-0 accent-[#315e4f]" />
            Revisé la información. Entiendo que al cerrar esta consulta quedará en el historial y no podré editar sus respuestas.
          </label>
          {error && <p role="alert" className="mt-3 text-sm text-[#963f32]">{error}</p>}
        </div>
        <footer className="grid gap-2 border-t border-[#dfe5e1] px-5 py-4 sm:flex sm:flex-wrap sm:justify-end sm:px-7">
          {busy && <p role="status" className="my-auto text-sm text-[#60766a] sm:mr-auto">Guardando cambios…</p>}
          <button type="button" className="nuth-button-secondary" disabled={!canClose} onClick={() => onConfirm("history")}>
            <ClipboardList size={16} aria-hidden="true" />Cerrar y ver historial
          </button>
          <button type="button" className="nuth-button" disabled={!canClose} onClick={() => onConfirm("workshop")}>
            <Salad size={16} aria-hidden="true" />Cerrar e ir al Taller de dietas
          </button>
        </footer>
      </div>
    </dialog>
  );
}
