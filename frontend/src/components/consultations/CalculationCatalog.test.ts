import { describe, expect, it } from "vitest";
import { buildCalculationResultGroups } from "./CalculationCatalog";

const calculated = (code: string, resultName = code) => ({
  item: { code, definition: { resultName, methodName: resultName, unit: "%" } },
  state: "calculated",
  displayedResult: "20.9",
}) as never;

describe("buildCalculationResultGroups", () => {
  it("groups simultaneous Siri, Brozek, fat mass and lean mass results without losing provenance", () => {
    const groups = buildCalculationResultGroups([
      calculated("density_jackson_pollock_7", "Densidad corporal"),
      calculated("body_fat_jp3_siri"),
      calculated("body_fat_jp7_siri"),
      calculated("body_fat_jp7_brozek"),
      calculated("fat_mass_jp3_siri"),
      calculated("fat_mass_jp7_brozek"),
      calculated("fat_free_mass_jp3_siri"),
      calculated("fat_free_mass_jp7_brozek"),
    ]);

    expect(groups.flatMap((group) => group.entries).map((entry) => entry.evaluation.item.code)).not.toContain("density_jackson_pollock_7");
    expect(groups.find((group) => group.title === "Fórmulas de grasa corporal")?.entries).toMatchObject([
      { label: "Grasa - Siri", method: "Jackson & Pollock 3" },
      { label: "Grasa - Siri", method: "Jackson & Pollock 7" },
      { label: "Grasa - Brozek", method: "Jackson & Pollock 7" },
    ]);
    expect(groups.find((group) => group.title === "Composición corporal")?.entries).toMatchObject([
      { label: "Grasa calculada", method: "Siri · Jackson & Pollock 3" },
      { label: "Grasa calculada", method: "Brozek · Jackson & Pollock 7" },
      { label: "Masa magra calculada", method: "Siri · Jackson & Pollock 3" },
      { label: "Masa magra calculada", method: "Brozek · Jackson & Pollock 7" },
    ]);
  });

  it("keeps the complete d785a8e result set visible when every formula is calculated", () => {
    const codes = [
      "bmi", "waist_hip_ratio", "waist_height_ratio",
      "body_fat_jp3_siri", "body_fat_jp7_siri", "body_fat_durnin_siri", "body_fat_jp7_brozek",
      "fat_mass_jp3_siri", "fat_mass_jp7_siri", "fat_mass_jp7_brozek", "fat_mass_durnin_siri",
      "fat_free_mass_jp3_siri", "fat_free_mass_jp7_siri", "fat_free_mass_jp7_brozek", "fat_free_mass_durnin_siri",
      "somatotype_endomorphy", "somatotype_mesomorphy", "somatotype_ectomorphy", "somatochart_coordinates",
    ];
    const groups = buildCalculationResultGroups(codes.map((code) => calculated(code)));

    expect(groups.flatMap((group) => group.entries).map((entry) => entry.evaluation.item.code)).toEqual(codes);
    expect(groups.map((group) => group.title)).toEqual([
      "Índices y composición corporal",
      "Fórmulas de grasa corporal",
      "Composición corporal",
      "Somatotipo",
    ]);
  });
});
