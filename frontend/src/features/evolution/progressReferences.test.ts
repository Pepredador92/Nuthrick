import { describe, expect, it } from "vitest";
import { emptyProgressReferences, gallagherReference, reportBodyFatInterpretation, weightReference } from "./progressReferences";
import type { InterpretationContext } from "@/src/features/interpretations/types";
import { interpretResult } from "@/src/features/interpretations/engine";
import { somatoProjection } from "./somatochart";
import type { LongitudinalPoint, LongitudinalSeries } from "./longitudinal";
const point = { consultation_id: "c1", consultation_date: "2026-09-01", raw_value: 28, display_value: "28", unit: "%", source_reference: {}, heightCm: 170,
  interpretation: interpretResult("body_fat_percentage", 28, "%", { age: 30, sex: "female", pregnant: false, bmi: 27 }, [], "c1") } as LongitudinalPoint;
const series = { id: "fat", unit: "%", conceptCode: "body_fat_percentage", points: [point] } as LongitudinalSeries;
describe("report references", () => {
  it.each([
    ["female", 20, [21, 33, 39]], ["female", 40, [23, 34, 40]], ["female", 60, [24, 36, 42]],
    ["male", 39, [8, 20, 25]], ["male", 59, [11, 22, 28]], ["male", 79, [13, 25, 30]],
  ] as const)("matches Gallagher table 4 for %s at %s, including boundaries", (sex, age, cuts) => {
    const reference = gallagherReference(sex, age);
    const classify = (value: number) => interpretResult("body_fat_percentage", value, "%", { age, sex, pregnant: false, bmi: 30 }, [reference], "visit").rule?.label;
    expect(classify(cuts[0] - 0.01)).toBe("Bajo");
    expect(classify(cuts[0])).toBe("Dentro de referencia");
    expect(classify(cuts[1])).toBe("Alto");
    expect(classify(cuts[2])).toBe("Muy alto");
  });
  it.each([{ age: 19 }, { age: 80 }, { pregnant: true }, { pregnant: null }, { bmi: 35.01 }, { bmi: null }, { sex: null }] as InterpretationContext[])("does not classify missing or inapplicable context %s", (context) => {
    const entry = { ...point, interpretation: { ...point.interpretation!, context: { ...point.interpretation!.context, ...context } } };
    expect(reportBodyFatInterpretation(series, entry, [{ ...series, points: [entry] }], { targetBmi: null, gallagherSeriesIds: [series.id] })?.interpretation?.state).not.toBe("classified");
  });
  it("requires a separate explicit selection for each method and never changes saved points", () => {
    const original = structuredClone(series);
    expect(reportBodyFatInterpretation(series, point, [series], emptyProgressReferences)).toBeNull();
    expect(reportBodyFatInterpretation(series, point, [series], { targetBmi: null, gallagherSeriesIds: ["another-device"] })).toBeNull();
    expect(reportBodyFatInterpretation(series, point, [series], { targetBmi: null, gallagherSeriesIds: ["fat"] })?.interpretation?.rule?.label).toBe("Dentro de referencia");
    expect(series).toEqual(original);
  });
  it("uses visit-specific height and keeps the recorded reference and chosen target separate", () => {
    const entry = { ...point, raw_value: 80, unit: "kg", referenceWeight: { value: 66, method: "Registrado" } };
    const result = weightReference(entry, [series], { ...emptyProgressReferences, targetBmi: 22 });
    expect(result.interval?.lower).toBeCloseTo(53.465);
    expect(result.interval?.upper).toBeCloseTo(72.25);
    expect(result.target?.value).toBeCloseTo(63.58);
    expect(result.recorded?.value).toBe(66);
    expect(weightReference({ ...entry, consultation_id: "other" }, [series], emptyProgressReferences).interval).toBeNull();
  });
  it("does not resolve contradictory historical context by guessing", () => {
    const conflict = { ...series, id: "other", points: [{ ...point, interpretation: { ...point.interpretation!, context: { ...point.interpretation!.context, pregnant: true } } }] };
    expect(weightReference(point, [series, conflict], emptyProgressReferences).interval).toBeNull();
  });
  it("uses the same somatochart origin for different histories and keeps extreme points visible", () => {
    const usual = somatoProjection([{ x: 0, y: 0 }], 520, 400, 40);
    const changed = somatoProjection([{ x: 4, y: 7 }], 520, 400, 40);
    expect(usual.x(0)).toBe(changed.x(0));
    expect(usual.y(0)).toBe(changed.y(0));
    expect((usual.x(1) - usual.x(0)) / (usual.y(0) - usual.y(1))).toBeCloseTo(Math.sqrt(3));
    const extreme = somatoProjection([{ x: 20, y: 30 }], 520, 400, 40);
    expect(extreme.x(20)).toBeLessThan(480);
    expect(extreme.y(30)).toBeGreaterThan(40);
  });
});
