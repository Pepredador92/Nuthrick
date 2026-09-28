import { useId, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { SharedResult } from "@/src/services/patientPortal";
import { portalChart, portalDate, portalProgress } from "@/src/features/patients/portalProgress";
import "./PortalResultCard.css";

const numberLabel = (value: number) => value.toLocaleString("es-MX", { maximumFractionDigits: 6 });

export function PortalResultCard({ result, compact = false, showMethod = false }: {
  result: SharedResult;
  compact?: boolean;
  showMethod?: boolean;
}) {
  const id = useId();
  const progress = portalProgress(result);
  const chart = portalChart(progress);
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
        <svg className="portal-result-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-labelledby={`${id}-chart-title ${id}-chart-description`}>
          <title id={`${id}-chart-title`}>Gráfica de evolución de {result.label}</title>
          <desc id={`${id}-chart-description`}>De la consulta más antigua a la más reciente, de izquierda a derecha. {chart.dots.length} {chart.dots.length === 1 ? "punto disponible" : "puntos disponibles"}. Los valores y fechas están en el historial.</desc>
          <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6aab92" stopOpacity=".24" /><stop offset="100%" stopColor="#6aab92" stopOpacity=".02" /></linearGradient></defs>
          {chart.ticks.map((tick, index) => <g key={index}><line x1={chart.left} x2={chart.width - chart.right} y1={tick.y} y2={tick.y} stroke="#dfe9e3" strokeDasharray="3 5" /><text x={chart.left - 8} y={tick.y + 4} textAnchor="end" fill="#61776c" fontSize="12">{tick.value.toLocaleString("es-MX", { maximumSignificantDigits: 4 })}</text></g>)}
          {chart.segments.map((segment, index) => {
            const path = segment.map((point, i) => `${i ? "L" : "M"}${point.x} ${point.y}`).join(" ");
            return <g key={index}>
              {segment.length > 1 && <path d={`${path} L${segment.at(-1)!.x} ${chart.baseline} L${segment[0].x} ${chart.baseline} Z`} fill={`url(#${id}-fill)`} />}
              <path d={path} fill="none" stroke="#36775e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </g>;
          })}
          <line x1={selected.x} x2={selected.x} y1={chart.top} y2={chart.baseline} stroke="#b79248" strokeDasharray="3 4" />
          {chart.dots.map((point) => <g key={point.key}>
            <circle cx={point.x} cy={point.y} r={point.key === selected.key ? 9 : 5} fill={point.key === selected.key ? "#f0c778" : "#36775e"} stroke={point.key === selected.key ? "#99742f" : "white"} strokeWidth="2" />
            {!compact && <circle cx={point.x} cy={point.y} r="18" fill="transparent" className="cursor-pointer" onPointerDown={() => setSelectedKey(point.key)}><title>{portalDate(point.date)} · {point.value} {unitAfter(point.value)}</title></circle>}
          </g>)}
          <text x={chart.left} y={chart.height - 7} fill="#61776c" fontSize="12">{portalDate(chart.dots[0].date)}</text>
          {chart.dots.at(-1)!.timestamp !== chart.dots[0].timestamp && <text x={chart.width - chart.right} y={chart.height - 7} textAnchor="end" fill="#61776c" fontSize="12">{portalDate(chart.dots.at(-1)!.date)}</text>}
        </svg>
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
