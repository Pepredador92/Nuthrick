import { useMemo, useState } from "react";
import { EmptyState } from "@/src/components/ui/Status";
import { formatPatientDate } from "@/src/features/patients/patientUtils";
import type { PatientMeasurement } from "@/src/types/domain";

type MetricKey = "weight_kg" | "bmi";

const metrics: Array<{ key: MetricKey; label: string; unit: string }> = [
  { key: "weight_kg", label: "Peso", unit: "kg" },
  { key: "bmi", label: "IMC", unit: "" },
];

export function PatientEvolutionChart({
  measurements,
  compact = false,
}: {
  measurements: PatientMeasurement[];
  compact?: boolean;
}) {
  const [metric, setMetric] = useState<MetricKey>("weight_kg");
  const selected = metrics.find((item) => item.key === metric) ?? metrics[0];
  const points = useMemo(
    () =>
      measurements
        .slice()
        .sort(
          (a, b) =>
            new Date(a.measured_at).getTime() -
            new Date(b.measured_at).getTime(),
        )
        .map((item) => ({
          item,
          value: Number(item[metric]),
        }))
        .filter((point) => Number.isFinite(point.value)),
    [measurements, metric],
  );
  if (points.length < 2) {
    return (
      <EmptyState
        title="Aún no hay suficientes mediciones"
        description="Registra al menos dos mediciones para mostrar la evolución."
      />
    );
  }
  const width = compact ? 520 : 720;
  const height = compact ? 170 : 250;
  const padding = { top: 18, right: 18, bottom: 38, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || Math.max(max * 0.05, 1);
  const coordinate = (value: number, index: number) => {
    const x =
      padding.left +
      (points.length === 1 ? 0 : (index / (points.length - 1)) * chartWidth);
    const y = padding.top + ((max - value) / spread) * chartHeight;
    return { x, y };
  };
  const line = points
    .map((point, index) => {
      const { x, y } = coordinate(point.value, index);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#82908a]">
            Evolución
          </p>
          <p className="mt-1 text-sm text-[#74817d]">
            {selected.label} {selected.unit && `(${selected.unit})`}
          </p>
        </div>
        <label className="text-sm text-[#74817d]">
          <span className="sr-only">Variable de evolución</span>
          <select
            className="nuth-input !w-auto !py-1.5"
            value={metric}
            onChange={(event) => setMetric(event.target.value as MetricKey)}
          >
            {metrics.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label={`Evolución de ${selected.label.toLowerCase()}`}
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto min-w-[460px] w-full"
        >
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={height - padding.bottom}
            stroke="#dfe8e1"
          />
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="#dfe8e1"
          />
          <polyline
            points={line}
            fill="none"
            stroke="#3d705d"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((point, index) => {
            const { x, y } = coordinate(point.value, index);
            return (
              <g key={point.item.id}>
                <circle cx={x} cy={y} r="6" fill="#efbd6b" stroke="#fff" strokeWidth="3" />
                {index === 0 || index === points.length - 1 ? (
                  <text x={x} y={y - 12} textAnchor="middle" fontSize="12" fill="#315e4f">
                    {point.value.toFixed(2)}
                  </text>
                ) : null}
                <text x={x} y={height - 14} textAnchor="middle" fontSize="10" fill="#82908a">
                  {formatPatientDate(point.item.measured_at)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
