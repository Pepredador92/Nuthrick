import { describe, expect, it } from "vitest";
import { reorderMeasurements } from "./measurementGroups";
const catalog = [{ id: "w", category: "general" }, { id: "a", category: "circumference" }, { id: "b", category: "circumference" }, { id: "c", category: "circumference" }, { id: "s", category: "skinfold" }] as never;
describe("measurement ordering", () => {
  it("preserves every id and the slots of unrelated categories", () => expect(reorderMeasurements(["w", "a", "s", "b", "c"], catalog, "a", "c")).toEqual(["w", "b", "s", "c", "a"]));
  it.each([["a", "w"], ["a", "missing"], ["a", "a"]])("ignores invalid move %s to %s", (from, to) => {
    const ids = ["w", "a", "b"];
    expect(reorderMeasurements(ids, catalog, from, to)).toBe(ids);
  });
});
