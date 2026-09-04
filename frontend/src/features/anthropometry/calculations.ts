import type { AssessmentInput, Result } from "./model";
import type {
  CalculationDefinition,
  CalculationChoiceId,
  CalculationInput,
  CalculatedMeasurement,
  CompositionMethod,
  FollowupConfiguration,
  IndicatorCode,
  MeasurementType,
  MeasurementWorkflow,
  RegisteredMeasurement,
} from "./workflowTypes";
import {
  classifyBmi,
  WHO_BMI,
  WHO_WHR,
  JP_M,
  JP_F,
  SIRI,
  BROZEK,
  LEAN_1996,
  HEATH_CARTER,
} from "./references";
export const calculationReferences = [
  WHO_BMI,
  WHO_WHR,
  JP_M,
  JP_F,
  SIRI,
  BROZEK,
  LEAN_1996,
  HEATH_CARTER,
];
export const WORKFLOW_ENGINE_VERSION = "2.0.0";
export const jp7Inputs = [
  "chest_skinfold",
  "midaxillary_skinfold",
  "triceps_skinfold",
  "subscapular_skinfold",
  "suprailiac_skinfold",
  "abdominal_skinfold",
  "thigh_skinfold",
];
export const indicatorNames: Record<IndicatorCode, string> = {
  bmi: "IMC",
  waist_hip_ratio: "Índice cintura/cadera",
  waist_height_ratio: "Índice cintura/talla",
  body_density: "Densidad corporal",
  body_fat: "Porcentaje de grasa",
  fat_mass: "Masa grasa",
  fat_free_mass: "Masa libre de grasa",
};
export const methodNames: Record<CompositionMethod, string> = {
  jp7_siri: "Jackson-Pollock 7 + Siri",
  jp7_brozek: "Jackson-Pollock 7 + Brozek",
  density_siri: "Densidad registrada + Siri",
  density_brozek: "Densidad registrada + Brozek",
  device: "Bioimpedancia",
};
export const methodDescriptions: Record<CompositionMethod, string> = {
  jp7_siri:
    "Estima densidad con 7 pliegues, edad y sexo; Siri la convierte a porcentaje de grasa.",
  jp7_brozek:
    "Estima densidad con 7 pliegues, edad y sexo; Brozek la convierte a porcentaje de grasa.",
  density_siri:
    "Convierte una densidad corporal obtenida por otro método a porcentaje de grasa con Siri.",
  density_brozek:
    "Convierte una densidad corporal obtenida por otro método a porcentaje de grasa con Brozek.",
  device:
    "Registra el porcentaje informado por un equipo de bioimpedancia, conservando modelo y protocolo.",
};
export interface CalculationChoice {
  id: CalculationChoiceId;
  name: string;
  short: string;
  use: string;
  result: string;
  applicability: string;
  calculationCodes: string[];
}
export const calculationChoices: CalculationChoice[] = [
  {
    id: "bmi",
    name: "IMC",
    short:
      "Relaciona el peso con la talla como indicador general del estado ponderal.",
    use: "Descripción y clasificación poblacional en adultos, cuando la referencia es aplicable.",
    result: "kg/m²",
    applicability: "Resultado con peso y talla; clasificación sólo en adultos no gestantes confirmados.",
    calculationCodes: ["bmi"],
  },
  {
    id: "waist_hip_ratio",
    name: "Índice cintura-cadera (ICC)",
    short:
      "Relaciona cintura y cadera para describir la distribución central de grasa corporal.",
    use: "Complementar la descripción de la distribución corporal.",
    result: "Razón adimensional",
    applicability: "La interpretación depende de población, edad, sexo y protocolo.",
    calculationCodes: ["waist_hip_ratio"],
  },
  {
    id: "waist_height_ratio",
    name: "Índice cintura-talla",
    short: "Relaciona la circunferencia de cintura con la talla.",
    use: "Describir la cintura en relación con el tamaño corporal.",
    result: "Razón adimensional",
    applicability: "Se muestra sin clasificación automática en esta versión.",
    calculationCodes: ["waist_height_ratio"],
  },
  {
    id: "jackson_pollock_7",
    name: "Jackson-Pollock 7",
    short: "Estima densidad corporal utilizando siete pliegues cutáneos.",
    use: "Obtener una densidad que puede convertirse posteriormente a porcentaje de grasa.",
    result: "Densidad corporal en g/cm³",
    applicability: "Ecuación masculina 18–61 años y femenina 18–55 años; adultos no gestantes.",
    calculationCodes: ["jackson_pollock_7"],
  },
  {
    id: "jp7_siri",
    name: "Jackson-Pollock 7 + Siri",
    short:
      "Estima densidad con siete pliegues y la convierte a porcentaje de grasa mediante Siri.",
    use: "Estimar composición corporal con un modelo de dos compartimentos.",
    result: "% de grasa, masa grasa y masa libre de grasa cuando hay peso",
    applicability: "Mantiene las restricciones poblacionales de Jackson-Pollock 7.",
    calculationCodes: ["body_fat_jp7_siri", "fat_mass_jp7_siri", "fat_free_mass_jp7_siri"],
  },
  {
    id: "jp7_brozek",
    name: "Jackson-Pollock 7 + Brozek",
    short:
      "Estima densidad con siete pliegues y la convierte a porcentaje de grasa mediante Brozek.",
    use: "Documentar una estimación con una conversión explícita y reproducible.",
    result: "% de grasa, masa grasa y masa libre de grasa cuando hay peso",
    applicability: "Mantiene las restricciones poblacionales de Jackson-Pollock 7.",
    calculationCodes: ["body_fat_jp7_brozek", "fat_mass_jp7_brozek", "fat_free_mass_jp7_brozek"],
  },
  {
    id: "density_siri",
    name: "Densidad registrada + Siri",
    short: "Convierte una densidad corporal registrada a porcentaje de grasa mediante Siri.",
    use: "Conservar explícitamente la conversión aplicada a una densidad obtenida por otro método.",
    result: "% de grasa, masa grasa y masa libre de grasa cuando hay peso",
    applicability: "La validez depende del método con el que se obtuvo la densidad.",
    calculationCodes: ["body_fat_density_siri", "fat_mass_density_siri", "fat_free_mass_density_siri"],
  },
  {
    id: "density_brozek",
    name: "Densidad registrada + Brozek",
    short: "Convierte una densidad corporal registrada a porcentaje de grasa mediante Brozek.",
    use: "Conservar explícitamente una conversión alternativa de densidad.",
    result: "% de grasa, masa grasa y masa libre de grasa cuando hay peso",
    applicability: "La validez depende del método con el que se obtuvo la densidad.",
    calculationCodes: ["body_fat_density_brozek", "fat_mass_density_brozek", "fat_free_mass_density_brozek"],
  },
  {
    id: "lean_1996",
    name: "Grasa corporal · Lean (1996)",
    short: "Estima porcentaje de grasa con cintura, pliegue tricipital, edad y sexo de la ecuación.",
    use: "Obtener una estimación antropométrica alternativa en adultos.",
    result: "% de grasa, masa grasa y masa libre de grasa cuando hay peso",
    applicability: "Adultos de 18 a 65 años; depende de la población y técnica de medición.",
    calculationCodes: ["body_fat_lean_1996", "fat_mass_lean_1996", "fat_free_mass_lean_1996"],
  },
  {
    id: "device_composition",
    name: "Composición derivada de bioimpedancia",
    short: "Deriva masas a partir del porcentaje de grasa reportado por un equipo identificado.",
    use: "Mantener separados los valores del dispositivo y los derivados por Nuthrick.",
    result: "Masa grasa y masa libre de grasa en kg",
    applicability: "Requiere peso, porcentaje de grasa del equipo, modelo y protocolo.",
    calculationCodes: ["fat_mass_device", "fat_free_mass_device"],
  },
  {
    id: "heath_carter",
    name: "Somatotipo · Heath-Carter",
    short: "Calcula endomorfia, mesomorfia y ectomorfia con mediciones antropométricas.",
    use: "Describir el somatotipo y sus coordenadas de representación.",
    result: "Tres componentes y coordenadas X/Y, sin clasificación clínica",
    applicability: "Requiere técnica antropométrica estandarizada; no constituye un diagnóstico.",
    calculationCodes: [
      "heath_carter_endomorphy",
      "heath_carter_mesomorphy",
      "heath_carter_ectomorphy",
      "somatochart_x",
      "somatochart_y",
    ],
  },
];
export const bmi = (weight: number, heightCm: number) =>
  weight / (heightCm / 100) ** 2;
