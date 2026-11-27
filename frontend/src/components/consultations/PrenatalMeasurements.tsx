import { useEffect, useState, type ReactNode } from "react";
import { Save } from "lucide-react";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import { Input } from "@/src/components/ui/FormField";
import type { Consultation, Patient } from "@/src/types/domain";
import { calculateAge, formatPatientDate } from "@/src/features/patients/patientUtils";
import {
  activityOptions, clinicalNumber, daysBetween, driReferenceUrl, evaluatePrenatalMeasurements,
  extractPrenatalInterview, gainVelocity, gestationalAge, maxReferenceGestation, prenatalOptionalFields, weightSourceOptions,
  type PhysicalActivity, type PregnancyType, type PrenatalOptionalField, type PrenatalWeightPoint, type WeightSource,
} from "@/src/features/consultations/prenatalMeasurements";
import {
  loadPrenatalMeasurements, savePrenatalMeasurements,
  type PrenatalRecord, type PrenatalMeasurements as MeasurementData,
} from "@/src/services/prenatalMeasurements";
import { formatKg, PrenatalEvolutionChart, PrenatalGainChart } from "./PrenatalWeightCharts";
import "./PrenatalMeasurements.css";

type Props = {
  consultation: Consultation;
  patient: Patient;
  clinicalDate: string;
  answers: Readonly<Record<string, unknown>>;
  optionalFields: PrenatalOptionalField[];
  onPendingChange: (pending: boolean) => void;
  beforeSave: () => Promise<boolean>;
  openInterview: () => void;
};
type PrenatalDraft = {
  weeks: string;
  days: string;
  type: PregnancyType | "";
  preWeight: string;
  source: WeightSource | "";
  activity: PhysicalActivity | "";
  edema: string;
  previousDate: string;
  previousWeight: string;
};

const newPregnancy = "new";
const emptyData: MeasurementData = { records: [], measurements: {} };
const textValue = (value: number | null | undefined) => value == null ? "" : String(value);
const selectClass = "nuth-input mt-1.5 block w-full";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="prenatal-field"><span>{label}</span>{children}</label>;
}

function NumberField({ label, value, onChange, integer, readOnly }: {
  label: string; value: string; onChange: (value: string) => void; integer?: boolean; readOnly?: boolean;
}) {
  return <Field label={label}><Input className="mt-1.5" inputMode={integer ? "numeric" : "decimal"}
    value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} placeholder="—" /></Field>;
}

function pregnancyDraft(record?: PrenatalRecord): PrenatalDraft {
  return {
    weeks: textValue(record?.gestation_days != null ? Math.floor(record.gestation_days / 7) : null),
    days: textValue(record?.gestation_days != null ? record.gestation_days % 7 : null),
    type: record?.pregnancy_type ?? "",
    preWeight: textValue(record?.pre_pregnancy_weight),
    source: record?.weight_source ?? "",
    activity: record?.activity ?? "",
    edema: record?.edema == null ? "" : String(record.edema),
    previousDate: record?.previous_date ?? "",
    previousWeight: textValue(record?.previous_weight),
  };
}

function weightPoints(records: PrenatalRecord[], current: PrenatalWeightPoint | null) {
  const points = new Map<string, PrenatalWeightPoint>();
  const chronological = records.toReversed();
  for (const record of chronological) {
    if (record.previous_weight !== null && record.previous_date && record.gestation_days !== null) {
      const days = record.gestation_days - daysBetween(record.previous_date, record.date);
      if (days >= 0 && days < record.gestation_days) {
        points.set(record.previous_date, { date: record.previous_date, days, weight: record.previous_weight });
      }
    }
  }
  for (const record of chronological) {
    if (record.weight !== null && record.gestation_days !== null) {
      points.set(record.date, { date: record.date, days: record.gestation_days, weight: record.weight });
    }
  }
  if (current) points.set(current.date, current);
  return [...points.values()].sort((a, b) => a.days - b.days || a.date.localeCompare(b.date));
}

function referenceGuidance(gestationPending: boolean, type: PregnancyType | null, age: number | null, height: number | null) {
  if (type === "multiple") return "El intervalo orientativo de este espacio corresponde a embarazos únicos.";
  if (age !== null && age < 18) return "El intervalo orientativo de este espacio corresponde a pacientes adultas.";
  if (gestationPending) return "Confirma la gestación en la entrevista para mostrar el intervalo orientativo.";
  if (type === null) return "Confirma el tipo de embarazo para mostrar el intervalo orientativo.";
  if (height === null && age === null) return "Registra la talla y completa la fecha de nacimiento en la ficha para mostrar el intervalo orientativo.";
  if (height === null) return "Registra la talla para mostrar el intervalo orientativo.";
  if (age === null) return "Completa la fecha de nacimiento en la ficha para mostrar el intervalo orientativo.";
  return null;
}

