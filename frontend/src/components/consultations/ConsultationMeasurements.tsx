import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LoaderCircle, Plus, Save, Search, Settings2, X } from "lucide-react";
import type { Consultation } from "@/src/types/domain";
import { loadConsultationMeasurements, saveConsultationMeasurements, saveMeasurementWorkspace, type CatalogMeasurement } from "@/src/services/consultationMeasurements";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";

type RawValues = Record<string, string | boolean>;
const categoryNames: Record<string, string> = { general: "Mediciones generales", circumference: "Circunferencias", skinfold: "Pliegues cutáneos", bone_breadth: "Diámetros y anchos óseos", anthropometric_length: "Longitudes y alturas", bioimpedance: "Bioimpedancia", clinical: "Signos y mediciones clínicas" };
const categoryGroups = [
  { title: "Antropometría", categories: ["general", "circumference", "skinfold", "bone_breadth", "anthropometric_length"] },
  { title: "Composición corporal", categories: ["bioimpedance"] },
  { title: "Clínica", categories: ["clinical"] },
];

function displayValue(value: unknown): string | boolean { return typeof value === "boolean" ? value : String(value ?? ""); }
function toPayloadValue(measurement: CatalogMeasurement, value: string | boolean | undefined): string | number | boolean | undefined {
  if (value === undefined || value === "") return undefined;
  if (measurement.data_type === "boolean") return value === true;
  if (["number", "percentage", "ratio"].includes(measurement.data_type)) { const parsed = Number(String(value).replace(",", ".")); return Number.isFinite(parsed) ? parsed : undefined; }
  return String(value).trim() || undefined;
}
function MeasurementField({ measurement, value, onChange }: { measurement: CatalogMeasurement; value: string | boolean | undefined; onChange: (value: string | boolean) => void }) {
  const id = `measurement-${measurement.code}`;
  const numeric = ["number", "percentage", "ratio"].includes(measurement.data_type);
  return <label htmlFor={id} className="block min-w-0 rounded-2xl border border-[#e1e8e3] bg-white p-3.5">
    <span className="block text-sm font-semibold text-[#173d36]">{measurement.display_name || measurement.name}</span>
    <span className="mt-1 block text-xs leading-5 text-[#718176]">{measurement.description}</span>
    <span className="mt-3 flex min-w-0 items-center gap-2">
      {measurement.data_type === "boolean" ? <input id={id} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[#315e4f]" />
        : measurement.data_type === "choice" ? <select id={id} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className="nuth-input min-w-0 flex-1"><option value="">Sin registrar</option>{measurement.choice_options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
          : <input id={id} inputMode={numeric ? "decimal" : "text"} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className="nuth-input min-w-0 flex-1" placeholder="—" aria-describedby={`${id}-unit`} />}
      {measurement.unit && <span id={`${id}-unit`} className="shrink-0 text-sm font-semibold text-[#52705f]">{measurement.unit}</span>}
    </span>
  </label>;
}
function CatalogRow({ measurement, selected, onAdd, onRemove }: { measurement: CatalogMeasurement; selected: boolean; onAdd: () => void; onRemove?: () => void }) {
  return <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-[#e0e8e2] bg-white p-3"><div className="min-w-0"><p className="text-sm font-semibold text-[#173d36]">{measurement.display_name || measurement.name}</p><p className="mt-1 text-xs text-[#718176]">{categoryNames[measurement.category]}{measurement.unit ? ` · ${measurement.unit}` : ""}</p></div>{selected ? onRemove ? <button type="button" className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#a45043] hover:bg-[#fbe9e5]" onClick={onRemove}>Quitar del espacio</button> : <span className="shrink-0 px-2.5 py-2 text-xs font-semibold text-[#52705f]">Ya está en tu espacio</span> : <button type="button" className="nuth-button shrink-0 !px-3 !py-2 !text-xs" onClick={onAdd}><Plus size={14} /> Agregar al espacio</button>}</div>;
}

export function ConsultationMeasurements({ consultation }: { consultation: Consultation }) {
  const [catalog, setCatalog] = useState<CatalogMeasurement[]>([]);
  const [workspace, setWorkspace] = useState<string[]>([]);
  const [values, setValues] = useState<RawValues>({});
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftWorkspace, setDraftWorkspace] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const loaded = await loadConsultationMeasurements(consultation.id); setCatalog(loaded.catalog.filter((item) => item.category !== "laboratory")); setWorkspace(loaded.workspaceIds); setValues(Object.fromEntries(loaded.values.map((item) => [item.measurement_type_id, displayValue(item.value)]))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cargar las mediciones."); }
    finally { setLoading(false); }
  }, [consultation.id]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const byId = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = useMemo(() => !normalizedQuery ? [] : catalog.filter((item) => [item.name, item.display_name, item.clinical_name, ...item.synonyms].join(" ").toLocaleLowerCase().includes(normalizedQuery)).slice(0, 12), [catalog, normalizedQuery]);
  const workspaceMeasurements = workspace.map((id) => byId.get(id)).filter((item): item is CatalogMeasurement => Boolean(item));
  const setValue = (id: string, value: string | boolean) => { setValues((current) => ({ ...current, [id]: value })); setNotice(""); };
  const persistWorkspace = async (next: string[], closeEditor = false) => {
    setSavingWorkspace(true); setError("");
    try { const saved = await saveMeasurementWorkspace(next); setWorkspace(saved); setDraftWorkspace(saved); if (closeEditor) setEditorOpen(false); setNotice("Espacio de trabajo actualizado."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar tu espacio de trabajo."); }
    finally { setSavingWorkspace(false); }
  };
  const addToWorkspace = (id: string) => { if (!workspace.includes(id)) void persistWorkspace([...workspace, id]); };
  const saveValues = async () => {
    setSaving(true); setError("");
    try { const payload = Object.fromEntries(catalog.flatMap((measurement) => { const value = toPayloadValue(measurement, values[measurement.id]); return value === undefined ? [] : [[measurement.id, value]]; })); const saved = await saveConsultationMeasurements(consultation, payload); setValues(Object.fromEntries(saved.map((item) => [item.measurement_type_id, displayValue(item.value)]))); setNotice(saved.length ? "Mediciones guardadas." : "No hay mediciones registradas en esta consulta."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar las mediciones."); }
    finally { setSaving(false); }
  };
  const openEditor = () => { setDraftWorkspace(workspace); setEditorOpen(true); };
  const move = (id: string, direction: -1 | 1) => setDraftWorkspace((current) => { const index = current.indexOf(id); const target = index + direction; if (index < 0 || target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  if (loading) return <LoadingState label="Cargando mediciones…" />;
  if (error && !catalog.length) return <ErrorState message={error} onRetry={() => void load()} />;
  return <section className="min-w-0" aria-label="Mediciones de la consulta">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="nuth-eyebrow">Captura directa</p><h2 className="mt-1 text-2xl font-semibold text-[#173d36]">Mediciones</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#718176]">Registra sólo lo que mediste hoy. Los campos vacíos no crean registros.</p></div><button type="button" className="nuth-button self-start sm:self-auto" disabled={saving} onClick={() => void saveValues()}>{saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />} Guardar mediciones</button></div>
    <div className="mt-5 flex flex-col gap-3 sm:flex-row"><div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#d6e2d9] bg-white px-3"><Search size={17} className="shrink-0 text-[#60766a]" /><input id="measurement-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar una medición…" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" aria-label="Buscar una medición" /></div><button type="button" className="nuth-button-secondary shrink-0" onClick={openEditor}><Settings2 size={16} /> Editar espacio</button></div>
    {normalizedQuery && <div className="mt-3 space-y-2 rounded-2xl border border-[#dfe5e1] bg-[#f8fbf8] p-3">{results.length ? results.map((item) => <CatalogRow key={item.id} measurement={item} selected={workspace.includes(item.id)} onAdd={() => addToWorkspace(item.id)} />) : <p className="p-2 text-sm text-[#718176]">No encontramos una medición disponible. Los laboratorios se registrarán en su propio módulo.</p>}</div>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-[#eaf3ec] px-4 py-3 text-sm text-[#315e4f]">{notice}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-[#fbe9e5] px-4 py-3 text-sm text-[#963f32]">{error}</p>}
    <section className="mt-6"><h3 className="text-base font-semibold text-[#173d36]">Espacio de trabajo</h3>{workspaceMeasurements.length ? <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{workspaceMeasurements.map((item) => <MeasurementField key={item.id} measurement={item} value={values[item.id]} onChange={(value) => setValue(item.id, value)} />)}</div> : <p className="mt-3 rounded-xl border border-dashed border-[#cbd9ce] p-4 text-sm text-[#718176]">Tu espacio está vacío. Busca una medición para agregarla.</p>}</section>
    {editorOpen && <div className="fixed inset-0 z-50 flex items-end bg-[#173d36]/35 p-0 sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Editar espacio de trabajo"><div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:max-w-4xl sm:rounded-[28px] sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="nuth-eyebrow">Configuración habitual</p><h3 className="mt-1 text-xl font-semibold text-[#173d36]">Editar espacio de trabajo</h3><p className="mt-2 text-sm leading-6 text-[#718176]">Esta selección se usa con todos tus pacientes. No modifica valores clínicos ya guardados.</p></div><button type="button" className="rounded-lg p-2 text-[#60766a] hover:bg-[#edf5ef]" aria-label="Cerrar editor" onClick={() => setEditorOpen(false)}><X size={18} /></button></div><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"><section><h4 className="text-sm font-semibold text-[#173d36]">Tus mediciones</h4><div className="mt-3 space-y-2">{draftWorkspace.map((id, index) => { const item = byId.get(id); if (!item) return null; return <div key={id} className="flex items-center gap-2 rounded-xl border border-[#dfe5e1] p-2.5"><span className="min-w-0 flex-1 text-sm font-medium text-[#173d36]">{item.display_name || item.name}</span><button type="button" aria-label={`Subir ${item.display_name}`} disabled={index === 0} onClick={() => move(id, -1)} className="rounded-lg p-1.5 hover:bg-[#edf5ef] disabled:opacity-30"><ArrowUp size={15} /></button><button type="button" aria-label={`Bajar ${item.display_name}`} disabled={index === draftWorkspace.length - 1} onClick={() => move(id, 1)} className="rounded-lg p-1.5 hover:bg-[#edf5ef] disabled:opacity-30"><ArrowDown size={15} /></button><button type="button" aria-label={`Quitar ${item.display_name}`} onClick={() => setDraftWorkspace((current) => current.filter((value) => value !== id))} className="rounded-lg p-1.5 text-[#a45043] hover:bg-[#fbe9e5]"><X size={15} /></button></div>; })}{!draftWorkspace.length && <p className="rounded-xl bg-[#f8fbf8] p-3 text-sm text-[#718176]">Agrega mediciones desde el catálogo.</p>}</div></section><section><h4 className="text-sm font-semibold text-[#173d36]">Catálogo disponible</h4><div className="mt-3 space-y-4">{categoryGroups.map((group) => <div key={group.title}><p className="text-xs font-bold uppercase tracking-wide text-[#52705f]">{group.title}</p><div className="mt-2 space-y-2">{catalog.filter((item) => group.categories.includes(item.category)).map((item) => <CatalogRow key={item.id} measurement={item} selected={draftWorkspace.includes(item.id)} onAdd={() => setDraftWorkspace((current) => [...current, item.id])} onRemove={() => setDraftWorkspace((current) => current.filter((id) => id !== item.id))} />)}</div></div>)}</div></section></div><div className="mt-7 flex justify-end gap-3 border-t border-[#e5ece7] pt-5"><button type="button" className="nuth-button-secondary" disabled={savingWorkspace} onClick={() => setEditorOpen(false)}>Cancelar</button><button type="button" className="nuth-button" disabled={savingWorkspace} onClick={() => void persistWorkspace(draftWorkspace, true)}>{savingWorkspace && <LoaderCircle className="animate-spin" size={16} />} Guardar cambios</button></div></div></div>}
  </section>;
}
