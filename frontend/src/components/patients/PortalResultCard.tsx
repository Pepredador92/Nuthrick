import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { SharedResult } from "@/src/services/patientPortal";
import { portalLabeledChart, portalDate, portalProgress } from "@/src/features/patients/portalProgress";
import { isPortalSomatochart } from "@/src/features/patients/portalSomatochart";
import { PortalSomatochartCard } from "./PortalSomatochartCard";
import { PortalProgressCard } from "./PortalProgressSummary";
import "./PortalResultCard.css";

const numberLabel = (value: number) => value.toLocaleString("es-MX", { maximumFractionDigits: 6 });

type ResultCardProps = {
  result: SharedResult;
  compact?: boolean;
  showMethod?: boolean;
};

export function PortalResultCard(props: ResultCardProps) {
  if (isPortalSomatochart(props.result)) return <PortalSomatochartCard {...props} />;
  if (props.result.conceptCode === "weight" || props.result.conceptCode === "bmi") {
    return <PortalProgressCard result={props.result} compact={props.compact} showSource={props.showMethod} />;
  }
  return <PortalNumericResultCard {...props} />;
}

function PortalNumericResultCard({ result, compact = false, showMethod = false }: ResultCardProps) {
  const id = useId();
  const chartContainer = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(400);
  const progress = portalProgress(result);
  const hasChart = progress.numeric.length > 0;
  useEffect(() => {
    const element = chartContainer.current;
    if (!element || !hasChart) return;
    const measure = () => {
      if (element.clientWidth > 0) setChartWidth(Math.min(520, element.clientWidth));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasChart]);
  const chart = portalLabeledChart(progress, chartWidth);
  const scrollable = chart && chart.width > chartWidth;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = chart?.dots.find((point) => point.key === selectedKey) ?? chart?.dots.at(-1);
  const { latest, change, points } = progress;
  const unitAfter = (value = "") => result.unit.trim() && value.trim().toLowerCase().endsWith(result.unit.trim().toLowerCase()) ? "" : result.unit;
  const changeUnit = result.unit.trim() === "%" ? "puntos porcentuales" : result.unit;
  const ChangeIcon = change === null || change === 0 ? Minus : change < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <article className={`portal-result${compact ? " portal-result-compact" : ""}`} aria-labelledby={`${id}-heading`}>
      <header className="portal-result-header">
        <div>
          <h3 id={`${id}-heading`}>{result.label}</h3>
          <p className="portal-result-value">{latest?.value || "—"} <span>{unitAfter(latest?.value)}</span></p>
          <p className="portal-result-date">{latest ? portalDate(latest.date) : "Aún sin registros"}</p>
        </div>
        <span className="portal-result-count">{points.length} {points.length === 1 ? "registro" : "registros"}</span>
      </header>
      {change !== null && <p className="portal-result-change"><ChangeIcon size={16} aria-hidden="true" /><strong>{change === 0 ? "Sin cambio" : `${change > 0 ? "+" : "−"}${numberLabel(Math.abs(change))} ${changeUnit}`}</strong><span>desde el primer registro</span></p>}
      {showMethod && result.method && <p className="portal-result-method">Método: {result.method}</p>}
      {chart && selected ? <>
        <div ref={chartContainer} className="portal-chart-scroll" tabIndex={scrollable ? 0 : undefined} role={scrollable ? "region" : undefined} aria-label={scrollable ? `Recorrido completo de ${result.label}` : undefined}>
        <svg className="portal-result-chart" style={{ width: chart.width, minWidth: chart.width }} viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-labelledby={`${id}-chart-title ${id}-chart-description`}>
          <title id={`${id}-chart-title`}>Gráfica de evolución de {result.label}</title>
          <desc id={`${id}-chart-description`}>De la consulta más antigua a la más reciente, de izquierda a derecha. {chart.dots.length} {chart.dots.length === 1 ? "punto disponible" : "puntos disponibles"}. Cada punto muestra su valor publicado. Las fechas están en el historial.</desc>
          <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#68b1bb" stopOpacity=".14" /><stop offset="100%" stopColor="#68b1bb" stopOpacity=".01" /></linearGradient></defs>
          {chart.ticks.map((tick, index) => <g key={index}><line x1={chart.left} x2={chart.width - chart.right} y1={tick.y} y2={tick.y} className="portal-chart-grid" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" /><text x={chart.left - 8} y={tick.y + 4} textAnchor="end" className="portal-chart-axis">{tick.value.toLocaleString("es-MX", { maximumSignificantDigits: 4 })}</text></g>)}
          {chart.segments.map((segment, index) => {
            const path = segment.map((point, i) => `${i ? "L" : "M"}${point.x} ${point.y}`).join(" ");
            return <g key={index}>
              {segment.length > 1 && <path d={`${path} L${segment.at(-1)!.x} ${chart.baseline} L${segment[0].x} ${chart.baseline} Z`} fill={`url(#${id}-fill)`} />}
              <path d={path} fill="none" className="portal-chart-path" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>;
          })}
          <line x1={selected.x} x2={selected.x} y1={chart.top} y2={chart.baseline} className="portal-chart-selection" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          {chart.labels.map((label, index) => <g key={label.key} className={`portal-chart-label${label.key === selected.key ? " is-selected" : ""}`}>
            <line x1={label.x} x2={chart.dots[index].x} y1={label.y + label.height} y2={chart.dots[index].y - 5} vectorEffect="non-scaling-stroke" />
            <rect x={label.x - label.width / 2} y={label.y} width={label.width} height={label.height} rx="8" vectorEffect="non-scaling-stroke" />
            <text x={label.x} y={label.y + 16} textAnchor="middle">{label.value}</text>
          </g>)}
          {chart.dots.map((point) => <g key={point.key}>
            <circle cx={point.x} cy={point.y} r={point.key === selected.key ? 4 : 3} className={`portal-chart-point${point.key === selected.key ? " is-selected" : ""}`} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            {!compact && <circle cx={point.x} cy={point.y} r="18" fill="transparent" className="cursor-pointer" onPointerDown={() => setSelectedKey(point.key)}><title>{portalDate(point.date)} · {point.value} {unitAfter(point.value)}</title></circle>}
          </g>)}
          <text x={chart.left} y={chart.height - 7} className="portal-chart-axis">{portalDate(chart.dots[0].date)}</text>
          {chart.dots.at(-1)!.timestamp !== chart.dots[0].timestamp && <text x={chart.width - chart.right} y={chart.height - 7} textAnchor="end" className="portal-chart-axis">{portalDate(chart.dots.at(-1)!.date)}</text>}
        </svg>
        </div>
        {scrollable && <p className="portal-result-note">Desliza la gráfica para recorrer todos tus registros.</p>}
        {chart.dots.length === 1 && <p className="portal-result-note">Tu punto de partida. Con otro registro podrás ver tu evolución.</p>}
        {!compact && chart.dots.length < points.length && <p className="portal-result-note">Los resultados sin un valor numérico claro o una fecha válida se conservan en el historial.</p>}
        {!compact && <div className="portal-result-explore">
          <div className="portal-result-selected" aria-live="polite" aria-atomic="true"><span>{portalDate(selected.date)}</span><strong>{selected.value} <small>{unitAfter(selected.value)}</small></strong></div>
          {chart.dots.length > 1 && <label htmlFor={`${id}-point`}><span>Explorar consultas</span><select id={`${id}-point`} aria-label={`Consulta de ${result.label}`} value={selected.key} onChange={(event) => setSelectedKey(event.target.value)}>{chart.dots.map((point) => <option key={point.key} value={point.key}>{portalDate(point.date)} · {point.value} {unitAfter(point.value)}</option>)}</select></label>}
        </div>}
      </> : <p className="portal-result-note">{points.length ? "Este resultado se muestra tal como lo compartió tu nutriólogo." : "Tu nutriólogo compartirá aquí tus resultados."}</p>}
      {!compact && points.length > 0 && <details className="portal-result-history"><summary>Ver historial de valores <span>{points.length}</span></summary><div className="portal-result-table"><table><caption className="sr-only">Historial de {result.label}</caption><thead><tr><th scope="col">Consulta</th><th scope="col">Resultado</th></tr></thead><tbody>{points.map((point) => <tr key={point.key}><td>{portalDate(point.date)}</td><td>{point.value} {unitAfter(point.value)}</td></tr>)}</tbody></table></div></details>}
    </article>
  );
}
