import { useEffect, useMemo, useRef, useState } from "react";
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

// Fit the drawing to its container before scaling, so axis text stays legible
// when the card is narrow, including in a grid on desktop.
function useChartWidth(preferredWidth: number, adaptive = true) {
  const plot = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  useEffect(() => {
    const element = plot.current;
    if (!element || !adaptive) return;
    const measure = () => setMeasuredWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [adaptive]);
  return { plot, width: adaptive && measuredWidth > 0 ? Math.min(preferredWidth, Math.max(180, measuredWidth)) : preferredWidth };
}

function spacedLabelIndices(positions: number[], minimumGap: number) {
  const last = positions.length - 1;
  const labels = new Set([last]);
  let previous = -Infinity;
  for (let index = 0; index < last; index++) {
    if (positions[index] - previous < minimumGap || positions[last] - positions[index] < minimumGap) continue;
    labels.add(index);
    previous = positions[index];
  }
  return labels;
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
    <figure className="nuth-evolution-chart min-w-0 [overflow-wrap:anywhere] rounded-2xl border border-[#e1e9e4] bg-[#fbfdfb] p-3 sm:p-4">
      <figcaption className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 font-semibold text-[#25453b]">{series.label}</p>
            {!patientView && <CategoryBadge series={series} />}
          </div>
          {!patientView && <p className="mt-1 text-xs text-[#74817d]">
            {[series.unit, series.provenance].filter(Boolean).join(" · ") || "Valores registrados"}
          </p>}
        </div>
        {latest && (
          <span
            className="max-w-full rounded-full px-2.5 py-1 text-xs font-semibold"
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
  const { plot, width } = useChartWidth(480);
  const height = compact ? 150 : 190;
  const ticks = [0, 1, 2, 3].map((step) =>
    (high - (high - low) * step / 3).toLocaleString("es-MX", { maximumFractionDigits: 1 }));
  const left = Math.max(40, 12 + Math.max(...ticks.map((tick) => tick.length)) * 7);
  const right = 28;
  const top = 25;
  const bottom = 30;
  const graphWidth = width - left - right;
  const graphHeight = height - top - bottom;
  const timestamps = points.map((point) => new Date(point.consultation_date).getTime());
  const duration = timestamps.at(-1)! - timestamps[0];
  const x = (index: number) => duration > 0 ? left + graphWidth * (timestamps[index] - timestamps[0]) / duration : left + graphWidth / 2;
  const positions = points.map((_, index) => x(index));
  const dateIndices = spacedLabelIndices(positions, Math.max(52, graphWidth / 4));
  const labelWidth = (label: string) => Math.min(width - 12, label.length * 7);
  const valuePositions = points.map((point, index) => {
    const margin = labelWidth(point.display_value) / 2 + 5;
    return Math.min(width - margin, Math.max(margin, positions[index]));
  });
  const valueIndices = spacedLabelIndices(valuePositions, Math.max(32, ...points.map(point => labelWidth(point.display_value) + 9)));
  const y = (value: number) => top + graphHeight - ((value - low) / (high - low)) * graphHeight;
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index)} ${y(point.value)}`).join(" ");
  const latest = points.at(-1);

  return (
    <ChartFrame series={series} latest={latest}>
      <div ref={plot} className="mt-3 min-w-0">
        <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label={`Gráfica de evolución de ${series.label}`}>
          {ticks.map((label, step) => {
            const lineY = top + (graphHeight * step) / 3;
            return <g key={step}><line x1={left} x2={width - right} y1={lineY} y2={lineY} stroke="#e2ebe5" strokeWidth="1" /><text x={left - 8} y={lineY + 4} textAnchor="end" className="fill-[#718079] text-[11px]">{label}</text></g>;
          })}
          <path d={path} fill="none" stroke={style.line} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => (
            <g key={`${point.consultation_id}-${index}`}>
              <title>{`${shortDate(point.consultation_date)} · ${point.display_value} ${point.unit ?? ""}`}</title>
              <circle cx={x(index)} cy={y(point.value)} r="4" fill={style.line} stroke="white" strokeWidth="2" />
              {valueIndices.has(index) && (
                <text x={valuePositions[index]} y={y(point.value) - 10} textAnchor="middle"
                  className="evolution-point-value fill-[var(--nuth-ink)] text-xs font-semibold"
                  stroke="var(--nuth-surface)" strokeWidth="4" paintOrder="stroke">
                  {point.display_value}
                </text>
              )}
              {dateIndices.has(index) && <text x={x(index)} y={height - 8} textAnchor="middle" className="fill-[#718079] text-[11px]">{shortDate(point.consultation_date)}</text>}
            </g>
          ))}
        </svg>
      </div>
      <details className="mt-2 border-t border-[var(--nuth-line)] pt-2 text-xs">
        <summary className="cursor-pointer font-semibold text-[var(--nuth-ink)]">Ver valores por consulta</summary>
        <ul aria-label={`Valores de ${series.label}`} className="mt-2 max-h-52 space-y-1 overflow-y-auto">
          {[...points].reverse().map((point, index) => (
            <li key={`${point.consultation_id}-${index}`} className="flex flex-wrap justify-between gap-x-3 rounded-lg bg-white px-2 py-1.5">
              <span className="text-[var(--nuth-muted)]">{chartDate(point.consultation_date)}</span>
              <strong className="text-[var(--nuth-ink)]">{point.display_value}{point.unit ? ` ${point.unit}` : ""}</strong>
            </li>
          ))}
        </ul>
      </details>
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
  const { plot, width } = useChartWidth(patientView ? 560 : 520, !patientView);
  const narrow = !patientView && width < 340;
  const height = narrow ? Math.max(210, Math.round(width * .83)) : compact ? 350 : 400;
  const { x, y, xMin, xMax, yMin, yMax } = somatoProjection(points, width, height, patientView ? 48 : narrow ? 30 : 40);
  const latest = points.at(-1);
  const polygon = (entries: Array<{ x: number; y: number }>) => entries.map((point) => `${x(point.x)},${y(point.y)}`).join(" ");
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(point.x)} ${y(point.y)}`).join(" ");
  return (
    <ChartFrame series={series} latest={patientView ? undefined : latest ? { ...latest, display_value: coordinateLabel(latest), unit: null } : undefined} patientView={patientView}>
      <div ref={plot} className="mt-3 min-w-0">
        <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label="Somatocarta de evolución Heath-Carter">
          {somatoRegions.map((region) => <polygon key={region.color} points={polygon(region.points)} fill={region.color} />)}
          <polygon points={polygon(somatoBoundary)} fill="none" stroke="#b4c6bf" strokeWidth="1.5"/>
          {[-6, -3, 0, 3, 6].map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={y(yMax)} y2={y(yMin)} stroke="#dce5e0" strokeDasharray="2 5"/><text x={x(tick)} y={y(yMin) + 14} textAnchor="middle" className="fill-[#74817d] text-[11px]">{tick}</text></g>)}
          {[-6, 0, 6, 12].map((tick) => <g key={tick}><line x1={x(xMin)} x2={x(xMax)} y1={y(tick)} y2={y(tick)} stroke="#dce5e0" strokeDasharray="2 5"/><text x={x(xMin) - 6} y={y(tick) + 4} textAnchor="end" className="fill-[#74817d] text-[11px]">{tick}</text></g>)}
          <line x1={x(0)} x2={x(0)} y1={y(12)} y2={y(-9)} stroke="#96afa3"/>
          <line x1={x(-6)} x2={x(6)} y1={y(-6)} y2={y(6)} stroke="#96afa3" strokeDasharray="4 4"/>
          <line x1={x(-6)} x2={x(6)} y1={y(6)} y2={y(-6)} stroke="#96afa3" strokeDasharray="4 4"/>
          <text x={x(0)} y={y(12) - (patientView ? 18 : 12)} textAnchor="middle" className="fill-[#315e50] text-[12px] font-bold">MESOMORFIA</text>
          {!narrow && <>
            <text x={Math.max(82, x(-6) - (patientView ? 10 : 0))} y={y(-6) + (patientView ? 28 : 18)} textAnchor="end" className="fill-[#805a3c] text-[11px] font-bold">ENDOMORFIA</text>
            <text x={Math.min(width - 76, x(6) + (patientView ? 10 : 0))} y={y(-6) + (patientView ? 28 : 18)} textAnchor="start" className="fill-[#456a86] text-[11px] font-bold">ECTOMORFIA</text>
          </>}
          {points.length > 1 && <path d={path} fill="none" stroke="#466b63" strokeWidth="1.8" strokeDasharray="4 3"/>}
          {points.map((point, index) => <g key={`${point.consultation_id}-${index}`}>
            <title>{patientView ? `${index + 1} · ${chartDate(point.consultation_date)}` : `${index + 1} · ${chartDate(point.consultation_date)} · ${coordinateLabel(point)}`}</title>
            {index === points.length - 1 && <circle cx={x(point.x)} cy={y(point.y)} r={patientView ? 8.5 : 11} fill="none" stroke="#315e4f" strokeWidth="1.5"/>}
            <circle cx={x(point.x)} cy={y(point.y)} r={patientView ? 5.5 : 7} fill={somatoColors[index % somatoColors.length]} stroke="white" strokeWidth="1.5"/>
            <text x={x(point.x)} y={y(point.y) + (patientView ? 2.5 : 3)} textAnchor="middle" className={patientView ? "fill-white text-[8px] font-bold" : "fill-white text-[9px] font-bold"}>{index + 1}</text>
          </g>)}
        </svg>
      </div>
      {!patientView && <p className="mt-1 text-center text-xs text-[#74817d]">X = ectomorfia − endomorfia · Y = 2 × mesomorfia − endomorfia − ectomorfia</p>}
      <ol aria-label="Consultas de la somatocarta" className="mt-2 max-h-52 space-y-2 overflow-y-auto text-xs">{points.map((point, index) => <li key={point.consultation_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white p-2"><span className="grid size-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: somatoColors[index % somatoColors.length] }}>{index + 1}</span><span>{chartDate(point.consultation_date)}</span>{!patientView && <span className="text-[#74817d]">{coordinateLabel(point)}</span>}{historicalClassification(point)?.label && <span>{historicalClassification(point)!.label}</span>}{index === points.length - 1 && <strong className="ml-auto text-[#315e4f]">Actual</strong>}</li>)}</ol>
      <ul aria-label="Regiones de la somatocarta" className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2 text-[11px] text-[#65766e]">
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
    <div className="min-w-0 space-y-4">
      {onReferencesChange && <ProgressReferenceControls series={series} value={references} onChange={onReferencesChange} />}
      <ClinicalProgressSummary series={series} contextSeries={history?.series} references={references} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
        <label className="min-w-0 text-xs font-semibold text-[#60766a]">Buscar una gráfica
          <input className="nuth-input mt-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Peso, cintura, pliegue…" />
        </label>
        <label className="min-w-0 text-xs font-semibold text-[#60766a]">Tipo de registro
          <select className="nuth-input mt-1" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Todos</option>
            {Object.entries(evolutionCategoryStyles).map(([key, style]) => <option key={key} value={key}>{style.label}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-[#60766a]">{series.length} gráficas disponibles con registros guardados. Cada método y equipo conserva su propia serie.</p>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      {series.filter((item) => (filter === "all" || item.category === filter) && item.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((series) => <EvolutionChartCard key={series.id} series={series} compact />)}
      <button type="button" className="rounded-2xl border border-dashed border-[#cbd8d1] px-4 py-5 text-left text-sm font-semibold text-[#3d705d] hover:bg-[#f7faf8] lg:col-span-2" onClick={onOpenEvolution}>
        Seleccionar gráficas y exportar evolución →
      </button>
      </div>
    </div>
  );
}
