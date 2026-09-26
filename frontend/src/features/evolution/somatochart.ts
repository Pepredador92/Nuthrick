export type SomatoCoordinate = { x: number; y: number };
export const somatoColors = ["#b3769b", "#5e9dba", "#ad8c44", "#697fba", "#498e79"];
// Presentation geometry from Carter's somatochart (2002, fig. 5). Coordinates
// stay in the saved Heath-Carter system; Y is displayed at 1/sqrt(3) scale.
const top = { x: 0, y: 12 }, left = { x: -6, y: -6 }, right = { x: 6, y: -6 };
function curve(a: SomatoCoordinate, b: SomatoCoordinate, c: SomatoCoordinate, d: SomatoCoordinate) {
  return Array.from({ length: 25 }, (_, index) => {
    const t = index / 24, u = 1 - t;
    return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y };
  });
}
const a = curve(top, { x: -4, y: 8 }, { x: -6, y: 1 }, left);
const b = curve(left, { x: -3, y: -10 }, { x: 3, y: -10 }, right);
const c = curve(right, { x: 6, y: 1 }, { x: 4, y: 8 }, top);
export const somatoBoundary = [...a, ...b.slice(1), ...c.slice(1)];
export const somatoRegions = [
  { color: "#e3eee8", points: [{ x: 0, y: 0 }, ...c.slice(12), ...a.slice(1, 13)] },
  { color: "#f4e9df", points: [{ x: 0, y: 0 }, ...a.slice(12), ...b.slice(1, 13)] },
  { color: "#e6eef6", points: [{ x: 0, y: 0 }, ...b.slice(12), ...c.slice(1, 13)] },
];
export function somatoProjection(points: SomatoCoordinate[], width: number, height: number, padding = 28) {
  const xMin = Math.min(-8, ...points.map((point) => Math.floor(point.x - 1)));
  const xMax = Math.max(8, ...points.map((point) => Math.ceil(point.x + 1)));
  const yMin = Math.min(-10, ...points.map((point) => Math.floor(point.y - 1)));
  const yMax = Math.max(14, ...points.map((point) => Math.ceil(point.y + 1)));
  const scale = Math.min((width - padding * 2) / (xMax - xMin), (height - padding * 2) / ((yMax - yMin) / Math.sqrt(3)));
  const x = (value: number) => width / 2 + (value - (xMin + xMax) / 2) * scale;
  const y = (value: number) => height / 2 - (value - (yMin + yMax) / 2) * scale / Math.sqrt(3);
  return { x, y, xMin, xMax, yMin, yMax };
}
