import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LoaderCircle, Plus, Save, Search, Settings2, X } from "lucide-react";
import type { Consultation, Patient } from "@/src/types/domain";
import { calculateAge } from "@/src/features/patients/patientUtils";
import { loadConsultationMeasurements, saveConsultationMeasurements, saveMeasurementWorkspace, savePatientMeasurementFollowup, type CatalogMeasurement, type PreviousMeasurement } from "@/src/services/consultationMeasurements";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import { CalculationCatalog } from "@/src/components/consultations/CalculationCatalog";
import { loadCalculationCatalog, saveConsultationCalculationResults } from "@/src/services/consultationCalculations";
import { calculationResultPayload, evaluateCalculationCatalog } from "@/src/features/calculations/engine";
import type { CalculationCatalogItem } from "@/src/features/calculations/catalog";

type RawValues = Record<string, string | boolean>;
const categoryNames: Record<string, string> = { general: "Mediciones registradas", clinical: "Mediciones registradas", bioimpedance: "Bioimpedancia", circumference: "Antropometría", skinfold: "Antropometría", bone_breadth: "Antropometría", anthropometric_length: "Antropometría" };
const subcategoryNames: Record<string, string> = { generales: "Generales", temperatura: "Temperatura", pulso: "Pulso", otros_registrados: "Otros datos conservados", composicion_general: "Composición corporal general", segmental: "Segmental", otros_dispositivo: "Otros datos de dispositivo", pliegues_cutaneos: "Pliegues cutáneos", circunferencias: "Circunferencias", diametros: "Diámetros", longitudes: "Longitudes" };
const categoryGroups = [
  { title: "Mediciones registradas", categories: ["general", "clinical"] },
  { title: "Bioimpedancia", categories: ["bioimpedance"] },
  { title: "Antropometría", categories: ["skinfold", "circumference", "bone_breadth", "anthropometric_length"] },
];
function catalogLabel(measurement: CatalogMeasurement) {
  const category = categoryNames[measurement.category] ?? measurement.category;
  const subcategory = subcategoryNames[measurement.subcategory];
  return subcategory ? `${category} · ${subcategory}` : category;
}
function catalogSectionsForGroup(catalog: CatalogMeasurement[], group: typeof categoryGroups[number]) {
  const sections = new Map<string, CatalogMeasurement[]>();
  for (const measurement of catalog.filter((item) => group.categories.includes(item.category))) {
    const key = measurement.subcategory || "otros";
    sections.set(key, [...(sections.get(key) ?? []), measurement]);
  }
  return [...sections.entries()].map(([subcategory, measurements]) => ({
    title: subcategoryNames[subcategory] ?? subcategory,
    measurements,
  }));
}

