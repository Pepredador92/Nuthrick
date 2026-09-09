import type {
  ActivityLevelDefinition,
  ActivityMethodDefinition,
  EnergyMethodDefinition,
  EnergyReference,
  EtaMethodDefinition,
  PredictiveEnergyFormulaCode,
} from "./types";

export const MJ_TO_KCAL = 239.005736;

const references = {
  mifflin: {
    authors: "Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO",
    year: 1990,
    title: "A new predictive equation for resting energy expenditure in healthy individuals",
    source: "American Journal of Clinical Nutrition, 51(2), 241–247",
    pmid: "2305711",
    doi: "10.1093/ajcn/51.2.241",
    url: "https://pubmed.ncbi.nlm.nih.gov/2305711/",
  },
  harrisOriginal: {
    authors: "Harris JA, Benedict FG",
    year: 1919,
    title: "A Biometric Study of Human Basal Metabolism",
    source: "Carnegie Institution of Washington, Publication No. 279",
    url: "https://archive.org/details/biometricstudyof00harruoft",
  },
  rozaShizgal: {
    authors: "Roza AM, Shizgal HM",
    year: 1984,
    title: "The Harris Benedict equation reevaluated: resting energy requirements and the body cell mass",
    source: "American Journal of Clinical Nutrition, 40(1), 168–182",
    pmid: "6741850",
    doi: "10.1093/ajcn/40.1.168",
    url: "https://pubmed.ncbi.nlm.nih.gov/6741850/",
  },
  valencia: {
    authors: "Valencia ME, Moya SY, McNeill G, Haggarty P",
    year: 1994,
    title: "Basal metabolic rate and body fatness of adult men in northern Mexico",
    source: "European Journal of Clinical Nutrition, 48(3), 205–211",
    pmid: "8194506",
    url: "https://pubmed.ncbi.nlm.nih.gov/8194506/",
  },
  schofield: {
    authors: "Schofield WN",
    year: 1985,
    title: "Predicting basal metabolic rate, new standards and review of previous work",
    source: "Human Nutrition: Clinical Nutrition, 39 Suppl 1, 5–41",
    pmid: "4044297",
    url: "https://pubmed.ncbi.nlm.nih.gov/4044297/",
  },
  fao: {
    authors: "FAO, WHO, UNU",
    year: 2004,
    title: "Human energy requirements: Report of a Joint FAO/WHO/UNU Expert Consultation",
    source: "FAO Food and Nutrition Technical Report Series No. 1",
    url: "https://www.fao.org/4/y5686e/y5686e00.htm",
  },
} satisfies Record<string, EnergyReference>;

const commonInputs = ["weightKg", "heightCm", "ageYears", "sex"] as const;

