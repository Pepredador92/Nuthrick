import { useEffect, useMemo, useState } from "react";
import { ClinicalProgressSummary } from "./ClinicalProgressSummary";
import { ProgressReferenceControls } from "./ProgressReferenceControls";
import { emptyProgressReferences, type ProgressReferenceOptions } from "@/src/features/evolution/progressReferences";
import { somatoBoundary, somatoColors, somatoProjection, somatoRegions } from "@/src/features/evolution/somatochart";
import { historicalClassification } from "@/src/features/evolution/clinicalSummary";
import { formatPatientDate } from "@/src/features/patients/patientUtils";
import { BarChart3 } from "lucide-react";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import { numericPoints } from "@/src/features/evolution/exportEvolution";
import { evolutionCategoryStyles } from "@/src/features/evolution/presentation";
import type { LongitudinalHistory, LongitudinalPoint, LongitudinalSeries } from "@/src/features/evolution/longitudinal";
import { loadLongitudinalHistory } from "@/src/services/longitudinalHistory";

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" })
    .format(date)
    .replace(/\./g, "");
}

function chartDate(value: string) {
  return formatPatientDate(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
}

function graphRange(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.12, 1);
    return [min - padding, max + padding] as const;
  }
  const padding = (max - min) * 0.14;
  return [min - padding, max + padding] as const;
}

export function somatochartPoints(series: LongitudinalSeries) {
  return series.points
    .map((point) => ({ ...point, x: Number(point.coordinates?.x), y: Number(point.coordinates?.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function graphableSeries(history: LongitudinalHistory) {
  return history.series.filter((series) =>
    series.graphable &&
    (series.visualization === "somatochart"
      ? somatochartPoints(series).length > 0
      : numericPoints(series).length > 0),
  );
}

function CategoryBadge({ series }: { series: LongitudinalSeries }) {
  const style = evolutionCategoryStyles[series.category];
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: style.tint, color: style.text }}
    >
      {style.label}
    </span>
  );
}

function ChartFrame({
  series,
  latest,
  patientView = false,
  children,
}: {
  series: LongitudinalSeries;
  latest?: LongitudinalPoint;
  patientView?: boolean;
  children: React.ReactNode;
}) {
  const style = evolutionCategoryStyles[series.category];
  return (
    <figure className="rounded-2xl border border-[#e1e9e4] bg-[#fbfdfb] p-4">
      <figcaption className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-[#25453b]">{series.label}</p>
            {!patientView && <CategoryBadge series={series} />}
          </div>
          {!patientView && <p className="mt-1 truncate text-xs text-[#74817d]">
            {[series.unit, series.provenance].filter(Boolean).join(" · ") || "Valores registrados"}
          </p>}
        </div>
        {latest && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ backgroundColor: style.tint, color: style.text }}
          >
            {latest.display_value}{latest.unit ? ` ${latest.unit}` : ""}
          </span>
        )}
      </figcaption>
      {children}
    </figure>
  );
}

function LineChartCard({ series, compact }: { series: LongitudinalSeries; compact: boolean }) {
  const points = numericPoints(series);
  const values = points.map((point) => point.value);
  const [low, high] = graphRange(values);
  const style = evolutionCategoryStyles[series.category];
  const width = 480;
  const height = compact ? 150 : 190;
  const left = 45;
  const right = 28;
  const top = 18;
  const bottom = 30;
  const graphWidth = width - left - right;
  const graphHeight = height - top - bottom;
  const timestamps = points.map((point) => new Date(point.consultation_date).getTime());
  const duration = timestamps.at(-1)! - timestamps[0];
  const x = (index: number) => duration > 0 ? left + graphWidth * (timestamps[index] - timestamps[0]) / duration : left + graphWidth / 2;
  const y = (value: number) => top + graphHeight - ((value - low) / (high - low)) * graphHeight;
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index)} ${y(point.value)}`).join(" ");
  const latest = points.at(-1);

  return (
    <ChartFrame series={series} latest={latest}>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 block w-full" role="img" aria-label={`Gráfica de evolución de ${series.label}`}>
        {[0, 1, 2, 3].map((step) => {
          const lineY = top + (graphHeight * step) / 3;
          return <g key={step}><line x1={left} x2={width - right} y1={lineY} y2={lineY} stroke="#e2ebe5" strokeWidth="1" /><text x={left - 8} y={lineY + 3} textAnchor="end" className="fill-[#718079] text-[10px]">{(high - (high - low) * step / 3).toLocaleString("es-MX", { maximumFractionDigits: 1 })}</text></g>;
        })}
        <path d={path} fill="none" stroke={style.line} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={`${point.consultation_id}-${index}`}>
            <title>{`${shortDate(point.consultation_date)} · ${point.display_value} ${point.unit ?? ""}`}</title>
            <circle cx={x(index)} cy={y(point.value)} r="4" fill={style.line} stroke="white" strokeWidth="2" />
            {(index === 0 || index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / 4)) === 0) && <text x={x(index)} y={height - 8} textAnchor="middle" className="fill-[#718079] text-[10px]">{shortDate(point.consultation_date)}</text>}
          </g>
        ))}
      </svg>
    </ChartFrame>
  );
}

function coordinateLabel(point: { x: number; y: number }) {
  return `X ${point.x.toLocaleString("es-MX", { maximumFractionDigits: 2 })} · Y ${point.y.toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;
}