function displayValue(value: unknown): string | boolean { return typeof value === "boolean" ? value : String(value ?? ""); }
function toPayloadValue(measurement: CatalogMeasurement, value: string | boolean | undefined): string | number | boolean | undefined {
  if (value === undefined || value === "") return undefined;
  if (measurement.data_type === "boolean") return value === true;
  if (["number", "percentage", "ratio"].includes(measurement.data_type)) { const parsed = Number(String(value).replace(",", ".")); return Number.isFinite(parsed) ? parsed : undefined; }
  return String(value).trim() || undefined;
}
function previousValueLabel(value: PreviousMeasurement, measurement: CatalogMeasurement) {
  const rendered = typeof value.value === "boolean" ? (value.value ? "Sí" : "No") : String(value.value);
  return `${rendered}${measurement.unit ? ` ${measurement.unit}` : ""}`;
}
function MeasurementField({ measurement, value, previous, onChange }: { measurement: CatalogMeasurement; value: string | boolean | undefined; previous?: PreviousMeasurement; onChange: (value: string | boolean) => void }) {
  const id = `measurement-${measurement.code}`;
  const numeric = ["number", "percentage", "ratio"].includes(measurement.data_type);
  return <label htmlFor={id} className="block min-w-0 rounded-2xl border border-[#e1e8e3] bg-white p-3.5">
    <span className="block text-sm font-semibold text-[#173d36]">{measurement.display_name || measurement.name}</span>
    <span className="mt-1 block text-xs leading-5 text-[#718176]">{measurement.description}</span>
    {previous && <span className="mt-2 block text-xs font-medium text-[#52705f]">Anterior: {previousValueLabel(previous, measurement)}</span>}
    <span className="mt-3 flex min-w-0 items-center gap-2">
      {measurement.data_type === "boolean" ? <input id={id} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[#315e4f]" />
        : measurement.data_type === "choice" ? <select id={id} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className="nuth-input min-w-0 flex-1"><option value="">Sin registrar</option>{measurement.choice_options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
          : <input id={id} inputMode={numeric ? "decimal" : "text"} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className="nuth-input min-w-0 flex-1" placeholder="—" aria-describedby={`${id}-unit`} />}
      {measurement.unit && <span id={`${id}-unit`} className="shrink-0 text-sm font-semibold text-[#52705f]">{measurement.unit}</span>}
    </span>
  </label>;
}
function CatalogRow({ measurement, selected, onAdd, onRemove }: { measurement: CatalogMeasurement; selected: boolean; onAdd: () => void; onRemove?: () => void }) {
  return <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-[#e0e8e2] bg-white p-3"><div className="min-w-0"><p className="text-sm font-semibold text-[#173d36]">{measurement.display_name || measurement.name}</p><p className="mt-1 text-xs text-[#718176]">{catalogLabel(measurement)}{measurement.unit ? ` · ${measurement.unit}` : ""}</p></div>{selected ? onRemove ? <button type="button" className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#a45043] hover:bg-[#fbe9e5]" onClick={onRemove}>Quitar del espacio</button> : <span className="shrink-0 px-2.5 py-2 text-xs font-semibold text-[#52705f]">Ya está en tu espacio</span> : <button type="button" className="nuth-button shrink-0 !px-3 !py-2 !text-xs" onClick={onAdd}><Plus size={14} /> Agregar al espacio</button>}</div>;
}

function equationSexLabel(value: Patient["equation_sex"]) {
  if (value === "female") return "Femenino";
  if (value === "male") return "Masculino";
  return "Sin registrar";
}

export function ConsultationMeasurements({ consultation, patient }: { consultation: Consultation; patient: Patient }) {
  const [catalog, setCatalog] = useState<CatalogMeasurement[]>([]);
  const [calculationCatalog, setCalculationCatalog] = useState<CalculationCatalogItem[]>([]);
  const [workspace, setWorkspace] = useState<string[]>([]);
  const [followup, setFollowup] = useState<string[]>([]);
  const [hasFollowup, setHasFollowup] = useState(false);
  const [previousValues, setPreviousValues] = useState<Record<string, PreviousMeasurement>>({});
  const [values, setValues] = useState<RawValues>({});
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftWorkspace, setDraftWorkspace] = useState<string[]>([]);
  const [followupEditorOpen, setFollowupEditorOpen] = useState(false);
  const [draftFollowup, setDraftFollowup] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [savingFollowup, setSavingFollowup] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const [loaded, loadedCalculations] = await Promise.all([loadConsultationMeasurements(consultation), loadCalculationCatalog()]); setCatalog(loaded.catalog.filter((item) => item.category !== "laboratory")); setCalculationCatalog(loadedCalculations); setWorkspace(loaded.workspaceIds); setFollowup(loaded.followupIds); setHasFollowup(loaded.hasFollowup); setPreviousValues(loaded.previousValues); setValues(Object.fromEntries(loaded.values.map((item) => [item.measurement_type_id, displayValue(item.value)]))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cargar las mediciones."); }
    finally { setLoading(false); }
  }, [consultation]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const byId = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = useMemo(() => !normalizedQuery ? [] : catalog.filter((item) => [item.name, item.display_name, item.clinical_name, ...item.synonyms].join(" ").toLocaleLowerCase().includes(normalizedQuery)).slice(0, 12), [catalog, normalizedQuery]);
  const workspaceMeasurements = workspace.map((id) => byId.get(id)).filter((item): item is CatalogMeasurement => Boolean(item));
  const activeMeasurementIds = hasFollowup ? workspace.filter((id) => followup.includes(id)) : workspace;
  const visibleWorkspaceMeasurements = activeMeasurementIds.map((id) => byId.get(id)).filter((item): item is CatalogMeasurement => Boolean(item)).filter((item) => item.code !== "height");
  const age = calculateAge(patient.birth_date, new Date(consultation.consultation_date));
  const calculationEvaluations = useMemo(() => evaluateCalculationCatalog({ catalog: calculationCatalog, measurementCatalog: catalog, values, workspaceIds: workspace, consultation, patient }), [calculationCatalog, catalog, values, workspace, consultation, patient]);
  const setValue = (id: string, value: string | boolean) => { setValues((current) => ({ ...current, [id]: value })); setNotice(""); };
  const persistWorkspace = async (next: string[], closeEditor = false) => {
    setSavingWorkspace(true); setError("");
    try { const saved = await saveMeasurementWorkspace(next); setWorkspace(saved); setDraftWorkspace(saved); if (closeEditor) setEditorOpen(false); setNotice("Espacio de trabajo actualizado."); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar tu espacio de trabajo."); return false; }
    finally { setSavingWorkspace(false); }
  };
  const addToWorkspace = (id: string) => { if (!workspace.includes(id)) void persistWorkspace([...workspace, id]); };
  const saveValues = async () => {
    setSaving(true); setError("");
    try { const payload = Object.fromEntries(catalog.flatMap((measurement) => { const value = toPayloadValue(measurement, values[measurement.id]); return value === undefined ? [] : [[measurement.id, value]]; })); const saved = await saveConsultationMeasurements(consultation, payload); const savedValues = Object.fromEntries(saved.map((item) => [item.measurement_type_id, displayValue(item.value)])); setValues(savedValues); const savedEvaluations = evaluateCalculationCatalog({ catalog: calculationCatalog, measurementCatalog: catalog, values: savedValues, workspaceIds: workspace, consultation, patient, savedMeasurements: saved }); await saveConsultationCalculationResults(consultation.id, calculationResultPayload(savedEvaluations, patient, consultation)); const proposedFollowup = saved.map((item) => item.measurement_type_id).filter((id) => workspace.includes(id)); if (!hasFollowup && proposedFollowup.length) { const savedFollowup = await savePatientMeasurementFollowup(patient.id, proposedFollowup); setFollowup(savedFollowup); setHasFollowup(true); setNotice("Mediciones y cálculos guardados. El seguimiento de este paciente se creó con las mediciones registradas hoy."); } else setNotice(saved.length ? "Mediciones y cálculos guardados." : "No hay mediciones registradas en esta consulta."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar las mediciones."); }
    finally { setSaving(false); }
  };
  const openEditor = () => { setDraftWorkspace(workspace); setEditorOpen(true); };
  const addCalculationMissing = async (ids: string[]) => {
    const added = await persistWorkspace([...new Set([...workspace, ...ids])]);
    if (added) setNotice(hasFollowup ? "Las mediciones se agregaron a tu espacio. Para usarlas habitualmente con este paciente, edita su seguimiento." : "Las mediciones faltantes se agregaron a tu espacio de trabajo.");
  };
  const openFollowupEditor = () => { setDraftFollowup(hasFollowup ? followup : [...workspace]); setFollowupEditorOpen(true); };
  const persistFollowup = async () => {
    setSavingFollowup(true); setError("");
    try { const available = draftFollowup.filter((id) => workspace.includes(id)); const dormant = followup.filter((id) => !workspace.includes(id)); const saved = await savePatientMeasurementFollowup(patient.id, [...available, ...dormant]); setFollowup(saved); setHasFollowup(true); setFollowupEditorOpen(false); setNotice("Seguimiento del paciente actualizado."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar el seguimiento de este paciente."); }
    finally { setSavingFollowup(false); }
  };
  const move = (id: string, direction: -1 | 1) => setDraftWorkspace((current) => { const index = current.indexOf(id); const target = index + direction; if (index < 0 || target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  if (loading) return <LoadingState label="Cargando mediciones…" />;
  if (error && !catalog.length) return <ErrorState message={error} onRetry={() => void load()} />;
  return <section className="min-w-0" aria-label="Mediciones de la consulta">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="nuth-eyebrow">Captura directa</p><h2 className="mt-1 text-2xl font-semibold text-[#173d36]">Mediciones</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#718176]">Registra sólo lo que mediste hoy. Los campos vacíos no crean registros.</p></div><button type="button" className="nuth-button self-start sm:self-auto" disabled={saving} onClick={() => void saveValues()}>{saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />} Guardar mediciones</button></div>
    <div className="mt-5 flex flex-col gap-3 sm:flex-row"><div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#d6e2d9] bg-white px-3"><Search size={17} className="shrink-0 text-[#60766a]" /><input id="measurement-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar una medición…" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" aria-label="Buscar una medición" /></div><button type="button" className="nuth-button-secondary shrink-0" onClick={openFollowupEditor}><Settings2 size={16} /> Editar seguimiento</button><button type="button" className="nuth-button-secondary shrink-0" onClick={openEditor}><Settings2 size={16} /> Editar espacio</button></div>
    {normalizedQuery && <div className="mt-3 space-y-2 rounded-2xl border border-[#dfe5e1] bg-[#f8fbf8] p-3">{results.length ? results.map((item) => <CatalogRow key={item.id} measurement={item} selected={workspace.includes(item.id)} onAdd={() => addToWorkspace(item.id)} />) : <p className="p-2 text-sm text-[#718176]">No encontramos una medición disponible. Los laboratorios se registrarán en su propio módulo.</p>}</div>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-[#eaf3ec] px-4 py-3 text-sm text-[#315e4f]">{notice}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-[#fbe9e5] px-4 py-3 text-sm text-[#963f32]">{error}</p>}
    <section className="mt-6 rounded-2xl border border-[#dfe8e1] bg-[#f8fbf8] p-4" aria-label="Datos del expediente"><h3 className="text-base font-semibold text-[#173d36]">Datos del expediente</h3><p className="mt-1 text-sm leading-6 text-[#718176]">Se cargan automáticamente; no es necesario volver a registrarlos en esta consulta.</p><dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"><div><dt className="text-xs font-semibold text-[#60766a]">Peso inicial</dt><dd className="mt-1 text-sm font-semibold text-[#173d36]">{patient.weight_kg != null ? `${patient.weight_kg} kg` : "Sin registrar"}</dd></div><div><dt className="text-xs font-semibold text-[#60766a]">Estatura</dt><dd className="mt-1 text-sm font-semibold text-[#173d36]">{patient.height_cm != null ? `${patient.height_cm} cm` : "Sin registrar"}</dd></div><div><dt className="text-xs font-semibold text-[#60766a]">Edad en esta consulta</dt><dd className="mt-1 text-sm font-semibold text-[#173d36]">{age != null ? `${age} años` : "Sin registrar"}</dd></div><div><dt className="text-xs font-semibold text-[#60766a]">Sexo para ecuaciones</dt><dd className="mt-1 text-sm font-semibold text-[#173d36]">{equationSexLabel(patient.equation_sex)}</dd></div></dl></section>
    <section className="mt-6"><div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-base font-semibold text-[#173d36]">{hasFollowup ? "Seguimiento de este paciente" : "Espacio de trabajo"}</h3><p className="mt-1 text-sm text-[#718176]">{hasFollowup ? "Estos campos se preparan para este paciente según su seguimiento habitual." : "Aún no hay seguimiento personalizado; se muestran tus mediciones habituales."}</p></div></div>{visibleWorkspaceMeasurements.length ? <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleWorkspaceMeasurements.map((item) => <MeasurementField key={item.id} measurement={item} value={values[item.id]} previous={previousValues[item.id]} onChange={(value) => setValue(item.id, value)} />)}</div> : <p className="mt-3 rounded-xl border border-dashed border-[#cbd9ce] p-4 text-sm text-[#718176]">No hay mediciones activas para este paciente. Edita su seguimiento o agrega una medición al espacio.</p>}</section>
    <CalculationCatalog evaluations={calculationEvaluations} adding={savingWorkspace} onAddMissing={(ids) => void addCalculationMissing(ids)} />
    {editorOpen && <div className="fixed inset-0 z-50 flex items-end bg-[#173d36]/35 p-0 sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Editar espacio de trabajo"><div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:max-w-4xl sm:rounded-[28px] sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="nuth-eyebrow">Configuración habitual</p><h3 className="mt-1 text-xl font-semibold text-[#173d36]">Editar espacio de trabajo</h3><p className="mt-2 text-sm leading-6 text-[#718176]">Esta selección se usa con todos tus pacientes. No modifica valores clínicos ya guardados.</p></div><button type="button" className="rounded-lg p-2 text-[#60766a] hover:bg-[#edf5ef]" aria-label="Cerrar editor" onClick={() => setEditorOpen(false)}><X size={18} /></button></div><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"><section><h4 className="text-sm font-semibold text-[#173d36]">Tus mediciones</h4><div className="mt-3 space-y-2">{draftWorkspace.map((id, index) => { const item = byId.get(id); if (!item) return null; return <div key={id} className="flex items-center gap-2 rounded-xl border border-[#dfe5e1] p-2.5"><span className="min-w-0 flex-1 text-sm font-medium text-[#173d36]">{item.display_name || item.name}</span><button type="button" aria-label={`Subir ${item.display_name}`} disabled={index === 0} onClick={() => move(id, -1)} className="rounded-lg p-1.5 hover:bg-[#edf5ef] disabled:opacity-30"><ArrowUp size={15} /></button><button type="button" aria-label={`Bajar ${item.display_name}`} disabled={index === draftWorkspace.length - 1} onClick={() => move(id, 1)} className="rounded-lg p-1.5 hover:bg-[#edf5ef] disabled:opacity-30"><ArrowDown size={15} /></button><button type="button" aria-label={`Quitar ${item.display_name}`} onClick={() => setDraftWorkspace((current) => current.filter((value) => value !== id))} className="rounded-lg p-1.5 text-[#a45043] hover:bg-[#fbe9e5]"><X size={15} /></button></div>; })}{!draftWorkspace.length && <p className="rounded-xl bg-[#f8fbf8] p-3 text-sm text-[#718176]">Agrega mediciones desde el catálogo.</p>}</div></section><section><h4 className="text-sm font-semibold text-[#173d36]">Catálogo disponible</h4><div className="mt-3 space-y-4">{categoryGroups.map((group) => <div key={group.title}><p className="text-xs font-bold uppercase tracking-wide text-[#52705f]">{group.title}</p>{catalogSectionsForGroup(catalog, group).map((section) => <div key={section.title} className="mt-3"><p className="text-xs font-semibold text-[#60766a]">{section.title}</p><div className="mt-2 space-y-2">{section.measurements.map((item) => <CatalogRow key={item.id} measurement={item} selected={draftWorkspace.includes(item.id)} onAdd={() => setDraftWorkspace((current) => [...current, item.id])} onRemove={() => setDraftWorkspace((current) => current.filter((id) => id !== item.id))} />)}</div></div>)}</div>)}</div></section></div><div className="mt-7 flex justify-end gap-3 border-t border-[#e5ece7] pt-5"><button type="button" className="nuth-button-secondary" disabled={savingWorkspace} onClick={() => setEditorOpen(false)}>Cancelar</button><button type="button" className="nuth-button" disabled={savingWorkspace} onClick={() => void persistWorkspace(draftWorkspace, true)}>{savingWorkspace && <LoaderCircle className="animate-spin" size={16} />} Guardar cambios</button></div></div></div>}
    {followupEditorOpen && <div className="fixed inset-0 z-50 flex items-end bg-[#173d36]/35 p-0 sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Editar seguimiento del paciente"><div className="w-full rounded-t-[28px] bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-[28px] sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="nuth-eyebrow">Configuración del paciente</p><h3 className="mt-1 text-xl font-semibold text-[#173d36]">Editar seguimiento</h3><p className="mt-2 text-sm leading-6 text-[#718176]">Elige qué mediciones de tu espacio habitual deseas seguir con {patient.full_name}. El orden seguirá tu espacio de trabajo.</p></div><button type="button" className="rounded-lg p-2 text-[#60766a] hover:bg-[#edf5ef]" aria-label="Cerrar seguimiento" onClick={() => setFollowupEditorOpen(false)}><X size={18} /></button></div><fieldset className="mt-6 space-y-2"><legend className="text-sm font-semibold text-[#173d36]">Mediciones disponibles</legend>{workspaceMeasurements.length ? workspaceMeasurements.map((item) => <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#dfe5e1] p-3"><input type="checkbox" checked={draftFollowup.includes(item.id)} onChange={(event) => setDraftFollowup((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} className="h-4 w-4 accent-[#315e4f]" /><span className="min-w-0 flex-1 text-sm font-medium text-[#173d36]">{item.display_name || item.name}</span>{item.unit && <span className="text-xs font-semibold text-[#52705f]">{item.unit}</span>}</label>) : <p className="rounded-xl bg-[#f8fbf8] p-3 text-sm text-[#718176]">Primero agrega mediciones a tu espacio de trabajo.</p>}</fieldset><div className="mt-7 flex justify-end gap-3 border-t border-[#e5ece7] pt-5"><button type="button" className="nuth-button-secondary" disabled={savingFollowup} onClick={() => setFollowupEditorOpen(false)}>Cancelar</button><button type="button" className="nuth-button" disabled={savingFollowup} onClick={() => void persistFollowup()}>{savingFollowup && <LoaderCircle className="animate-spin" size={16} />} Guardar seguimiento</button></div></div></div>}
  </section>;
}
