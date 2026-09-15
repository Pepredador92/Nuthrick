import { useEffect, useState } from "react";
import { libraryPreview, libraryReady } from "@/src/features/diet-library/model";
import { libraryContributionAccess, listLibraryContributions, reviewLibraryContribution, withdrawLibraryContribution, type LibraryContribution } from "@/src/services/dietLibrary";
import { PatientPlanPreview } from "./PatientPlanPreview";

const labels = { pending: "En revisión", approved: "Publicada", rejected: "Requiere ajustes", withdrawn: "Retirada" };
export function LibraryContributions() {
  const [rows, setRows] = useState<LibraryContribution[]>([]);
  const [reviewer, setReviewer] = useState(false);
  const [selected, setSelected] = useState<LibraryContribution | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const refresh = async () => {
    const [items, access] = await Promise.all([listLibraryContributions(), libraryContributionAccess()]);
    setRows(items); setReviewer(access);
  };
  useEffect(() => { let active = true;
    Promise.all([listLibraryContributions(), libraryContributionAccess()]).then(([items, access]) => {
      if (active) { setRows(items); setReviewer(access); }
    }).catch(() => { if (active) setError("No pudimos cargar las aportaciones."); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); setSelected(null); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "No pudimos completar la revisión."); }
    finally { setBusy(false); }
  };
  return <section className="mt-4 space-y-4 min-w-0" aria-label="Aportaciones a Nuthrick">
    <p className="text-sm">{reviewer ? "Cola de revisión de Nuthrick" : "Mis aportaciones"} · Se comparte una copia, nunca tu original ni el expediente.</p>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {busy && <p role="status">Cargando…</p>}
    {!selected ? <div className="grid gap-3 sm:grid-cols-2">{rows.map(row => <button key={row.id} disabled={busy} className="rounded-xl border bg-white p-4 text-left min-w-0" onClick={() => { setSelected(row); setReviewed(false); setNote(""); }}>
      <span className="text-xs text-[#64786d]">{labels[row.status]}</span><span className="block font-semibold break-words">{row.name}</span>
      <span className="text-xs">Revisión {row.source_revision}</span>
    </button>)}{!rows.length && !busy && <p className="text-sm">Todavía no hay aportaciones. Abre una base personal y elige «Aportar a Nuthrick».</p>}</div> : <div className="space-y-4">
      <button className="nuth-button-secondary" disabled={busy} onClick={() => setSelected(null)}>Volver a aportaciones</button>
      <h3 className="font-semibold">{selected.name} · {labels[selected.status]}</h3>
      {selected.review_note && <p className="rounded-xl bg-amber-50 p-3 text-sm whitespace-pre-wrap">{selected.review_note}</p>}
      <PatientPlanPreview value={libraryPreview(selected)} />
      {selected.status === "pending" && (reviewer ? <div className="space-y-3 rounded-xl border bg-white p-4">
        {!libraryReady(selected.content) && <p className="text-sm text-amber-900">Hay datos sin verificar. Devuelve la base para completar su revisión antes de publicarla.</p>}
        <label className="block text-sm">Observaciones para quien aporta<textarea className="nuth-input mt-1" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />Revisé privacidad, derechos de uso, alimentos, cantidades y coherencia de los aportes. La publicación no certifica que sea apropiada para todos los pacientes.</label>
        <div className="flex flex-wrap gap-2">
          <button className="nuth-button" disabled={busy || !reviewed || !libraryReady(selected.content)} onClick={() => void run(async () => { await reviewLibraryContribution(selected.id, true, note, reviewed); })}>Aprobar y publicar copia</button>
          <button className="nuth-button-secondary" disabled={busy || !reviewed || !note.trim()} onClick={() => void run(async () => { await reviewLibraryContribution(selected.id, false, note, reviewed); })}>Devolver con observaciones</button>
        </div>
      </div> : <button className="nuth-button-secondary" disabled={busy} onClick={() => void run(() => withdrawLibraryContribution(selected.id))}>Retirar aportación pendiente</button>)}
      {selected.status === "rejected" && <p className="text-sm">Edita tu base personal y guarda los ajustes. Después podrás enviar esa nueva revisión.</p>}
    </div>}
  </section>;
}
