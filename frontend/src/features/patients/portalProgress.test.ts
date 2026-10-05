import { describe, expect, it } from "vitest";
import type { SharedResult } from "@/src/services/patientPortal";
import { portalChart, portalLabeledChart, portalProgress } from "./portalProgress";

const result = (values: string[]): SharedResult => ({ id: "weight", label: "Peso", unit: "kg", method: "", points: values.map((value, index) => ({ consultationId: `c${index}`, date: `2026-09-${String(index + 1).padStart(2, "0")}`, value })) });

describe("published patient progress", () => {
  it("plots 100 → 92 kg from left to right and downward without changing published points", () => {
    const input = result(["100", "92"]);
    input.points.reverse();
    const before = structuredClone(input);
    const progress = portalProgress(input);
    const chart = portalChart(progress)!;
    expect(progress.change).toBe(-8);
    expect(progress.latest?.value).toBe("92");
    expect(chart.dots[0].x).toBeLessThan(chart.dots[1].x);
    expect(chart.dots[0].y).toBeLessThan(chart.dots[1].y);
    expect(input).toEqual(before);
  });
  it("orders timestamps by time, including timezone offsets", () => {
    const input = result(["100", "92"]);
    input.points[0].date = "2026-09-02T00:00:00+03:00";
    input.points[1].date = "2026-09-01T23:00:00Z";
    expect(portalProgress(input).numeric.map((point) => point.number)).toEqual([100, 92]);
  });
  it("accepts decimal points, decimal commas, units and zero; keeps decimal differences clean", () => {
    expect(portalProgress(result(["87.6", "87,4 kg", "0"])).numeric.map((point) => point.number)).toEqual([87.6, 87.4, 0]);
    expect(portalProgress(result(["87.6", "87,4"])).change).toBe(-0.2);
    expect(portalProgress(result(["1,234.5", "12,345,678"])).numeric.map((point) => point.number)).toEqual([1234.5, 12345678]);
  });
  it("does not turn text, ambiguous numbers, comparators or missing values into measurements", () => {
    const progress = portalProgress(result(["", " ", "estable", "<5", "1,234", "NaN", "Infinity", "120/80", "X 1 · Y 2"]));
    expect(progress.numeric).toEqual([]);
    expect(progress.points).toHaveLength(9);
    expect(progress.change).toBeNull();
    expect(portalChart(progress)).toBeNull();
  });
  it("keeps gaps without connecting or inventing intermediate measurements", () => {
    const progress = portalProgress(result(["100", "sin dato", "92", "91"]));
    const chart = portalChart(progress)!;
    expect(chart.segments.map((segment) => segment.map((point) => point.number))).toEqual([[100], [92, 91]]);
    expect(chart.dots[1].x - chart.dots[0].x).toBeCloseTo(2 * (chart.dots[2].x - chart.dots[1].x));
  });
  it.each([["70"], ["70", "70"], ["0", "0"]])("supports a single or constant value %j without invalid geometry", (...values) => {
    const input = result(values);
    input.points.forEach((point) => { point.date = "2026-09-01"; });
    const chart = portalChart(portalProgress(input))!;
    for (const point of chart.dots) { expect(Number.isFinite(point.x)).toBe(true); expect(Number.isFinite(point.y)).toBe(true); }
  });
  it("preserves invalid-date values in history but excludes them from charts and comparisons", () => {
    const input = result(["100", "92"]);
    input.points[1].date = "sin fecha";
    const progress = portalProgress(input);
    expect(progress.points).toHaveLength(2);
    expect(progress.numeric).toHaveLength(1);
    expect(progress.change).toBeNull();
  });
  it.each([260, 400, 520])("keeps all value badges separate and inside the chart when dates cluster at width %i", (availableWidth) => {
    const input = result(["87,4 kg", "87.2", "86.9", "86.8", "86.7", "86.5"]);
    input.points.forEach((point, index) => { point.date = index < 5 ? "2026-09-01" : "2026-10-01"; });
    const before = structuredClone(input);
    const progress = portalProgress(input);
    const chart = portalLabeledChart(progress, availableWidth)!;
    expect(chart.labels.map((label) => label.value)).toEqual(input.points.map((point) => point.value));
    expect(chart.dots.slice(0, 5).every((point) => point.x === chart.left)).toBe(true);
    for (const [index, label] of chart.labels.entries()) {
      expect(label.x - label.width / 2).toBeGreaterThanOrEqual(chart.left);
      expect(label.x + label.width / 2).toBeLessThanOrEqual(chart.width - chart.right);
      expect(label.y).toBeGreaterThanOrEqual(0);
      if (index) expect(label.x - label.width / 2).toBeGreaterThan(chart.labels[index - 1].x + chart.labels[index - 1].width / 2);
    }
    expect(input).toEqual(before);
  });
});
