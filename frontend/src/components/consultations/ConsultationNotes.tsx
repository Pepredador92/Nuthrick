import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { NotebookPen, X } from "lucide-react";
import { formatPatientDate } from "@/src/features/patients/patientUtils";
import { createPatientNote, deletePatientNote, listPatientNotes, updatePatientNote } from "@/src/services/patients";
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
  const [edit, setEdit] = useConsultationDraft<{ id: string; content: string } | null>("patient-note-edit", null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const pending = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
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

  const noteText = edit?.content ?? content;

  async function mutateNote(action: () => Promise<void>, message: string) {
    if (pending.current || loading) return;
    pending.current = true;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      await action();
      setStatus(message);
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No pudimos actualizar la nota. Intenta de nuevo.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!noteText.trim() || removeId) return;
    void mutateNote(async () => {
      const note = edit
        ? await updatePatientNote(edit.id, noteText)
        : await createPatientNote(patientId, noteText, consultationId);
      setNotes(current => [note, ...current.filter(item => item.id !== note.id)]);
      if (edit) setEdit(null);
      else setContent("");
    }, edit ? "Nota actualizada en el historial del paciente." : "Nota guardada en el historial del paciente.");
  }

  function removeNote(note: PatientNote) {
    void mutateNote(async () => {
      await deletePatientNote(note.id);
      setNotes(current => current.filter(item => item.id !== note.id));
      if (edit?.id === note.id) setEdit(null);
      setRemoveId(null);
    }, "Nota eliminada del historial del paciente.");
  }

  return <>
    <button ref={opener} type="button" className="consultation-notes-trigger" aria-haspopup="dialog"
      onClick={() => { loadNotes(); setRemoveId(null); setError(""); setOpen(true); }}>
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
          <label htmlFor={`${id}-content`}>{edit ? "Editar nota" : "Nueva nota"}</label>
          <textarea ref={input} id={`${id}-content`} rows={4} maxLength={10000} value={noteText} readOnly={saving}
            onChange={event => {
              if (edit) setEdit({ ...edit, content: event.target.value });
              else setContent(event.target.value);
              setStatus("");
            }} />
          <div className="consultation-note-actions">
            <button type="submit" className="nuth-button" disabled={saving || loading || !!removeId || !noteText.trim()}>
              {saving && !removeId ? "Guardando…" : edit ? "Guardar cambios" : "Guardar nota"}
            </button>
            {edit && <button type="button" className="nuth-button-secondary" disabled={saving} onClick={() => { setEdit(null); setError(""); }}>Cancelar edición</button>}
          </div>
          {status && <p role="status">{status}</p>}
          {error && <p role="alert">{error}</p>}
        </form>
        <section aria-label="Notas guardadas">
          <h3>Notas guardadas</h3>
          {loading && <p role="status">Cargando notas…</p>}
          {loadError && <p role="alert">No pudimos cargar las notas. <button type="button" className="underline" disabled={saving} onClick={loadNotes}>Reintentar</button></p>}
          {!loading && !loadError && notes.length === 0 && <p>Aún no hay notas de esta consulta.</p>}
          {notes.length > 0 && <ul>
            {notes.map((note, index) => <li key={note.id}>
              <time dateTime={note.updated_at}>{formatPatientDate(note.updated_at)}</time>
              <p>{note.content}</p>
              {removeId === note.id ? <fieldset>
                <legend>¿Eliminar esta nota del historial del paciente?</legend>
                <div className="consultation-note-actions">
                  <button type="button" className="nuth-button-secondary" disabled={saving} onClick={() => setRemoveId(null)}>Cancelar</button>
                  <button type="button" className="nuth-button-secondary consultation-note-remove" disabled={saving} onClick={() => removeNote(note)}>{saving ? "Eliminando…" : "Confirmar eliminación"}</button>
                </div>
              </fieldset> : <div className="consultation-note-actions">
                <button type="button" className="nuth-button-secondary" aria-label={`Editar nota ${index + 1}`}
                  disabled={saving || loading || !!removeId} onClick={() => {
                    setEdit({ id: note.id, content: note.content }); setError(""); setStatus(""); input.current?.focus();
                  }}>Editar</button>
                <button type="button" className="nuth-button-secondary" aria-label={`Eliminar nota ${index + 1}`}
                  disabled={saving || loading || !!removeId} onClick={() => { setRemoveId(note.id); setError(""); setStatus(""); }}>Eliminar</button>
              </div>}
            </li>)}
          </ul>}
        </section>
      </div>
    </dialog>
  </>;
}