export const waistHipRatio = (waist: number, hip: number) => waist / hip;
export const waistHeightRatio = (waist: number, height: number) =>
  waist / height;
export const siri = (density: number) => 495 / density - 450;
export const brozek = (density: number) => 457 / density - 414.2;
export const fatMass = (weight: number, fatPercentage: number) =>
  (weight * fatPercentage) / 100;
export const fatFreeMass = (weight: number, fat: number) => weight - fat;
export const jacksonPollock7 = (
  sum: number,
  age: number,
  sex: "male" | "female",
) =>
  sex === "male"
    ? 1.112 - 0.00043499 * sum + 0.00000055 * sum ** 2 - 0.00028826 * age
    : 1.097 - 0.00046971 * sum + 0.00000056 * sum ** 2 - 0.00012828 * age;
export const leanBodyFat = (
  waist: number,
  triceps: number,
  age: number,
  sex: "male" | "female",
) =>
  sex === "male"
    ? 0.353 * waist + 0.756 * triceps + 0.235 * age - 26.4
    : 0.232 * waist + 0.657 * triceps + 0.215 * age - 5.5;
export const heathCarterEndomorphy = (
  triceps: number,
  subscapular: number,
  supraspinale: number,
  heightCm: number,
) => {
  const x = (triceps + subscapular + supraspinale) * (170.18 / heightCm);
  return -0.7182 + 0.1451 * x - 0.00068 * x ** 2 + 0.0000014 * x ** 3;
};
export const heathCarterMesomorphy = (
  humerus: number,
  femur: number,
  flexedArm: number,
  triceps: number,
  calf: number,
  calfSkinfold: number,
  heightCm: number,
) =>
  0.858 * humerus +
  0.601 * femur +
  0.188 * (flexedArm - triceps / 10) +
  0.161 * (calf - calfSkinfold / 10) -
  0.131 * heightCm +
  4.5;
