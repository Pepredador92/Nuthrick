import type {
  AnthroPayload,
  AnthroRecord,
  AssessmentInput,
  FormulaId,
  Measurements,
  Reference,
  Result,
} from "./model";
import {
  BROZEK,
  classifyBmi,
  JP_F,
  JP_M,
  SIRI,
  WHO_BMI,
  WHO_WHR,
} from "./references";

export const ENGINE_VERSION = "1.0.0";
export const fields: Array<{
  key: keyof Measurements;
  label: string;
  unit: string;
  max: number;
}> = [
  { key: "weight", label: "Peso", unit: "kg", max: 1000 },
  { key: "height", label: "Talla", unit: "cm", max: 300 },
  { key: "waist", label: "Cintura", unit: "cm", max: 300 },
  { key: "hip", label: "Cadera", unit: "cm", max: 300 },
  ...(
    [
      "chest",
      "axillary",
      "triceps",
      "subscapular",
      "suprailiac",
      "abdomen",
      "thigh",
    ] as const
  ).map((key, index) => ({
    key,
    label: [
      "Pectoral",
      "Axilar medio",
      "Tríceps",
      "Subescapular",
      "Suprailíaco",
      "Abdominal",
      "Muslo",
    ][index],
    unit: "mm",
    max: 120,
  })),
];
const skinKeys = fields.slice(4).map((f) => f.key);
export interface Formula {
  id: FormulaId;
  name: string;
  short: string;
  use: string;
  requires: string;
  calculation: string;
  unit: string;
  guidance: string;
  limitations: string;
  applicability: string;
  sources: Reference[];
  version: string;
}
const jp = {
  requires:
    "Pectoral, axilar medio, tríceps, subescapular, suprailíaco, abdominal y muslo (mm); edad y sexo de la ecuación.",
  applicability:
    "Ecuación masculina: 18–61 años. Femenina: 18–55 años. Adultos no gestantes; no extrapolar a otras poblaciones.",
  limitations:
    "Depende de la técnica del evaluador y del plicómetro. Las poblaciones originales no representan a toda la población actual.",
  sources: [JP_M, JP_F],
  version: ENGINE_VERSION,
};
export const formulas: Formula[] = [
  {
    id: "bmi",
    name: "IMC",
    short: "Relaciona peso y talla como indicador general del estado ponderal.",
    use: "Descripción y clasificación poblacional en adultos.",
    requires: "Peso (kg) y talla (cm). Edad y contexto para clasificar.",
    calculation: "IMC = peso / (talla / 100)²",
    unit: "kg/m²",
    guidance:
      "Relaciona peso con talla. No distingue grasa de músculo; interpretar junto con la evaluación clínica.",
    limitations:
      "No mide composición corporal. La clasificación adulta no aplica a menores o gestación.",
    applicability:
      "Resultado numérico con peso y talla válidos; clasificación sólo en adultos no gestantes confirmados.",
    sources: [WHO_BMI],
    version: ENGINE_VERSION,
  },
  {
    id: "whr",
    name: "Índice cintura-cadera (ICC)",
    short: "Describe la proporción entre cintura y cadera.",
    use: "Complementar la descripción de la distribución corporal.",
    requires: "Cintura y cadera, ambas en cm.",
    calculation: "ICC = cintura / cadera",
    unit: "adimensional",
    guidance:
      "Describe proporciones corporales; no cuantifica grasa total. Este módulo no asigna una clasificación al ICC.",
    limitations:
      "El sitio anatómico y la técnica modifican el resultado; comparar con el mismo protocolo.",
    applicability:
      "Interpretación dependiente de edad, sexo y población. No se configuran umbrales universales.",
    sources: [WHO_WHR],
    version: ENGINE_VERSION,
  },
  {
    id: "jp7",
    name: "Jackson-Pollock 7",
    short: "Estima densidad corporal a partir de siete pliegues.",
    use: "Base para estimar grasa con una conversión de dos compartimentos.",
    ...jp,
    calculation:
      "S = suma de 7 pliegues (mm). Masculina: D = 1.112 − 0.00043499S + 0.00000055S² − 0.00028826edad. Femenina: D = 1.097 − 0.00046971S + 0.00000056S² − 0.00012828edad.",
    unit: "g/cm³",
    guidance:
      "Es una estimación de densidad; no un porcentaje de grasa. La conversión elegida debe quedar identificada.",
  },
  {
    id: "siri",
    name: "Jackson-Pollock 7 + Siri",
    short:
      "Convierte la densidad estimada por siete pliegues en porcentaje de grasa.",
    use: "Estimar composición corporal con un modelo de dos compartimentos.",
    ...jp,
    sources: [JP_M, JP_F, SIRI],
    calculation: "Primero Jackson-Pollock 7; % grasa = 495 / D − 450.",
    unit: "%",
    guidance:
      "Estimación por pliegues + Siri. Comparar con el mismo método, no con bioimpedancia.",
    limitations:
      jp.limitations +
      " Asume densidades constantes de grasa y masa libre de grasa.",
  },
  {
    id: "brozek",
    name: "Jackson-Pollock 7 + Brozek",
    short: "Conversión alternativa de densidad a porcentaje de grasa.",
    use: "Documentar una estimación con una conversión explícita y reproducible.",
    ...jp,
    sources: [JP_M, JP_F, BROZEK],
    calculation: "Primero Jackson-Pollock 7; % grasa = 457 / D − 414.2.",
    unit: "%",
    guidance:
      "No intercambiar con Siri o BIA para evaluar evolución. Conservar la conversión usada.",
    limitations:
      jp.limitations +
      " Asume composición constante de la masa libre de grasa.",
  },
];
export const displayNumber = (n: number) =>
  Number(n.toFixed(2)).toLocaleString("es-MX", { maximumFractionDigits: 2 });