function SomatotypeGlyph({ variant }: { variant: "endo" | "meso" | "ecto" }) {
  const body = {
    endo: "M7 20c.2-5.7 1.5-8.7 5-8.7s4.8 3 5 8.7",
    meso: "M6.2 20c.4-5.7 1.8-8.7 5.8-8.7s5.4 3 5.8 8.7",
    ecto: "M10 20c.8-5.7 1.2-8.7 2-8.7s1.2 3 2 8.7",
  }[variant];
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7"><circle cx="12" cy="4.5" r="2.2" fill="currentColor" stroke="none" /><path d={body} /><path d="M12 8v3.3M8.5 10.3h7" /></svg>;
}

export function SomatochartCard({ series, compact = false, patientView = false }: { series: LongitudinalSeries; compact?: boolean; patientView?: boolean }) {
  const points = somatochartPoints(series);
  const width = 520, height = compact ? 350 : 400;
  const { x, y, xMin, xMax, yMin, yMax } = somatoProjection(points, width, height, 40);
  const latest = points.at(-1);
  const polygon = (entries: Array<{ x: number; y: number }>) => entries.map((point) => `${x(point.x)},${y(point.y)}`).join(" ");
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(point.x)} ${y(point.y)}`).join(" ");
  return (
    <ChartFrame series={series} latest={patientView ? undefined : latest ? { ...latest, display_value: coordinateLabel(latest), unit: null } : undefined} patientView={patientView}>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 block w-full" role="img" aria-label="Somatocarta de evolución Heath-Carter">
        {somatoRegions.map((region) => <polygon key={region.color} points={polygon(region.points)} fill={region.color} />)}
        <polygon points={polygon(somatoBoundary)} fill="none" stroke="#b4c6bf" strokeWidth="1.5"/>
        {[-6, -3, 0, 3, 6].map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={y(yMax)} y2={y(yMin)} stroke="#dce5e0" strokeDasharray="2 5"/><text x={x(tick)} y={y(yMin) + 14} textAnchor="middle" className="fill-[#74817d] text-[11px]">{tick}</text></g>)}
        {[-6, 0, 6, 12].map((tick) => <g key={tick}><line x1={x(xMin)} x2={x(xMax)} y1={y(tick)} y2={y(tick)} stroke="#dce5e0" strokeDasharray="2 5"/><text x={x(xMin) - 6} y={y(tick) + 4} textAnchor="end" className="fill-[#74817d] text-[11px]">{tick}</text></g>)}
        <line x1={x(0)} x2={x(0)} y1={y(12)} y2={y(-9)} stroke="#96afa3"/>
        <line x1={x(-6)} x2={x(6)} y1={y(-6)} y2={y(6)} stroke="#96afa3" strokeDasharray="4 4"/>
        <line x1={x(-6)} x2={x(6)} y1={y(6)} y2={y(-6)} stroke="#96afa3" strokeDasharray="4 4"/>
        <text x={x(0)} y={y(12) - 12} textAnchor="middle" className="fill-[#315e50] text-[12px] font-bold">MESOMORFIA</text>
        <text x={x(-6)} y={y(-6) + 18} textAnchor="end" className="fill-[#805a3c] text-[11px] font-bold">ENDOMORFIA</text>
        <text x={x(6)} y={y(-6) + 18} textAnchor="start" className="fill-[#456a86] text-[11px] font-bold">ECTOMORFIA</text>
        {points.length > 1 && <path d={path} fill="none" stroke="#466b63" strokeWidth="1.8" strokeDasharray="4 3"/>}
        {points.map((point, index) => <g key={`${point.consultation_id}-${index}`}>
          <title>{patientView ? `${index + 1} · ${chartDate(point.consultation_date)}` : `${index + 1} · ${chartDate(point.consultation_date)} · ${coordinateLabel(point)}`}</title>
          {index === points.length - 1 && <circle cx={x(point.x)} cy={y(point.y)} r="11" fill="none" stroke="#315e4f" strokeWidth="1.5"/>}
          <circle cx={x(point.x)} cy={y(point.y)} r="7" fill={somatoColors[index % somatoColors.length]} stroke="white" strokeWidth="1.5"/>
          <text x={x(point.x)} y={y(point.y) + 3} textAnchor="middle" className="fill-white text-[9px] font-bold">{index + 1}</text>
        </g>)}
        {!patientView && <text x={width / 2} y={height - 7} textAnchor="middle" className="fill-[#718079] text-[10px]">X = ectomorfia − endomorfia · Y = 2 × mesomorfia − endomorfia − ectomorfia</text>}
      </svg>
      <ol aria-label="Consultas de la somatocarta" className="mt-2 max-h-52 space-y-2 overflow-y-auto text-xs">{points.map((point, index) => <li key={point.consultation_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white p-2"><span className="grid size-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: somatoColors[index % somatoColors.length] }}>{index + 1}</span><span>{chartDate(point.consultation_date)}</span>{!patientView && <span className="text-[#74817d]">{coordinateLabel(point)}</span>}{historicalClassification(point)?.label && <span>{historicalClassification(point)!.label}</span>}{index === points.length - 1 && <strong className="ml-auto text-[#315e4f]">Actual</strong>}</li>)}</ol>
      <ul aria-label="Regiones de la somatocarta" className="mt-2 grid gap-2 text-[11px] text-[#65766e] sm:grid-cols-3">
        <li className="flex items-center gap-2 rounded-xl bg-[#f8eee4] px-2.5 py-2"><SomatotypeGlyph variant="endo" /><span><strong className="block text-[#805a3c]">Endomorfia</strong><span>Adiposidad relativa</span></span></li>
        <li className="flex items-center gap-2 rounded-xl bg-[#edf5ef] px-2.5 py-2"><SomatotypeGlyph variant="meso" /><span><strong className="block text-[#315e50]">Mesomorfia</strong><span>Robustez relativa</span></span></li>
        <li className="flex items-center gap-2 rounded-xl bg-[#edf2f7] px-2.5 py-2"><SomatotypeGlyph variant="ecto" /><span><strong className="block text-[#456a86]">Ectomorfia</strong><span>Linealidad relativa</span></span></li>
      </ul>
      {!patientView && <p className="mt-2 text-xs text-[#74817d]">Coordenadas Heath-Carter guardadas por consulta. El contorno orienta la lectura; las categorías mostradas proceden de cada registro. Los puntos coincidentes conservan sus fechas en la lista.</p>}
    </ChartFrame>
  );
}

export function EvolutionChartCard({
  series,
  compact = false,
}: {
  series: LongitudinalSeries;
  compact?: boolean;
}) {
  if (series.visualization === "somatochart") return <SomatochartCard series={series} compact={compact} />;
  return <LineChartCard series={series} compact={compact} />;
}

function preferredSeries(history: LongitudinalHistory) {
  const all = graphableSeries(history);
  const preferred = ["peso", "imc"]
    .map((term) => all.find((series) => series.label.toLocaleLowerCase().includes(term)))
    .filter((series): series is LongitudinalSeries => Boolean(series));
  const somatochart = all.find((series) => series.visualization === "somatochart");
  return [...new Map([...preferred, ...(somatochart ? [somatochart] : []), ...all].map((series) => [series.id, series])).values()];
}

export function PatientEvolutionCharts({
  patientId,
  onOpenEvolution,
  references = emptyProgressReferences,
  onReferencesChange,
}: {
  patientId: string;
  onOpenEvolution: () => void;
  references?: ProgressReferenceOptions;
  onReferencesChange?: (value: ProgressReferenceOptions) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState<LongitudinalHistory | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setHistory(await loadLongitudinalHistory(patientId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos cargar las gráficas de evolución.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // The chart collection follows the patient whose profile is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);
  const series = useMemo(() => (history ? preferredSeries(history) : []), [history]);

  if (loading) return <LoadingState label="Preparando gráficas…" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!series.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d4e0d8] bg-[#fbfdfb] px-5 py-7 text-center">
        <BarChart3 className="mx-auto text-[#779287]" size={22} />
        <p className="mt-3 text-sm font-semibold text-[#426356]">Aún no hay datos numéricos o coordenadas para graficar.</p>
        <p className="mt-1 text-xs text-[#74817d]">Las gráficas aparecerán al guardar mediciones o coordenadas de somatocarta en una consulta.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {onReferencesChange && <ProgressReferenceControls series={series} value={references} onChange={onReferencesChange} />}
      <ClinicalProgressSummary series={series} contextSeries={history?.series} references={references} />
      <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-xs font-semibold text-[#60766a]">Buscar una gráfica<input className="nuth-input mt-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Peso, cintura, pliegue…" /></label><label className="text-xs font-semibold text-[#60766a]">Tipo de registro<select className="nuth-input mt-1" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Todos</option>{Object.entries(evolutionCategoryStyles).map(([key, style]) => <option key={key} value={key}>{style.label}</option>)}</select></label></div>
      <p className="text-xs text-[#60766a]">{series.length} gráficas disponibles con registros guardados. Cada método y equipo conserva su propia serie.</p>
      <div className="grid items-start gap-4 lg:grid-cols-2">
      {series.filter((item) => (filter === "all" || item.category === filter) && item.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((series) => <EvolutionChartCard key={series.id} series={series} compact />)}
      <button type="button" className="rounded-2xl border border-dashed border-[#cbd8d1] px-4 py-5 text-left text-sm font-semibold text-[#3d705d] hover:bg-[#f7faf8] lg:col-span-2" onClick={onOpenEvolution}>
        Seleccionar gráficas y exportar evolución →
      </button>
      </div>
    </div>
  );
}
