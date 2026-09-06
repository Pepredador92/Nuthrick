import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import {
  type LongitudinalCategory,
  type LongitudinalHistory,
  type LongitudinalPoint,
  type LongitudinalSeries,
} from "@/src/features/evolution/longitudinal";
import { loadLongitudinalHistory } from "@/src/services/longitudinalHistory";

type CategoryFilter = "all" | LongitudinalCategory;

const categories: Array<{ id: LongitudinalCategory; label: string; heading: string }> = [
  { id: "measurements", label: "Mediciones", heading: "Mediciones registradas" },
  { id: "calculations", label: "Calculados", heading: "Datos calculados" },
  { id: "bioimpedance", label: "Bioimpedancia", heading: "Bioimpedancia" },
  { id: "laboratories", label: "Laboratorios", heading: "Laboratorios" },
];

function consultationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", " ·");
}

function pointFor(series: LongitudinalSeries, consultationId: string) {
  return series.points.find((point) => point.consultation_id === consultationId);
}

function matchesSearch(series: LongitudinalSeries, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [series.label, series.concept, series.method, series.provenance]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase().includes(normalized));
}

function provenanceText(point: LongitudinalPoint, series: LongitudinalSeries) {
  const source = point.source_reference;
  const reportDetail = [
    source.laboratory_name,
    source.sample_type,
    source.analytical_method,
  ]
    .filter(Boolean)
    .join(" · ");
  return reportDetail || series.provenance || series.method || "Valor registrado en la consulta";
}

