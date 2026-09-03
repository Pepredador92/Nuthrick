import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Consultation, Patient } from "@/src/types/domain";
import {
  loadAnthropometry,
  loadGuidancePreference,
  saveAnthropometry,
  saveGuidancePreference,
} from "@/src/services/anthropometry";
import {
  calculate,
  changeText,
  compare,
  createNote,
  displayNumber,
  ENGINE_VERSION,
  fields,
  formulas,
  latestRecords,
  payloadHasContent,
  resultText,
  validateInput,
} from "./engine";
import type {
  AnthroPayload,
  AnthroRecord,
  AssessmentInput,
  Result,
} from "./model";
import { newPayload, prompts } from "./model";

const box = "rounded-2xl border border-[#dfe5e1] bg-white p-4 sm:p-6";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 text-sm">
      <span className="mb-2 block font-semibold">{label}</span>
      {children}
    </label>
  );
}
const localDate = (date: string) => {
  const d = new Date(date);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
function ageOn(birth: string | null, date: string): number | null {
  if (!birth) return null;
  const b = new Date(birth + "T12:00:00"),
    d = new Date(date);
  if (!Number.isFinite(b.getTime())) return null;
  return (
    d.getFullYear() -
    b.getFullYear() -
    (d.getMonth() < b.getMonth() ||
    (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())
      ? 1
      : 0)
  );
}
const conditions = (bia: AssessmentInput["bia"]) =>
  `Ayuno: ${bia.fastingHours ?? "sin registrar"} h · Ejercicio reciente: ${bia.recentExercise === "yes" ? "sí" : bia.recentExercise === "no" ? "no" : "sin registrar"} · Hidratación: ${bia.hydration === "usual" ? "habitual" : bia.hydration === "changed" ? "cambió" : "sin registrar"}${bia.notes ? ` · ${bia.notes}` : ""}`;

export function ResultCards({
  results,
  guidance = true,
  input,
}: {
  results: Result[];
  guidance?: boolean;
  input?: AssessmentInput;
}) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {results.map((r) => (
        <article
          key={r.id}
          className="min-w-0 rounded-xl border border-[#e1e8e2] bg-[#fbfcfa] p-4 [overflow-wrap:anywhere]"
        >
          <h4 className="font-semibold">{r.label}</h4>
          <p className="mt-2 text-xl font-semibold text-[#173d36]">
            {displayNumber(r.value)}{" "}
            <span className="text-xs font-normal">{r.unit}</span>
          </p>
          <p className="mt-1 text-xs text-[#5e7469]">
            {r.method} · v{r.methodVersion}
          </p>
          <p className="text-xs text-[#74817d]">
            {r.provenance === "calculated"
              ? "Calculado por Nuthrick"
              : r.provenance === "device"
                ? "Transcrito del dispositivo por el profesional"
                : "Medido y registrado por el profesional"}
          </p>
          {r.previous ? (
            <div className="mt-3 text-sm">
              <p>
                Anterior: {displayNumber(r.previous.value)} {r.unit}
              </p>
              <p>
                Cambio: {r.previous.delta > 0 ? "+" : ""}
                {displayNumber(r.previous.delta)}{" "}
                {r.unit === "%" ? "puntos porcentuales" : r.unit}
              </p>
              <p className="text-xs text-[#74817d]">
                {new Date(r.previous.measuredAt).toLocaleString("es-MX")}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-[#74817d]">
              {r.compatibilityKey
                ? "Sin resultado anterior comparable."
                : "Sin comparación: falta identificar protocolo o equipo."}
            </p>
          )}
          {r.classification && r.reference && (
            <div className="mt-3 rounded-lg bg-[#edf3ee] p-2 text-sm">
              <p>Clasificación de referencia: {r.classification}</p>
              <a
                className="text-xs underline"
                href={r.reference.url}
                target="_blank"
                rel="noreferrer"
              >
                {r.reference.title} · {r.reference.version}
              </a>
            </div>
          )}
          {r.previous?.conditionsDiffer && (
            <div className="mt-3 text-xs text-[#866027]">
              <p>
                Las condiciones de medición difieren respecto a la consulta
                anterior.
              </p>
              {input && <p className="mt-1">Actual: {conditions(input.bia)}</p>}
              {r.previous.conditions && (
                <p className="mt-1">
                  Anterior: {conditions(r.previous.conditions)}
                </p>
              )}
            </div>
          )}
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-semibold">
              Datos utilizados
            </summary>
            <dl className="mt-2 space-y-1">
              {Object.entries(r.inputs).map(([key, value]) => (
                <div key={key}>
                  <dt className="inline font-semibold">{key}: </dt>
                  <dd className="inline">{value}</dd>
                </div>
              ))}
            </dl>
            {r.calculation && (
              <p className="mt-3">Cálculo conservado: {r.calculation}</p>
            )}
          </details>
          {guidance && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer font-semibold text-[#3d705d]">
                ¿Qué significa este resultado?
              </summary>
              <p className="mt-2 leading-5">{r.guidance}</p>
              {r.sources.map((s) => (
                <a
                  key={s.id}
                  className="mt-1 block underline"
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.title} · {s.version}
                </a>
              ))}
            </details>
          )}
        </article>
      ))}
    </div>
  );
}

