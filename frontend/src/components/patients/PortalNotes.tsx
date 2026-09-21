import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Trash2, LockKeyhole } from "lucide-react";
import { portalAction, type PortalNote } from "@/src/services/patientPortal";

export function PortalNotes({ session }: { session: string }) {
  const [notes, setNotes] = useState<PortalNote[]>([]);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<PortalNote | null>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const pendingNoteId = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    void portalAction<{ notes: PortalNote[] }>({ session }, "notes")
      .then((r) => {
        if (active) setNotes(r.notes);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session]);
  async function act(action: string, data: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await portalAction({ session }, action, data);
      const result = await portalAction<{ notes: PortalNote[] }>(
        { session },
        "notes",
      );
      setNotes(result.notes);
      setRemove(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function saveNote() {
    const id = editing?.id || pendingNoteId.current || crypto.randomUUID();
    pendingNoteId.current = id;
    if (await act("note", { id, body: draft, done: editing?.done || false })) {
      setDraft("");
      setEditing(null);
      pendingNoteId.current = null;
    }
  }
  return (
    <section className="portal-card">
      <h2 className="text-xl font-semibold">Para mi próxima consulta</h2>
      <p className="mt-2 flex items-center gap-2 text-sm text-[#74817d]">
        <LockKeyhole size={15} />
        Solo tú puedes ver estas notas.
      </p>
      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void saveNote();
        }}
      >
        <label htmlFor="portal-note" className="sr-only">
          Mi nota
        </label>
        <textarea
          id="portal-note"
          className="nuth-input min-h-28"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
          maxLength={2000}
          placeholder="¿Qué quiero preguntar o recordar?"
        />
        <div className="mt-3 flex gap-3">
          <button className="nuth-button" disabled={busy || !draft.trim()}>
            {editing ? "Guardar cambios" : "Guardar nota"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setDraft("");
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="mt-5">
          Cargando notas…
        </p>
      )}
      {!loading && !notes.length && (
        <p className="mt-8 text-sm text-[#74817d]">
          Anota tus dudas cuando surjan. Aquí las tendrás a mano.
        </p>
      )}
      <ul className="mt-6 space-y-3">
        {notes.map((note) => (
          <li
            key={note.id}
            className="rounded-2xl border border-[#e2e8de] bg-[#fffdf6] p-4"
          >
            <p
              className={`whitespace-pre-wrap break-words ${note.done ? "text-[#74817d] line-through" : ""}`}
            >
              {note.body}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <button
                disabled={busy}
                className="portal-note-action"
                onClick={() => void act("note", { ...note, done: !note.done })}
              >
                <Check size={15} />
                {note.done ? "Volver a pendiente" : "Ya lo pregunté"}
              </button>
              <button
                disabled={busy}
                className="portal-note-action"
                onClick={() => {
                  setEditing(note);
                  setDraft(note.body);
                }}
              >
                <Pencil size={15} />
                Editar
              </button>
              <button
                disabled={busy}
                className="portal-note-action"
                onClick={() => setRemove(note.id)}
              >
                <Trash2 size={15} />
                Eliminar
              </button>
            </div>
            {remove === note.id && (
              <div className="mt-3 rounded-xl bg-white p-3" role="alert">
                <p className="text-sm">
                  ¿Eliminar esta nota? No podrás recuperarla.
                </p>
                <div className="mt-2 flex gap-4 text-sm">
                  <button
                    disabled={busy}
                    onClick={() => void act("delete_note", { id: note.id })}
                  >
                    Sí, eliminar
                  </button>
                  <button onClick={() => setRemove(null)}>Conservar</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
