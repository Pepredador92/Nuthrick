import { describe, expect, it } from "vitest";
import { calculateFormula } from "./mathematics";

const calculate = (code: string, values: Record<string, number>) => calculateFormula(code, values)!.rawResult;

describe("validated anthropometry mathematics", () => {
  it("calculates Jackson-Pollock 3 and 7 for both equation sexes", () => {
    expect(calculate("density_jackson_pollock_3", { sex: 1, age: 30, chest: 10, abdominal: 20, thigh: 15 })).toBeCloseTo(1.0676965, 6);
    expect(calculate("density_jackson_pollock_3", { sex: 0, age: 30, triceps: 15, suprailiac: 14, thigh: 20 })).toBeCloseTo(1.0521863, 6);
    const inputs = { age: 30, chest: 10, midaxillary: 10, triceps: 12, subscapular: 12, suprailiac: 12, abdominal: 18, thigh: 16 };
    expect(calculate("density_jackson_pollock_7", { ...inputs, sex: 1 })).toBeCloseTo(1.0686581, 6);
    expect(calculate("density_jackson_pollock_7", { ...inputs, sex: 0 })).toBeCloseTo(1.0554137, 6);
  });

  it("selects the Durnin-Womersley coefficient bands at their boundaries", () => {
    const skinfolds = { biceps: 8, triceps: 12, subscapular: 14, suprailiac: 12 };
    expect(calculate("density_durnin_womersley", { ...skinfolds, sex: 1, age: 19 })).toBeCloseTo(1.162 - .063 * Math.log10(46), 10);
    expect(calculate("density_durnin_womersley", { ...skinfolds, sex: 1, age: 20 })).toBeCloseTo(1.1631 - .0632 * Math.log10(46), 10);
    expect(calculate("density_durnin_womersley", { ...skinfolds, sex: 0, age: 16 })).toBeCloseTo(1.1549 - .0678 * Math.log10(46), 10);
    expect(calculate("density_durnin_womersley", { ...skinfolds, sex: 0, age: 68 })).toBeCloseTo(1.1339 - .0645 * Math.log10(46), 10);
  });

  it("keeps each body-fat chain and its mass pair mathematically distinct", () => {
    const density = 1.05;
    const siri = calculate("body_fat_jp7_siri", { density_jackson_pollock_7: density });
    const brozek = calculate("body_fat_jp7_brozek", { density_jackson_pollock_7: density });
    expect(siri).toBeCloseTo((4.95 / density - 4.5) * 100, 10);
    expect(brozek).toBeCloseTo((4.57 / density - 4.142) * 100, 10);
    expect(siri).not.toBeCloseTo(brozek, 3);
    const mass = calculate("fat_mass_jp7_siri", { weight: 80, body_fat_jp7_siri: siri });
    expect(mass).toBeCloseTo(80 * siri / 100, 10);
    expect(calculate("fat_free_mass_jp7_siri", { weight: 80, fat_mass_jp7_siri: mass })).toBeCloseTo(80 - mass, 10);
  });

  it("calculates all Heath-Carter components and preserves X and Y", () => {
    const endomorphy = calculate("somatotype_endomorphy", { triceps: 12, subscapular: 14, supraespinale: 10, height: 174 });
    const mesomorphy = calculate("somatotype_mesomorphy", { humerus_breadth: 7, femur_breadth: 9, flexed_arm: 32, triceps: 12, calf: 37, calf_skinfold: 10, height: 174 });
    const ectomorphy = calculate("somatotype_ectomorphy", { height: 174, weight: 70 });
    expect(endomorphy).toBeGreaterThan(.1);
    expect(mesomorphy).toBeGreaterThan(.1);
    expect(ectomorphy).toBeGreaterThan(.1);
    const coordinates = calculateFormula("somatochart_coordinates", { somatotype_endomorphy: endomorphy, somatotype_mesomorphy: mesomorphy, somatotype_ectomorphy: ectomorphy })!;
    expect(coordinates.rawResult).toBeCloseTo(ectomorphy - endomorphy, 10);
    expect(coordinates.resultValues).toEqual({ x: coordinates.rawResult, y: 2 * mesomorphy - endomorphy - ectomorphy });
  });
});