function RecordView({
  record,
  measurementsOnly = false,
}: {
  record: AnthroRecord;
  measurementsOnly?: boolean;
}) {
  const p = record.payload;
  return (
    <div className="space-y-5 [overflow-wrap:anywhere]">
      <p className="text-xs text-[#74817d]">
        Medición: {new Date(record.measured_at).toLocaleString("es-MX")} ·
        revisión {record.revision} · motor {p.engineVersion}
      </p>
      <ResultCards results={p.results} input={p.input} />
      {p.input.bia.fat !== null && (
        <p className="text-sm">Condiciones BIA: {conditions(p.input.bia)}</p>
      )}
      {!measurementsOnly && (
        <>
          <section>
            <h4 className="font-semibold">
              Valoración antropométrica · criterio profesional
            </h4>
            {p.assessment.map((a, index) =>
              a.trim() ? (
                <div key={index} className="mt-3">
                  <p className="text-xs font-semibold">{prompts[index]}</p>
                  <p className="whitespace-pre-wrap text-sm">{a}</p>
                </div>
              ) : null,
            )}
          </section>
          {p.note && (
            <section>
              <h4 className="font-semibold">Nota antropométrica revisada</h4>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                {p.note}
              </p>
            </section>
          )}
          {p.diagnosis.enabled && (
            <section className="rounded-xl bg-[#f5f1e9] p-4">
              <h4 className="font-semibold">
                Diagnóstico nutricional · registrado por el profesional
              </h4>
              {p.diagnosis.mode === "pes" ? (
                <>
                  <p className="mt-2">Problema: {p.diagnosis.problem}</p>
                  <p>Relacionado con: {p.diagnosis.etiology}</p>
                </>
              ) : (
                <p className="mt-2 whitespace-pre-wrap">
                  {p.diagnosis.narrative}
                </p>
              )}
              <p className="mt-2">
                Evidenciado por: {p.diagnosis.evidenceText}
              </p>
              {p.diagnosis.evidence.map((e) => (
                <p key={e.id} className="mt-1 text-sm">
                  {resultText(e)}
                  {e.previous ? ` · ${changeText(e)}` : ""}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export function AnthropometryHistory({
  patientId,
  consultationId,
  measurementsOnly = false,
}: {
  patientId: string;
  consultationId?: string;
  measurementsOnly?: boolean;
}) {
  const [records, setRecords] = useState<AnthroRecord[]>([]),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void loadAnthropometry(patientId)
        .then((r) => {
          if (active) {
            setRecords(r);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [patientId]);
  if (loading) return <p className="text-sm">Cargando antropometría…</p>;
  if (error)
    return (
      <p role="alert" className="text-sm text-red-700">
        {error}
      </p>
    );
  const visible = latestRecords(records).filter(
    (r) => !consultationId || r.consultation_id === consultationId,
  );
  if (!visible.length)
    return (
      <p className="text-sm text-[#74817d]">
        Sin valoración antropométrica registrada en este módulo.
      </p>
    );
  return (
    <section className={box}>
      <h3 className="mb-4 text-lg font-semibold">
        {measurementsOnly
          ? "Mediciones y cálculos por método"
          : "Antropometría y valoración profesional"}
      </h3>
      {visible.map((r) => (
        <details key={r.id} open={!!consultationId} className="mb-4">
          <summary className="cursor-pointer font-semibold">
            {new Date(r.measured_at).toLocaleString("es-MX")}
          </summary>
          <div className="mt-4">
            <RecordView record={r} measurementsOnly={measurementsOnly} />
          </div>
          {records
            .filter(
              (old) =>
                old.consultation_id === r.consultation_id && old.id !== r.id,
            )
            .map((old) => (
              <details key={old.id} className="mt-4 rounded-xl border p-3">
                <summary className="cursor-pointer text-sm">
                  Revisión conservada {old.revision} ·{" "}
                  {new Date(old.created_at).toLocaleString("es-MX")}
                </summary>
                <RecordView record={old} measurementsOnly={measurementsOnly} />
              </details>
            ))}
        </details>
      ))}
    </section>
  );
}

export interface AnthropometryHandle {
  saveIfDirty: () => Promise<boolean>;
}
export const AnthropometryPanel = forwardRef<
  AnthropometryHandle,
  {
    consultation: Consultation;
    patient: Patient;
    onDirty: (dirty: boolean) => void;
    onNeedsAttention: () => void;
  }
>(function AnthropometryPanel(
  { consultation, patient, onDirty, onNeedsAttention },
  ref,
) {
  const [payload, setPayload] = useState(() =>
    newPayload(
      consultation.consultation_date,
      ageOn(patient.birth_date, consultation.consultation_date),
    ),
  );
  const [records, setRecords] = useState<AnthroRecord[]>([]),
    [revision, setRevision] = useState(0),
    [guidance, setGuidance] = useState(true);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false),
    [calculated, setCalculated] = useState(false),
    [evidenceOpen, setEvidenceOpen] = useState(false);
  const [savedEncoded, setSavedEncoded] = useState("");
  const busy = useRef(false);
  const dirty =
    !loading && !loadError && JSON.stringify(payload) !== savedEncoded;
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [rows, show] = await Promise.all([
        loadAnthropometry(patient.id),
        loadGuidancePreference(consultation.professional_id),
      ]);
      const latest = rows.find((r) => r.consultation_id === consultation.id);
      const data =
        latest?.payload ??
        newPayload(
          consultation.consultation_date,
          ageOn(patient.birth_date, consultation.consultation_date),
        );
      setPayload(data);
      setSavedEncoded(JSON.stringify(data));
      setRecords(rows);
      setRevision(latest?.revision ?? 0);
      setGuidance(show);
      setCalculated(!!latest);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudo cargar.");
    } finally {
      setLoading(false);
    }
  }, [
    patient.id,
    patient.birth_date,
    consultation.id,
    consultation.professional_id,
    consultation.consultation_date,
  ]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const computed = useMemo(() => calculate(payload.input), [payload.input]);
  const results = useMemo(
    () => compare(computed.results, payload.input, records, consultation.id),
    [computed.results, payload.input, records, consultation.id],
  );
  const changeInput = (change: Partial<AssessmentInput>) => {
    setPayload((p) => ({
      ...p,
      input: { ...p.input, ...change },
      noteReviewed: false,
      diagnosis: { ...p.diagnosis, evidence: [] },
    }));
    setCalculated(false);
    setNotice("");
  };
  const persist = useCallback(async (): Promise<boolean> => {
    if (loading || loadError || busy.current) {
      onNeedsAttention();
      return false;
    }
    const p = payload;
    if (JSON.stringify(p) === savedEncoded) return true;
    const problems = validateInput(p.input);
    if (p.note.trim() && !p.noteReviewed)
      problems.push(
        "Revisa la nota y confirma la revisión antes de guardarla.",
      );
    if (
      p.diagnosis.enabled &&
      (p.diagnosis.mode === "pes"
        ? !p.diagnosis.problem.trim() ||
          !p.diagnosis.etiology.trim() ||
          (!p.diagnosis.evidenceText.trim() && !p.diagnosis.evidence.length)
        : !p.diagnosis.narrative.trim())
    )
      problems.push("Completa el diagnóstico manual o desactiva su registro.");
    if (!payloadHasContent(p))
      problems.push("Registra al menos una medición o una valoración.");
    if (problems.length) {
      setError(problems.join(" "));
      onNeedsAttention();
      return false;
    }
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const snapshot: AnthroPayload = {
        ...p,
        engineVersion: ENGINE_VERSION,
        results: compare(
          calculate(p.input).results,
          p.input,
          records,
          consultation.id,
        ),
      };
      const row = await saveAnthropometry(consultation, revision, snapshot);
      setSavedEncoded(JSON.stringify(snapshot));
      setPayload(snapshot);
      setRecords((rows) => [row, ...rows]);
      setRevision(row.revision);
      setCalculated(true);
      setNotice(
        "Mediciones y documentación guardadas. Se conserva esta revisión.",
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      onNeedsAttention();
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [
    loading,
    loadError,
    consultation,
    records,
    revision,
    onNeedsAttention,
    payload,
    savedEncoded,
  ]);
  useImperativeHandle(ref, () => ({ saveIfDirty: persist }), [persist]);
  if (loading) return <p className="mt-5">Cargando antropometría…</p>;
  if (loadError)
    return (
      <div className={box}>
        <p role="alert">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="nuth-button-secondary mt-3"
        >
          Reintentar
        </button>
      </div>
    );
  const i = payload.input;
  return (
    <div className="mt-5 min-w-0 space-y-5 [overflow-wrap:anywhere]">
      <div className="rounded-2xl bg-[#edf4ee] p-5">
        <h2 className="text-2xl font-semibold">Antropometría</h2>
        <p className="mt-2 text-sm">
          Registra mediciones, identifica los métodos y documenta tu valoración.
          Los resultados y clasificaciones no constituyen un diagnóstico.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-green-50 p-4">
          {notice}
        </p>
      )}
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        <section className={box}>
          <h3 className="mb-4 text-lg font-semibold">Mediciones y contexto</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Fecha y hora de medición">
              <input
                className="nuth-input"
                type="datetime-local"
                value={localDate(i.measuredAt)}
                onChange={(e) => {
                  if (e.target.value)
                    changeInput({
                      measuredAt: new Date(e.target.value).toISOString(),
                      age: ageOn(
                        patient.birth_date,
                        new Date(e.target.value).toISOString(),
                      ),
                    });
                }}
              />
            </Field>
            <Field label="Edad en años cumplidos">
              <input
                className="nuth-input"
                type="number"
                min="0"
                max="120"
                value={i.age ?? ""}
                onChange={(e) =>
                  changeInput({
                    age: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Contexto para fórmulas y referencias">
              <select
                className="nuth-input"
                value={i.context}
                onChange={(e) =>
                  changeInput({
                    context: e.target.value as AssessmentInput["context"],
                  })
                }
              >
                <option value="">Sin confirmar</option>
                <option value="adult">Adulto no gestante</option>
                <option value="pregnancy">Gestación</option>
                <option value="other">Menor u otra población</option>
              </select>
            </Field>
            <Field label="Sexo requerido por Jackson-Pollock">
              <select
                className="nuth-input"
                value={i.sex}
                onChange={(e) =>
                  changeInput({ sex: e.target.value as AssessmentInput["sex"] })
                }
              >
                <option value="">Sin seleccionar</option>
                <option value="male">Ecuación masculina</option>
                <option value="female">Ecuación femenina</option>
              </select>
            </Field>
            <Field label="Protocolo de medición">
              <input
                className="nuth-input"
                maxLength={160}
                placeholder="Nombre y versión del protocolo utilizado"
                value={i.protocol}
                onChange={(e) => changeInput({ protocol: e.target.value })}
              />
            </Field>
            <Field label="Báscula / equipo">
              <input
                className="nuth-input"
                maxLength={160}
                placeholder="Modelo e identificador"
                value={i.scale}
                onChange={(e) => changeInput({ scale: e.target.value })}
              />
            </Field>
            {fields.slice(0, 4).map((f) => (
              <Field key={f.key} label={`${f.label} (${f.unit})`}>
                <input
                  className="nuth-input"
                  type="number"
                  step="any"
                  min="0"
                  max={f.max}
                  value={i.measurements[f.key] ?? ""}
                  onChange={(e) => {
                    const measurements = { ...i.measurements };
                    if (e.target.value === "") delete measurements[f.key];
                    else measurements[f.key] = Number(e.target.value);
                    changeInput({ measurements });
                  }}
                />
              </Field>
            ))}
          </div>
          <details className="mt-5">
            <summary className="cursor-pointer font-semibold">
              Pliegues cutáneos · Jackson-Pollock 7
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Plicómetro">
                <input
                  className="nuth-input"
                  maxLength={160}
                  placeholder="Modelo e identificador"
                  value={i.caliper}
                  onChange={(e) => changeInput({ caliper: e.target.value })}
                />
              </Field>
              {fields.slice(4).map((f) => (
                <Field key={f.key} label={`${f.label} (${f.unit})`}>
                  <input
                    className="nuth-input"
                    type="number"
                    step="any"
                    min="0"
                    max={f.max}
                    value={i.measurements[f.key] ?? ""}
                    onChange={(e) => {
                      const measurements = { ...i.measurements };
                      if (e.target.value === "") delete measurements[f.key];
                      else measurements[f.key] = Number(e.target.value);
                      changeInput({ measurements });
                    }}
                  />
                </Field>
              ))}
            </div>
          </details>
        </section>
        <section className={box}>
          <h3 className="text-lg font-semibold">Bioimpedancia</h3>
          <p className="mb-4 mt-1 text-sm text-[#74817d]">
            Transcribe el resultado del equipo; Nuthrick no ejecuta su algoritmo
            propietario.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Fabricante, modelo e identificador BIA">
              <input
                className="nuth-input"
                maxLength={160}
                placeholder="Ej. Tanita MC-780MA · equipo 1"
                value={i.bia.device}
                onChange={(e) =>
                  changeInput({ bia: { ...i.bia, device: e.target.value } })
                }
              />
            </Field>
            <Field label="Protocolo / modo / software BIA">
              <input
                className="nuth-input"
                maxLength={160}
                placeholder="Ej. manual del equipo, modo estándar, v…"
                value={i.bia.protocol}
                onChange={(e) =>
                  changeInput({ bia: { ...i.bia, protocol: e.target.value } })
                }
              />
            </Field>
            <Field label="Grasa corporal del dispositivo (%)">
              <input
                className="nuth-input"
                type="number"
                min="0"
                max="100"
                step="any"
                value={i.bia.fat ?? ""}
                onChange={(e) =>
                  changeInput({
                    bia: {
                      ...i.bia,
                      fat:
                        e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Horas de ayuno">
              <input
                className="nuth-input"
                type="number"
                min="0"
                max="72"
                step="any"
                value={i.bia.fastingHours ?? ""}
                onChange={(e) =>
                  changeInput({
                    bia: {
                      ...i.bia,
                      fastingHours:
                        e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Ejercicio reciente">
              <select
                className="nuth-input"
                value={i.bia.recentExercise}
                onChange={(e) =>
                  changeInput({
                    bia: {
                      ...i.bia,
                      recentExercise: e.target
                        .value as AssessmentInput["bia"]["recentExercise"],
                    },
                  })
                }
              >
                <option value="">Sin registrar</option>
                <option value="yes">Sí</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="Hidratación respecto a lo habitual">
              <select
                className="nuth-input"
                value={i.bia.hydration}
                onChange={(e) =>
                  changeInput({
                    bia: {
                      ...i.bia,
                      hydration: e.target
                        .value as AssessmentInput["bia"]["hydration"],
                    },
                  })
                }
              >
                <option value="">Sin registrar</option>
                <option value="usual">Habitual</option>
                <option value="changed">Cambió</option>
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Otras condiciones de medición (opcional)">
              <input
                className="nuth-input"
                maxLength={500}
                value={i.bia.notes}
                onChange={(e) =>
                  changeInput({ bia: { ...i.bia, notes: e.target.value } })
                }
              />
            </Field>
          </div>
        </section>
        <section className={box}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Fórmulas</h3>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={guidance}
                onChange={(e) => {
                  const show = e.target.checked;
                  void saveGuidancePreference(
                    consultation.professional_id,
                    show,
                  )
                    .then(() => setGuidance(show))
                    .catch((e) => setError(e.message));
                }}
              />
              Mostrar orientación
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {formulas.map((f) => (
              <article
                key={f.id}
                className="rounded-xl border border-[#dce5de] p-4"
              >
                <label className="flex items-start gap-3 font-semibold">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={i.selected.includes(f.id)}
                    onChange={(e) =>
                      changeInput({
                        selected: e.target.checked
                          ? [...i.selected, f.id]
                          : i.selected.filter((id) => id !== f.id),
                      })
                    }
                  />
                  {f.name}
                </label>
                {guidance && (
                  <p className="mt-2 text-sm leading-6 text-[#63786c]">
                    {f.short}
                  </p>
                )}
                <p className="mt-2 text-xs">
                  <strong>Requiere: </strong>
                  {f.requires}
                </p>
                <p className="mt-1 text-xs">
                  <strong>Resultado: </strong>
                  {f.unit}
                </p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-[#3d705d]">
                    Más información · {f.name}
                  </summary>
                  <dl className="mt-3 space-y-3 text-sm">
                    {[
                      ["¿Qué es?", f.short],
                      ["¿Para qué se utiliza?", f.use],
                      ["Datos necesarios", f.requires],
                      ["Cálculo", f.calculation],
                      ["Resultado", f.unit],
                      ["Interpretación", f.guidance],
                      ["Limitaciones", f.limitations],
                      ["Aplicabilidad", f.applicability],
                      ["Versión del método implementado", f.version],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="font-semibold">{label}</dt>
                        <dd className="mt-1 leading-6">{value}</dd>
                      </div>
                    ))}
                    <div>
                      <dt className="font-semibold">Referencias</dt>
                      <dd>
                        {f.sources.map((s) => (
                          <a
                            key={s.id}
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block underline"
                          >
                            {s.title}
                          </a>
                        ))}
                      </dd>
                    </div>
                  </dl>
                </details>
              </article>
            ))}
          </div>
          <label className="mt-4 flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={i.bmiReference}
              onChange={(e) => changeInput({ bmiReference: e.target.checked })}
            />
            Usar clasificación OMS para IMC cuando edad y contexto sean
            aplicables
          </label>
          <button
            type="button"
            className="nuth-button mt-4"
            onClick={() => {
              setCalculated(true);
              setError("");
            }}
          >
            Calcular resultados
          </button>
        </section>
        {calculated && (
          <section className={box}>
            <h3 className="mb-3 text-lg font-semibold">
              Resultados antropométricos
            </h3>
            {computed.notices.length > 0 && (
              <div
                role="status"
                className="mb-4 rounded-xl bg-amber-50 p-3 text-sm"
              >
                {computed.notices.map((n) => (
                  <p key={n}>{n}</p>
                ))}
              </div>
            )}
            <ResultCards results={results} guidance={guidance} input={i} />
            {!results.length && (
              <p>Completa datos válidos para obtener resultados.</p>
            )}
          </section>
        )}
        <section className={box}>
          <h3 className="text-xl font-semibold">Valoración antropométrica</h3>
          <p className="mt-2 text-sm text-[#74817d]">
            Interpretación profesional. Las preguntas son opcionales y no
            constituyen un diagnóstico automático.
          </p>
          <details className="mt-4" open>
            <summary className="cursor-pointer font-semibold">
              Resumen antropométrico actual y anterior
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              {results
                .filter((r) => r.unit !== "mm")
                .map((r) => (
                  <p key={r.id}>
                    {resultText(r)}
                    {r.previous
                      ? ` · Anterior: ${displayNumber(r.previous.value)} ${r.unit}; ${changeText(r)}`
                      : ""}
                  </p>
                ))}
              {!results.length && <p>Aún no hay mediciones válidas.</p>}
            </div>
          </details>
          <aside className="mt-4 rounded-xl bg-[#f3f6ef] p-4">
            <h4 className="font-semibold">Ayuda para documentar</h4>
            <p className="mt-1 text-sm">
              Estos datos podrían ser relevantes para tu valoración:
            </p>
            {results
              .filter(
                (r) =>
                  r.previous && ["weight", "waist", "fat"].includes(r.metric),
              )
              .map((r) => (
                <p key={r.id} className="mt-2 text-sm">
                  • {changeText(r)}
                </p>
              ))}
            {results.filter((r) => r.metric === "fat").length > 1 && (
              <p className="mt-2 text-sm">
                • Hay porcentaje de grasa obtenido por varios métodos. La
                comparación debe realizarse por método.
              </p>
            )}
            {results.some((r) => r.previous?.conditionsDiffer) && (
              <p className="mt-2 text-sm">
                • Las condiciones de bioimpedancia difieren respecto a una
                medición anterior.
              </p>
            )}
            {results.find((r) => r.id === "whr") && (
              <p className="mt-2 text-sm">
                • ICC calculado:{" "}
                {displayNumber(results.find((r) => r.id === "whr")!.value)}.
              </p>
            )}
          </aside>
          <div className="mt-5 space-y-4">
            {prompts.map((prompt, index) => (
              <Field key={prompt} label={prompt}>
                <textarea
                  className="nuth-input min-h-20"
                  maxLength={3000}
                  rows={2}
                  value={payload.assessment[index] ?? ""}
                  onChange={(e) =>
                    setPayload((p) => ({
                      ...p,
                      assessment: p.assessment.map((a, n) =>
                        n === index ? e.target.value : a,
                      ),
                    }))
                  }
                />
              </Field>
            ))}
          </div>
          <div className="mt-5 border-t pt-5">
            <h4 className="font-semibold">Nota antropométrica</h4>
            <button
              type="button"
              disabled={!results.length}
              className="nuth-button-secondary mt-3"
              onClick={() => {
                if (
                  payload.note.trim() &&
                  !window.confirm(
                    "¿Reemplazar el borrador de nota con los datos actuales?",
                  )
                )
                  return;
                setPayload((p) => ({
                  ...p,
                  note: createNote(results, i),
                  noteReviewed: false,
                }));
              }}
            >
              Crear nota antropométrica
            </button>
            <p className="mt-2 text-xs text-[#74817d]">
              Se genera un borrador con los datos registrados. Edítalo, agrega
              tu interpretación y revisa antes de guardar. Si cambias
              mediciones, vuelve a revisar la nota y seleccionar evidencia.
            </p>
            {payload.note !== "" && (
              <div className="mt-3">
                <Field label="Borrador editable de nota antropométrica">
                  <textarea
                    className="nuth-input min-h-64"
                    maxLength={30000}
                    value={payload.note}
                    onChange={(e) =>
                      setPayload((p) => ({
                        ...p,
                        note: e.target.value,
                        noteReviewed: false,
                      }))
                    }
                  />
                </Field>
                <label className="mt-3 flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={payload.noteReviewed}
                    onChange={(e) =>
                      setPayload((p) => ({
                        ...p,
                        noteReviewed: e.target.checked,
                      }))
                    }
                  />
                  Revisé y aprobé esta nota para guardarla
                </label>
                <button
                  type="button"
                  className="mt-2 text-sm text-red-700"
                  onClick={() =>
                    setPayload((p) => ({ ...p, note: "", noteReviewed: false }))
                  }
                >
                  Descartar borrador de nota
                </button>
              </div>
            )}
          </div>
        </section>
        <section className={box}>
          <label className="flex gap-3 text-lg font-semibold">
            <input
              type="checkbox"
              checked={payload.diagnosis.enabled}
              onChange={(e) =>
                setPayload((p) => ({
                  ...p,
                  diagnosis: { ...p.diagnosis, enabled: e.target.checked },
                }))
              }
            />
            Registrar diagnóstico nutricional (opcional)
          </label>
          <p className="mt-2 text-sm text-[#74817d]">
            Lo registra el profesional con su evaluación integral. Nuthrick no
            propone problemas ni etiologías.
          </p>
          {payload.diagnosis.enabled && (
            <div className="mt-4 space-y-4">
              <Field label="Formato del diagnóstico">
                <select
                  className="nuth-input"
                  value={payload.diagnosis.mode}
                  onChange={(e) =>
                    setPayload((p) => ({
                      ...p,
                      diagnosis: {
                        ...p.diagnosis,
                        mode: e.target.value as "pes" | "narrative",
                      },
                    }))
                  }
                >
                  <option value="pes">Estructura PES</option>
                  <option value="narrative">Redacción libre</option>
                </select>
              </Field>
              {(payload.diagnosis.mode === "pes"
                ? [
                    ["problem", "Problema"],
                    ["etiology", "Relacionado con / etiología"],
                  ]
                : [["narrative", "Diagnóstico registrado por el profesional"]]
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <textarea
                    className="nuth-input"
                    maxLength={4000}
                    value={
                      payload.diagnosis[
                        key as "problem" | "etiology" | "narrative"
                      ]
                    }
                    onChange={(e) =>
                      setPayload((p) => ({
                        ...p,
                        diagnosis: { ...p.diagnosis, [key]: e.target.value },
                      }))
                    }
                  />
                </Field>
              ))}
              <Field label="Evidenciado por · otra evidencia clínica">
                <textarea
                  className="nuth-input"
                  maxLength={4000}
                  value={payload.diagnosis.evidenceText}
                  onChange={(e) =>
                    setPayload((p) => ({
                      ...p,
                      diagnosis: {
                        ...p.diagnosis,
                        evidenceText: e.target.value,
                      },
                    }))
                  }
                />
              </Field>
              <button
                type="button"
                className="nuth-button-secondary"
                onClick={() => setEvidenceOpen(!evidenceOpen)}
                aria-expanded={evidenceOpen}
              >
                Agregar evidencia antropométrica
              </button>
              {evidenceOpen && (
                <div className="space-y-3 rounded-xl bg-[#f5f7f3] p-4">
                  {results.map((r) => (
                    <label key={r.id} className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={payload.diagnosis.evidence.some(
                          (e) => e.id === r.id,
                        )}
                        onChange={(e) =>
                          setPayload((p) => ({
                            ...p,
                            diagnosis: {
                              ...p.diagnosis,
                              evidence: e.target.checked
                                ? [...p.diagnosis.evidence, structuredClone(r)]
                                : p.diagnosis.evidence.filter(
                                    (v) => v.id !== r.id,
                                  ),
                            },
                          }))
                        }
                      />
                      <span>
                        {resultText(r)}
                        {r.previous ? ` · ${changeText(r)}` : ""}
                      </span>
                    </label>
                  ))}
                  {!results.length && (
                    <p>Registra mediciones para seleccionar evidencia.</p>
                  )}
                </div>
              )}
              {payload.diagnosis.evidence.map((e) => (
                <p key={e.id} className="text-sm">
                  • {resultText(e)}
                  {e.previous ? ` · ${changeText(e)}` : ""}
                </p>
              ))}
            </div>
          )}
        </section>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="nuth-button"
            disabled={saving || !dirty}
            onClick={() => void persist()}
          >
            {saving ? "Guardando…" : "Guardar antropometría y valoración"}
          </button>
          <button
            type="button"
            className="nuth-button-secondary"
            disabled={saving || !dirty}
            onClick={() => {
              if (
                !window.confirm(
                  "¿Descartar únicamente los cambios de antropometría que aún no has guardado? Las revisiones guardadas se conservan.",
                )
              )
                return;
              setPayload(JSON.parse(savedEncoded) as AnthroPayload);
              setCalculated(revision > 0);
              setError("");
              setNotice("Cambios sin guardar descartados.");
            }}
          >
            Descartar cambios sin guardar
          </button>
          <p role="status" className="text-xs text-[#74817d]">
            {dirty ? "Cambios pendientes de guardar" : "Sin cambios pendientes"}
          </p>
        </div>
      </fieldset>
      {revision > 1 && (
        <details className={box}>
          <summary className="cursor-pointer font-semibold">
            Revisiones conservadas
          </summary>
          {records
            .filter(
              (r) =>
                r.consultation_id === consultation.id && r.revision < revision,
            )
            .map((r) => (
              <details key={r.id} className="mt-4">
                <summary className="cursor-pointer">
                  Revisión {r.revision}
                </summary>
                <RecordView record={r} />
              </details>
            ))}
        </details>
      )}
    </div>
  );
});
