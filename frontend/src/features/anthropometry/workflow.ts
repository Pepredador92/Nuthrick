import {
  newPayload,
  type AnthroPayload,
  type AnthroRecord,
  type AssessmentInput,
} from "./model";
import { legacyCodes, measurementTypes } from "./catalog";
import {
  emptyConfiguration,
  type MeasurementDevice,
  type MeasurementType,
  type MeasurementWorkflow,
  type PatientMeasurementTemplate,
  type RegisteredMeasurement,
} from "./workflowTypes";
import type {
  Consultation,
  Patient,
  PatientMeasurement,
} from "@/src/types/domain";
import { latestRecords } from "./engine";
import { selectedMeasurements } from "./calculations";
export function ageAt(
  birth: string | null,
  date: string,
  timezone = "America/Mexico_City",
): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const [y, m, d] = birth.split("-").map(Number),
    datePart =
      date.length === 10
        ? date
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(date)),
    [cy, cm, cd] = datePart.split("-").map(Number);
  if (!y || !cy || !m || !d) return null;
  const age = cy - y - (cm < m || (cm === m && cd < d) ? 1 : 0);
  return age >= 0 && age <= 120 ? age : null;
}
export function newWorkflow(
  patient: Patient,
  c: Consultation,
  template: PatientMeasurementTemplate | null,
): MeasurementWorkflow {
  return {
    version: 2,
    configuration: structuredClone(
      template?.configuration ?? emptyConfiguration(),
    ),
    entries: {},
    calculations: [],
    calculated_at: null,
    calculation_signature: null,
    context: {
      birthDate: patient.birth_date,
      age: ageAt(patient.birth_date, c.consultation_date, patient.timezone),
      sex: patient.equation_sex ?? "",
      consultationDate: c.consultation_date,
      timezone: patient.timezone || "America/Mexico_City",
      fromPatient: true,
    },
    templateRevision: template?.revision ?? 0,
    templateScope: template ? "today" : "habitual",
  };
}
export function createEntry(
  t: MeasurementType,
  value: number,
  w: MeasurementWorkflow,
  c: Consultation,
  measuredAt: string,
  devices: MeasurementDevice[],
  source?: RegisteredMeasurement["source_type"],
): RegisteredMeasurement {
  const device =
    t.category === "bioimpedance" || source === "device"
      ? (devices.find((d) => d.id === w.configuration.deviceId) ?? null)
      : null;
  const equipment =
    t.code === "weight"
      ? w.configuration.scale
      : t.category === "skinfold"
        ? w.configuration.caliper
        : "";
  return {
    id: crypto.randomUUID(),
    patient_id: c.patient_id,
    consultation_id: c.id,
    measurement_type_id: t.id,
    code: t.code,
    name: t.name,
    value,
    unit: t.unit,
    source_type:
      source ?? (t.category === "bioimpedance" ? "device" : "manual"),
    device_id: device?.id ?? null,
    device,
    measured_at: measuredAt,
    created_at: new Date().toISOString(),
    created_by: c.professional_id,
    notes: "",
    protocol:
      t.category === "bioimpedance"
        ? w.configuration.biaProtocol
        : w.configuration.protocol
          ? w.configuration.protocol + (equipment ? " · " + equipment : "")
          : "",
  };
}
export function preparePayload(
  patient: Patient,
  c: Consultation,
  template: PatientMeasurementTemplate | null,
  existing?: AnthroRecord,
  devices: MeasurementDevice[] = [],
): AnthroPayload {
  if (existing?.payload.workflow) {
    const data = structuredClone(existing.payload);
    data.workflow!.templateRevision = template?.revision ?? 0;
    data.workflow!.templateScope = "today";
    data.workflow!.context.timezone =
      data.workflow!.context.timezone ||
      patient.timezone ||
      "America/Mexico_City";
    return data;
  }
  const payload = existing
    ? structuredClone(existing.payload)
    : newPayload(
        c.consultation_date,
        ageAt(patient.birth_date, c.consultation_date, patient.timezone),
      );
  const w = newWorkflow(patient, c, template);
  if (existing) {
    w.context = {
      ...w.context,
      age: payload.input.age,
      sex: payload.input.sex,
      fromPatient: false,
    };
    w.configuration = {
      ...emptyConfiguration(),
      entry: "indicators",
      measurements: Object.keys(payload.input.measurements)
        .map((k) => legacyCodes[k])
        .filter(Boolean),
      indicators: payload.input.selected
        .filter((k) => k === "bmi" || k === "whr" || k === "jp7")
        .map((k) =>
          k === "whr"
            ? "waist_hip_ratio"
            : k === "jp7"
              ? "body_density"
              : "bmi",
        ),
      methods: payload.input.selected
        .filter((k) => k === "siri" || k === "brozek")
        .map((k) => (k === "siri" ? "jp7_siri" : "jp7_brozek")),
      deviceId: null,
      protocol: payload.input.protocol,
      scale: payload.input.scale,
      caliper: payload.input.caliper,
      biaProtocol: payload.input.bia.protocol,
    };
    if (w.configuration.methods.length)
      w.configuration.indicators.push("body_fat", "fat_mass", "fat_free_mass");
    if (!w.configuration.methods.length) w.configuration.methods = ["jp7_siri"];
    for (const [key, value] of Object.entries(payload.input.measurements)) {
      const t = measurementTypes.find((t) => t.code === legacyCodes[key]);
      if (!t || value === undefined) continue;
      const e = createEntry(t, value, w, c, existing.measured_at, devices);
      e.notes =
        "Adaptada de la revisión anterior; el original permanece conservado.";
      w.entries[t.code] = e;
    }
    if (payload.input.bia.fat !== null) {
      const t = measurementTypes.find(
        (t) => t.code === "body_fat_percentage_device",
      )!;
      const device = devices.find(
        (d) =>
          (d.manufacturer + " " + d.model).toLowerCase() ===
          payload.input.bia.device.toLowerCase(),
      );
      w.configuration.measurements.push(t.code);
      w.configuration.deviceId = device?.id ?? null;
      w.entries[t.code] = createEntry(
        t,
        payload.input.bia.fat,
        w,
        c,
        existing.measured_at,
        devices,
      );
      w.entries[t.code].notes =
        "Equipo original: " +
        payload.input.bia.device +
        ". Confirma el equipo en el catálogo.";
    }
  }
  payload.workflow = w;
  payload.input.age = w.context.age;
  payload.input.sex = w.context.sex;
  return payload;
}
export function legacyInput(
  w: MeasurementWorkflow,
  input: AssessmentInput,
): AssessmentInput {
  const m: AssessmentInput["measurements"] = {};
  for (const [key, code] of Object.entries(legacyCodes))
    if (w.entries[code]) m[key as keyof typeof m] = w.entries[code].value;
  const device = Object.values(w.entries).find(
    (e) => e.source_type === "device",
  )?.device;
  return {
    ...input,
    age: w.context.age,
    sex: w.context.sex,
    measurements: m,
    protocol: w.configuration.protocol,
    scale: w.configuration.scale,
    caliper: w.configuration.caliper,
    bia: {
      ...input.bia,
      device: device
        ? device.manufacturer + " " + device.model
        : input.bia.device,
      protocol: w.configuration.biaProtocol,
      fat: w.entries.body_fat_percentage_device?.value ?? null,
    },
  };
}
export function previousHeight(
  records: AnthroRecord[],
  legacy: PatientMeasurement[],
  c: Consultation,
): RegisteredMeasurement | null {
  const candidates: RegisteredMeasurement[] = [];
  for (const r of latestRecords(records).filter(
    (r) => r.consultation_id !== c.id && r.measured_at < c.consultation_date,
  )) {
    const e = r.payload.workflow?.entries.height;
    if (e) {
      candidates.push(e);
      continue;
    }
    if (r.payload.input.measurements.height)
      candidates.push({
        id: r.id + ":height",
        patient_id: r.patient_id,
        consultation_id: r.consultation_id,
        measurement_type_id: "height",
        code: "height",
        name: "Talla",
        value: r.payload.input.measurements.height,
        unit: "cm",
        source_type: "manual",
        device_id: null,
        device: null,
        measured_at: r.measured_at,
        created_at: r.created_at,
        created_by: r.professional_id,
        notes: "Registro anterior",
        protocol: r.payload.input.protocol,
      });
  }
  for (const r of legacy.filter(
    (r) => r.consultation_id !== c.id && r.measured_at < c.consultation_date,
  ))
    candidates.push({
      id: r.id + ":height",
      patient_id: r.patient_id,
      consultation_id: r.consultation_id ?? "",
      measurement_type_id: "height",
      code: "height",
      name: "Talla",
      value: r.height_cm,
      unit: "cm",
      source_type: "manual",
      device_id: null,
      device: null,
      measured_at: r.measured_at,
      created_at: r.created_at,
      created_by: r.professional_id,
      notes: "Registro anterior del expediente",
      protocol: "",
    });
  return (
    candidates.sort((a, b) =>
      (b.original_measured_at ?? b.measured_at).localeCompare(
        a.original_measured_at ?? a.measured_at,
      ),
    )[0] ?? null
  );
}
export function activeEntries(w: MeasurementWorkflow) {
  return Object.fromEntries(
    selectedMeasurements(w.configuration)
      .filter((k) => w.entries[k])
      .map((k) => [k, w.entries[k]]),
  );
}
