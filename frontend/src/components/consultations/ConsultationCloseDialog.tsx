import { useEffect, useRef, type ReactNode } from "react";
import { Check, X } from "lucide-react";

export function ConsultationCloseDialog({ busy, reviewed, pending, error, children, onReview, onCancel, onConfirm }: {
  busy: boolean; reviewed: boolean; pending: string[]; error: string; children: ReactNode;
  onReview: (value: boolean) => void; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} aria-labelledby="close-consultation-title" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-[#dfe5e1] bg-white p-5 text-[#173d36] shadow-xl backdrop:bg-[#173d36]/40 sm:p-7">
    <div className="flex items-start justify-between gap-4"><div><p className="nuth-eyebrow">Antes de cerrar</p><h2 id="close-consultation-title" className="mt-2 text-xl font-semibold">Cerrar entrevista</h2></div><button autoFocus type="button" aria-label="Volver a la consulta" disabled={busy} className="rounded-lg p-2 hover:bg-[#edf5ef]" onClick={onCancel}><X size={20} /></button></div>
    <p className="mt-3 text-sm leading-6 text-[#60766a]">Revisa la información registrada. Al confirmar, la consulta quedará en el historial.</p>
    <details className="mt-4 rounded-xl border border-[#dfe5e1] p-4"><summary className="cursor-pointer text-sm font-semibold">Ver resumen de la entrevista</summary><div className="mt-4">{children}</div></details>
    {pending.length > 0 && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Guarda primero los cambios pendientes de {pending.join(" y ")}. Después podrás cerrar desde esta misma pestaña.</p>}
    <label className="mt-5 flex items-start gap-3 rounded-xl bg-[#edf5ef] p-4 text-sm leading-6"><input type="checkbox" checked={reviewed} disabled={busy} onChange={(event) => onReview(event.target.checked)} className="mt-1 accent-[#315e4f]" />Revisé la información. Entiendo que al cerrar esta consulta quedará en el historial y no podré editar sus respuestas.</label>
    {error && <p role="alert" className="mt-3 text-sm text-[#963f32]">{error}</p>}
    <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" className="nuth-button-secondary" disabled={busy} onClick={onCancel}>Volver a la consulta</button><button type="button" className="nuth-button" disabled={busy || !reviewed || pending.length > 0} onClick={onConfirm}><Check size={16} />{busy ? "Cerrando…" : "Confirmar cierre"}</button></div>
  </dialog>;
}