const norm = (s: string) => s.trim().toLocaleLowerCase();
export function validateInput(i: AssessmentInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(Date.parse(i.measuredAt)))
    errors.push("Indica una fecha válida de medición.");
  for (const f of fields) {
    const n = i.measurements[f.key];
    if (n !== undefined && (!Number.isFinite(n) || n <= 0 || n > f.max))
      errors.push(`${f.label}: revisa el valor en ${f.unit}.`);
  }
  if (i.age !== null && (!Number.isFinite(i.age) || i.age < 0 || i.age > 120))
    errors.push("Revisa la edad en años cumplidos.");
  if (
    i.bia.fat !== null &&
    (!Number.isFinite(i.bia.fat) || i.bia.fat <= 0 || i.bia.fat >= 100)
  )
    errors.push(
      "El porcentaje de grasa BIA debe ser mayor que 0 y menor que 100.",
    );
  if (i.bia.fat !== null && !i.bia.device.trim())
    errors.push("Identifica fabricante, modelo y equipo de bioimpedancia.");
  if (
    i.bia.fastingHours !== null &&
    (!Number.isFinite(i.bia.fastingHours) ||
      i.bia.fastingHours < 0 ||
      i.bia.fastingHours > 72)
  )
    errors.push("Revisa las horas de ayuno.");
  return errors;
}
export function calculate(i: AssessmentInput): {
  results: Result[];
  notices: string[];
} {
  const results: Result[] = [],
    notices = validateInput(i);
  if (notices.length) return { results, notices };
  const m = i.measurements,
    protocol = norm(i.protocol);
  const add = (
    id: string,
    label: string,
    value: number,
    unit: string,
    method: string,
    inputs: Result["inputs"],
    options: Partial<Result> = {},
  ) => {
    if (!Number.isFinite(value)) return;
    const primarySource = options.sources?.at(-1) ?? null;
    results.push({
      id,
      metric: id,
      label,
      value,
      unit,
      method,
      methodVersion: ENGINE_VERSION,
      provenance: "calculated",
      inputs,
      compatibilityKey: null,
      classification: null,
      reference: null,
      reference_id: primarySource?.id ?? null,
      reference_version: primarySource?.version ?? null,
      sources: [],
      guidance: "Dato registrado; interpretar en el contexto de la consulta.",
      ...options,
    });
  };
  for (const f of fields)
    if (m[f.key] !== undefined)
      add(
        f.key,
        f.label,
        m[f.key]!,
        f.unit,
        "Medición directa",
        {
          [f.label]: `${m[f.key]} ${f.unit}`,
          Protocolo: i.protocol || "No registrado",
          ...(f.key === "weight" && i.scale ? { Báscula: i.scale } : {}),
          ...(f.unit === "mm" && i.caliper ? { Plicómetro: i.caliper } : {}),
        },
        {
          provenance: "measured",
          compatibilityKey:
            protocol &&
            (f.key !== "weight" || norm(i.scale)) &&
            (f.unit !== "mm" || norm(i.caliper))
              ? `${f.key}:${f.unit}:${protocol}:${f.key === "weight" ? norm(i.scale) : f.unit === "mm" ? norm(i.caliper) : ""}`
              : null,
        },
      );
  for (const id of i.selected) {
    const f = formulas.find((f) => f.id === id);
    if (!f) continue;
    const opts: Partial<Result> = {
      formula: id,
      calculation:
        (id === "siri" || id === "brozek"
          ? formulas.find((f) => f.id === "jp7")!.calculation + " "
          : "") + f.calculation,
      sources: f.sources,
      guidance: f.guidance,
    };
    if (id === "bmi") {
      if (!m.weight || !m.height) {
        notices.push("IMC: falta peso o talla.");
        continue;
      }
      const value = m.weight / (m.height / 100) ** 2,
        ref = classifyBmi(value, i);
      add(
        id,
        f.name,
        value,
        f.unit,
        f.name,
        { Peso: `${m.weight} kg`, Talla: `${m.height} cm` },
        {
          ...opts,
          ...ref,
          reference_id: ref.reference?.id ?? null,
          reference_version: ref.reference?.version ?? null,
          compatibilityKey:
            protocol && norm(i.scale)
              ? `bmi:${ENGINE_VERSION}:${protocol}:${norm(i.scale)}`
              : null,
        },
      );
    } else if (id === "whr") {
      if (!m.waist || !m.hip) {
        notices.push("ICC: falta cintura o cadera.");
        continue;
      }
      add(
        id,
        f.name,
        m.waist / m.hip,
        f.unit,
        f.name,
        { Cintura: `${m.waist} cm`, Cadera: `${m.hip} cm` },
        {
          ...opts,
          compatibilityKey: protocol
            ? `whr:${ENGINE_VERSION}:${protocol}`
            : null,
        },
      );
    } else {
      if (skinKeys.some((k) => !m[k]) || i.age == null || !i.sex) {
        notices.push(
          `${f.name}: completa siete pliegues, edad y sexo requerido por la ecuación.`,
        );
        continue;
      }
      if (
        i.context !== "adult" ||
        i.age < 18 ||
        i.age > (i.sex === "male" ? 61 : 55)
      ) {
        notices.push(
          `${f.name}: no aplicable a la edad o contexto registrados.`,
        );
        continue;
      }
      const sum = skinKeys.reduce((s, k) => s + m[k]!, 0);
      const density =
        i.sex === "male"
          ? 1.112 -
            0.00043499 * sum +
            0.00000055 * sum ** 2 -
            0.00028826 * i.age
          : 1.097 -
            0.00046971 * sum +
            0.00000056 * sum ** 2 -
            0.00012828 * i.age;
      const value =
        id === "jp7"
          ? density
          : id === "siri"
            ? 495 / density - 450
            : 457 / density - 414.2;
      if (density <= 0 || (id !== "jp7" && (value <= 0 || value >= 100))) {
        notices.push(
          `${f.name}: resultado fuera del dominio físico; revisa los datos y el método.`,
        );
        continue;
      }
      add(
        id,
        id === "jp7" ? "Densidad corporal" : "% grasa",
        value,
        f.unit,
        f.name,
        {
          ...Object.fromEntries(
            fields.slice(4).map((f) => [f.label, `${m[f.key]} mm`]),
          ),
          Edad: i.age,
          "Sexo de ecuación": i.sex === "male" ? "Masculino" : "Femenino",
          "Suma de pliegues (mm)": sum,
          "Densidad (g/cm³)": density,
        },
        {
          ...opts,
          metric: id === "jp7" ? "density" : "fat",
          compatibilityKey:
            protocol && norm(i.caliper)
              ? `${id}:${ENGINE_VERSION}:${i.sex}:${protocol}:${norm(i.caliper)}`
              : null,
        },
      );
    }
  }
  if (i.bia.fat !== null)
    add(
      "bia",
      "% grasa",
      i.bia.fat,
      "%",
      `Bioimpedancia · ${i.bia.device.trim()}`,
      { Equipo: i.bia.device, Protocolo: i.bia.protocol || "No registrado" },
      {
        metric: "fat",
        provenance: "device",
        compatibilityKey: i.bia.protocol.trim()
          ? `bia:${norm(i.bia.device)}:${norm(i.bia.protocol)}`
          : null,
        guidance:
          "Valor transcrito del dispositivo. La hidratación, ayuno y ejercicio pueden afectar la comparabilidad; no equivale a una estimación por pliegues.",
      },
    );
  if (m.weight)
    for (const r of results.filter((r) => r.metric === "fat"))
      for (const lean of [false, true]) {
        const metric = lean ? "ffm" : "fat_mass";
        add(
          `${r.id}-${metric}`,
          lean ? "Masa libre de grasa" : "Masa grasa",
          m.weight * (lean ? 1 - r.value / 100 : r.value / 100),
          "kg",
          r.method,
          { Peso: `${m.weight} kg`, "Grasa utilizada": `${r.value} %` },
          {
            metric,
            sources: r.sources,
            calculation:
              (r.calculation ? r.calculation + " " : "") +
              (lean
                ? "Masa libre de grasa = peso × (1 − % grasa / 100)."
                : "Masa grasa = peso × % grasa / 100."),
            compatibilityKey:
              r.compatibilityKey && protocol && norm(i.scale)
                ? `${r.compatibilityKey}:${metric}:${protocol}:${norm(i.scale)}`
                : null,
            guidance:
              "Derivada de peso y porcentaje de grasa de este método. Masa libre de grasa no equivale a masa muscular.",
          },
        );
      }
  return { results, notices };
}
export function latestRecords(records: AnthroRecord[]): AnthroRecord[] {
  const latest = new Map<string, AnthroRecord>();
  for (const r of records)
    if (
      !latest.has(r.consultation_id) ||
      latest.get(r.consultation_id)!.revision < r.revision
    )
      latest.set(r.consultation_id, r);
  return [...latest.values()].sort(
    (a, b) => Date.parse(b.measured_at) - Date.parse(a.measured_at),
  );
}
export function compare(
  results: Result[],
  input: AssessmentInput,
  records: AnthroRecord[],
  consultationId: string,
): Result[] {
  const previous = latestRecords(records).filter(
    (r) =>
      r.consultation_id !== consultationId &&
      Date.parse(r.measured_at) < Date.parse(input.measuredAt),
  );
  return results.map((result) => {
    if (!result.compatibilityKey) return result;
    for (const record of previous) {
      const old = record.payload.results.find(
        (r) =>
          r.metric === result.metric &&
          r.unit === result.unit &&
          r.compatibilityKey === result.compatibilityKey,
      );
      if (!old) continue;
      const bia =
        result.isBioimpedance || result.method.startsWith("Bioimpedancia");
      const conditionsDiffer =
        bia &&
        ["fastingHours", "recentExercise", "hydration", "notes"].some(
          (key) =>
            record.payload.input.bia[key as keyof AssessmentInput["bia"]] !==
            input.bia[key as keyof AssessmentInput["bia"]],
        );
      return {
        ...result,
        previous: {
          value: old.value,
          delta: result.value - old.value,
          measuredAt: record.measured_at,
          recordId: record.id,
          conditionsDiffer,
          conditions: bia ? record.payload.input.bia : null,
        },
      };
    }
    return result;
  });
}
export function formatResultNumber(value: number, r: Result): string {
  return value.toLocaleString("es-MX", {
    maximumFractionDigits: r.decimal_places ?? 2,
  });
}
export function resultText(r: Result): string {
  return `${r.label}: ${formatResultNumber(r.display_value ?? r.value, r)} ${r.unit} · ${r.method}`;
}
export function changeText(r: Result): string {
  return r.previous
    ? `${r.label}: ${r.previous.delta > 0 ? "+" : ""}${formatResultNumber(r.previous.delta, r)} ${r.unit === "%" ? "puntos porcentuales" : r.unit} desde ${new Date(r.previous.measuredAt).toLocaleDateString("es-MX")} · ${r.method}`
    : "";
}
export function createNote(results: Result[], input: AssessmentInput): string {
  const changes = results.filter((r) => r.previous).map(changeText);
  const describeConditions = (b: AssessmentInput["bia"]) =>
    [
      b.fastingHours !== null ? `ayuno ${b.fastingHours} h` : "",
      b.recentExercise
        ? `ejercicio reciente: ${b.recentExercise === "yes" ? "sí" : "no"}`
        : "",
      b.hydration
        ? `hidratación: ${b.hydration === "usual" ? "habitual" : "cambió"}`
        : "",
      b.notes,
    ]
      .filter(Boolean)
      .join("; ");
  return [
    "DATOS ACTUALES",
    ...results.map(resultText),
    "",
    "COMPARACIÓN",
    ...(changes.length ? changes : ["Sin mediciones anteriores comparables."]),
    ...new Set(
      results
        .filter((r) => r.previous?.conditionsDiffer)
        .map(
          (r) =>
            `${r.method}: las condiciones de medición difieren respecto a la consulta anterior.`,
        ),
    ),
    "",
    "MÉTODOS",
    ...new Set(results.map((r) => `${r.method} · versión ${r.methodVersion}`)),
    ...(input.protocol ? [`Protocolo de medición: ${input.protocol}`] : []),
    ...(input.scale && input.measurements.weight
      ? [`Báscula: ${input.scale}`]
      : []),
    ...(input.caliper && skinKeys.some((k) => input.measurements[k])
      ? [`Plicómetro: ${input.caliper}`]
      : []),
    ...(input.bia.fat !== null || results.some((r) => r.isBioimpedance)
      ? [
          ...(input.bia.protocol
            ? [`Protocolo BIA: ${input.bia.protocol}`]
            : []),
          ...(describeConditions(input.bia)
            ? [`Condiciones BIA actuales: ${describeConditions(input.bia)}.`]
            : []),
          ...new Set(
            results
              .filter((r) => r.previous?.conditions)
              .map((r) =>
                describeConditions(r.previous!.conditions!)
                  ? `Condiciones BIA anteriores (${r.method}): ${describeConditions(r.previous!.conditions!)}.`
                  : "",
              )
              .filter(Boolean),
          ),
        ]
      : []),
    "",
    "INTERPRETACIÓN PROFESIONAL",
    "",
    "PLAN DE MONITOREO",
    "",
  ].join("\n");
}
export function payloadHasContent(p: AnthroPayload): boolean {
  return (
    Object.keys(p.input.measurements).length > 0 ||
    p.input.bia.fat !== null ||
    p.assessment.some((v) => v.trim()) ||
    !!p.note.trim() ||
    p.diagnosis.enabled
  );
}
