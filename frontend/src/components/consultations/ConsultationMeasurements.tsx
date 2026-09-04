import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LoaderCircle, Save, Search } from "lucide-react";
import type { Consultation } from "@/src/types/domain";
import {
  loadConsultationMeasurements,
  saveConsultationMeasurements,
  type CatalogMeasurement,
} from "@/src/services/consultationMeasurements";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";

type RawValues = Record<string, string | boolean>;

const mainCodes = [
  "weight",
  "height",
  "waist_circumference",
  "hip_circumference",
  "abdominal_circumference",
];

const groups = [
  { title: "Antropometría", categories: ["general", "circumference", "skinfold", "bone_breadth", "anthropometric_length"] },
  { title: "Composición corporal", categories: ["bioimpedance"] },
  { title: "Clínica", categories: ["clinical"] },
];

const categoryNames: Record<string, string> = {
  circumference: "Circunferencias",
  skinfold: "Pliegues cutáneos",
  bone_breadth: "Diámetros y anchos óseos",
  anthropometric_length: "Longitudes y alturas",
  bioimpedance: "Bioimpedancia",
  clinical: "Signos y mediciones clínicas",
  general: "Mediciones generales",
};

function displayValue(value: unknown): string | boolean {
  return typeof value === "boolean" ? value : String(value ?? "");
}

function toPayloadValue(
  measurement: CatalogMeasurement,
  value: string | boolean | undefined,
): string | number | boolean | undefined {
  if (value === undefined || value === "") return undefined;
  if (measurement.data_type === "boolean") return value === true;
  if (measurement.data_type === "number" || measurement.data_type === "percentage" || measurement.data_type === "ratio") {
    const number = Number(String(value).replace(",", "."));
    return Number.isFinite(number) ? number : undefined;
  }
  return String(value).trim() || undefined;
}

