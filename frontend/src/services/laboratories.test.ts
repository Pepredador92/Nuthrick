import { describe, expect, it } from "vitest";
import { compareReportedRange, originalResultValue, resultHasContent, searchLaboratoryCatalog, type LaboratoryCatalogItem } from "./laboratories";

const glucose: LaboratoryCatalogItem = {
  id: "serum_glucose", code: "serum_glucose", display_name: "Glucosa sérica", clinical_name: "Glucosa sérica", subcategory: "glycemic_control", unit: "mg/dL", data_type: "number", synonyms: ["glucosa"], choice_options: [],
};
const ast: LaboratoryCatalogItem = {
  id: "ast", code: "ast", display_name: "AST / TGO", clinical_name: "Aspartato aminotransferasa", subcategory: "liver_proteins", unit: "U/L", data_type: "number", synonyms: ["TGO", "GOT"], choice_options: [],
};

describe("laboratory result helpers", () => {
  it("preserves a numeric comparator as original reported text", () => {
    expect(originalResultValue({ result_kind: "numeric", numeric_comparator: "<", numeric_value: 5, text_value: null })).toBe("<5");
  });
  it("supports qualitative, ordinal and free-text values without coercing them to numbers", () => {
    expect(resultHasContent({ result_kind: "qualitative", text_value: "Negativo" })).toBe(true);
    expect(resultHasContent({ result_kind: "ordinal", text_value: "++" })).toBe(true);
    expect(resultHasContent({ result_kind: "text", text_value: "Muestra hemolizada" })).toBe(true);
    expect(resultHasContent({ result_kind: "numeric", numeric_value: null })).toBe(false);
    expect(resultHasContent({ result_kind: "qualitative", text_value: "  " })).toBe(false);
  });
  it("compares only a plain numeric result against a same-unit structured interval", () => {
    const base = { result_kind: "numeric" as const, numeric_comparator: null, numeric_value: 92, unit: "mg/dL", reference_unit: "mg/dL", reference_lower: 70, reference_upper: 99, reference_lower_inclusive: true, reference_upper_inclusive: true };
    expect(compareReportedRange(base)).toBe("in_range");
    expect(compareReportedRange({ ...base, numeric_value: 60 })).toBe("below");
    expect(compareReportedRange({ ...base, numeric_value: 110 })).toBe("above");
    expect(compareReportedRange({ ...base, reference_lower: null, reference_upper: 99, numeric_value: 80 })).toBe("in_range");
    expect(compareReportedRange({ ...base, unit: "mmol/L" })).toBe("not_comparable");
    expect(compareReportedRange({ ...base, numeric_comparator: "<" })).toBe("not_comparable");
  });
  it("finds a standard analyte through its synonyms without creating aliases", () => {
    expect(searchLaboratoryCatalog([glucose, ast], "gluco").map((item) => item.id)).toEqual(["serum_glucose"]);
    expect(searchLaboratoryCatalog([glucose, ast], "TGO").map((item) => item.id)).toEqual(["ast"]);
    expect(searchLaboratoryCatalog([glucose, ast], "GOT").map((item) => item.id)).toEqual(["ast"]);
  });
});
