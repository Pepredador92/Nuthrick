import { useEffect, useMemo, useState } from "react";
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
  children,
}: {
  series: LongitudinalSeries;
  latest?: LongitudinalPoint;
  children: React.ReactNode;
}) {
  const style = evolutionCategoryStyles[series.category];
  return (
    <figure className="rounded-2xl border border-[#e1e9e4] bg-[#fbfdfb] p-4">
      <figcaption className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-[#25453b]">{series.label}</p>
            <CategoryBadge series={series} />
          </div>
          <p className="mt-1 truncate text-xs text-[#74817d]">
            {[series.unit, series.provenance].filter(Boolean).join(" · ") || "Valores registrados"}
          </p>
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
  const left = 28;
  const right = 16;
  const top = 18;
  const bottom = 30;
  const graphWidth = width - left - right;
  const graphHeight = height - top - bottom;
  const x = (index: number) => points.length === 1 ? left + graphWidth / 2 : left + (graphWidth * index) / (points.length - 1);
  const y = (value: number) => top + graphHeight - ((value - low) / (high - low)) * graphHeight;
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index)} ${y(point.value)}`).join(" ");
  const latest = points.at(-1);

  return (
    <ChartFrame series={series} latest={latest}>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 block w-full" role="img" aria-label={`Gráfica de evolución de ${series.label}`}>
        {[0, 1, 2, 3].map((step) => {
          const lineY = top + (graphHeight * step) / 3;
          return <line key={step} x1={left} x2={width - right} y1={lineY} y2={lineY} stroke="#e2ebe5" strokeWidth="1" />;
        })}
        <path d={path} fill="none" stroke={style.line} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={`${point.consultation_id}-${index}`}>
            <circle cx={x(index)} cy={y(point.value)} r="4" fill={style.line} stroke="white" strokeWidth="2" />
            <text x={x(index)} y={height - 8} textAnchor="middle" className="fill-[#718079] text-[10px]">{shortDate(point.consultation_date)}</text>
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

export function SomatochartCard({ series, compact = false }: { series: LongitudinalSeries; compact?: boolean }) {
  const points = somatochartPoints(series);
  const style = evolutionCategoryStyles[series.category];
  const width = 520;
  const height = compact ? 306 : 386;
  const padding = 50;
  const chartSize = Math.min(width - padding * 2, height - padding * 2 - 34);
  const chartX = (width - chartSize) / 2;
  const chartY = 30;
  const limit = Math.max(4, ...points.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]).map((value) => Math.ceil(value + 1)));
  const pointX = (value: number) => chartX + ((value + limit) / (limit * 2)) * chartSize;
  const pointY = (value: number) => chartY + chartSize - ((value + limit) / (limit * 2)) * chartSize;
  const latest = points.at(-1);
  const path = points.map((point, index) => `${index ? "L" : "M"}${pointX(point.x)} ${pointY(point.y)}`).join(" ");
  const topX = chartX + chartSize / 2;
  const topY = chartY;
  const leftX = chartX;
  const leftY = chartY + chartSize;
  const rightX = chartX + chartSize;
  const rightY = chartY + chartSize;
  const centerX = topX;
  const centerY = chartY + chartSize * 0.66;
  const top = `${topX},${topY}`;
  const left = `${leftX},${leftY}`;
  const right = `${rightX},${rightY}`;
  const center = `${centerX},${centerY}`;
  const topLeft = `${(topX + leftX) / 2},${(topY + leftY) / 2}`;
  const topRight = `${(topX + rightX) / 2},${(topY + rightY) / 2}`;
  const bottomLeft = `${(leftX + centerX) / 2},${(leftY + centerY) / 2}`;
  const bottomRight = `${(rightX + centerX) / 2},${(rightY + centerY) / 2}`;

  return (
    <ChartFrame
      series={series}
      latest={latest ? { ...latest, display_value: coordinateLabel(latest), unit: null } : undefined}
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 block w-full" role="img" aria-label="Somatocarta de evolución Heath-Carter">
        <polygon points={`${top} ${left} ${right}`} fill="#f8fbf8" stroke="#b8cbc0" strokeWidth="1.5" />
        <polygon points={`${top} ${topRight} ${center} ${topLeft}`} fill="#e7f1ea" fillOpacity=".94" />
        <polygon points={`${left} ${bottomLeft} ${center} ${topLeft}`} fill="#f4e9dc" fillOpacity=".92" />
        <polygon points={`${right} ${topRight} ${center} ${bottomRight}`} fill="#e6edf3" fillOpacity=".9" />
        <line x1={chartX} x2={chartX + chartSize} y1={chartY + chartSize} y2={chartY + chartSize} stroke="#98aaa0" strokeWidth="1" />
        <line x1={chartX + chartSize / 2} x2={chartX + chartSize / 2} y1={chartY} y2={chartY + chartSize} stroke="#ffffff" strokeWidth="1" strokeDasharray="4 5" />
        <text x={chartX + chartSize / 2} y={chartY - 9} textAnchor="middle" className="fill-[#315e50] text-[11px] font-bold tracking-[.12em]">MESOMORFIA</text>
        <text x={chartX - 5} y={chartY + chartSize + 19} textAnchor="start" className="fill-[#805a3c] text-[11px] font-bold tracking-[.1em]">ENDOMORFIA</text>
        <text x={chartX + chartSize + 5} y={chartY + chartSize + 19} textAnchor="end" className="fill-[#456a86] text-[11px] font-bold tracking-[.1em]">ECTOMORFIA</text>
        {points.length > 1 && <path d={path} fill="none" stroke={style.line} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {points.map((point, index) => (
          <g key={`${point.consultation_id}-${index}`}>
            <title>{`${shortDate(point.consultation_date)} · ${coordinateLabel(point)}`}</title>
            <circle cx={pointX(point.x)} cy={pointY(point.y)} r={index === points.length - 1 ? 6 : 4} fill={index === points.length - 1 ? style.line : "white"} stroke={style.line} strokeWidth="2.2" />
            <text x={pointX(point.x) + 8} y={pointY(point.y) - 8} className="fill-[#63756d] text-[10px]">{shortDate(point.consultation_date)}</text>
          </g>
        ))}
        <text x={chartX + chartSize / 2} y={height - 7} textAnchor="middle" className="fill-[#718079] text-[10px]">X · ectomorfia − endomorfia</text>
      </svg>
      <ul aria-label="Regiones de la somatocarta" className="mt-2 grid gap-2 text-[11px] text-[#65766e] sm:grid-cols-3">
        <li className="flex items-center gap-2 rounded-xl bg-[#f8eee4] px-2.5 py-2"><SomatotypeGlyph variant="endo" /><span><strong className="block text-[#805a3c]">Endomorfia</strong><span>Adiposidad relativa</span></span></li>
        <li className="flex items-center gap-2 rounded-xl bg-[#edf5ef] px-2.5 py-2"><SomatotypeGlyph variant="meso" /><span><strong className="block text-[#315e50]">Mesomorfia</strong><span>Robustez relativa</span></span></li>
        <li className="flex items-center gap-2 rounded-xl bg-[#edf2f7] px-2.5 py-2"><SomatotypeGlyph variant="ecto" /><span><strong className="block text-[#456a86]">Ectomorfia</strong><span>Linealidad relativa</span></span></li>
      </ul>
      <p className="mt-2 text-xs text-[#74817d]">Coordenadas Heath-Carter guardadas por consulta; la gráfica no clasifica ni emite diagnósticos.</p>
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
  return [...new Map([...preferred, ...(somatochart ? [somatochart] : []), ...all].map((series) => [series.id, series])).values()].slice(0, 3);
}

export function PatientEvolutionCharts({
  patientId,
  onOpenEvolution,
}: {
  patientId: string;
  onOpenEvolution: () => void;
}) {
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
    <div className="grid gap-4 lg:grid-cols-2">
      {series.map((series) => <EvolutionChartCard key={series.id} series={series} compact />)}
      <button type="button" className="rounded-2xl border border-dashed border-[#cbd8d1] px-4 py-5 text-left text-sm font-semibold text-[#3d705d] hover:bg-[#f7faf8] lg:col-span-2" onClick={onOpenEvolution}>
        Ver todas las gráficas y exportar evolución →
      </button>
    </div>
  );
}