function MeasurementField({
  measurement,
  value,
  onChange,
}: {
  measurement: CatalogMeasurement;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  const id = `measurement-${measurement.code}`;
  const numeric = ["number", "percentage", "ratio"].includes(measurement.data_type);
  return (
    <label htmlFor={id} className="block min-w-0 rounded-2xl border border-[#e1e8e3] bg-white p-3.5">
      <span className="block text-sm font-semibold text-[#173d36]">{measurement.display_name || measurement.name}</span>
      <span className="mt-1 block text-xs leading-5 text-[#718176]">{measurement.description}</span>
      <span className="mt-3 flex min-w-0 items-center gap-2">
        {measurement.data_type === "boolean" ? (
          <input id={id} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[#315e4f]" />
        ) : measurement.data_type === "choice" ? (
          <select id={id} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className="nuth-input min-w-0 flex-1">
            <option value="">Sin registrar</option>
            {measurement.choice_options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : (
          <input id={id} inputMode={numeric ? "decimal" : "text"} type={numeric ? "text" : "text"} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className="nuth-input min-w-0 flex-1" placeholder="—" aria-describedby={`${id}-unit`} />
        )}
        {measurement.unit && <span id={`${id}-unit`} className="shrink-0 text-sm font-semibold text-[#52705f]">{measurement.unit}</span>}
      </span>
    </label>
  );
}

export function ConsultationMeasurements({ consultation }: { consultation: Consultation }) {
  const [catalog, setCatalog] = useState<CatalogMeasurement[]>([]);
  const [values, setValues] = useState<RawValues>({});
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const loaded = await loadConsultationMeasurements(consultation.id);
      setCatalog(loaded.catalog.filter((item) => item.category !== "laboratory"));
      setValues(Object.fromEntries(loaded.values.map((item) => [item.measurement_type_id, displayValue(item.value)])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos cargar las mediciones.");
    } finally {
      setLoading(false);
    }
  }, [consultation.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const byCode = useMemo(() => new Map(catalog.map((item) => [item.code, item])), [catalog]);
  const main = mainCodes.map((code) => byCode.get(code)).filter((item): item is CatalogMeasurement => Boolean(item));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = useMemo(() => !normalizedQuery ? [] : catalog.filter((item) => [item.name, item.display_name, item.clinical_name, ...item.synonyms].join(" ").toLocaleLowerCase().includes(normalizedQuery)).slice(0, 12), [catalog, normalizedQuery]);
  const setValue = (code: string, value: string | boolean) => { setValues((current) => ({ ...current, [code]: value })); setNotice(""); };
  const save = async () => {
    setSaving(true); setError("");
    try {
      const payload = Object.fromEntries(catalog.flatMap((measurement) => {
        const value = toPayloadValue(measurement, values[measurement.code]);
        return value === undefined ? [] : [[measurement.id, value]];
      }));
      const saved = await saveConsultationMeasurements(consultation, payload);
      setValues(Object.fromEntries(saved.map((item) => [item.measurement_type_id, displayValue(item.value)])));
      setNotice(saved.length ? "Mediciones guardadas." : "No hay mediciones registradas en esta consulta.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar las mediciones."); }
    finally { setSaving(false); }
  };
  if (loading) return <LoadingState label="Cargando mediciones…" />;
  if (error && !catalog.length) return <ErrorState message={error} onRetry={() => void load()} />;
  const categoryFields = (category: string) => catalog.filter((item) => item.category === category && !mainCodes.includes(item.code));
  return <section className="min-w-0" aria-label="Mediciones de la consulta">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="nuth-eyebrow">Captura directa</p><h2 className="mt-1 text-2xl font-semibold text-[#173d36]">Mediciones</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#718176]">Registra sólo lo que mediste hoy. Los campos vacíos no crean registros.</p></div>
      <button type="button" className="nuth-button self-start sm:self-auto" disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />} Guardar mediciones</button>
    </div>
    {notice && <p role="status" className="mt-4 rounded-xl bg-[#eaf3ec] px-4 py-3 text-sm text-[#315e4f]">{notice}</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-[#fbe9e5] px-4 py-3 text-sm text-[#963f32]">{error}</p>}
    <section className="mt-6"><h3 className="text-base font-semibold text-[#173d36]">Principales</h3><div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{main.map((item) => <MeasurementField key={item.code} measurement={item} value={values[item.code]} onChange={(value) => setValue(item.code, value)} />)}</div></section>
    <div className="mt-7 rounded-2xl border border-[#dfe5e1] bg-[#f8fbf8] p-4"><label htmlFor="measurement-search" className="text-sm font-semibold text-[#173d36]">Buscar medición</label><div className="mt-2 flex items-center gap-2 rounded-xl border border-[#d6e2d9] bg-white px-3"><Search size={17} className="shrink-0 text-[#60766a]" /><input id="measurement-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. brazo, tríceps, presión" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" /></div>{normalizedQuery && <div className="mt-3 grid gap-3 sm:grid-cols-2">{results.length ? results.map((item) => <MeasurementField key={`search-${item.code}`} measurement={item} value={values[item.code]} onChange={(value) => setValue(item.code, value)} />) : <p className="text-sm text-[#718176]">No encontramos una medición disponible. Los laboratorios se registrarán en su propio módulo.</p>}</div>}</div>
    <div className="mt-7 space-y-6">{groups.map((group) => <section key={group.title}><h3 className="text-base font-semibold text-[#173d36]">{group.title}</h3><div className="mt-3 space-y-2">{group.categories.map((category) => { const fields = categoryFields(category); if (!fields.length) return null; const isOpen = opened[category] === true; return <div key={category} className="overflow-hidden rounded-2xl border border-[#dfe5e1] bg-white"><button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left" aria-expanded={isOpen} onClick={() => setOpened((current) => ({ ...current, [category]: !isOpen }))}><span><span className="block text-sm font-semibold text-[#173d36]">{categoryNames[category]}</span><span className="mt-1 block text-xs text-[#718176]">{fields.length} mediciones disponibles</span></span>{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>{isOpen && <div className="grid min-w-0 gap-3 border-t border-[#e5ece7] p-3 sm:grid-cols-2 xl:grid-cols-3">{fields.map((item) => <MeasurementField key={item.code} measurement={item} value={values[item.code]} onChange={(value) => setValue(item.code, value)} />)}</div>}</div>; })}</div></section>)}</div>
  </section>;
}