export const energyMethodCatalog: EnergyMethodDefinition[] = [
  {
    code: "MIFFLIN_ST_JEOR_1990",
    name: "Mifflin–St Jeor 1990",
    shortName: "Mifflin–St Jeor",
    author: "Mifflin et al.",
    year: 1990,
    catalogVersion: 1,
    methodVersion: "1.0.0",
    kind: "predictive_equation",
    resultType: "REE",
    resultUnit: "kcal/day",
    requiredInputs: [...commonInputs],
    applicability: {
      population: "Adultos de la muestra original, con y sin obesidad.",
      minAge: 19,
      maxAge: 78,
      sexScope: "male_and_female",
    },
    variants: [
      {
        code: "male",
        label: "Hombre",
        when: { sex: "male" },
        equation: {
          kind: "linear",
          intercept: 5,
          coefficients: { weightKg: 10, heightCm: 6.25, ageYears: -5 },
          sourceUnit: "kcal/day",
          expression: "10 × peso_kg + 6.25 × talla_cm − 5 × edad_años + 5",
        },
      },
      {
        code: "female",
        label: "Mujer",
        when: { sex: "female" },
        equation: {
          kind: "linear",
          intercept: -161,
          coefficients: { weightKg: 10, heightCm: 6.25, ageYears: -5 },
          sourceUnit: "kcal/day",
          expression: "10 × peso_kg + 6.25 × talla_cm − 5 × edad_años − 161",
        },
      },
    ],
    references: [references.mifflin],
    notes: ["La edad fuera de 19–78 años produce advertencia, no bloqueo automático."],
    warnings: ["Es una estimación predictiva y no sustituye calorimetría indirecta."],
    active: true,
  },
  {
    code: "HARRIS_BENEDICT_ORIGINAL_1919",
    name: "Harris–Benedict original 1919",
    shortName: "Harris–Benedict original",
    author: "Harris y Benedict",
    year: 1919,
    catalogVersion: 1,
    methodVersion: "1.0.0",
    kind: "predictive_equation",
    resultType: "BMR",
    resultUnit: "kcal/day",
    requiredInputs: [...commonInputs],
    applicability: {
      population: "Población estudiada por Harris y Benedict; interpretar según contexto clínico.",
      sexScope: "male_and_female",
    },
    variants: [
      {
        code: "male",
        label: "Hombre",
        when: { sex: "male" },
        equation: {
          kind: "linear",
          intercept: 66.473,
          coefficients: { weightKg: 13.7516, heightCm: 5.0033, ageYears: -6.755 },
          sourceUnit: "kcal/day",
          expression: "66.4730 + 13.7516 × peso_kg + 5.0033 × talla_cm − 6.7550 × edad_años",
        },
      },
      {
        code: "female",
        label: "Mujer",
        when: { sex: "female" },
        equation: {
          kind: "linear",
          intercept: 655.0955,
          coefficients: { weightKg: 9.5634, heightCm: 1.8496, ageYears: -4.6756 },
          sourceUnit: "kcal/day",
          expression: "655.0955 + 9.5634 × peso_kg + 1.8496 × talla_cm − 4.6756 × edad_años",
        },
      },
    ],
    references: [references.harrisOriginal],
    notes: ["Se conserva como método independiente de la revisión de 1984."],
    warnings: ["La antigüedad y población original deben considerarse al interpretar el resultado."],
    active: true,
  },
  {
    code: "HARRIS_BENEDICT_ROZA_SHIZGAL_1984",
    name: "Harris–Benedict revisada por Roza y Shizgal 1984",
    shortName: "Harris–Benedict revisada",
    author: "Roza y Shizgal",
    year: 1984,
    catalogVersion: 1,
    methodVersion: "1.0.0",
    kind: "predictive_equation",
    resultType: "REE",
    resultUnit: "kcal/day",
    requiredInputs: [...commonInputs],
    applicability: {
      population: "Población de la reevaluación de Roza y Shizgal.",
      sexScope: "male_and_female",
    },
    variants: [
      {
        code: "male",
        label: "Hombre",
        when: { sex: "male" },
        equation: {
          kind: "linear",
          intercept: 88.362,
          coefficients: { weightKg: 13.397, heightCm: 4.799, ageYears: -5.677 },
          sourceUnit: "kcal/day",
          expression: "88.362 + 13.397 × peso_kg + 4.799 × talla_cm − 5.677 × edad_años",
        },
      },
      {
        code: "female",
        label: "Mujer",
        when: { sex: "female" },
        equation: {
          kind: "linear",
          intercept: 447.593,
          coefficients: { weightKg: 9.247, heightCm: 3.098, ageYears: -4.33 },
          sourceUnit: "kcal/day",
          expression: "447.593 + 9.247 × peso_kg + 3.098 × talla_cm − 4.330 × edad_años",
        },
      },
    ],
    references: [references.rozaShizgal],
    notes: ["No se presenta como equivalente silencioso de Harris–Benedict 1919."],
    warnings: ["Es una estimación predictiva; revisar aplicabilidad individual."],
    active: true,
  },
  {
    code: "VALENCIA_MEXICO",
    name: "Valencia · población mexicana",
    shortName: "Valencia",
    author: "Valencia y colaboradores",
    year: 1994,
    catalogVersion: 1,
    methodVersion: "1.0.0",
    kind: "predictive_equation",
    resultType: "BMR",
    resultUnit: "kcal/day",
    requiredInputs: ["weightKg", "ageYears", "sex"],
    applicability: {
      population: "Población mexicana; las variantes configuradas comienzan a los 18 años.",
      minAge: 18,
      sexScope: "male_and_female",
    },
    variants: [
      ["MALE_18_30", "Hombre · 18 a <30 años", "male", 18, 30, false, 13.37, 747],
      ["MALE_30_60", "Hombre · 30 a 60 años", "male", 30, 60, true, 13.08, 693],
      ["MALE_OVER_60", "Hombre · más de 60 años", "male", 60, undefined, false, 14.21, 429],
      ["FEMALE_18_30", "Mujer · 18 a <30 años", "female", 18, 30, false, 11.02, 679],
      ["FEMALE_30_60", "Mujer · 30 a 60 años", "female", 30, 60, true, 10.92, 677],
      ["FEMALE_OVER_60", "Mujer · más de 60 años", "female", 60, undefined, false, 10.98, 520],
    ].map(([code, label, sex, minAge, maxAge, maxInclusive, coefficient, intercept]) => ({
      code: String(code),
      label: String(label),
      when: {
        sex: sex as "male" | "female",
        minAge: Number(minAge),
        maxAge: maxAge === undefined ? undefined : Number(maxAge),
        minAgeInclusive: code === "MALE_OVER_60" || code === "FEMALE_OVER_60" ? false : true,
        maxAgeInclusive: Boolean(maxInclusive),
      },
      equation: {
        kind: "linear" as const,
        intercept: Number(intercept),
        coefficients: { weightKg: Number(coefficient) },
        sourceUnit: "kcal/day" as const,
        expression: `${coefficient} × peso_kg + ${intercept}`,
      },
    })),
    references: [references.valencia],
    notes: ["La variante se selecciona y se conserva de manera explícita según edad y sexo."],
    warnings: ["No extrapolar automáticamente una variante adulta a menores de 18 años."],
    active: true,
  },
  {
    code: "SCHOFIELD_WEIGHT_1985",
    name: "Schofield 1985 · ecuaciones basadas en peso",
    shortName: "Schofield por peso",
    author: "Schofield",
    year: 1985,
    catalogVersion: 1,
    methodVersion: "1.0.0",
    kind: "predictive_equation",
    resultType: "BMR",
    resultUnit: "kcal/day",
    requiredInputs: ["weightKg", "ageYears", "sex"],
    applicability: {
      population: "Grupos por edad y sexo del conjunto revisado por Schofield.",
      minAge: 0,
      sexScope: "male_and_female",
    },
    variants: [
      ["MALE_0_3", "Hombre · 0 a <3 años", "male", 0, 3, 0.249, -0.127],
      ["MALE_3_10", "Hombre · 3 a <10 años", "male", 3, 10, 0.095, 2.11],
      ["MALE_10_18", "Hombre · 10 a <18 años", "male", 10, 18, 0.074, 2.754],
      ["MALE_18_30", "Hombre · 18 a <30 años", "male", 18, 30, 0.063, 2.896],
      ["MALE_30_60", "Hombre · 30 a <60 años", "male", 30, 60, 0.048, 3.653],
      ["MALE_60_PLUS", "Hombre · 60 años o más", "male", 60, undefined, 0.049, 2.459],
      ["FEMALE_0_3", "Mujer · 0 a <3 años", "female", 0, 3, 0.244, -0.13],
      ["FEMALE_3_10", "Mujer · 3 a <10 años", "female", 3, 10, 0.085, 2.033],
      ["FEMALE_10_18", "Mujer · 10 a <18 años", "female", 10, 18, 0.056, 2.898],
      ["FEMALE_18_30", "Mujer · 18 a <30 años", "female", 18, 30, 0.062, 2.036],
      ["FEMALE_30_60", "Mujer · 30 a <60 años", "female", 30, 60, 0.034, 3.538],
      ["FEMALE_60_PLUS", "Mujer · 60 años o más", "female", 60, undefined, 0.038, 2.755],
    ].map(([code, label, sex, minAge, maxAge, coefficient, intercept]) => ({
      code: String(code),
      label: String(label),
      when: {
        sex: sex as "male" | "female",
        minAge: Number(minAge),
        maxAge: maxAge === undefined ? undefined : Number(maxAge),
        minAgeInclusive: true,
        maxAgeInclusive: false,
      },
      equation: {
        kind: "linear" as const,
        intercept: Number(intercept),
        coefficients: { weightKg: Number(coefficient) },
        sourceUnit: "MJ/day" as const,
        expression: `${coefficient} × peso_kg ${Number(intercept) < 0 ? "−" : "+"} ${Math.abs(Number(intercept))} MJ/día`,
      },
    })),
    references: [references.schofield, references.fao],
    relatedMethodCode: "FAO_WHO_UNU_FRAMEWORK",
    notes: [`La salida original en MJ/día se convierte al final con 1 MJ = ${MJ_TO_KCAL} kcal.`],
    warnings: ["El error de predicción individual puede ser considerable."],
    active: true,
  },
  {
    code: "FAO_WHO_UNU_FRAMEWORK",
    name: "Marco FAO/WHO/UNU de requerimientos energéticos",
    shortName: "FAO/WHO/UNU",
    author: "FAO, WHO y UNU",
    year: 2004,
    catalogVersion: 1,
    methodVersion: "1.0.0",
    kind: "reference_framework",
    resultType: "framework",
    resultUnit: null,
    requiredInputs: [],
    applicability: { population: "Poblaciones a lo largo del ciclo de vida.", sexScope: "male_and_female" },
    variants: [],
    references: [references.fao],
    relatedMethodCode: "SCHOFIELD_WEIGHT_1985",
    notes: ["Es un marco de referencia que combina BMR y PAL; no duplica Schofield como otra ecuación."],
    warnings: [],
    active: true,
  },
  {
    code: "MANUAL_ENERGY_TARGET",
    name: "Objetivo energético manual",
    shortName: "Objetivo manual",
    author: "Nuthrick",
    year: null,
    catalogVersion: 1,
    methodVersion: "1.0.0",
    kind: "manual_target",
    resultType: "energy_target",
    resultUnit: "kcal/day",
    requiredInputs: [],
    applicability: { population: "Definido por el profesional.", sexScope: "male_and_female" },
    variants: [],
    references: [],
    notes: ["Representa una prescripción directa; no calcula GER o GEB."],
    warnings: [],
    active: true,
  },
  {
    code: "MEASURED_INDIRECT_CALORIMETRY",
    name: "Calorimetría indirecta medida",
    shortName: "Calorimetría indirecta",
    author: "Nuthrick",
    year: null,
    catalogVersion: 1,
    methodVersion: "1.0.0",
    kind: "measured",
    resultType: "REE",
    resultUnit: "kcal/day",
    requiredInputs: [],
    applicability: { population: "Según protocolo, equipo y condiciones de medición.", sexScope: "male_and_female" },
    variants: [],
    references: [],
    notes: ["Preparado para registrar valor, fecha y fuente/equipo en un objetivo posterior."],
    warnings: ["Debe etiquetarse como medido, no como resultado de una ecuación."],
    active: true,
  },
];

