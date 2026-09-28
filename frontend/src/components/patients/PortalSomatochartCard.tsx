import { useId, useState } from "react";
import type { SharedResult } from "@/src/services/patientPortal";
import { somatoBoundary, somatoColors, somatoProjection, somatoRegions } from "@/src/features/evolution/somatochart";
import { portalDate } from "@/src/features/patients/portalProgress";
import { portalSomatochart } from "@/src/features/patients/portalSomatochart";
import "./PortalSomatochartCard.css";

export function PortalSomatochartCard({ result, compact = false, showMethod = false }: {
  result: SharedResult;
  compact?: boolean;
  showMethod?: boolean;
}) {
  const id = useId();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { points, valid, segments } = portalSomatochart(result);
  const latest = valid.at(-1);
  const selected = valid.find((point) => point.key === selectedKey) ?? latest;
  const width = 400, height = 350;
  const { x, y } = somatoProjection(valid.map((point) => point.coordinates), width, height, 26);
  const polygon = (entries: Array<{ x: number; y: number }>) => entries.map((point) => `${x(point.x)},${y(point.y)}`).join(" ");
  // Draw the selected point last, so coinciding historical points remain selectable.
  const drawingOrder = selected ? [...valid.filter((point) => point.key !== selected.key), selected] : [];
  const color = (ordinal: number) => somatoColors[(ordinal - 1) % somatoColors.length];
  return (
    <article className={`portal-result portal-somato${compact ? " portal-somato-compact" : ""}`} aria-labelledby={`${id}-heading`}>
      <header className="portal-result-header">
        <div><h3 id={`${id}-heading`}>Mi somatocarta</h3><p className="portal-result-date">Tu recorrido, consulta a consulta</p></div>
        <span className="portal-result-count">{valid.length} {valid.length === 1 ? "punto" : "puntos"}</span>
      </header>
      {showMethod && result.method && <p className="portal-result-method">Método: {result.method}</p>}
      {selected ? <>
        <div className="portal-somato-body">
          <div>
            <svg viewBox={`0 0 ${width} ${height}`} className="portal-somato-chart" role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
              <title id={`${id}-title`}>Somatocarta de evolución Heath-Carter</title>
              <desc id={`${id}-description`}>{valid.length} puntos históricos. Los números siguen el orden de las consultas, de la más antigua a la más reciente. El aro destaca la consulta seleccionada.</desc>
              {somatoRegions.map((region) => <polygon key={region.color} points={polygon(region.points)} fill={region.color} />)}
              <polygon points={polygon(somatoBoundary)} fill="none" stroke="#a6bcb0" strokeWidth="1.5" />
              {[-6, -3, 0, 3, 6].map((tick) => <line key={`x-${tick}`} x1={x(tick)} x2={x(tick)} y1={y(12)} y2={y(-9)} stroke="#b4c7be" strokeDasharray="2 5" opacity=".55" />)}
              {[-6, 0, 6, 12].map((tick) => <line key={`y-${tick}`} x1={x(-6)} x2={x(6)} y1={y(tick)} y2={y(tick)} stroke="#b4c7be" strokeDasharray="2 5" opacity=".55" />)}
              <line x1={x(0)} x2={x(0)} y1={y(12)} y2={y(-9)} stroke="#9db5a7" />
              <text x={x(0)} y={y(12) - 18} textAnchor="middle" fill="#315e50" fontSize="16" fontWeight="600">Mesomorfia</text>
              <text x={x(-6)} y={y(-6) + 30} textAnchor="middle" fill="#805a3c" fontSize="16" fontWeight="600">Endomorfia</text>
              <text x={x(6)} y={y(-6) + 30} textAnchor="middle" fill="#456a86" fontSize="16" fontWeight="600">Ectomorfia</text>
              {segments.filter((segment) => segment.length > 1).map((segment, index) => <path key={index} d={segment.map((point, i) => `${i ? "L" : "M"}${x(point.coordinates.x)} ${y(point.coordinates.y)}`).join(" ")} fill="none" stroke="#527b69" strokeWidth="2" strokeDasharray="4 4" />)}
              {drawingOrder.map((point) => <g key={point.key}>
                {selected.key === point.key && <circle cx={x(point.coordinates.x)} cy={y(point.coordinates.y)} r="16" fill="none" stroke="#977134" strokeWidth="2" />}
                <circle cx={x(point.coordinates.x)} cy={y(point.coordinates.y)} r="11" fill={selected.key === point.key ? "#f4d394" : "#fff"} stroke={color(point.ordinal)} strokeWidth="2" />
                <text x={x(point.coordinates.x)} y={y(point.coordinates.y) + 4} textAnchor="middle" fill="#244639" fontSize="11" fontWeight="700">{point.ordinal}</text>
                {!compact && <circle cx={x(point.coordinates.x)} cy={y(point.coordinates.y)} r="20" fill="transparent" className="cursor-pointer" onPointerDown={() => setSelectedKey(point.key)}><title>Consulta {point.ordinal} · {portalDate(point.date)}</title></circle>}
              </g>)}
            </svg>
            <p className="portal-result-note">Cada punto representa una consulta. El aro marca la que estás viendo.</p>
          </div>
          <div className="portal-somato-context">
            <div className="portal-result-explore">
              <div className="portal-somato-selected" aria-live="polite" aria-atomic="true"><span className="portal-somato-marker" style={{ borderColor: color(selected.ordinal) }}>{selected.ordinal}</span><div><p>Consulta seleccionada</p><strong>{portalDate(selected.date)}</strong>{selected.key === latest?.key && <small>{latest.key === points.at(-1)?.key ? "Más reciente" : "Último punto disponible"}</small>}</div></div>
              {!compact && valid.length > 1 && <label htmlFor={`${id}-point`}><span>Explorar consultas</span><select id={`${id}-point`} aria-label="Consulta de la somatocarta" value={selected.key} onChange={(event) => setSelectedKey(event.target.value)}>{valid.map((point) => <option key={point.key} value={point.key}>Consulta {point.ordinal} · {portalDate(point.date)}</option>)}</select></label>}
            </div>
            {!compact && <div className="portal-somato-key" aria-label="Regiones de la somatocarta"><span>Las tres regiones</span><ul><li>Endomorfia</li><li>Mesomorfia</li><li>Ectomorfia</li></ul></div>}
          </div>
        </div>
        {valid.length === 1 && <p className="portal-result-note">Este es tu primer punto disponible. Los siguientes registros se sumarán a tu recorrido.</p>}
      </> : <p className="portal-result-note">Aún no hay un punto con las dos coordenadas y una fecha válida para mostrar tu somatocarta.</p>}
      {valid.length < points.length && <p className="portal-result-note">{showMethod ? "Algunos registros no incluyen un par X/Y válido o una fecha válida. Si las coordenadas completas ya están guardadas en la consulta, vuelve a publicar este resultado." : "Algunas consultas todavía no tienen un punto disponible. Tu nutriólogo puede revisar esos registros."}</p>}
      {!compact && points.length > 0 && <details className="portal-result-history"><summary>Ver consultas de la somatocarta <span>{points.length}</span></summary><div className="portal-result-table"><table><caption className="sr-only">Historial de la somatocarta</caption><thead><tr><th scope="col">Consulta</th><th scope="col">Punto</th>{showMethod && <th scope="col">Coordenadas publicadas</th>}</tr></thead><tbody>{points.map((point) => <tr key={point.key}><td>{portalDate(point.date)}</td><td>{valid.some((item) => item.key === point.key) ? point.ordinal : "No disponible"}</td>{showMethod && <td>{point.value}</td>}</tr>)}</tbody></table></div></details>}
    </article>
  );
}
