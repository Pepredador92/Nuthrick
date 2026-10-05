import { parseMeasurementNumber } from "@/src/features/calculations/measurementNumber";
import type { SharedResult } from "@/src/services/patientPortal";

export function portalTimestamp(date: string) {
  return Date.parse(date.length === 10 ? `${date}T12:00:00` : date);
}

export function portalDate(value: string) {
  const timestamp = portalTimestamp(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
    : "Fecha no disponible";
}

function sharedNumber(value: string, unit: string) {
  // Published values are display strings. Do not guess whether a lone comma
  // followed by three digits is a decimal or a thousands separator.
  const withoutUnit = unit && value.trim().toLowerCase().endsWith(unit.trim().toLowerCase())
    ? value.trim().slice(0, -unit.trim().length).trim()
    : value.trim();
  if (/^[+-]?\d+,[0-9]{3}$/.test(withoutUnit)) return undefined;
  const grouped = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(withoutUnit);
  return parseMeasurementNumber(grouped ? withoutUnit.replaceAll(",", "") : withoutUnit).value;
}

export function portalProgress(result: SharedResult) {
  const points = result.points.map((point, index) => ({
    ...point,
    key: `${point.consultationId}-${index}`,
    timestamp: portalTimestamp(point.date),
    number: sharedNumber(point.value, result.unit),
  })).sort((a, b) => {
    if (!Number.isFinite(a.timestamp)) return Number.isFinite(b.timestamp) ? 1 : 0;
    if (!Number.isFinite(b.timestamp)) return -1;
    return a.timestamp - b.timestamp;
  });
  const numeric = points.filter((point): point is typeof point & { number: number } =>
    point.number !== undefined && Number.isFinite(point.timestamp));
  const first = points[0];
  const latest = points.at(-1);
  const change = points.length > 1 && first?.number !== undefined && latest?.number !== undefined
    && Number.isFinite(first.timestamp) && Number.isFinite(latest.timestamp)
    ? Number((latest.number - first.number).toFixed(8)) : null;
  return { points, numeric, latest, change };
}

export type PortalProgress = ReturnType<typeof portalProgress>;

export function portalChart(progress: PortalProgress, dimensions: { width?: number; height?: number; top?: number } = {}) {
  const { points, numeric } = progress;
  if (!numeric.length) return null;
  const width = dimensions.width ?? 400, height = dimensions.height ?? 208, left = 50, right = 22, top = dimensions.top ?? 24, bottom = 34;
  const values = numeric.map((point) => point.number);
  const min = Math.min(...values), max = Math.max(...values);
  const padding = max === min ? Math.max(Math.abs(min) * 0.05, 1) : (max - min) * 0.2;
  const low = min >= 0 ? Math.max(0, min - padding) : min - padding;
  const high = max + padding;
  const start = numeric[0].timestamp, end = numeric.at(-1)!.timestamp;
  const x = (timestamp: number) => end > start ? left + (timestamp - start) / (end - start) * (width - left - right) : (left + width - right) / 2;
  const y = (value: number) => top + (high - value) / (high - low) * (height - top - bottom);
  const dots = numeric.map((point) => ({ ...point, x: x(point.timestamp), y: y(point.number) }));
  const segments: typeof dots[] = [];
  let segment: typeof dots = [];
  for (const point of points) {
    const dot = dots.find((item) => item.key === point.key);
    if (dot) segment.push(dot);
    else if (segment.length) { segments.push(segment); segment = []; }
  }
  if (segment.length) segments.push(segment);
  return { width, height, left, right, top, baseline: height - bottom, dots, segments,
    ticks: [high, (high + low) / 2, low].map((value) => ({ value, y: y(value) })) };
}

/** Keep the time scale intact; only move the value badges when dates cluster.
 * Extra records get horizontal room rather than smaller text or hidden values.
 */
export function portalLabeledChart(progress: PortalProgress, availableWidth = 400) {
  const gap = 8;
  const sizes = progress.numeric.map((point) => Math.max(42, point.value.trim().length * 7 + 20));
  const width = Math.max(availableWidth, 72 + sizes.reduce((sum, size) => sum + size, 0) + gap * Math.max(0, sizes.length - 1));
  const chart = portalChart(progress, { width, height: 240, top: 44 });
  if (!chart) return null;
  const labels = chart.dots.map((point, index) => ({
    key: point.key,
    x: Math.max(chart.left + sizes[index] / 2, Math.min(point.x, width - chart.right - sizes[index] / 2)),
    y: point.y - 34,
    width: sizes[index],
    height: 24,
    value: point.value.trim(),
  }));
  for (let i = 1; i < labels.length; i++) {
    labels[i].x = Math.max(labels[i].x, labels[i - 1].x + (labels[i - 1].width + labels[i].width) / 2 + gap);
  }
  labels.at(-1)!.x = Math.min(labels.at(-1)!.x, width - chart.right - labels.at(-1)!.width / 2);
  for (let i = labels.length - 2; i >= 0; i--) {
    labels[i].x = Math.min(labels[i].x, labels[i + 1].x - (labels[i + 1].width + labels[i].width) / 2 - gap);
  }
  return { ...chart, labels };
}
