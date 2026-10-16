import { useEffect, useRef } from "react";
import { LoaderCircle, Save, Trash2 } from "lucide-react";

export function ConsultationExitDialog({ busy, canDiscard, pending, error, onSave, onDiscard, onContinue, onReview }: {
  busy: boolean;
  canDiscard: boolean;
  pending: string[];
  error: string;
  onSave: () => void;
  onDiscard: () => void;
  onContinue: () => void;
  onReview: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    continueButton.current?.focus();
    return () => { if (element?.open) element.close(); };
  }, []);
  return <dialog ref={dialog} aria-labelledby="consultation-exit-title" aria-describedby="consultation-exit-description" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-[#dfe5e1] bg-white p-6 text-[#173d36] shadow-xl backdrop:bg-[#173d36]/50" onCancel={event => { event.preventDefault(); if (!busy) onContinue(); }}>
    <p className="nuth-eyebrow">Consulta en curso</p>
    <h2 id="consultation-exit-title" className="mt-2 text-xl font-semibold">¿Qué quieres hacer con esta consulta?</h2>
    <p id="consultation-exit-description" className="mt-3 text-sm leading-6 text-[#60766a]">{canDiscard ? "Guárdala como borrador para retomarla después, o elimina esta consulta y los datos que capturaste en ella. La eliminación no se puede deshacer." : "Esta consulta conserva un historial previo. Guarda el borrador para retomarla después."}</p>
    {pending.length > 0 && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900"><p>Antes de guardar y salir, revisa los cambios pendientes de {pending.join(" y ")}. Tus datos siguen en la consulta.</p><button type="button" disabled={busy} className="mt-2 font-semibold underline" onClick={onReview}>Revisar cambios pendientes</button></div>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-[#fbe9e5] p-3 text-sm text-[#963f32]">{error}</p>}
    <div className="mt-6 grid gap-3">
      <button type="button" className="nuth-button justify-center" disabled={busy || pending.length > 0} onClick={onSave}>{busy ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}Guardar borrador y salir</button>
      {canDiscard && <button type="button" className="nuth-button-secondary consultation-discard-action justify-center" disabled={busy} onClick={onDiscard}><Trash2 size={17} />Eliminar consulta y salir</button>}
      <button ref={continueButton} autoFocus type="button" className="rounded-xl px-3 py-2 text-sm font-semibold text-[#315e4f]" disabled={busy} onClick={onContinue}>Continuar en la consulta</button>
    </div>
  </dialog>;
}
