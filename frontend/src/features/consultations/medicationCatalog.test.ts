import { beforeAll, describe, expect, it } from "vitest";
import { initialInterview } from "./interviewTemplate";
import { formatAnswer } from "./questionnaire";
import { loadMedicationCatalog, medicationAnswer, medicationNutritionAlert, searchMedicationCatalog, type MedicationCatalog } from "./medicationCatalog";

let catalog: MedicationCatalog;
beforeAll(async () => { catalog = await loadMedicationCatalog(); });

describe("medication catalog", () => {
  it("retains all source records and distinguishes presentations by internal SKU", () => {
    expect(catalog.products).toHaveLength(215);
    expect(catalog.products.flatMap(({ entries }) => entries)).toHaveLength(219);
    expect(catalog.products.flatMap(({ insulin }) => insulin ? [insulin] : [])).toHaveLength(23);
    expect(catalog.references).toHaveLength(12);
    expect(new Set([...catalog.products, ...catalog.references].map(({ sku }) => sku)).size).toBe(227);
    const { products } = searchMedicationCatalog(catalog, "metformina pharmalife 850");
    expect(products).toHaveLength(1);
    expect(new Set(products[0].entries.map(({ sourceSku }) => sourceSku)).size).toBe(2);
  });

  it("finds a brand, active ingredient, strength and disease", () => {
    const search = (query: string) => searchMedicationCatalog(catalog, query).products;
    expect(search("HIPERTENSION ARTERIAL").length).toBeGreaterThan(20);
    expect(search("metformina").some(({ entries }) => entries[0].name === "Dabex")).toBe(true);
    expect(search("eutirox 50mcg")[0].entries[0].concentration).toBe("50 mcg");
    expect(search("soliqua 100u 50mcg").map(({ insulin }) => insulin?.devicesPerPack).sort()).toEqual(["1", "3"]);
  });

  it("requires an applicable formulation and preserves the separate patient dose in the summary", () => {
    const search = (query: string) => searchMedicationCatalog(catalog, query).products[0];
    expect(medicationNutritionAlert(search("xaraban 15 mg"))?.title).toBe("Toma con alimentos");
    expect(medicationNutritionAlert(search("xaraban 10 mg"))).toBeUndefined();
    expect(medicationNutritionAlert(search("cynoplus"))).toBeUndefined();
    expect(medicationNutritionAlert(search("soliqua"))).toBeUndefined();
    const question = initialInterview.sections.flatMap(({ questions }) => questions).find(({ question_key }) => question_key === "medication_list_v2")!;
    const answer = { ...medicationAnswer(search("eutirox 50 mcg")), dose: "½ tableta" };
    const summary = formatAnswer(question, [JSON.parse(JSON.stringify(answer))]);
    expect(summary).toContain("Dosis y unidad: ½ tableta");
    expect(summary).toContain("Concentración comercial: 50 mcg");
    expect(summary).not.toContain(answer.catalog.sku);
  });
});
