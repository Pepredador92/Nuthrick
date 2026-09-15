import { useState } from "react";

// Memory belongs to the current editing session; no clinical draft is saved while exploring.
const sessions = new Map<string, unknown>();
export const clearProposalSession = () => sessions.clear();
export function useProposalSetting<T>(key: string, initial: T) {
  const [stored, setValue] = useState<{ key: string; value: T }>(() => {
    if (!sessions.has(key)) sessions.set(key, initial);
    return { key, value: sessions.get(key) as T };
  });
  const value = stored.key === key ? stored.value : (sessions.has(key) ? sessions.get(key) as T : initial);
  const change = (next: T) => { sessions.set(key, next); setValue({ key, value: next }); };
  return [value, change] as const;
}
type History<P, D> = { context: string; items: P[]; seen: string[]; index: number; open: boolean; undo: D | null; editUndo: P | null };
export function useProposalExplorer<P, D>(key: string, context: string, identify: (p: P) => string) {
  const [state, save] = useProposalSetting<History<P, D>>(key, { context, items: [], seen: [], index: 0, open: false, undo: null, editUndo: null });
  const [message, setMessage] = useState("");
  const valid = state.context === context;
  const items = valid ? state.items : [];
  const proposal = valid && state.open ? items[state.index] ?? null : null;
  return {
    proposal, message: valid || state.items.length === 0 ? message : "Las condiciones cambiaron. Genera una nueva propuesta.",
    count: items.length, index: valid ? state.index : 0, canUndo: valid && state.undo !== null,
    canUndoEdit: Boolean(proposal && state.editUndo),
    undoEdit: (restore?: (next: P) => void) => { if (proposal && state.editUndo) { restore?.(state.editUndo); save({ ...state, items: items.map((item, index) => index === state.index ? state.editUndo! : item), editUndo: null }); } },
    edit: (next: P) => { if (proposal) save({ ...state, seen: [...new Set([...state.seen, identify(proposal), identify(next)])], editUndo: structuredClone(proposal), items: items.map((item, index) => index === state.index ? next : item) }); },
    restart: (next: P) => save({ context, items: [next], seen: [...new Set([...(valid ? state.seen : []), identify(next)])], index: 0, open: true, undo: valid ? state.undo : null, editUndo: null }),
    generate: (generate: () => P[]) => {
      try {
        const candidates = generate();
        const seen = new Set(valid ? [...state.seen, ...items.map(identify)] : []);
        const next = candidates.find(p => !seen.has(identify(p)));
        if (!next) { setMessage("No encontré otra alternativa adecuada con estas condiciones. Revisa los rechazos o los elementos fijados."); return; }
        save({ context, items: [...items, next], seen: [...seen, identify(next)], index: items.length, open: true, undo: valid ? state.undo : null, editUndo: null });
        setMessage("");
      } catch (e) { setMessage(e instanceof Error ? e.message : "No pudimos generar la propuesta."); }
    },
    navigate: (direction: number) => { if (valid) save({ ...state, index: Math.max(0, Math.min(items.length - 1, state.index + direction)), open: true, editUndo: null }); },
    discard: () => { setMessage(""); save({ ...state, open: false }); },
    invalidate: () => { setMessage(""); save({ context, items: [], seen: [], index: 0, open: false, undo: null, editUndo: null }); },
    apply: (draft: D, apply: (p: P) => void) => {
      if (!proposal) return;
      setMessage("");
      save({ ...state, open: false, undo: structuredClone(draft) });
      apply(proposal);
    },
    undo: (restore: (draft: D) => void) => {
      if (!valid || state.undo === null) return;
      setMessage("");
      restore(structuredClone(state.undo));
      save({ ...state, open: false, undo: null });
    },
  };
}

export function ProposalNavigation({ count, index, onNavigate }: { count: number; index: number; onNavigate: (direction: number) => void }) {
  if (!count) return null;
  return <div className="my-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#315e4f]">
    <button type="button" aria-label="Propuesta anterior" disabled={index === 0} className="rounded-lg border px-2 py-2 disabled:opacity-30" onClick={() => onNavigate(-1)}>Anterior</button>
    <span role="status">Propuesta {index + 1} de {count}</span>
    <button type="button" aria-label="Propuesta siguiente" disabled={index >= count - 1} className="rounded-lg border px-2 py-2 disabled:opacity-30" onClick={() => onNavigate(1)}>Siguiente</button>
  </div>;
}
