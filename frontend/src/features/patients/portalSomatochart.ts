import type { SharedResult } from "@/src/services/patientPortal";
import type { SomatoCoordinate } from "@/src/features/evolution/somatochart";
import { portalProgress } from "./portalProgress";

export function isPortalSomatochart(result: Pick<SharedResult, "id" | "label" | "method">) {
  return result.id.startsWith("calculation:somatochart_coordinates:")
    || (/somatocarta/i.test(result.label) && /heath[\s–-]*carter/i.test(result.method));
}

// Read only the explicit X/Y pair already approved for sharing. A scalar X,
// component scores or arbitrary text cannot reconstruct a saved somatochart.
const coordinateNumber = "([+-]?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)(?:e[+-]?\\d+)?)";
const coordinatePair = new RegExp(`^X\\s*:?\\s*${coordinateNumber}\\s*[·;]\\s*Y\\s*:?\\s*${coordinateNumber}$`, "i");
export function parsePortalCoordinates(value: string): SomatoCoordinate | null {
  const match = coordinatePair.exec(value.trim().replaceAll("−", "-"));
  if (!match) return null;
  const x = Number(match[1].replace(",", "."));
  const y = Number(match[2].replace(",", "."));
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Preserve the stored pair in the existing published value, without deriving it. */
export function sharedSomatoValue(coordinates: SomatoCoordinate | undefined, fallback: string) {
  return coordinates && Number.isFinite(coordinates.x) && Number.isFinite(coordinates.y)
    ? `X: ${coordinates.x} · Y: ${coordinates.y}`
    : fallback;
}

export function portalSomatochart(result: SharedResult) {
  const points = portalProgress(result).points.map(({ key, consultationId, date, value, timestamp }, index) => ({
    key, consultationId, date, value, timestamp, ordinal: index + 1,
    coordinates: parsePortalCoordinates(value),
  }));
  const valid = points.filter((point): point is typeof point & { coordinates: SomatoCoordinate } =>
    point.coordinates !== null && Number.isFinite(point.timestamp));
  const segments: typeof valid[] = [];
  let segment: typeof valid = [];
  for (const point of points) {
    const saved = valid.find((item) => item.key === point.key);
    if (saved) segment.push(saved);
    else if (segment.length) { segments.push(segment); segment = []; }
  }
  if (segment.length) segments.push(segment);
  return { points, valid, segments };
}
