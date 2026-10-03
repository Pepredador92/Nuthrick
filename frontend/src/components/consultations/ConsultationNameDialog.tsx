import { useEffect, useRef, useState, type FormEvent } from "react";
import { consultationLabel } from "@/src/features/patients/patientUtils";
import { renameConsultation } from "@/src/services/consultations";
import type { Consultation } from "@/src/types/domain";

export function ConsultationNameDialog({ consultation, onClose, onSaved }: {
  consultation: Consultation;
  onClose: () => void;
  onSaved: (consultation: Consultation) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [name, setName] = useState(consultationLabel(consultation));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const automaticName = consultationLabel({ ...consultation, display_name: null });
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const updated = await renameConsultation(consultation, name);
      onSaved(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos guardar el nombre.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <dialog ref={dialog} aria-labelledby="consultation-name-title" aria-describedby="consultation-name-help"
      onCancel={(event) => { event.preventDefault(); if (!saving.current) onClose(); }}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl border border-[#dfe5e1] bg-white p-6 text-[#24463b] shadow-2xl backdrop:bg-[#102d27]/45">
      <form onSubmit={(event) => void save(event)}>
        <h2 id="consultation-name-title" className="text-xl font-semibold">Cambiar nombre de consulta</h2>
        <p id="consultation-name-help" className="mt-2 text-sm text-[#60726a]">Este nombre te ayudará a identificarla en la ficha y el historial.</p>
        <label className="mt-5 block text-sm font-semibold" htmlFor="consultation-name">Nombre de la consulta</label>
        <input id="consultation-name" className="nuth-input mt-2 w-full" autoFocus maxLength={120} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder={automaticName} />
        <button type="button" className="mt-2 text-sm font-semibold underline" disabled={busy} onClick={() => setName("")}>Usar nombre automático</button>
        {!name.trim() && <p className="mt-1 text-sm text-[#60726a]">Se mostrará: {automaticName}</p>}
        {error && <p role="alert" className="mt-4 text-sm text-[#9b493a]">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="nuth-button-secondary" disabled={busy} onClick={onClose}>Cancelar</button>
          <button type="submit" className="nuth-button" disabled={busy}>{busy ? "Guardando…" : "Guardar nombre"}</button>
        </div>
      </form>
    </dialog>
  );
}
