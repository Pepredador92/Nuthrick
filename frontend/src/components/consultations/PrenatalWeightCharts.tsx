import { useEffect, useId, useRef, useState } from "react";
import {
  expectedGain, iomReferenceUrl,
  type ClinicalRange, type PrenatalWeightPoint,
} from "@/src/features/consultations/prenatalMeasurements";
import { formatPatientDate } from "@/src/features/patients/patientUtils";

export const formatKg = (number: number, digits = 1) => number.toLocaleString("es-MX", {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
});
const signedKg = (number: number) => `${number > 0 ? "+" : ""}${formatKg(number)} kg`;
const gainLabels = {
  inside: "Dentro del intervalo orientativo",
  below: "Por debajo del intervalo orientativo",
  above: "Por encima del intervalo orientativo",
};

export function PrenatalGainChart({ gain, range, position, weekLabel, category, notice }: {
  gain: number;
  range: ClinicalRange | null;
  position: keyof typeof gainLabels | null;
  weekLabel: string | null;
  category: string | null;
  notice: string | null;
}) {
  const min = range ? Math.min(0, Math.floor(gain - 0.5), Math.floor(range[0])) : 0;
  const max = range ? Math.max(Math.ceil((range[1] + 1) * 2) / 2, Math.ceil(gain + 0.5)) : 1;
  const percent = (value: number) => 100 * (value - min) / (max - min);
  const ends = [weekLabel, category ? `${category} pregestacional` : null].filter(Boolean).join(" · ");
  return (
    <section className="prenatal-card prenatal-gain">
      <h3>Ganancia de peso acumulada</h3>
      {ends && <p className="prenatal-muted">{ends}</p>}
      <p className="prenatal-gain-value" data-position={position}>{signedKg(gain)}</p>
      {range && position && <>
        <div className="prenatal-gauge" aria-hidden="true">
          <div className="prenatal-gauge-track">
            <div className="prenatal-gauge-range" style={{ left: `${percent(range[0])}%`, width: `${percent(range[1]) - percent(range[0])}%` }} />
            <div className="prenatal-gauge-marker" data-position={position} style={{ left: `${percent(gain)}%` }} />
          </div>
          <div className="prenatal-gauge-axis"><span>{formatKg(min)}</span><span>{formatKg(max)} kg</span></div>
        </div>
        <p className="prenatal-reference"><strong>{formatKg(range[0], 2)} a {formatKg(range[1], 2)} kg</strong> · Intervalo orientativo</p>
        <p className="prenatal-gain-status" data-position={position}>{gainLabels[position]}</p>
      </>}
      {notice && <p className="prenatal-muted">{notice}</p>}
    </section>
  );
}

export function PrenatalEvolutionChart({ points, baseline, rate, pointNotice, referenceNotice }: {
  points: PrenatalWeightPoint[];
  baseline: number;
  rate: ClinicalRange | null;
  pointNotice: string | null;
  referenceNotice: string | null;
}) {
  const id = useId();
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  useEffect(() => {
    const element = plot.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.max(210, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const height = width < 430 ? 228 : 285;
  const left = 39;
  const right = 19;
  const top = 20;
  const bottom = height - 34;
  const maxWeek = Math.max(40, Math.ceil((points.at(-1)?.days ?? 0) / 7));
  const minWeek = Math.min(13, Math.floor((points[0]?.days ?? 91) / 7));
  const bandEnd = rate && expectedGain(40 * 7, rate);
  const values = points.map(({ weight }) => weight - baseline);
  const maxGain = Math.max(1, bandEnd ? bandEnd[1] : 0, ...values);
  const minGain = Math.min(0, ...values);
  const step = Math.max(1, Math.ceil((maxGain - minGain) / 4));
  const lower = Math.floor(minGain / step) * step;
  const upper = Math.ceil(maxGain / step) * step;
  const x = (week: number) => left + (week - minWeek) / (maxWeek - minWeek) * (width - left - right);
  const y = (gain: number) => bottom - (gain - lower) / (upper - lower) * (bottom - top);
  const start = rate && expectedGain(13 * 7, rate);
  const ticks = width < 425 ? [14, 22, 30, 40] : [14, 18, 22, 26, 30, 34, 38, 40];
  const chartPoints = points.map((point) => ({ ...point, x: x(point.days / 7), y: y(point.weight - baseline) }));
  const showData = points.length > 0;

  return (
    <section className="prenatal-card prenatal-history">
      <h3 id={id}>Seguimiento de ganancia gestacional</h3>
      <div ref={plot} className="prenatal-plot">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-labelledby={id}>
          <text x={5} y={13}>kg</text>
          {Array.from({ length: Math.round((upper - lower) / step) + 1 }, (_, index) => lower + index * step).map((value) => (
            <g key={value}>
              <line className="prenatal-gridline" x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
              <text x={left - 9} y={y(value)} textAnchor="end" dominantBaseline="central">{value}</text>
            </g>
          ))}
          {start && bandEnd && <path className="prenatal-band" d={`M ${x(13)} ${y(start[0])} L ${x(40)} ${y(bandEnd[0])} L ${x(40)} ${y(bandEnd[1])} L ${x(13)} ${y(start[1])} Z`} />}
          {showData && <polyline className="prenatal-line" points={chartPoints.map((point) => `${point.x},${point.y}`).join(" ")} />}
          {chartPoints.map((point) => (
            <circle key={point.date} className="prenatal-point" data-current={point.current || undefined} cx={point.x} cy={point.y} r={point.current ? 5.5 : 4.5}>
              <title>{formatPatientDate(point.date)} · Semana {Math.floor(point.days / 7)} + {point.days % 7} días · {signedKg(point.weight - baseline)}</title>
            </circle>
          ))}
          {ticks.map((week) => <text key={week} x={x(week)} y={bottom + 18} textAnchor="middle">{week}</text>)}
        </svg>
      </div>
      <p className="prenatal-axis-label">Semanas de gestación</p>
      <div className="prenatal-legend">
        {rate && <span data-band><i />Intervalo orientativo</span>}
        {showData && <span><i />Evolución de la paciente</span>}
      </div>
      {rate && <p className="prenatal-muted"><a href={iomReferenceUrl} target="_blank" rel="noreferrer">Referencia IOM 2009</a> · Aproximación lineal de la ganancia materna.</p>}
      {pointNotice && <p className="prenatal-muted">{pointNotice}</p>}
      {referenceNotice && <p className="prenatal-muted">{referenceNotice}</p>}
      {showData && <details className="prenatal-chart-values">
        <summary>Ver valores de la gráfica</summary>
        <table><thead><tr><th>Fecha</th><th>Semana</th><th>Ganancia</th></tr></thead><tbody>
          {points.map((point) => <tr key={point.date}><td>{formatPatientDate(point.date)}</td><td>{Math.floor(point.days / 7)}+{point.days % 7}</td><td>{signedKg(point.weight - baseline)}</td></tr>)}
        </tbody></table>
      </details>}
    </section>
  );
}