function EvolutionMatrix({
  history,
  series,
  currentConsultationId,
  onOpenConsultation,
}: {
  history: LongitudinalHistory;
  series: LongitudinalSeries[];
  currentConsultationId?: string | null;
  onOpenConsultation?: (consultationId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#dfe5e1]" aria-label="Tabla comparativa de evolución">
      <table className="min-w-[760px] w-full border-separate border-spacing-0 text-left text-sm">
        <thead className="bg-[#f7faf8] text-xs font-semibold text-[#53645f]">
          <tr>
            <th scope="col" className="sticky left-0 z-20 min-w-[210px] border-b border-r border-[#dfe5e1] bg-[#f7faf8] px-3 py-3 shadow-[2px_0_4px_rgba(16,45,39,0.03)]">
              Indicador
            </th>
            {history.consultations.map((consultation) => {
              const active = consultation.id === currentConsultationId;
              return (
                <th
                  key={consultation.id}
                  scope="col"
                  className={`min-w-[132px] border-b border-[#dfe5e1] px-3 py-2.5 ${active ? "bg-[#edf6ef]" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => onOpenConsultation?.(consultation.id)}
                    className="w-full text-left font-semibold text-[#24473d] hover:text-[#3d705d] focus:outline-none focus:ring-2 focus:ring-[#76a78e] focus:ring-offset-2"
                    aria-label={`Abrir consulta del ${consultationDate(consultation.consultation_date)}`}
                  >
                    {consultationDate(consultation.consultation_date)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {series.map((item) => (
            <tr key={item.id} className="group hover:bg-[#fbfdfb]">
              <th scope="row" className="sticky left-0 z-10 min-w-[210px] border-b border-r border-[#e8eeeb] bg-white px-3 py-3 align-top font-medium text-[#26443b] group-hover:bg-[#fbfdfb]">
                <span className="block break-words">{item.label}</span>
                <span className="mt-1 block text-xs font-normal text-[#74817d]">
                  {[item.unit, item.provenance].filter(Boolean).join(" · ") || "Valor registrado"}
                </span>
              </th>
              {history.consultations.map((consultation) => {
                const point = pointFor(item, consultation.id);
                const active = consultation.id === currentConsultationId;
                return (
                  <td
                    key={consultation.id}
                    className={`border-b border-[#e8eeeb] px-3 py-3 align-top ${active ? "bg-[#f5faf6]" : ""}`}
                  >
                    {point ? (
                      <button
                        type="button"
                        onClick={() => onOpenConsultation?.(consultation.id)}
                        className="max-w-full break-words text-left font-medium text-[#183f34] hover:text-[#3d705d] focus:outline-none focus:ring-2 focus:ring-[#76a78e] focus:ring-offset-2"
                        title={provenanceText(point, item)}
                        aria-label={`${item.label}: ${point.display_value}. Abrir consulta del ${consultationDate(consultation.consultation_date)}`}
                      >
                        {point.display_value}
                        {point.unit ? <span className="ml-1 text-xs font-normal text-[#74817d]">{point.unit}</span> : null}
                      </button>
                    ) : (
                      <span className="text-[#98a49f]" aria-label={`Sin ${item.label} en esta consulta`}>—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PatientEvolutionTable({
  patientId,
  currentConsultationId,
  onOpenConsultation,
}: {
  patientId: string;
  currentConsultationId?: string | null;
  onOpenConsultation?: (consultationId: string) => void;
}) {
  const [history, setHistory] = useState<LongitudinalHistory | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Partial<Record<LongitudinalCategory, boolean>>>({});

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setHistory(await loadLongitudinalHistory(patientId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos cargar el historial comparativo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // The data load intentionally follows the patient displayed in the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const visible = useMemo(
    () => (history?.series ?? []).filter(
      (series) => (filter === "all" || series.category === filter) && matchesSearch(series, query),
    ),
    [filter, history?.series, query],
  );

  if (loading) return <LoadingState label="Cargando historial comparativo…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!history || history.consultations.length === 0 || history.series.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#cbd8d1] bg-[#fbfdfb] px-5 py-8 text-center">
        <p className="font-semibold text-[#26443b]">Todavía no hay mediciones o resultados para comparar.</p>
        <p className="mt-1 text-sm text-[#74817d]">Los valores aparecerán aquí conforme se registren en las consultas.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="evolution-table-heading">
      <div className="flex flex-col gap-3 border-b border-[#e4ebe7] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#668176]">Evolución</p>
          <h2 id="evolution-table-heading" className="mt-1 text-lg font-bold text-[#1c382f]">Tabla comparativa</h2>
          <p className="mt-1 text-sm text-[#74817d]">Valores registrados por consulta. No modifica el expediente.</p>
        </div>
        <label className="relative block w-full sm:w-64">
          <span className="sr-only">Buscar en la evolución</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#74817d]" />
          <input
            className="nuth-input !pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar indicador o método"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar evolución">
        {([{ id: "all", label: "Todos" }, ...categories] as Array<{ id: CategoryFilter; label: string }>).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${filter === item.id ? "border-[#1c5545] bg-[#1c5545] text-white" : "border-[#d5e0da] bg-white text-[#496158] hover:border-[#76a78e]"}`}
            aria-pressed={filter === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-5">
        {categories
          .filter((category) => filter === "all" || filter === category.id)
          .map((category) => {
            const entries = visible.filter((series) => series.category === category.id);
            if (!entries.length) return null;
            const isCollapsed = collapsed[category.id] ?? false;
            return (
              <section key={category.id} className="rounded-2xl border border-[#e1e9e4] bg-white p-3 sm:p-4">
                <button
                  type="button"
                  onClick={() => setCollapsed((current) => ({ ...current, [category.id]: !isCollapsed }))}
                  className="flex w-full items-center justify-between gap-3 px-1 text-left"
                  aria-expanded={!isCollapsed}
                >
                  <span>
                    <span className="block font-bold text-[#25453b]">{category.heading}</span>
                    <span className="mt-0.5 block text-xs text-[#74817d]">{entries.length} {entries.length === 1 ? "indicador" : "indicadores"}</span>
                  </span>
                  <ChevronDown size={18} className={`shrink-0 text-[#668176] transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                </button>
                {!isCollapsed ? <div className="mt-3"><EvolutionMatrix history={history} series={entries} currentConsultationId={currentConsultationId} onOpenConsultation={onOpenConsultation} /></div> : null}
              </section>
            );
          })}
        {!visible.length ? (
          <p className="rounded-xl border border-dashed border-[#cbd8d1] px-4 py-6 text-center text-sm text-[#74817d]">No encontramos indicadores que coincidan con tu búsqueda.</p>
        ) : null}
      </div>
    </section>
  );
}