export function PrenatalMeasurements({ consultation, patient, clinicalDate, answers, optionalFields, onPendingChange, beforeSave, openInterview }: Props) {
  const [data, setData] = useState(emptyData);
  const [pregnancy, setPregnancy] = useState("");
  const [draft, setDraft] = useState(pregnancyDraft);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void loadPrenatalMeasurements(consultation.id).then((result) => {
      if (!active) return;
      const current = result.records.find((record) => record.consultation_id === consultation.id);
      setData(result);
      setPregnancy(current?.pregnancy_id ?? (result.records.length ? "" : newPregnancy));
      setDraft(pregnancyDraft(current));
      setMeasurements(Object.fromEntries(Object.entries(result.measurements).map(([key, value]) => [key, textValue(value)])));
      setError("");
      setLoading(false);
    }).catch((cause: Error) => {
      if (!active) return;
      setError(cause.message);
      setLoading(false);
    });
    return () => { active = false; };
  }, [consultation.id, attempt]);

  useEffect(() => { onPendingChange(dirty || saving || loading); }, [dirty, saving, loading, onPendingChange]);

  const interview = extractPrenatalInterview(answers);
  const age = calculateAge(patient.birth_date, new Date(clinicalDate + "T12:00:00"));
  const weeks = interview.weeks === null ? draft.weeks : String(interview.weeks);
  const days = interview.days === null ? draft.days : String(interview.days);
  const gestation = gestationalAge(weeks, days);
  const type = interview.type ?? (interview.typePending ? null : draft.type || null);
  const preWeightText = interview.preWeight === null ? draft.preWeight : String(interview.preWeight);
  const preWeight = clinicalNumber(preWeightText, 0.1, 1000);
  const source = interview.preWeight === null ? draft.source : (interview.source ?? draft.source);
  const weight = clinicalNumber(measurements.weight, 0.1, 1000);
  const lastHeight = data.records.find((record) => record.pregnancy_id === pregnancy
    && record.consultation_id !== consultation.id && record.date < clinicalDate && record.height !== null)?.height;
  const heightText = measurements.height ?? textValue(patient.height_cm ?? lastHeight);
  const height = clinicalNumber(heightText, 20, 300);
  const previousWeight = clinicalNumber(draft.previousWeight, 0.1, 1000);
  const results = evaluatePrenatalMeasurements({ age, height, preWeight, weight, days: gestation,
    type: interview.gestationPending ? null : type, activity: draft.activity || null });
  const currentPoint = gestation === null || weight === null ? null : { days: gestation, weight, date: clinicalDate, current: true };
  const loggedBefore = data.records.filter((record) => record.pregnancy_id === pregnancy && record.consultation_id !== consultation.id && record.date < clinicalDate);
  const points = weightPoints(loggedBefore, currentPoint);
  if (previousWeight !== null && draft.previousDate && gestation !== null) {
    const elapsed = daysBetween(draft.previousDate, clinicalDate);
    if (elapsed > 0 && elapsed <= gestation && !points.some((point) => point.date === draft.previousDate)) {
      points.push({ date: draft.previousDate, days: gestation - elapsed, weight: previousWeight });
      points.sort((a, b) => a.days - b.days || a.date.localeCompare(b.date));
    }
  }
  const canCompareHistory = Boolean(pregnancy);
  const velocity = canCompareHistory ? gainVelocity(points, currentPoint) : null;
  const weekLabel = gestation === null ? null : `Semana ${Math.floor(gestation / 7)}${gestation % 7 ? ` + ${gestation % 7} días` : ""}`;
  const episodes = [...new Map(data.records.toReversed().map((record) => [record.pregnancy_id, record])).values()].reverse();
  const currentRecord = data.records.find((record) => record.consultation_id === consultation.id);

  const markEdited = () => { setDirty(true); setNotice(""); setError(""); };
  const edit = <K extends keyof typeof draft,>(key: K, value: (typeof draft)[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    markEdited();
  };
  const editMeasurement = (key: string, value: string) => {
    setMeasurements((current) => ({ ...current, [key]: value }));
    markEdited();
  };
  const changePregnancy = (id: string) => {
    const existing = data.records.filter((record) => record.pregnancy_id === id);
    const baseline = existing.find((record) => record.pre_pregnancy_weight !== null);
    setPregnancy(id);
    if (currentRecord?.pregnancy_id === id) setDraft(pregnancyDraft(currentRecord));
    else setDraft((current) => ({
      ...current, type: existing.find((record) => record.pregnancy_type)?.pregnancy_type ?? "",
      preWeight: textValue(baseline?.pre_pregnancy_weight), source: baseline?.weight_source ?? "",
      previousDate: "", previousWeight: "",
    }));
    markEdited();
  };

  const save = async () => {
    if (saving) return;
    if (!pregnancy) { setError("Elige a qué embarazo corresponde esta medición."); return; }
    if ((weeks !== "" || days !== "") && gestation === null) {
      setError("Revisa la edad gestacional. Usa semanas completas y de 0 a 6 días adicionales.");
      return;
    }
    if (preWeightText.trim() && preWeight === null) { setError("Revisa el peso pregestacional en kg."); return; }
    if (draft.previousDate || draft.previousWeight.trim()) {
      const elapsed = daysBetween(draft.previousDate, clinicalDate);
      if (previousWeight === null || !draft.previousDate || !Number.isFinite(elapsed) || elapsed <= 0 || (gestation !== null && elapsed > gestation)) {
        setError("Registra un peso válido y una fecha anterior de este mismo embarazo.");
        return;
      }
    }
    const payload: Record<string, number | null> = {};
    const specs = [
      ["weight", measurements.weight ?? "", 0.1, 1000, "el peso actual"],
      ["height", heightText, 20, 300, "la talla"],
      ["relaxed_arm_circumference", measurements.relaxed_arm_circumference ?? "", 0.1, 150, "la circunferencia del brazo"],
      ["systolic_blood_pressure", measurements.systolic_blood_pressure ?? "", 1, 400, "la presión sistólica"],
      ["diastolic_blood_pressure", measurements.diastolic_blood_pressure ?? "", 1, 300, "la presión diastólica"],
    ] as const;
    for (const [key, raw, min, max, label] of specs) {
      const value = clinicalNumber(raw, min, max);
      if (raw.trim() && value === null) { setError(`Revisa ${label}.`); return; }
      if (key in measurements || (key === "height" && value !== null)) payload[key] = value;
    }
    setSaving(true);
    setError("");
    try {
      if (!await beforeSave()) {
        setError("Guarda los datos de la consulta antes de guardar las mediciones.");
        return;
      }
      const saved = await savePrenatalMeasurements(consultation.id, pregnancy === newPregnancy ? null : pregnancy, {
        gestation_days: gestation,
        pregnancy_type: type,
        pre_pregnancy_weight: preWeight,
        weight_source: preWeight === null ? null : (source || "unspecified"),
        activity: draft.activity || null,
        edema: draft.edema ? draft.edema === "true" : null,
        previous_weight: previousWeight,
        previous_date: draft.previousDate || null,
      }, payload);
      const current = saved.records.find((record) => record.consultation_id === consultation.id);
      setData(saved);
      setPregnancy(current?.pregnancy_id ?? pregnancy);
      setDraft(pregnancyDraft(current));
      setMeasurements(Object.fromEntries(Object.entries(saved.measurements).map(([key, value]) => [key, textValue(value)])));
      setDirty(false);
      setNotice("Mediciones prenatales guardadas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos guardar las mediciones.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Cargando mediciones prenatales…" />;
  if (error && data === emptyData) return <ErrorState message={error} onRetry={() => { setLoading(true); setAttempt(attempt + 1); }} />;

  const options = {
    arm: <NumberField label="Circunferencia media del brazo (cm)" value={measurements.relaxed_arm_circumference ?? ""} onChange={(value) => editMeasurement("relaxed_arm_circumference", value)} />,
    blood_pressure: <div className="prenatal-field-pair">
      <NumberField label="Presión sistólica (mmHg)" value={measurements.systolic_blood_pressure ?? ""} onChange={(value) => editMeasurement("systolic_blood_pressure", value)} />
      <NumberField label="Presión diastólica (mmHg)" value={measurements.diastolic_blood_pressure ?? ""} onChange={(value) => editMeasurement("diastolic_blood_pressure", value)} />
    </div>,
    edema: <Field label="Edema"><select className={selectClass} value={draft.edema} onChange={(event) => edit("edema", event.target.value)}>
      <option value="">Sin registrar</option><option value="false">Ausente</option><option value="true">Presente</option>
    </select></Field>,
    previous_weight: <div className="prenatal-field-pair">
      <NumberField label="Peso anterior del mismo embarazo (kg)" value={draft.previousWeight} onChange={(value) => edit("previousWeight", value)} />
      <Field label="Fecha del peso anterior"><Input className="mt-1.5" type="date" value={draft.previousDate} max={clinicalDate} onChange={(event) => edit("previousDate", event.target.value)} /></Field>
    </div>,
  };

  const energyPending = interview.gestationPending ? "Confirma la gestación en la entrevista."
    : gestation !== null && (gestation < 98 || gestation > maxReferenceGestation)
    ? "La estimación gestacional está disponible de la semana 14 a la 42."
    : type === "multiple" || (age !== null && age < 18)
      ? "La estimación de este espacio corresponde a pacientes adultas con embarazo único."
      : `Falta ${[age === null && "edad", height === null && "talla", preWeight === null && "peso pregestacional", weight === null && "peso actual", gestation === null && "edad gestacional", type === null && "tipo de embarazo", !draft.activity && "actividad habitual"].filter(Boolean).join(", ")}.`;
  const referenceNotice = referenceGuidance(interview.gestationPending, type, age, height);
  const gainNotice = results.range ? null : referenceNotice ?? (gestation === null
    ? "Registra la edad gestacional para mostrar el intervalo orientativo de esta consulta."
    : "La comparación por semana se muestra desde la semana 13 hasta la semana 42 con 6 días.");
  const missingGain = preWeight === null && weight === null ? "Registra el peso pregestacional y el peso actual para calcular la ganancia."
    : preWeight === null ? "Registra el peso pregestacional para calcular la ganancia."
      : "Registra el peso actual para calcular la ganancia.";
  const pointNotice = currentPoint ? null : (weight === null && gestation === null
    ? "Registra el peso actual y la edad gestacional para ubicar esta consulta."
    : weight === null ? "Registra el peso actual para ubicar esta consulta."
      : "Registra la edad gestacional para ubicar este peso en la gráfica.");

  return <section className="prenatal-workspace min-w-0" aria-label="Mediciones prenatales">
    <header className="consultation-section-banner prenatal-banner">
      <div><h2>Mediciones prenatales</h2><p>Registra el peso de la consulta y revisa su evolución durante el embarazo.</p></div>
      <button type="button" className="nuth-button" disabled={saving} onClick={() => void save()}><Save size={16} />{saving ? "Guardando…" : "Guardar mediciones"}</button>
    </header>
    {error && <p className="prenatal-alert" role="alert">{error}</p>}
    {notice && <p className="prenatal-notice" role="status">{notice}</p>}
    <fieldset className="prenatal-card prenatal-capture" disabled={saving}>
      <div className="prenatal-capture-top">
        <h3>Datos para la valoración</h3>
        {(interview.weeks !== null || interview.preWeight !== null || interview.type !== null || interview.typePending || interview.gestationPending) &&
          <button type="button" className="nuth-button-secondary" onClick={openInterview}>Editar datos de la entrevista</button>}
      </div>
      {episodes.some((episode) => episode.consultation_id !== consultation.id) &&
        <Field label="Embarazo al que corresponde la medición">
          <select className={selectClass} value={pregnancy} onChange={(event) => changePregnancy(event.target.value)}>
            <option value="" disabled>Selecciona un embarazo</option>
            {episodes.map((episode) => <option key={episode.pregnancy_id} value={episode.pregnancy_id}>Registro del {formatPatientDate(episode.date)}</option>)}
            {!currentRecord && <option value={newPregnancy}>Registrar un embarazo nuevo</option>}
          </select>
        </Field>}
      <div className="prenatal-fields">
        <NumberField label="Peso actual (kg)" value={measurements.weight ?? ""} onChange={(value) => editMeasurement("weight", value)} />
        <NumberField label="Talla (cm)" value={heightText} onChange={(value) => editMeasurement("height", value)} />
        <div className="prenatal-field-pair">
          <NumberField label="Semanas de gestación" value={weeks} integer readOnly={interview.weeks !== null} onChange={(value) => edit("weeks", value)} />
          <NumberField label="Días adicionales" value={days} integer readOnly={interview.days !== null} onChange={(value) => edit("days", value)} />
        </div>
        <Field label="Tipo de embarazo"><select className={selectClass} disabled={interview.type !== null || interview.typePending} value={type ?? ""} onChange={(event) => edit("type", event.target.value as PregnancyType | "")}>
          <option value="">{interview.typePending ? "Por confirmar en la entrevista" : "Sin registrar"}</option><option value="single">Único</option><option value="multiple">Múltiple</option>
        </select></Field>
        <NumberField label="Peso pregestacional (kg)" value={preWeightText} readOnly={interview.preWeight !== null} onChange={(value) => edit("preWeight", value)} />
        <Field label="Origen del peso pregestacional"><select className={selectClass}
          disabled={interview.preWeight !== null && interview.source !== null} value={source} onChange={(event) => edit("source", event.target.value as WeightSource | "")}>
          <option value="">Sin registrar</option>
          {Object.entries(weightSourceOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></Field>
        <Field label="Actividad física habitual"><select className={selectClass} value={draft.activity} onChange={(event) => edit("activity", event.target.value as PhysicalActivity | "")}>
          <option value="">Selecciona la actividad</option>
          {Object.entries(activityOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></Field>
        <p className="prenatal-age"><strong>Edad en esta consulta</strong><span>{age === null ? "Completa la fecha de nacimiento en la ficha" : `${age} años`}</span></p>
      </div>
      {optionalFields.length > 0 && <details className="prenatal-optional"><summary>Mediciones complementarias</summary>
        <div className="prenatal-fields">{optionalFields.map((field) => <div key={field} aria-label={prenatalOptionalFields[field]}>{options[field]}</div>)}</div>
      </details>}
    </fieldset>
    <div className="prenatal-results" aria-label="Resultados prenatales">
      <section className="prenatal-card">
        <h3>IMC pregestacional</h3>
        {results.bmi !== null ? <><strong className="prenatal-result-value">{formatKg(results.bmi, 2)} kg/m²</strong>
          {results.category && <p>{results.category.label}{source === "estimated" ? " · Peso inicial estimado" : ""}</p>}
        </> : <p className="prenatal-muted">Completa el peso pregestacional y la talla.</p>}
        {results.reference && <p className="prenatal-muted">Referencia al término · {results.reference.total.join(" a ")} kg</p>}
      </section>
      <section className="prenatal-card">
        <h3>Ritmo entre mediciones</h3>
        {velocity ? <><strong className="prenatal-result-value">{Math.round(velocity.rate * 1000).toLocaleString("es-MX")} g/semana</strong><p className="prenatal-muted">Desde el {formatPatientDate(velocity.previous.date)}</p></>
          : <p className="prenatal-muted">Se calcula con dos pesos fechados de este embarazo.</p>}
        {results.reference && <p className="prenatal-muted">Referencia del 2.º y 3.º trimestre · {results.reference.rate.map((rate) => Math.round(1000 * rate)).join(" a ")} g/semana</p>}
      </section>
      <section className="prenatal-card">
        <h3>Energía estimada <span className="prenatal-muted">· DRI 2023</span></h3>
        {results.energy !== null ? <><strong className="prenatal-result-value">{Math.round(results.energy).toLocaleString("es-MX")} kcal/día</strong>
          <p className="prenatal-muted">Estimación para revisar antes de definir el plan de alimentación.</p>
        </> : <p className="prenatal-muted">{energyPending}</p>}
        <a className="prenatal-link" href={driReferenceUrl} target="_blank" rel="noreferrer">Ver ecuaciones DRI 2023</a>
      </section>
    </div>
    {results.gain !== null
      ? <PrenatalGainChart gain={results.gain} range={results.range} position={results.position} weekLabel={weekLabel} category={results.category?.label ?? null} notice={gainNotice} />
      : <section className="prenatal-card"><h3>Ganancia de peso acumulada</h3><p className="prenatal-muted">{missingGain}</p></section>}
    {preWeight !== null && canCompareHistory
      ? <PrenatalEvolutionChart points={points} baseline={preWeight} rate={results.reference?.rate ?? null}
        pointNotice={pointNotice} referenceNotice={referenceNotice} />
      : <section className="prenatal-card"><h3>Seguimiento de ganancia gestacional</h3><p className="prenatal-muted">{canCompareHistory ? "Registra el peso pregestacional para ver la ganancia por semana." : "Selecciona el embarazo para ver su evolución."}</p></section>}
  </section>;
}
