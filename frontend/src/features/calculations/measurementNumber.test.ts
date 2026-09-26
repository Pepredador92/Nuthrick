import { describe, expect, it } from "vitest";
import { parseMeasurementNumber } from "./measurementNumber";
describe("measurement decimals", () => {
  it.each(["87.6", "87,6", " 87,6 kg ", "87.6KG"])("normalizes %s without rounding", (raw) => {
    expect(parseMeasurementNumber(raw, { unit: "kg" })).toEqual({ value: 87.6 });
  });
  it.each(["", "   ", null, undefined])("keeps an absent value absent: %s", (raw) => expect(parseMeasurementNumber(raw)).toEqual({}));
  it.each(["87.6 lb", "87,6.2", "8x", "Infinity", true, "1e2", "1 200"])("rejects invalid or ambiguous input %s", (raw) => expect(parseMeasurementNumber(raw, { unit: "kg" }).error).toBeTruthy());
  it("preserves precision and validates existing catalog limits", () => {
    expect(parseMeasurementNumber("87,6543").value).toBe(87.6543);
    expect(parseMeasurementNumber("-1", { min_value: 0 }).error).toBeTruthy();
    expect(parseMeasurementNumber("101", { max_value: 100 }).error).toBeTruthy();
    expect(parseMeasurementNumber("0", { min_value: 0 }).value).toBe(0);
  });
});
