export type CalculationMathResult = {
  rawResult: number;
  resultValues?: Record<string, number>;
};

type Values = Record<string, number>;

const total = (values: Values, keys: string[]) => keys.reduce((sum, key) => sum + values[key], 0);
const densityToSiri = (density: number) => (4.95 / density - 4.5) * 100;
const densityToBrozek = (density: number) => (4.57 / density - 4.142) * 100;

/**
 * Pure, contract-bound implementation of the methods validated in catalog v2.
 * Input names are the calculation definition keys; dependencies are injected by
 * the engine under their calculation code so each result retains its method.
 */
export function calculateFormula(code: string, values: Values): CalculationMathResult | undefined {
  if (code === "bmi") return { rawResult: values.weight / (values.height / 100) ** 2 };
  if (code === "waist_hip_ratio") return { rawResult: values.waist / values.hip };
  if (code === "waist_height_ratio") return { rawResult: values.waist / values.height };

  if (code === "density_jackson_pollock_3") {
    const sum3 = values.sex === 1
      ? total(values, ["chest", "abdominal", "thigh"])
      : total(values, ["triceps", "suprailiac", "thigh"]);
    const density = values.sex === 1
      ? 1.10938 - 0.0008267 * sum3 + 0.0000016 * sum3 ** 2 - 0.0002574 * values.age
      : 1.0994921 - 0.0009929 * sum3 + 0.0000023 * sum3 ** 2 - 0.0001392 * values.age;
    return { rawResult: density };
  }
  if (code === "density_jackson_pollock_7") {
    const sum7 = total(values, ["chest", "midaxillary", "triceps", "subscapular", "suprailiac", "abdominal", "thigh"]);
    const density = values.sex === 1
      ? 1.112 - 0.00043499 * sum7 + 0.00000055 * sum7 ** 2 - 0.00028826 * values.age
      : 1.097 - 0.00046971 * sum7 + 0.00000056 * sum7 ** 2 - 0.00012828 * values.age;
    return { rawResult: density };
  }
  if (code === "density_durnin_womersley") {
    const sum4 = total(values, ["biceps", "triceps", "subscapular", "suprailiac"]);
    const coefficients: Record<string, [number, number]> = {
      male_17_19: [1.162, 0.063], male_20_29: [1.1631, 0.0632], male_30_39: [1.1422, 0.0544],
      male_40_49: [1.162, 0.07], male_50_72: [1.1715, 0.0779], female_16_19: [1.1549, 0.0678],
      female_20_29: [1.1599, 0.0717], female_30_39: [1.1423, 0.0632], female_40_49: [1.1333, 0.0612],
      female_50_68: [1.1339, 0.0645],
    };
    const sex = values.sex === 1 ? "male" : "female";
    const age = values.age;
    const band = sex === "male"
      ? age <= 19 ? "17_19" : age <= 29 ? "20_29" : age <= 39 ? "30_39" : age <= 49 ? "40_49" : "50_72"
      : age <= 19 ? "16_19" : age <= 29 ? "20_29" : age <= 39 ? "30_39" : age <= 49 ? "40_49" : "50_68";
    const [c, m] = coefficients[`${sex}_${band}`];
    return { rawResult: c - m * Math.log10(sum4) };
  }

  if (code === "body_fat_jp3_siri") return { rawResult: densityToSiri(values.density_jackson_pollock_3) };
  if (code === "body_fat_jp7_siri") return { rawResult: densityToSiri(values.density_jackson_pollock_7) };
  if (code === "body_fat_jp7_brozek") return { rawResult: densityToBrozek(values.density_jackson_pollock_7) };
  if (code === "body_fat_durnin_siri") return { rawResult: densityToSiri(values.density_durnin_womersley) };

  const fatMassSources: Record<string, string> = {
    fat_mass_jp3_siri: "body_fat_jp3_siri", fat_mass_jp7_siri: "body_fat_jp7_siri",
    fat_mass_jp7_brozek: "body_fat_jp7_brozek", fat_mass_durnin_siri: "body_fat_durnin_siri",
  };
  const freeMassSources: Record<string, string> = {
    fat_free_mass_jp3_siri: "fat_mass_jp3_siri", fat_free_mass_jp7_siri: "fat_mass_jp7_siri",
    fat_free_mass_jp7_brozek: "fat_mass_jp7_brozek", fat_free_mass_durnin_siri: "fat_mass_durnin_siri",
  };
  if (fatMassSources[code]) return { rawResult: values.weight * values[fatMassSources[code]] / 100 };
  if (freeMassSources[code]) return { rawResult: values.weight - values[freeMassSources[code]] };

  if (code === "somatotype_endomorphy") {
    const correctedSum = total(values, ["triceps", "subscapular", "supraespinale"]) * 170.18 / values.height;
    return { rawResult: Math.max(0.1, -0.7182 + 0.1451 * correctedSum - 0.00068 * correctedSum ** 2 + 0.0000014 * correctedSum ** 3) };
  }
  if (code === "somatotype_mesomorphy") {
    const correctedArm = values.flexed_arm - values.triceps / 10;
    const correctedCalf = values.calf - values.calf_skinfold / 10;
    return { rawResult: Math.max(0.1, 0.858 * values.humerus_breadth + 0.601 * values.femur_breadth + 0.188 * correctedArm + 0.161 * correctedCalf - 0.131 * values.height + 4.5) };
  }
  if (code === "somatotype_ectomorphy") {
    const hwr = values.height / Math.cbrt(values.weight);
    return { rawResult: hwr >= 40.75 ? 0.732 * hwr - 28.58 : hwr > 38.25 ? 0.463 * hwr - 17.63 : 0.1 };
  }
  if (code === "somatochart_coordinates") {
    const x = values.somatotype_ectomorphy - values.somatotype_endomorphy;
    const y = 2 * values.somatotype_mesomorphy - values.somatotype_endomorphy - values.somatotype_ectomorphy;
    return { rawResult: x, resultValues: { x, y } };
  }
  return undefined;
}
