import { useState } from "react";

// Memory belongs to the current editing session; no clinical draft is saved while exploring.
const sessions = new Map<string, unknown>();
export const clearProposalSession = () => sessions.clear();
export function useProposalSetting<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (!sessions.has(key)) sessions.set(key, initial);
    return sessions.get(key) as T;
  });
  const change = (next: T) => { sessions.set(key, next); setValue(next); };
  return [value, change] as const;
}
type History<P, D> = { context: string; items: P[]; index: number; open: boolean; undo: D | null };
export function useProposalExplorer<P, D>(key: string, context: string, identify: (p: P) => string) {
  const [state, save] = useProposalSetting<History<P, D>>(key, { context, items: [], index: 0, open: false, undo: null });
  const [message, setMessage] = useState("");
  const valid = state.context === context;
  const items = valid ? state.items : [];
  const proposal = valid && state.open ? items[state.index] ?? null : null;
  return {
    proposal, message: valid ? message : "Las condiciones cambiaron. Genera una nueva propuesta.",
    count: items.length, index: valid ? state.index : 0, canUndo: valid && state.undo !== null,
    generate: (generate: () => P[]) => {
      try {
        const candidates = generate();
        const seen = new Set(items.map(identify));
        const next = candidates.find(p => !seen.has(identify(p)));
        if (!next) { setMessage("No encontramos más opciones adecuadas. Conservamos la propuesta actual."); return; }
        save({ context, items: [...items, next], index: items.length, open: true, undo: valid ? state.undo : null });
        setMessage("");
      } catch (e) { setMessage(e instanceof Error ? e.message : "No pudimos generar la propuesta."); }
    },
    navigate: (direction: number) => save({ ...state, index: Math.max(0, Math.min(items.length - 1, state.index + direction)), open: true }),
    discard: () => save({ ...state, open: false }),
    invalidate: () => save({ context, items: [], index: 0, open: false, undo: null }),
    apply: (draft: D, apply: (p: P) => void) => {
      if (!proposal) return;
      save({ ...state, open: false, undo: structuredClone(draft) });
      apply(proposal);
    },
    undo: (restore: (draft: D) => void) => {
      if (!valid || state.undo === null) return;
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
