import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { NotebookPen, X } from "lucide-react";
import { formatPatientDate } from "@/src/features/patients/patientUtils";
import { createPatientNote, listPatientNotes } from "@/src/services/patients";
import type { PatientNote } from "@/src/types/domain";
import { useConsultationDraft } from "./ConsultationDrafts";
import "./ConsultationNotes.css";

export function ConsultationNotes({ patientId, consultationId, onSaved }: {
  patientId: string;
  consultationId: string;
  onSaved: () => void;
}) {
  const id = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [content, setContent] = useConsultationDraft("unsaved-patient-note", "");
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return;
    const dialog = modal.current;
    const trigger = opener.current;
    dialog?.showModal();
    input.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void listPatientNotes(patientId, consultationId).then(loaded => {
      if (active) setNotes(loaded);
    }).catch(() => {
      if (active) setLoadError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [open, patientId, consultationId, reload]);

  function loadNotes() {
    setLoading(true);
    setLoadError(false);
    setReload(value => value + 1);
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading || !content.trim()) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const note = await createPatientNote(patientId, content, consultationId);
      setNotes(current => [note, ...current]);
      setContent("");
      setSaved(true);
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No pudimos guardar la nota. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <button ref={opener} type="button" className="consultation-notes-trigger" aria-haspopup="dialog"
      onClick={() => { loadNotes(); setOpen(true); }}>
      <NotebookPen size={17} aria-hidden="true" />Notas
    </button>
    <dialog ref={modal} className="consultation-notes-modal" aria-labelledby={id}
      onCancel={event => { event.preventDefault(); if (!saving) setOpen(false); }}>
      <header>
        <h2 id={id}>Notas de la consulta</h2>
        <button type="button" className="nuth-button-secondary" aria-label="Cerrar notas"
          disabled={saving} onClick={() => setOpen(false)}><X size={19} aria-hidden="true" /></button>
      </header>
      <div className="consultation-notes-body">
        <form onSubmit={saveNote}>
          <label htmlFor={`${id}-content`}>Nueva nota</label>
          <textarea ref={input} id={`${id}-content`} rows={4} maxLength={10000} value={content} readOnly={saving}
            onChange={event => { setContent(event.target.value); setSaved(false); }} />
          <button type="submit" className="nuth-button" disabled={saving || loading || !content.trim()}>
            {saving ? "Guardando…" : "Guardar nota"}
          </button>
          {saved && <p role="status">Nota guardada en el historial del paciente.</p>}
          {error && <p role="alert">{error}</p>}
        </form>
        <section aria-label="Notas guardadas">
          <h3>Notas guardadas</h3>
          {loading && <p role="status">Cargando notas…</p>}
          {loadError && <p role="alert">No pudimos cargar las notas. <button type="button" className="underline" disabled={saving} onClick={loadNotes}>Reintentar</button></p>}
          {!loading && !loadError && notes.length === 0 && <p>Aún no hay notas de esta consulta.</p>}
          {notes.length > 0 && <ul>
            {notes.map(note => <li key={note.id}>
              <time dateTime={note.updated_at}>{formatPatientDate(note.updated_at)}</time>
              <p>{note.content}</p>
            </li>)}
          </ul>}
        </section>
      </div>
    </dialog>
  </>;
}