export const predictiveEnergyFormulaCodes = energyMethodCatalog
  .filter((method) => method.kind === "predictive_equation")
  .map((method) => method.code as PredictiveEnergyFormulaCode);

export const activityMethodCatalog: ActivityMethodDefinition[] = [
  {
    code: "CLINICAL_ACTIVITY_FACTOR",
    name: "Factor clínico configurable",
    methodVersion: "1.0.0",
    kind: "factor",
    includesEta: false,
    description: "Desglosa la energía de actividad como GER × (factor − 1).",
  },
  {
    code: "PAL_FAO_WHO_UNU",
    name: "PAL FAO/WHO/UNU",
    methodVersion: "1.0.0",
    kind: "pal",
    includesEta: true,
    description: "Calcula GET como GER × PAL; el PAL representa TEE/BMR e integra ETA.",
    reference: references.fao,
  },
];

export const activityLevelCatalog: ActivityLevelDefinition[] = [
  { methodCode: "CLINICAL_ACTIVITY_FACTOR", code: "SEDENTARY", label: "Sedentaria", suggestedFactor: 1.2, displayOrder: 10 },
  { methodCode: "CLINICAL_ACTIVITY_FACTOR", code: "LIGHT", label: "Ligera", suggestedFactor: 1.375, displayOrder: 20 },
  { methodCode: "CLINICAL_ACTIVITY_FACTOR", code: "MODERATE", label: "Moderada", suggestedFactor: 1.55, displayOrder: 30 },
  { methodCode: "CLINICAL_ACTIVITY_FACTOR", code: "INTENSE", label: "Intensa", suggestedFactor: 1.725, displayOrder: 40 },
  { methodCode: "PAL_FAO_WHO_UNU", code: "SEDENTARY_LIGHT", label: "Sedentario o actividad ligera", minFactor: 1.4, maxFactor: 1.69, displayOrder: 10 },
  { methodCode: "PAL_FAO_WHO_UNU", code: "ACTIVE_MODERATE", label: "Activo o moderadamente activo", minFactor: 1.7, maxFactor: 1.99, displayOrder: 20 },
  { methodCode: "PAL_FAO_WHO_UNU", code: "VIGOROUS", label: "Vigorosamente activo", minFactor: 2, maxFactor: 2.4, displayOrder: 30 },
];

export const etaMethodCatalog: EtaMethodDefinition[] = [
  {
    code: "PERCENT_OF_BASAL",
    name: "ETA como porcentaje del gasto basal",
    methodVersion: "1.0.0",
    base: "basal",
    defaultRate: 0.1,
    configurable: true,
  },
];

export function getEnergyMethod(code: string) {
  return energyMethodCatalog.find((method) => method.code === code);
}

export function getActivityMethod(code: string) {
  return activityMethodCatalog.find((method) => method.code === code);
}

export function getActivityLevel(methodCode: string, levelCode?: string) {
  return activityLevelCatalog.find((level) => level.methodCode === methodCode && level.code === levelCode);
}

export function getEtaMethod(code = "PERCENT_OF_BASAL") {
  return etaMethodCatalog.find((method) => method.code === code);
}
