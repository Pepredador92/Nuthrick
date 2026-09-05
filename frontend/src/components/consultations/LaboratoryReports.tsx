import { useCallback, useEffect, useMemo, useState } from "react";
import { Beaker, LoaderCircle, Plus, Save, Search, Trash2, X } from "lucide-react";
import type { Consultation } from "@/src/types/domain";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import {
  compareReportedRange,
  deleteLaboratoryReport,
  loadLaboratoryData,
  newLaboratoryReportDraft,
  newLaboratoryResultDraft,
  saveLaboratoryReport,
  searchLaboratoryCatalog,
  type LaboratoryCatalogItem,
  type LaboratoryRangeComparison,
  type LaboratoryReportDraft,
  type LaboratoryResultDraft,
} from "@/src/services/laboratories";

type Props = { consultation: Consultation };
type LoadedLaboratories = Awaited<ReturnType<typeof loadLaboratoryData>>;

const comparisonLabel: Record<LaboratoryRangeComparison, string> = {
  in_range: "Dentro del intervalo reportado",
  below: "Por debajo del intervalo reportado",
  above: "Por encima del intervalo reportado",
  not_comparable: "Sin comparación automática",
};

function reportDrafts(data: LoadedLaboratories): LaboratoryReportDraft[] {
  return data.reports.map((report) => ({
    ...report,
    local_id: report.id,
    results: data.results.filter((result) => result.report_id === report.id).map((result) => ({ ...result, local_id: result.id })),
    persisted_result_ids: data.results.filter((result) => result.report_id === report.id).map((result) => result.id),
  }));
}