export const heathCarterEctomorphy = (heightCm: number, weightKg: number) => {
  const hwr = heightCm / Math.cbrt(weightKg);
  return hwr >= 40.75
    ? 0.732 * hwr - 28.58
    : hwr > 38.25
      ? 0.463 * hwr - 17.63
      : 0.1;
};
const densityFormula =
  "Masculina: D = 1.112 − 0.00043499S + 0.00000055S² − 0.00028826edad. Femenina: D = 1.097 − 0.00046971S + 0.00000056S² − 0.00012828edad. S = suma de 7 pliegues en mm.";
const definition = (
  code: string,
  name: string,
  category: CalculationDefinition["category"],
  requiredInputs: string[],
  dependencies: string[],
  calculation: string,
  unit: CalculationDefinition["unit"],
  decimalPlaces: number,
  description: string,
  referenceUrls: string[] = [],
  limitations = "No constituye un diagnóstico. Interpretar con la evaluación profesional.",
): CalculationDefinition => ({
  code,
  name,
  category,
  requiredInputs,
  dependencies,
  calculation,
  unit,
  decimalPlaces,
  description,
  referenceUrls,
  limitations,
  status: "implemented",
  version: WORKFLOW_ENGINE_VERSION,
  optionalInputs: [],
  applicableSex: [],
  applicableAgeRange: null,
});
export const calculationDefinitions: CalculationDefinition[] = [
  definition(
    "bmi",
    "IMC",
    "index",
    ["weight", "height"],
    [],
    "peso_kg / (talla_cm / 100)²",
    "kg/m²",
    1,
    "Relaciona peso con talla.",
    [WHO_BMI.url],
    "No distingue grasa de músculo. Clasificación OMS sólo en adultos no gestantes confirmados.",
  ),
  definition(
    "waist_hip_ratio",
    "Índice cintura/cadera",
    "index",
    ["waist_circumference", "hip_circumference"],
    [],
    "cintura_cm / cadera_cm",
    "ratio",
    2,
    "Describe la proporción entre cintura y cadera.",
    [WHO_WHR.url],
  ),
  definition(
    "waist_height_ratio",
    "Índice cintura/talla",
    "index",
    ["waist_circumference", "height"],
    [],
    "cintura_cm / talla_cm",
    "ratio",
    2,
    "Relaciona cintura y talla. Se muestra sin clasificación automática.",
  ),
  {
    ...definition(
      "jackson_pollock_7",
      "Jackson-Pollock 7",
      "density",
      jp7Inputs,
      [],
      densityFormula,
      "g/cm³",
      5,
      "Estima densidad corporal a partir de siete pliegues.",
      [JP_M.url, JP_F.url],
      "Masculina: 18–61 años; femenina: 18–55. Requiere sexo de la ecuación y contexto adulto no gestante. Depende de técnica y población.",
    ),
    applicableSex: ["male", "female"],
    applicableAgeRange: [18, 61],
  },
  definition(
    "siri",
    "Siri",
    "body_fat",
    [],
    ["body_density"],
    "495 / densidad − 450",
    "%",
    1,
    "Convierte densidad a grasa corporal con un modelo de dos compartimentos.",
    [SIRI.url],
    "Asume densidades constantes. No intercambiar métodos para evaluar evolución.",
  ),
  definition(
    "brozek",
    "Brozek",
    "body_fat",
    [],
    ["body_density"],
    "457 / densidad − 414.2",
    "%",
    1,
    "Conversión alternativa de densidad a porcentaje de grasa.",
    [BROZEK.url],
  ),
  definition(
    "fat_mass",
    "Masa grasa",
    "body_composition",
    ["weight"],
    ["body_fat"],
    "peso × porcentaje_grasa / 100",
    "kg",
    1,
    "Deriva masa grasa usando el porcentaje del método seleccionado.",
  ),
  definition(
    "fat_free_mass",
    "Masa libre de grasa",
    "body_composition",
    ["weight"],
    ["fat_mass"],
    "peso − masa_grasa",
    "kg",
    1,
    "No equivale a masa muscular.",
  ),
  {
    ...definition(
      "lean_1996",
      "Grasa corporal · Lean",
      "body_fat",
      ["waist_circumference", "triceps_skinfold"],
      [],
      "Hombres: 0.353×cintura + 0.756×tríceps + 0.235×edad − 26.4. Mujeres: 0.232×cintura + 0.657×tríceps + 0.215×edad − 5.5.",
      "%",
      1,
      "Estima porcentaje de grasa a partir de cintura, pliegue tricipital y edad.",
      [LEAN_1996.url],
      "Derivada en adultos de 18 a 65 años. Requiere la variable de sexo de la ecuación; depende de la población y de la técnica de medición.",
    ),
    applicableSex: ["male", "female"],
    applicableAgeRange: [18, 65] as [number, number],
  },
  definition(
    "heath_carter_endomorphy",
    "Endomorfia · Heath-Carter",
    "somatotype",
    ["triceps_skinfold", "subscapular_skinfold", "supraespinale_skinfold", "height"],
    [],
    "X=(tríceps+subescapular+supraespinal)×170.18/talla; −0.7182+0.1451X−0.00068X²+0.0000014X³",
    "unidad",
    1,
    "Componente de adiposidad relativa del somatotipo antropométrico.",
    [HEATH_CARTER.url],
    "Depende de mediciones antropométricas estandarizadas. No es una clasificación clínica.",
  ),
  definition(
    "heath_carter_mesomorphy",
    "Mesomorfia · Heath-Carter",
    "somatotype",
    ["humerus_breadth", "femur_breadth", "flexed_arm_circumference", "triceps_skinfold", "calf_circumference", "calf_skinfold", "height"],
    [],
    "0.858×húmero+0.601×fémur+0.188×brazo corregido+0.161×pantorrilla corregida−0.131×talla+4.5",
    "unidad",
    1,
    "Componente de robustez músculo-esquelética relativa del somatotipo.",
    [HEATH_CARTER.url],
    "Las circunferencias se corrigen con los pliegues correspondientes. No equivale a masa muscular.",
  ),
  definition(
    "heath_carter_ectomorphy",
    "Ectomorfia · Heath-Carter",
    "somatotype",
    ["height", "weight"],
    [],
    "Según índice ponderal HWR=talla/∛peso: 0.732HWR−28.58; 0.463HWR−17.63; o 0.1.",
    "unidad",
    1,
    "Componente de linealidad relativa del somatotipo.",
    [HEATH_CARTER.url],
    "No es una clasificación clínica y debe interpretarse junto con los otros dos componentes.",
  ),
  definition(
    "somatochart_x",
    "Somatocarta · X",
    "somatotype",
    [],
    ["heath_carter_ectomorphy", "heath_carter_endomorphy"],
    "ectomorfia − endomorfia",
    "unidad",
    1,
    "Coordenada horizontal para representar el somatotipo.",
    [HEATH_CARTER.url],
  ),
  definition(
    "somatochart_y",
    "Somatocarta · Y",
    "somatotype",
    [],
    ["heath_carter_mesomorphy", "heath_carter_endomorphy", "heath_carter_ectomorphy"],
    "2×mesomorfia − (endomorfia + ectomorfia)",
    "unidad",
    1,
    "Coordenada vertical para representar el somatotipo.",
    [HEATH_CARTER.url],
  ),
  ...[
    ["jackson_pollock_3", "Jackson-Pollock 3"],
    ["durnin_womersley", "Durnin-Womersley"],
    ["faulkner", "Faulkner"],
    ["yuhasz", "Yuhasz"],
    ["lee", "Masa muscular · Lee"],
    ["ledesma", "Grasa corporal · Ledesma"],
  ].map(([code, name]) => ({
    ...definition(
      code,
      name,
      code.includes("heath") || code.includes("somatochart")
        ? "somatotype"
        : "body_composition",
      [],
      [],
      "",
      "unidad",
      2,
      "Preparado para incorporar una fórmula y aplicabilidad validadas.",
    ),
    status: "not_implemented" as const,
  })),
];
interface Node {
  key: string;
  definition: string;
  name: string;
  method: string;
  measurementCodes: string[];
  dependencies: string[];
  compute: (v: Record<string, number>, w: MeasurementWorkflow) => number;
}
export function selectedCalculationChoices(
  c: FollowupConfiguration | undefined,
): CalculationChoiceId[] {
  const valid = new Set(calculationChoices.map((choice) => choice.id));
  if (!c) return [];
  if (Array.isArray(c.calculations))
    return [...new Set(c.calculations.filter((id) => valid.has(id)))];
  const selected: CalculationChoiceId[] = [];
  for (const indicator of c.indicators ?? []) {
    if (
      indicator === "bmi" ||
      indicator === "waist_hip_ratio" ||
      indicator === "waist_height_ratio"
    )
      selected.push(indicator);
    if (indicator === "body_density") selected.push("jackson_pollock_7");
  }
  if (
    (c.indicators ?? []).some((id) =>
      ["body_fat", "fat_mass", "fat_free_mass"].includes(id),
    )
  )
    for (const method of c.methods ?? [])
      selected.push(method === "device" ? "device_composition" : method);
  return [...new Set(selected)];
}

