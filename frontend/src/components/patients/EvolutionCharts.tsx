import { useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import { numericPoints } from "@/src/features/evolution/exportEvolution";
import type { LongitudinalHistory, LongitudinalSeries } from "@/src/features/evolution/longitudinal";
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

export function graphableSeries(history: LongitudinalHistory) {
  return history.series.filter(
    (series) => series.graphable && numericPoints(series).length > 0,
  );
}

export function EvolutionChartCard({
  series,
  compact = false,
}: {
  series: LongitudinalSeries;
  compact?: boolean;
}) {
  const points = numericPoints(series);
  const values = points.map((point) => point.value);
  const [low, high] = graphRange(values);
  const width = 480;
  const height = compact ? 150 : 190;
  const left = 28;
  const right = 16;
  const top = 18;
  const bottom = 30;
  const graphWidth = width - left - right;
  const graphHeight = height - top - bottom;
  const x = (index: number) =>
    points.length === 1
      ? left + graphWidth / 2
      : left + (graphWidth * index) / (points.length - 1);
  const y = (value: number) =>
    top + graphHeight - ((value - low) / (high - low)) * graphHeight;
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index)} ${y(point.value)}`).join(" ");
  const latest = points.at(-1);

  return (
    <figure className="rounded-2xl border border-[#e1e9e4] bg-[#fbfdfb] p-4">
      <figcaption className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#25453b]">{series.label}</p>
          <p className="mt-1 truncate text-xs text-[#74817d]">
            {[series.unit, series.provenance].filter(Boolean).join(" · ") || "Valores registrados"}
          </p>
        </div>
        {latest && (
          <span className="shrink-0 rounded-full bg-[#e8f2ec] px-2.5 py-1 text-xs font-semibold text-[#315e4f]">
            {latest.display_value}{latest.unit ? ` ${latest.unit}` : ""}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 block w-full" role="img" aria-label={`Gráfica de evolución de ${series.label}`}>
        {[0, 1, 2, 3].map((step) => {
          const lineY = top + (graphHeight * step) / 3;
          return <line key={step} x1={left} x2={width - right} y1={lineY} y2={lineY} stroke="#e2ebe5" strokeWidth="1" />;
        })}
        <path d={path} fill="none" stroke="#3d705d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={`${point.consultation_id}-${index}`}>
            <circle cx={x(index)} cy={y(point.value)} r="4" fill="#3d705d" stroke="white" strokeWidth="2" />
            <text x={x(index)} y={height - 8} textAnchor="middle" className="fill-[#718079] text-[10px]">{shortDate(point.consultation_date)}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

function preferredSeries(history: LongitudinalHistory) {
  const all = graphableSeries(history);
  const preferred = ["peso", "imc"]
    .map((term) => all.find((series) => series.label.toLocaleLowerCase().includes(term)))
    .filter((series): series is LongitudinalSeries => Boolean(series));
  return [...new Map([...preferred, ...all].map((series) => [series.id, series])).values()].slice(0, 2);
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
        <p className="mt-3 text-sm font-semibold text-[#426356]">Aún no hay datos numéricos para graficar.</p>
        <p className="mt-1 text-xs text-[#74817d]">Las gráficas aparecerán al registrar mediciones en más de una consulta.</p>
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
