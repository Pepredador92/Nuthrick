import { describe, expect, it } from "vitest";
import type { SharedResult } from "@/src/services/patientPortal";
import { sanitizePortalContent } from "../../../../supabase/functions/agenda/portal-content";
import { isPortalSomatochart, parsePortalCoordinates, portalSomatochart, sharedSomatoValue } from "./portalSomatochart";

const result = (values: string[]): SharedResult => ({ id: "calculation:somatochart_coordinates:somatochart_coordinates:Heath-Carter:2:coordenadas", label: "Coordenadas de somatocarta", unit: "coordenadas", method: "Heath-Carter", points: values.map((value, index) => ({ consultationId: `c${index}`, date: `2026-09-${String(index + 1).padStart(2, "0")}`, value })) });

describe("published somatochart coordinates", () => {
  it("recognizes the saved somatochart identity and does not treat component scores as coordinates", () => {
    expect(isPortalSomatochart(result([]))).toBe(true);
    expect(isPortalSomatochart({ id: "legacy", label: "Coordenadas de somatocarta", method: "Heath-Carter · v2" })).toBe(true);
    for (const component of ["endomorphy", "mesomorphy", "ectomorphy"]) expect(isPortalSomatochart({ ...result([]), id: `calculation:somatotype_${component}:`, label: component })).toBe(false);
    expect(isPortalSomatochart({ ...result([]), id: "other", label: "Otro resultado" })).toBe(false);
  });
  it("reads both signed coordinates including zero, decimal commas and precise scientific notation", () => {
    expect(parsePortalCoordinates("X: -1.2 · Y: 3.4")).toEqual({ x: -1.2, y: 3.4 });
    expect(parsePortalCoordinates("X: −1,25 · Y: +0,125")).toEqual({ x: -1.25, y: 0.125 });
    expect(parsePortalCoordinates("X 0; Y -0")).toEqual({ x: 0, y: -0 });
    expect(parsePortalCoordinates("X: 1.23e-8 · Y: -2.5e+0")).toEqual({ x: 1.23e-8, y: -2.5 });
  });
  it.each(["", "-1.2", "X: 2", "Y: 2", "X: · Y: 0", "X: NaN · Y: 0", "X: Infinity · Y: 0", "X: 1e999 · Y: 0", "X: 2 · Y: 3 · X: 4", "<2 · 3", "2, 3", "X: 2 · Y: 3 Texto adicional"])("rejects incomplete or malformed coordinates %s", (value) => {
    expect(parsePortalCoordinates(value)).toBeNull();
  });
  it("preserves chronology and gaps, without reconstructing missing coordinates", () => {
    const input = result(["X: -3 · Y: 2", "-2", "X: -1 · Y: 0", "X: 0 · Y: 0"]);
    input.points.reverse();
    const before = structuredClone(input);
    const chart = portalSomatochart(input);
    expect(chart.valid.map((point) => point.ordinal)).toEqual([1, 3, 4]);
    expect(chart.valid.map((point) => point.coordinates)).toEqual([{ x: -3, y: 2 }, { x: -1, y: 0 }, { x: 0, y: 0 }]);
    expect(chart.segments.map((segment) => segment.length)).toEqual([1, 2]);
    expect(input).toEqual(before);
  });
  it("keeps coinciding points distinct and excludes invalid dates", () => {
    const input = result(["X: 0 · Y: 0", "X: 0 · Y: 0", "X: 2 · Y: 3"]);
    input.points[2].date = "sin fecha";
    const chart = portalSomatochart(input);
    expect(chart.points).toHaveLength(3);
    expect(chart.valid).toHaveLength(2);
    expect(chart.valid[0].key).not.toBe(chart.valid[1].key);
  });
  it("publishes the exact saved pair through the unchanged sanitization contract", () => {
    const coordinates = { x: -1.23456789012345, y: 3.45678901234567 };
    const value = sharedSomatoValue(coordinates, "-1.2");
    const shared = sanitizePortalContent({ goal: "", instructions: "", consultations: [], results: [{ ...result([]), points: [{ consultationId: "00000000-0000-0000-0000-000000000001", date: "2026-09-01", value }] }] });
    expect(parsePortalCoordinates(shared.results[0].points[0].value)).toEqual(coordinates);
    expect(sharedSomatoValue(undefined, "-1.2")).toBe("-1.2");
    expect(sharedSomatoValue({ x: 1, y: NaN }, "sin dato")).toBe("sin dato");
  });
});