function nodesFor(c?: FollowupConfiguration): {
  nodes: Map<string, Node>;
  roots: string[];
} {
  const nodes = new Map<string, Node>(),
    roots: string[] = [];
  const add = (node: Node) => {
    nodes.set(node.key, node);
    return node.key;
  };
  for (const id of ["bmi", "waist_hip_ratio", "waist_height_ratio"] as const) {
    const d = calculationDefinitions.find((item) => item.code === id)!;
    roots.push(add({
      key: id,
      definition: id,
      name: d.name,
      method: d.name,
      measurementCodes: d.requiredInputs,
      dependencies: [],
      compute: (v) => id === "bmi"
        ? bmi(v.weight, v.height)
        : id === "waist_hip_ratio"
          ? waistHipRatio(v.waist_circumference, v.hip_circumference)
          : waistHeightRatio(v.waist_circumference, v.height),
    }));
  }
  const density = add({
    key: "jackson_pollock_7",
    definition: "jackson_pollock_7",
    name: "Densidad corporal",
    method: "Jackson-Pollock 7",
    measurementCodes: jp7Inputs,
    dependencies: [],
    compute: (v, w) => jacksonPollock7(
      jp7Inputs.reduce((sum, key) => sum + v[key], 0),
      w.context.age!,
      w.context.sex as "male" | "female",
    ),
  });
  roots.push(density);

  const addComposition = (suffix: string, fat: string, method: string, raw = false) => {
    roots.push(fat);
    const mass = add({
      key: `fat_mass_${suffix}`,
      definition: "fat_mass",
      name: "Masa grasa",
      method,
      measurementCodes: raw ? ["weight", fat] : ["weight"],
      dependencies: raw ? [] : [fat],
      compute: (v) => fatMass(v.weight, v[fat]),
    });
    roots.push(mass);
    roots.push(add({
      key: `fat_free_mass_${suffix}`,
      definition: "fat_free_mass",
      name: "Masa libre de grasa",
      method,
      measurementCodes: ["weight"],
      dependencies: [mass],
      compute: (v) => fatFreeMass(v.weight, v[mass]),
    }));
  };
  for (const [suffix, source, method] of [
    ["jp7_siri", density, "Jackson-Pollock 7 + Siri"],
    ["jp7_brozek", density, "Jackson-Pollock 7 + Brozek"],
    ["density_siri", "body_density_measured", "Densidad registrada + Siri"],
    ["density_brozek", "body_density_measured", "Densidad registrada + Brozek"],
  ] as const) {
    const fat = add({
      key: `body_fat_${suffix}`,
      definition: suffix.endsWith("siri") ? "siri" : "brozek",
      name: "Grasa corporal",
      method,
      measurementCodes: suffix.startsWith("density") ? [source] : [],
      dependencies: suffix.startsWith("jp7") ? [source] : [],
      compute: (v) => suffix.endsWith("siri") ? siri(v[source]) : brozek(v[source]),
    });
    addComposition(suffix, fat, method);
  }
  const lean = add({
    key: "body_fat_lean_1996",
    definition: "lean_1996",
    name: "Grasa corporal",
    method: "Lean 1996",
    measurementCodes: ["waist_circumference", "triceps_skinfold"],
    dependencies: [],
    compute: (v, w) => leanBodyFat(
      v.waist_circumference,
      v.triceps_skinfold,
      w.context.age!,
      w.context.sex as "male" | "female",
    ),
  });
  addComposition("lean_1996", lean, "Lean 1996");
  addComposition("device", "body_fat_percentage_device", "Bioimpedancia", true);

  const endomorphy = add({
    key: "heath_carter_endomorphy",
    definition: "heath_carter_endomorphy",
    name: "Endomorfia",
    method: "Heath-Carter",
    measurementCodes: ["triceps_skinfold", "subscapular_skinfold", "supraespinale_skinfold", "height"],
    dependencies: [],
    compute: (v) => heathCarterEndomorphy(v.triceps_skinfold, v.subscapular_skinfold, v.supraespinale_skinfold, v.height),
  });
  const mesomorphy = add({
    key: "heath_carter_mesomorphy",
    definition: "heath_carter_mesomorphy",
    name: "Mesomorfia",
    method: "Heath-Carter",
    measurementCodes: ["humerus_breadth", "femur_breadth", "flexed_arm_circumference", "triceps_skinfold", "calf_circumference", "calf_skinfold", "height"],
    dependencies: [],
    compute: (v) => heathCarterMesomorphy(v.humerus_breadth, v.femur_breadth, v.flexed_arm_circumference, v.triceps_skinfold, v.calf_circumference, v.calf_skinfold, v.height),
  });
  const ectomorphy = add({
    key: "heath_carter_ectomorphy",
    definition: "heath_carter_ectomorphy",
    name: "Ectomorfia",
    method: "Heath-Carter",
    measurementCodes: ["height", "weight"],
    dependencies: [],
    compute: (v) => heathCarterEctomorphy(v.height, v.weight),
  });
  roots.push(endomorphy, mesomorphy, ectomorphy);
  roots.push(add({
    key: "somatochart_x",
    definition: "somatochart_x",
    name: "Somatocarta · X",
    method: "Heath-Carter",
    measurementCodes: [],
    dependencies: [ectomorphy, endomorphy],
    compute: (v) => v[ectomorphy] - v[endomorphy],
  }));
  roots.push(add({
    key: "somatochart_y",
    definition: "somatochart_y",
    name: "Somatocarta · Y",
    method: "Heath-Carter",
    measurementCodes: [],
    dependencies: [mesomorphy, endomorphy, ectomorphy],
    compute: (v) => 2 * v[mesomorphy] - (v[endomorphy] + v[ectomorphy]),
  }));
  const allRoots = [...new Set(roots)];
  if (!c) return { nodes, roots: allRoots };
  const selected = new Set(selectedCalculationChoices(c));
  return {
    nodes,
    roots: calculationChoices
      .filter((choice) => selected.has(choice.id))
      .flatMap((choice) => choice.calculationCodes)
      .filter((key) => allRoots.includes(key)),
  };
}

