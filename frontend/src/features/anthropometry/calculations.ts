import type { AssessmentInput, Result } from "./model";
import type {
  CalculationDefinition,
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
} from "./references";
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
  ...[
    ["jackson_pollock_3", "Jackson-Pollock 3"],
    ["durnin_womersley", "Durnin-Womersley"],
    ["faulkner", "Faulkner"],
    ["yuhasz", "Yuhasz"],
    ["lee", "Masa muscular · Lee"],
    ["heath_carter", "Somatotipo · Heath-Carter"],
    ["somatochart_x", "Somatocarta · X"],
    ["somatochart_y", "Somatocarta · Y"],
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
function nodesFor(c: FollowupConfiguration): {
  nodes: Map<string, Node>;
  roots: string[];
} {
  const nodes = new Map<string, Node>(),
    roots: string[] = [];
  const add = (node: Node) => {
    nodes.set(node.key, node);
    return node.key;
  };
  for (const id of c.indicators) {
    if (["bmi", "waist_hip_ratio", "waist_height_ratio"].includes(id)) {
      const d = calculationDefinitions.find((d) => d.code === id)!;
      roots.push(
        add({
          key: id,
          definition: id,
          name: d.name,
          method: d.name,
          measurementCodes: d.requiredInputs,
          dependencies: [],
          compute: (v) =>
            id === "bmi"
              ? bmi(v.weight, v.height)
              : id === "waist_hip_ratio"
                ? waistHipRatio(v.waist_circumference, v.hip_circumference)
                : waistHeightRatio(v.waist_circumference, v.height),
        }),
      );
      continue;
    }
    const methods = id === "body_density" ? ["jp7_siri" as const] : c.methods;
    for (const method of methods) {
      const density = method.startsWith("jp7")
        ? add({
            key: "jackson_pollock_7",
            definition: "jackson_pollock_7",
            name: "Densidad corporal",
            method: "Jackson-Pollock 7",
            measurementCodes: jp7Inputs,
            dependencies: [],
            compute: (v, w) =>
              jacksonPollock7(
                jp7Inputs.reduce((s, k) => s + v[k], 0),
                w.context.age!,
                w.context.sex as "male" | "female",
              ),
          })
        : "body_density_measured";
      if (id === "body_density") {
        roots.push(density);
        continue;
      }
      const fat =
        method === "device"
          ? "body_fat_percentage_device"
          : add({
              key: "body_fat_" + method,
              definition: method.endsWith("siri") ? "siri" : "brozek",
              name: "Grasa corporal",
              method: methodNames[method],
              measurementCodes: method.startsWith("density") ? [density] : [],
              dependencies: method.startsWith("jp7") ? [density] : [],
              compute: (v) =>
                method.endsWith("siri") ? siri(v[density]) : brozek(v[density]),
            });
      if (id === "body_fat") {
        roots.push(fat);
        continue;
      }
      const mass = add({
        key: "fat_mass_" + method,
        definition: "fat_mass",
        name: "Masa grasa",
        method: methodNames[method],
        measurementCodes: method === "device" ? ["weight", fat] : ["weight"],
        dependencies: method === "device" ? [] : [fat],
        compute: (v) => fatMass(v.weight, v[fat]),
      });
      if (id === "fat_mass") {
        roots.push(mass);
        continue;
      }
      roots.push(
        add({
          key: "fat_free_mass_" + method,
          definition: "fat_free_mass",
          name: "Masa libre de grasa",
          method: methodNames[method],
          measurementCodes: ["weight"],
          dependencies: [mass],
          compute: (v) => fatFreeMass(v.weight, v[mass]),
        }),
      );
    }
  }
  return { nodes, roots: [...new Set(roots)] };
}
export function requiredMeasurements(
  c: FollowupConfiguration,
): Map<string, string[]> {
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
  return [...new Set([...requiredMeasurements(c).keys(), ...c.measurements])];
}
export function validateEntries(
  w: MeasurementWorkflow,
  types: MeasurementType[],
): string[] {
  const errors: string[] = [];
  for (const code of selectedMeasurements(w.configuration)) {
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
  const entries = Object.fromEntries(
    selectedMeasurements(w.configuration)
      .filter((k) => w.entries[k])
      .map((k) => [k, w.entries[k]]),
  );
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
    if (n.definition === "jackson_pollock_7")
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
                : [];
    const reference =
      n.definition === "bmi"
        ? classifyBmi(value, { ...input, age: w.context.age })
        : { classification: null, reference: null };
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
            (n.definition === "jackson_pollock_7" || key.includes("jp7")
              ? ":" + w.context.sex
              : "")
          : null,
      ...reference,
      reference_id: reference.reference?.id ?? null,
      reference_version: reference.reference?.version ?? null,
      sources: [
        ...new Map(
          [...dependencies.flatMap((d) => d.sources), ...sources].map((s) => [
            s.id,
            s,
          ]),
        ).values(),
      ],
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
  const statuses: CalculationAvailability[] = [
    ...new Set([...nodes.keys(), ...roots]),
  ].map((key) => ({
    key,
    name: nodes.get(key)?.name ?? "Grasa corporal del dispositivo",
    method: nodes.get(key)?.method ?? "Bioimpedancia",
    state:
      calculated.has(key) || (!nodes.has(key) && valid(key))
        ? "available"
        : "pending",
    missing: missing.get(key) ?? [],
  }));
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
      selectedMeasurements(w.configuration)
        .filter((k) => w.entries[k])
        .map((k) => [k, w.entries[k]]),
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