function ResultEditor({ result, catalogItem, disabled, onChange, onRemove }: {
  result: LaboratoryResultDraft;
  catalogItem?: LaboratoryCatalogItem;
  disabled: boolean;
  onChange: (patch: Partial<LaboratoryResultDraft>) => void;
  onRemove: () => void;
}) {
  const comparison = compareReportedRange(result);
  const isNumeric = result.result_kind === "numeric";
  const choices = catalogItem?.choice_options ?? [];
  const inputClass = "mt-1 w-full rounded-lg border border-[#d7e1dc] bg-white px-3 py-2 text-sm text-[#173d36] outline-none focus:border-[#3d705d] disabled:bg-[#f3f5f4]";
  return (
    <article className="min-w-0 rounded-xl border border-[#dfe5e1] bg-white p-3 sm:p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          {result.custom ? (
            <label className="block text-sm font-semibold text-[#173d36]">
              Nombre del resultado personalizado
              <input className={inputClass} value={result.custom.name} disabled={disabled} placeholder="Ej. Anticuerpos específicos" onChange={(event) => onChange({ custom: { ...result.custom!, name: event.target.value }, analyte_name_snapshot: event.target.value || "Resultado personalizado" })} />
            </label>
          ) : (
            <>
              <p className="truncate text-sm font-semibold text-[#173d36]">{result.analyte_name_snapshot}</p>
              {result.analyte_clinical_name_snapshot && result.analyte_clinical_name_snapshot !== result.analyte_name_snapshot && <p className="mt-0.5 text-xs text-[#74817d]">{result.analyte_clinical_name_snapshot}</p>}
            </>
          )}
        </div>
        <button type="button" aria-label={`Quitar ${result.analyte_name_snapshot}`} disabled={disabled} onClick={onRemove} className="rounded-lg p-2 text-[#9b493a] hover:bg-[#fbe9e5] disabled:opacity-50"><Trash2 size={16} /></button>
      </div>
      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold text-[#53635d]">Tipo de resultado
          <select className={inputClass} disabled={disabled} value={result.result_kind ?? "text"} onChange={(event) => onChange({ result_kind: event.target.value as LaboratoryResultDraft["result_kind"], numeric_value: null, text_value: null, numeric_comparator: null })}>
            <option value="numeric">Numérico</option><option value="qualitative">Cualitativo</option><option value="ordinal">Semicuantitativo</option><option value="text">Texto</option>
          </select>
        </label>
        {isNumeric ? <>
          <label className="text-xs font-semibold text-[#53635d]">Resultado
            <div className="mt-1 flex gap-2"><select aria-label="Comparador" className="w-20 rounded-lg border border-[#d7e1dc] bg-white px-2 py-2 text-sm" disabled={disabled} value={result.numeric_comparator ?? ""} onChange={(event) => onChange({ numeric_comparator: (event.target.value || null) as LaboratoryResultDraft["numeric_comparator"] })}><option value="">=</option><option value="<">&lt;</option><option value=">">&gt;</option><option value="<=">≤</option><option value=">=">≥</option></select><input aria-label="Valor numérico" type="number" step="any" className="min-w-0 flex-1 rounded-lg border border-[#d7e1dc] px-3 py-2 text-sm" disabled={disabled} value={result.numeric_value ?? ""} onChange={(event) => onChange({ numeric_value: event.target.value === "" ? null : Number(event.target.value) })} /></div>
          </label>
          <label className="text-xs font-semibold text-[#53635d]">Unidad original<input className={inputClass} disabled={disabled} value={result.unit ?? ""} placeholder="mg/dL" onChange={(event) => onChange({ unit: event.target.value })} /></label>
        </> : <>
          <label className="text-xs font-semibold text-[#53635d] sm:col-span-2">Resultado escrito
            <input className={inputClass} list={choices.length ? `laboratory-options-${result.local_id}` : undefined} disabled={disabled} value={result.text_value ?? ""} placeholder="Ej. Negativo, trazas, ++" onChange={(event) => onChange({ text_value: event.target.value })} />
            {choices.length > 0 && <datalist id={`laboratory-options-${result.local_id}`}>{choices.map((choice) => <option key={choice} value={choice} />)}</datalist>}
          </label>
          <label className="text-xs font-semibold text-[#53635d]">Unidad original (si aplica)<input className={inputClass} disabled={disabled} value={result.unit ?? ""} onChange={(event) => onChange({ unit: event.target.value })} /></label>
        </>}
        <label className="text-xs font-semibold text-[#53635d]">Marcador del laboratorio<input className={inputClass} disabled={disabled} value={result.laboratory_flag ?? ""} placeholder="H, L, crítico…" onChange={(event) => onChange({ laboratory_flag: event.target.value })} /></label>
      </div>
      {result.custom && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-[#53635d]">Nombre clínico (opcional)<input className={inputClass} disabled={disabled} value={result.custom.clinicalName} onChange={(event) => onChange({ custom: { ...result.custom!, clinicalName: event.target.value } })} /></label><label className="text-xs font-semibold text-[#53635d]">Unidad sugerida<input className={inputClass} disabled={disabled} value={result.custom.defaultUnit} onChange={(event) => onChange({ custom: { ...result.custom!, defaultUnit: event.target.value } })} /></label></div>}
      <details className="mt-3 rounded-lg bg-[#f7faf8] p-3" open={Boolean(result.reference_text || result.reference_lower !== null || result.reference_upper !== null)}>
        <summary className="cursor-pointer text-xs font-semibold text-[#3d705d]">Referencia del reporte y detalles</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-[#53635d] sm:col-span-2">Referencia escrita exactamente como aparece<input className={inputClass} disabled={disabled} value={result.reference_text ?? ""} placeholder="70–99 mg/dL, &lt;150, Negativo…" onChange={(event) => onChange({ reference_text: event.target.value })} /></label>
          <label className="text-xs font-semibold text-[#53635d]">Límite inferior<input type="number" step="any" className={inputClass} disabled={disabled} value={result.reference_lower ?? ""} onChange={(event) => onChange({ reference_lower: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <label className="text-xs font-semibold text-[#53635d]">Límite superior<input type="number" step="any" className={inputClass} disabled={disabled} value={result.reference_upper ?? ""} onChange={(event) => onChange({ reference_upper: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <label className="text-xs font-semibold text-[#53635d]">Unidad de referencia<input className={inputClass} disabled={disabled} value={result.reference_unit ?? ""} onChange={(event) => onChange({ reference_unit: event.target.value })} /></label>
          <label className="text-xs font-semibold text-[#53635d] sm:col-span-2">Nota del resultado<input className={inputClass} disabled={disabled} value={result.notes ?? ""} onChange={(event) => onChange({ notes: event.target.value })} /></label>
        </div>
      </details>
      <p className="mt-3 text-xs text-[#66766f]">{comparisonLabel[comparison]}. Esta comparación solo usa la unidad y el intervalo que registraste; no es un diagnóstico.</p>
    </article>
  );
}

export function LaboratoryReports({ consultation }: Props) {
  const [data, setData] = useState<LoadedLaboratories | null>(null);
  const [reports, setReports] = useState<LaboratoryReportDraft[]>([]);
  const [searches, setSearches] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const editable = consultation.status === "draft";
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const loaded = await loadLaboratoryData(consultation); setData(loaded); setReports(reportDrafts(loaded)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cargar los laboratorios."); }
    finally { setLoading(false); }
  }, [consultation]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const catalogById = useMemo(() => new Map(data?.catalog.map((item) => [item.id, item]) ?? []), [data]);
  const changeReport = (localId: string, patch: Partial<LaboratoryReportDraft>) => setReports((current) => current.map((report) => report.local_id === localId ? { ...report, ...patch } : report));
  const changeResult = (reportId: string, resultId: string, patch: Partial<LaboratoryResultDraft>) => setReports((current) => current.map((report) => report.local_id !== reportId ? report : { ...report, results: report.results.map((result) => result.local_id === resultId ? { ...result, ...patch } : result) }));
  const removeResult = (reportId: string, resultId: string) => setReports((current) => current.map((report) => report.local_id !== reportId ? report : { ...report, results: report.results.filter((result) => result.local_id !== resultId) }));
  const addResult = (reportId: string, item?: LaboratoryCatalogItem) => setReports((current) => current.map((report) => report.local_id !== reportId ? report : { ...report, results: [...report.results, newLaboratoryResultDraft(item)] }));
  const addCustom = (reportId: string) => setReports((current) => current.map((report) => report.local_id !== reportId ? report : { ...report, results: [...report.results, { ...newLaboratoryResultDraft(), custom: { name: "", clinicalName: "", resultKind: "text", defaultUnit: "" } }] }));
  const addPanel = (reportId: string, templateId: string) => {
    if (!data) return;
    const current = reports.find((report) => report.local_id === reportId);
    const existing = new Set(current?.results.map((result) => result.analyte_id).filter(Boolean));
    const additions = data.templateItems.filter((item) => item.template_id === templateId && !existing.has(item.analyte_id)).map((item) => newLaboratoryResultDraft(catalogById.get(item.analyte_id)));
    if (!additions.length) { setNotice("Todos los analitos de este perfil ya están en el reporte."); return; }
    setReports((all) => all.map((report) => report.local_id !== reportId ? report : { ...report, results: [...report.results, ...additions] }));
  };
  const save = async (draft: LaboratoryReportDraft) => {
    setSavingId(draft.local_id); setError(""); setNotice("");
    try { await saveLaboratoryReport(consultation, draft); await load(); setNotice("Reporte guardado. Solo se conservaron los resultados que contienen un valor."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar el reporte."); }
    finally { setSavingId(null); }
  };
  const removeReport = async (draft: LaboratoryReportDraft) => {
    if (!draft.id) { setReports((current) => current.filter((report) => report.local_id !== draft.local_id)); return; }
    if (!window.confirm("¿Eliminar este reporte y sus resultados? Esta acción solo está disponible mientras la consulta sea editable.")) return;
    setSavingId(draft.local_id); setError("");
    try { await deleteLaboratoryReport(draft.id); await load(); setNotice("Reporte eliminado."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos eliminar el reporte."); }
    finally { setSavingId(null); }
  };
  if (loading) return <LoadingState label="Cargando laboratorios…" />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return null;
  return <section className="min-w-0 space-y-5">
    <header className="rounded-2xl border border-[#dfe5e1] bg-[#f7faf8] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#3d705d]">Laboratorios</p><h2 className="mt-1 text-xl font-semibold text-[#173d36]">Reportes y estudios</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[#66766f]">Cada resultado queda ligado a su reporte, laboratorio, fecha, unidad y referencia original. No se generan diagnósticos ni cálculos clínicos.</p></div>{editable && <button type="button" className="nuth-button-primary inline-flex items-center gap-2" onClick={() => setReports((current) => [...current, newLaboratoryReportDraft()])}><Plus size={16} />Agregar estudio</button>}</div>
      {!editable && <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-[#66766f]">Esta consulta no está disponible para edición.</p>}
    </header>
    {notice && <p role="status" className="rounded-xl bg-[#eaf3ec] px-4 py-3 text-sm text-[#315e4f]">{notice}</p>}
    {error && <ErrorState message={error} onRetry={() => void load()} />}
    {reports.length === 0 && <div className="rounded-2xl border border-dashed border-[#cbd8d1] bg-white p-7 text-center"><Beaker className="mx-auto text-[#709883]" size={28} /><p className="mt-3 font-semibold text-[#173d36]">Aún no hay reportes de laboratorio</p><p className="mt-1 text-sm text-[#66766f]">Agrega un estudio para registrar resultados con su procedencia.</p></div>}
    {reports.map((report, index) => {
      const search = searches[report.local_id] ?? "";
      const matches = searchLaboratoryCatalog(data.catalog, search).filter((item) => !report.results.some((result) => result.analyte_id === item.id)).slice(0, 8);
      const customMatches = search ? data.customAnalytes.filter((item) => [item.display_name, item.clinical_name ?? "", ...(item.synonyms ?? [])].some((value) => value.toLocaleLowerCase().includes(search.toLocaleLowerCase()))).slice(0, 4) : [];
      return <article key={report.local_id} className="min-w-0 rounded-2xl border border-[#dfe5e1] bg-[#fcfdfc] p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold text-[#173d36]">{report.report_name?.trim() || `Estudio ${index + 1}`}</h3>{editable && <button type="button" disabled={savingId === report.local_id} onClick={() => void removeReport(report)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#9b493a] hover:bg-[#fbe9e5] disabled:opacity-50"><Trash2 size={15} />Eliminar reporte</button>}</div>
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-semibold text-[#53635d]">Nombre del estudio<input className="mt-1 w-full rounded-lg border border-[#d7e1dc] px-3 py-2 text-sm" disabled={!editable} value={report.report_name ?? ""} placeholder="Ej. Perfil lipídico" onChange={(event) => changeReport(report.local_id, { report_name: event.target.value })} /></label>
          <label className="text-xs font-semibold text-[#53635d]">Laboratorio de origen<input className="mt-1 w-full rounded-lg border border-[#d7e1dc] px-3 py-2 text-sm" disabled={!editable} value={report.laboratory_name ?? ""} placeholder="Ej. Salud Digna" onChange={(event) => changeReport(report.local_id, { laboratory_name: event.target.value })} /></label>
          <label className="text-xs font-semibold text-[#53635d]">Identificador externo (opcional)<input className="mt-1 w-full rounded-lg border border-[#d7e1dc] px-3 py-2 text-sm" disabled={!editable} value={report.external_identifier ?? ""} onChange={(event) => changeReport(report.local_id, { external_identifier: event.target.value })} /></label>
          <label className="text-xs font-semibold text-[#53635d]">Fecha de toma<input type="date" className="mt-1 w-full rounded-lg border border-[#d7e1dc] px-3 py-2 text-sm" disabled={!editable} value={report.sample_date ?? ""} onChange={(event) => changeReport(report.local_id, { sample_date: event.target.value || null })} /></label>
          <label className="text-xs font-semibold text-[#53635d]">Hora de toma<input type="time" className="mt-1 w-full rounded-lg border border-[#d7e1dc] px-3 py-2 text-sm" disabled={!editable} value={report.sample_time ?? ""} onChange={(event) => changeReport(report.local_id, { sample_time: event.target.value || null })} /></label>
          <label className="text-xs font-semibold text-[#53635d]">Fecha de reporte<input type="date" className="mt-1 w-full rounded-lg border border-[#d7e1dc] px-3 py-2 text-sm" disabled={!editable} value={report.report_date ?? ""} onChange={(event) => changeReport(report.local_id, { report_date: event.target.value || null })} /></label>
          <label className="text-xs font-semibold text-[#53635d]">Ayuno<select className="mt-1 w-full rounded-lg border border-[#d7e1dc] bg-white px-3 py-2 text-sm" disabled={!editable} value={report.fasting_status ?? "unknown"} onChange={(event) => changeReport(report.local_id, { fasting_status: event.target.value as LaboratoryReportDraft["fasting_status"] })}><option value="unknown">No registrado</option><option value="fasting">En ayuno</option><option value="not_fasting">No en ayuno</option></select></label>
          <label className="text-xs font-semibold text-[#53635d]">Horas de ayuno<input type="number" min="0" max="72" step="0.25" className="mt-1 w-full rounded-lg border border-[#d7e1dc] px-3 py-2 text-sm" disabled={!editable} value={report.fasting_hours ?? ""} onChange={(event) => changeReport(report.local_id, { fasting_hours: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <label className="text-xs font-semibold text-[#53635d]">Tipo de muestra<input className="mt-1 w-full rounded-lg border border-[#d7e1dc] px-3 py-2 text-sm" disabled={!editable} value={report.sample_type ?? ""} placeholder="Suero, orina…" onChange={(event) => changeReport(report.local_id, { sample_type: event.target.value })} /></label>
          <label className="text-xs font-semibold text-[#53635d] sm:col-span-2">Método / equipo (si el reporte lo indica)<input className="mt-1 w-full rounded-lg border border-[#d7e1dc] px-3 py-2 text-sm" disabled={!editable} value={report.analytical_method ?? ""} placeholder="HPLC, inmunoensayo…" onChange={(event) => changeReport(report.local_id, { analytical_method: event.target.value })} /></label>
          <label className="text-xs font-semibold text-[#53635d]">Notas generales<textarea className="mt-1 min-h-10 w-full rounded-lg border border-[#d7e1dc] px-3 py-2 text-sm" disabled={!editable} value={report.notes ?? ""} onChange={(event) => changeReport(report.local_id, { notes: event.target.value })} /></label>
        </div>
        {editable && <div className="mt-5 rounded-xl border border-[#dfe5e1] bg-white p-3"><p className="text-xs font-semibold text-[#3d705d]">Perfiles como atajo</p><div className="mt-2 flex flex-wrap gap-2">{data.templates.filter((template) => template.is_system).map((template) => <button type="button" key={template.id} title={template.description ?? undefined} onClick={() => addPanel(report.local_id, template.id)} className="rounded-full border border-[#cbd8d1] px-3 py-1.5 text-xs font-semibold text-[#315e4f] hover:bg-[#eaf3ec]">+ {template.name}</button>)}</div></div>}
        <div className="mt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-[#173d36]">Resultados</h4><span className="text-xs text-[#74817d]">{report.results.length} campos en este reporte</span></div>
          {editable && <div className="mt-3"><label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#74817d]" size={16} /><input className="w-full rounded-xl border border-[#d7e1dc] bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-[#3d705d]" value={search} placeholder="Buscar analito: glucosa, HbA1c, TGO…" onChange={(event) => setSearches((current) => ({ ...current, [report.local_id]: event.target.value }))} />{search && <button type="button" aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#66766f]" onClick={() => setSearches((current) => ({ ...current, [report.local_id]: "" }))}><X size={15} /></button>}</label>
            {search && <div className="mt-2 max-h-60 overflow-auto rounded-xl border border-[#dfe5e1] bg-white p-1">{matches.map((item) => <button type="button" key={item.id} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#f1f7f3]" onClick={() => { addResult(report.local_id, item); setSearches((current) => ({ ...current, [report.local_id]: "" })); }}><span className="block text-sm font-semibold text-[#173d36]">{item.display_name}</span><span className="block text-xs text-[#74817d]">{item.clinical_name}{item.unit ? ` · ${item.unit}` : ""}</span></button>)}{customMatches.map((item) => <button type="button" key={item.id} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#f1f7f3]" onClick={() => { setReports((current) => current.map((currentReport) => currentReport.local_id !== report.local_id ? currentReport : { ...currentReport, results: [...currentReport.results, { ...newLaboratoryResultDraft(), custom_analyte_id: item.id, analyte_name_snapshot: item.display_name, analyte_clinical_name_snapshot: item.clinical_name, analyte_synonyms_snapshot: item.synonyms, result_kind: item.result_kind, unit: item.default_unit ?? "", reference_unit: item.default_unit ?? "" }] })); setSearches((current) => ({ ...current, [report.local_id]: "" })); }}><span className="block text-sm font-semibold text-[#173d36]">{item.display_name}</span><span className="block text-xs text-[#74817d]">Analito personalizado</span></button>)}{!matches.length && !customMatches.length && <p className="px-3 py-2 text-sm text-[#66766f]">No encontramos un analito estándar con ese término.</p>}</div>}</div>}
          <div className="mt-3 space-y-3">{report.results.map((result) => <ResultEditor key={result.local_id} result={result} catalogItem={result.analyte_id ? catalogById.get(result.analyte_id) : undefined} disabled={!editable || savingId === report.local_id} onChange={(patch) => changeResult(report.local_id, result.local_id, patch)} onRemove={() => removeResult(report.local_id, result.local_id)} />)}</div>
          {editable && <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="nuth-button-secondary inline-flex items-center gap-2 !px-3 !py-2 !text-xs" onClick={() => addCustom(report.local_id)}><Plus size={15} />Resultado personalizado</button></div>}
        </div>
        {editable && <div className="mt-5 flex justify-end"><button type="button" disabled={savingId === report.local_id} className="nuth-button-primary inline-flex items-center gap-2" onClick={() => void save(report)}>{savingId === report.local_id ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}Guardar reporte</button></div>}
      </article>;
    })}
  </section>;
}