export function definitionsForChoice(
  id: CalculationChoiceId,
): CalculationDefinition[] {
  const { nodes } = nodesFor();
  const choice = calculationChoices.find((item) => item.id === id);
  if (!choice) return [];
  const codes = new Set<string>();
  const visit = (key: string) => {
    const node = nodes.get(key);
    if (!node) return;
    codes.add(node.definition);
    node.dependencies.forEach(visit);
  };
  choice.calculationCodes.forEach(visit);
  return [...codes]
    .map((code) => calculationDefinitions.find((item) => item.code === code))
    .filter((item): item is CalculationDefinition => Boolean(item));
}

export function measurementCodesForChoice(id: CalculationChoiceId): string[] {
  const { nodes } = nodesFor();
  const choice = calculationChoices.find((item) => item.id === id);
  if (!choice) return [];
  const measurements = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string) => {
    if (visited.has(key)) return;
    visited.add(key);
    const node = nodes.get(key);
    if (!node) {
      measurements.add(key);
      return;
    }
    node.measurementCodes.forEach((code) => measurements.add(code));
    node.dependencies.forEach(visit);
  };
  choice.calculationCodes.forEach(visit);
  return [...measurements];
}
export function requiredMeasurements(
  c: FollowupConfiguration,
): Map<string, string[]> {
  void c;
  const out = new Map<string, string[]>(),
    { nodes, roots } = nodesFor(c);
  const visit = (key: string, label: string, seen: Set<string>) => {
    if (seen.has(key)) return;
    seen.add(key);
    const n = nodes.get(key);
    if (!n) {
      out.set(key, [...new Set([...(out.get(key) ?? []), label])]);
      return;
    }
    n.measurementCodes.forEach((code) =>
      out.set(code, [...new Set([...(out.get(code) ?? []), label])]),
    );
    n.dependencies.forEach((k) => visit(k, label, seen));
  };
  roots.forEach((key) =>
    visit(
      key,
      nodes.get(key)?.name ?? "Grasa corporal del dispositivo",
      new Set(),
    ),
  );
  return out;
}
export function selectedMeasurements(c: FollowupConfiguration): string[] {
  return [...new Set(c.measurements)];
}
export function validateEntries(
  w: MeasurementWorkflow,
  types: MeasurementType[],
): string[] {
  const errors: string[] = [];
  for (const code of Object.keys(w.entries)) {
    const e = w.entries[code];
    if (!e) continue;
    const t = types.find((t) => t.code === code);
    if (!t) {
      errors.push("Tipo de medición no disponible: " + code);
      continue;
    }
    if (
      !Number.isFinite(e.value) ||
      e.value < t.min_value ||
      e.value > t.max_value
    )
      errors.push(t.name + ": revisa el valor en " + t.unit + ".");
    if (e.unit !== t.unit)
      errors.push(t.name + ": la unidad no coincide con el catálogo.");
    if (e.source_type === "device" && !e.device_id)
      errors.push(t.name + ": selecciona un equipo.");
    if (!Number.isFinite(Date.parse(e.measured_at)))
      errors.push(t.name + ": falta una fecha válida.");
  }
  return errors;
}
export function registeredResult(
  e: RegisteredMeasurement,
  t?: MeasurementType,
): Result {
  return {
    id: e.code,
    metric: e.code,
    label: e.name,
    value: e.value,
    unit: e.unit,
    method:
      e.source_type === "device"
        ? e.device
          ? e.device.manufacturer + " " + e.device.model
          : "Dispositivo"
        : e.source_type === "imported"
          ? "Medición importada"
          : "Medición directa",
    methodVersion: "2.0.0",
    provenance: e.source_type === "device" ? "device" : "measured",
    display_value: Number(e.value.toFixed(t?.decimal_places ?? 2)),
    decimal_places: t?.decimal_places ?? 2,
    isBioimpedance: e.source_type === "device",
    sourceType: e.source_type,
    inputs: {
      Valor: e.value,
      Unidad: e.unit,
      Origen: e.source_type,
      "ID de medición": e.id,
      "Fecha medida": e.original_measured_at ?? e.measured_at,
      ...(e.notes ? { Notas: e.notes } : {}),
    },
    compatibilityKey: e.protocol.trim()
      ? `registered:${e.code}:${e.unit}:${e.source_type}:${e.device_id ?? ""}:${e.protocol.trim().toLowerCase()}`
      : null,
    classification: null,
    reference: null,
    reference_id: null,
    reference_version: null,
    sources: [],
    guidance: t?.description ?? "Dato registrado por el profesional.",
  };
}
export interface CalculationAvailability {
  key: string;
  name: string;
  method: string;
  state: "available" | "pending";
  missing: string[];
}
export function evaluateWorkflow(
  w: MeasurementWorkflow,
  input: AssessmentInput,
  types: MeasurementType[],
  now = new Date().toISOString(),
) {
  const { nodes, roots } = nodesFor(w.configuration),
    calculated = new Map<string, CalculatedMeasurement>(),
    missing = new Map<string, string[]>(),
    visiting = new Set<string>();
  const entries = { ...w.entries };
  const valid = (key: string) => {
    const e = entries[key],
      t = types.find((t) => t.code === key);
    return (
      e &&
      t &&
      Number.isFinite(e.value) &&
      e.value >= t.min_value &&
      e.value <= t.max_value &&
      e.unit === t.unit &&
      (e.source_type !== "device" || !!e.device_id)
    );
  };
  const visit = (key: string): number | undefined => {
    if (calculated.has(key)) return calculated.get(key)!.raw_value;
    if (missing.has(key)) return;
    const n = nodes.get(key);
    if (!n) {
      if (valid(key)) return entries[key].value;
      missing.set(key, [types.find((t) => t.code === key)?.name ?? key]);
      return;
    }
    if (visiting.has(key)) throw new Error("Dependencia circular de cálculo");
    visiting.add(key);
    const v: Record<string, number> = {},
      problems: string[] = [];
    for (const code of [...n.measurementCodes, ...n.dependencies]) {
      const value = visit(code);
      if (value === undefined) problems.push(...(missing.get(code) ?? [code]));
      else v[code] = value;
    }
    if (n.definition === "jackson_pollock_7") {
      if (w.context.age === null)
        problems.push("Fecha de nacimiento o edad confirmada");
      if (!w.context.sex) problems.push("Sexo requerido por la ecuación");
      if (input.context !== "adult")
        problems.push("Confirmar contexto adulto no gestante");
      if (
        w.context.age !== null &&
        (w.context.age < 18 ||
          w.context.age > (w.context.sex === "female" ? 55 : 61))
      )
        problems.push("Edad fuera de la población de la ecuación");
    }
    if (n.definition === "lean_1996") {
      if (w.context.age === null)
        problems.push("Fecha de nacimiento o edad confirmada");
      if (!w.context.sex) problems.push("Sexo requerido por la ecuación");
      if (input.context !== "adult")
        problems.push("Confirmar contexto adulto no gestante");
      if (w.context.age !== null && (w.context.age < 18 || w.context.age > 65))
        problems.push("Edad fuera de la población de la ecuación");
    }
    visiting.delete(key);
    if (problems.length) {
      missing.set(key, [...new Set(problems)]);
      return;
    }
    const value = n.compute(v, w);
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      ((n.definition === "siri" || n.definition === "brozek") && value >= 100)
    ) {
      missing.set(key, [
        "Datos fuera del dominio físico del método; revisa la captura",
      ]);
      return;
    }
    const d = calculationDefinitions.find((d) => d.code === n.definition)!;
    const dependencies = n.dependencies.map((k) => calculated.get(k)!);
    const allMeasurements = [
      ...new Map(
        [
          ...n.measurementCodes.map((k) => entries[k]),
          ...dependencies.flatMap((dep) =>
            Object.values(dep.inputs_json).flatMap((i) =>
              i.measurement_id
                ? Object.values(entries).filter(
                    (e) => e.id === i.measurement_id,
                  )
                : [],
            ),
          ),
        ]
          .filter(Boolean)
          .map((e) => [e.id, e]),
      ).values(),
    ];
    // Carry transitive original measurement IDs as well as immediate calculation dependencies.
    const inputs_json: Record<string, CalculationInput> = {};
    for (const dep of dependencies) Object.assign(inputs_json, dep.inputs_json);
    for (const code of n.measurementCodes) {
      const e = entries[code];
      inputs_json[code] = {
        measurement_id: e.id,
        value: e.value,
        unit: e.unit,
        measured_at: e.original_measured_at ?? e.measured_at,
      };
    }
    for (const dep of dependencies)
      inputs_json[dep.calculation_code] = {
        calculation_id: dep.calculation_id,
        value: dep.raw_value,
        unit: dep.unit,
      };
    if (n.definition === "jackson_pollock_7" || n.definition === "lean_1996")
      inputs_json.age = { value: w.context.age!, unit: "años" };
    const sources =
      n.definition === "bmi"
        ? [WHO_BMI]
        : n.definition === "waist_hip_ratio"
          ? [WHO_WHR]
          : n.definition === "jackson_pollock_7"
            ? [w.context.sex === "male" ? JP_M : JP_F]
            : n.definition === "siri"
              ? [SIRI]
            : n.definition === "brozek"
                ? [BROZEK]
                : n.definition === "lean_1996"
                  ? [LEAN_1996]
                  : n.definition.startsWith("heath_carter") ||
                      n.definition.startsWith("somatochart")
                    ? [HEATH_CARTER]
                : [];
    const reference =
      n.definition === "bmi"
        ? classifyBmi(value, { ...input, age: w.context.age })
        : { classification: null, reference: null };
    const resultSources = [
      ...new Map(
        [...dependencies.flatMap((item) => item.sources), ...sources].map(
          (source) => [source.id, source],
        ),
      ).values(),
    ];
    const primaryReference = reference.reference ?? resultSources.at(-1) ?? null;
    const device = allMeasurements.find(
      (e) => e.source_type === "device",
    )?.device;
    const method =
      n.method === "Bioimpedancia"
        ? `Derivado de bioimpedancia · ${device?.manufacturer ?? ""} ${device?.model ?? ""}`.trim()
        : n.method;
    const protocol = allMeasurements.map(
      (e) => registeredResult(e).compatibilityKey,
    );
    const previous = w.calculations.find((r) => r.calculation_code === key);
    const r: CalculatedMeasurement = {
      id: key,
      metric: key,
      label: n.name,
      value,
      raw_value: value,
      display_value: Number(value.toFixed(d.decimalPlaces)),
      decimal_places: d.decimalPlaces,
      unit: d.unit,
      method,
      methodVersion: d.version,
      provenance: "calculated",
      source_type: "calculated",
      isBioimpedance: !!device,
      calculation_id: crypto.randomUUID(),
      calculation_code: key,
      patient_id: allMeasurements[0]?.patient_id ?? "",
      consultation_id: allMeasurements[0]?.consultation_id ?? "",
      calculated_at: now,
      ...(previous ? { recalculated_at: now } : {}),
      dependency_ids: [
        ...allMeasurements.map((e) => e.id),
        ...dependencies.map((r) => r.calculation_id),
      ],
      inputs_json,
      formula_metadata: {
        definition: d,
        context: structuredClone(w.context),
        device: device ?? null,
      },
      inputs: Object.fromEntries(
        Object.entries(inputs_json).map(([code, v]) => [
          code,
          v.value + " " + v.unit,
        ]),
      ),
      compatibilityKey:
        protocol.length && protocol.every(Boolean)
          ? key +
            ":" +
            d.version +
            ":" +
            JSON.stringify(protocol.sort()) +
            (n.definition === "jackson_pollock_7" ||
            n.definition === "lean_1996" ||
            key.includes("jp7") ||
            key.includes("lean_1996")
              ? ":" + w.context.sex
              : "")
          : null,
      ...reference,
      reference_id: primaryReference?.id ?? null,
      reference_version: primaryReference?.version ?? null,
      sources: resultSources,
      calculation: d.calculation,
      guidance: d.description + " " + d.limitations,
    };
    calculated.set(key, r);
    return value;
  };
  roots.forEach(visit);
  if (w.calculation_signature === calculationSignature(w, input)) {
    for (const saved of w.calculations)
      if (calculated.has(saved.calculation_code))
        calculated.set(saved.calculation_code, saved);
  }
  const selectedChoices = new Set(selectedCalculationChoices(w.configuration));
  const statuses: CalculationAvailability[] = calculationChoices
    .filter((choice) => selectedChoices.has(choice.id))
    .map((choice) => {
      const primary = choice.calculationCodes[0];
      return {
        key: choice.id,
        name: choice.name,
        method: choice.name,
        state:
          calculated.has(primary) || (!nodes.has(primary) && valid(primary))
            ? "available"
            : "pending",
        missing: missing.get(primary) ?? [],
      };
    });
  return {
    registered: Object.values(entries),
    calculated: [...calculated.values()],
    results: [
      ...Object.values(entries).map((e) =>
        registeredResult(
          e,
          types.find((t) => t.code === e.code),
        ),
      ),
      ...[...calculated.values()],
    ],
    statuses,
    errors: validateEntries(w, types),
  };
}
export function calculationSignature(
  w: MeasurementWorkflow,
  input: AssessmentInput,
): string {
  return JSON.stringify({
    configuration: w.configuration,
    entries: Object.fromEntries(
      Object.keys(w.entries).map((k) => [k, w.entries[k]]),
    ),
    context: {
      birthDate: w.context.birthDate,
      age: w.context.age,
      sex: w.context.sex,
      consultationDate: w.context.consultationDate,
      timezone: w.context.timezone,
    },
    conditions: input.bia,
    applicability: input.context,
    bmiReference: input.bmiReference,
  });
}
