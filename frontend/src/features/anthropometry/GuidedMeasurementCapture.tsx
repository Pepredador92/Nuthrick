import { useState } from "react";
import type { AnthroPayload, AssessmentInput } from "./model";
import type { Consultation, Patient } from "@/src/types/domain";
import type {
  FollowupConfiguration,
  MeasurementDevice,
  MeasurementType,
  MeasurementWorkflow,
  RegisteredMeasurement,
  MeasurementCategory,
  MeasurementUnit,
  CalculationChoiceId,
} from "./workflowTypes";
import { categoryNames } from "./catalog";
import {
  calculationChoices,
  calculationReferences,
  definitionsForChoice,
  measurementCodesForChoice,
  requiredMeasurements,
  selectedCalculationChoices,
  selectedMeasurements,
  type CalculationAvailability,
} from "./calculations";
import { ageAt, createEntry, legacyInput } from "./workflow";
import {
  createMeasurementDevice,
  createMeasurementType,
} from "@/src/services/anthropometry";
const panel = "rounded-2xl border border-[#dfe5e1] bg-white p-4 sm:p-6";
const field = "block min-w-0 text-sm font-medium";
type Props = {
  payload: AnthroPayload;
  consultation: Consultation;
  patient: Patient;
  types: MeasurementType[];
  devices: MeasurementDevice[];
  previousHeight: RegisteredMeasurement | null;
  statuses: CalculationAvailability[];
  onChange: (w: MeasurementWorkflow, input: AssessmentInput) => void;
  onTypes: (types: MeasurementType[]) => void;
  onDevices: (devices: MeasurementDevice[]) => void;
};
export function GuidedMeasurementCapture({
  payload,
  consultation,
  patient,
  types,
  devices,
  previousHeight,
  statuses,
  onChange,
  onTypes,
  onDevices,
}: Props) {
  const w = payload.workflow!,
    c = w.configuration;
  const [catalogOpen, setCatalogOpen] = useState(false),
    [formulaCatalogOpen, setFormulaCatalogOpen] = useState(true),
    [formulaOpen, setFormulaOpen] = useState<CalculationChoiceId | null>(null),
    [search, setSearch] = useState(""),
    [deviceSearch, setDeviceSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [customDevice, setCustomDevice] = useState({
    manufacturer: "",
    model: "",
    device_type: "bioimpedance",
    technology: "BIA",
    notes: "",
  });
  const [customType, setCustomType] = useState({
    name: "",
    category: "other" as MeasurementCategory,
    unit: "cm" as MeasurementUnit,
    min_value: 0,
    max_value: 1000,
    decimal_places: 1,
    description: "",
  });
  const required = requiredMeasurements(c),
    selected = selectedMeasurements(c),
    selectedFormulas = selectedCalculationChoices(c);
  const needsEquationContext = [
    "triceps_skinfold",
    "chest_skinfold",
    "midaxillary_skinfold",
  ].some((code) => selected.includes(code) || Boolean(w.entries[code]));
  const needsDevice =
    selected.some(
      (code) => types.find((t) => t.code === code)?.category === "bioimpedance",
    ) || Object.values(w.entries).some((e) => e.source_type === "device");
  const change = (next: MeasurementWorkflow, input = payload.input) =>
    onChange(next, legacyInput(next, input));
  const configure = (patch: Partial<FollowupConfiguration>) => {
    const next = { ...w, configuration: { ...c, ...patch } };
    const entries = { ...w.entries };
    for (const [key, e] of Object.entries(entries)) {
      const t = types.find((t) => t.code === key);
      if (!t) continue;
      if (
        patch.deviceId !== undefined &&
        e.source_type === "device" &&
        e.device_id &&
        e.device_id !== patch.deviceId
      ) {
        delete entries[key];
        continue;
      }
      const refreshed = createEntry(
        t,
        e.value,
        next,
        consultation,
        e.measured_at,
        devices,
        e.source_type,
      );
      if (refreshed.protocol !== e.protocol)
        entries[key] = {
          ...e,
          id: crypto.randomUUID(),
          protocol: refreshed.protocol,
        };
    }
    next.entries = entries;
    change(next);
  };
  const toggleMeasurement = (code: string) =>
    configure({
      measurements: c.measurements.includes(code)
        ? c.measurements.filter((k) => k !== code)
        : [...c.measurements, code],
    });
  const toggleFormula = (id: CalculationChoiceId) => {
    const enabled = selectedFormulas.includes(id);
    configure({
      calculations: enabled
        ? selectedFormulas.filter((item) => item !== id)
        : [...selectedFormulas, id],
      measurements: enabled
        ? c.measurements
        : [
            ...new Set([
              ...c.measurements,
              ...measurementCodesForChoice(id),
            ]),
          ],
    });
  };
  const setEntry = (t: MeasurementType, value: string) => {
    const entries = { ...w.entries };
    if (value === "") delete entries[t.code];
    else
      entries[t.code] = {
        ...createEntry(
          t,
          Number(value),
          w,
          consultation,
          payload.input.measuredAt,
          devices,
        ),
        notes: entries[t.code]?.notes ?? "",
      };
    change({ ...w, entries });
  };
  const updateContext = (patch: Partial<MeasurementWorkflow["context"]>) => {
    const context = { ...w.context, ...patch, fromPatient: false };
    context.age = ageAt(
      context.birthDate,
      consultation.consultation_date,
      patient.timezone,
    );
    change({ ...w, context });
  };
  return (
    <div className="min-w-0 space-y-5">
      <section className="rounded-2xl bg-[#173d36] p-4 text-white sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold">Agregar mediciones</h3>
            <p className="mt-1 text-sm text-white/75">
              Elige las mediciones y las fórmulas que correspondan al objetivo
              de esta consulta.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="shrink-0 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#173d36]"
              aria-expanded={catalogOpen}
              onClick={() => setCatalogOpen(true)}
            >
              Seleccionar mediciones
            </button>
            <button
              type="button"
              className="shrink-0 rounded-xl border border-white/40 px-4 py-3 text-sm font-semibold text-white"
              aria-expanded={formulaCatalogOpen}
              onClick={() => setFormulaCatalogOpen(true)}
            >
              Seleccionar fórmulas
            </button>
          </div>
        </div>
      </section>
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">
              {w.templateRevision
                ? "Seguimiento antropométrico habitual"
                : "Prepara las mediciones de esta consulta"}
            </h3>
            <p className="mt-1 text-sm text-[#63786c]">
              {patient.full_name} ·{" "}
              {w.context.age !== null
                ? w.context.age + " años en esta consulta"
                : "Fecha de nacimiento pendiente"}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-[#edf4ee] p-4">
          <p className="text-sm font-semibold">Cálculo bajo selección profesional</p>
          <p className="mt-1 text-sm text-[#496758]">
            Nuthrick calcula únicamente las fórmulas que selecciones. Cada
            resultado conserva datos utilizados, método, versión y referencias.
          </p>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Configurar seguimiento habitual
          </summary>
          <div className="mt-4">
            <fieldset className="rounded-xl border border-[#cbd9cf] p-4">
              <legend className="px-2 text-sm font-semibold">
                ¿Dónde aplicar estos cambios?
              </legend>
              <label className="flex gap-2 text-sm">
                <input
                  type="radio"
                  name="measurement-template-scope"
                  checked={w.templateScope === "today"}
                  onChange={() => change({ ...w, templateScope: "today" })}
                />
                Sólo en esta consulta
              </label>
              <label className="mt-3 flex gap-2 text-sm">
                <input
                  type="radio"
                  name="measurement-template-scope"
                  checked={w.templateScope === "habitual"}
                  onChange={() => change({ ...w, templateScope: "habitual" })}
                />
                También en el seguimiento habitual de este paciente
              </label>
              <p className="mt-2 text-xs text-[#63786c]">
                Se aplicará al guardar. Nunca modifica consultas anteriores.
              </p>
            </fieldset>
          </div>
        </details>
      </section>
      <section id="formula-selector" className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold">Fórmulas y métodos</h3>
            <p className="mt-1 text-sm text-[#63786c]">
              {selectedFormulas.length
                ? `${selectedFormulas.length} seleccionados para esta consulta.`
                : "Aún no has seleccionado fórmulas. Puedes guardar mediciones sin calcular."}
            </p>
          </div>
          <button
            type="button"
            className="nuth-button-secondary"
            aria-expanded={formulaCatalogOpen}
            onClick={() => setFormulaCatalogOpen((open) => !open)}
          >
            {formulaCatalogOpen ? "Ocultar selector" : "Seleccionar fórmulas"}
          </button>
        </div>
        {formulaCatalogOpen && (
          <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">
            {calculationChoices.map((choice) => {
              const checked = selectedFormulas.includes(choice.id);
              const requiredNames = measurementCodesForChoice(choice.id).map(
                (code) => types.find((type) => type.code === code)?.name ?? code,
              );
              return (
                <article
                  key={choice.id}
                  className={`min-w-0 rounded-xl border p-4 [overflow-wrap:anywhere] ${
                    checked
                      ? "border-[#3d705d] bg-[#f2f7f3]"
                      : "border-[#dfe5e1] bg-white"
                  }`}
                >
                  <label className="flex min-w-0 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggleFormula(choice.id)}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">{choice.name}</span>
                      <span className="mt-1 block text-sm text-[#496758]">
                        {choice.short}
                      </span>
                    </span>
                  </label>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div>
                      <dt className="font-semibold">Requiere</dt>
                      <dd>{requiredNames.join(" + ") || "Resultados dependientes del método"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Resultado</dt>
                      <dd>{choice.result}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className="mt-3 text-sm font-semibold text-[#3d705d] underline"
                    onClick={() => setFormulaOpen(choice.id)}
                  >
                    Más información
                  </button>
                </article>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs text-[#63786c]">
          La orientación es educativa. Ninguna fórmula constituye por sí sola
          un diagnóstico nutricional.
        </p>
      </section>
      <section className={panel}>
        <h3 className="font-semibold">Datos del expediente</h3>
        <p className="mt-1 text-sm">
          Edad correspondiente al{" "}
          {new Date(consultation.consultation_date).toLocaleDateString("es-MX")}
          : {w.context.age ?? "pendiente"}
          {w.context.age !== null ? " años · automática" : ""}
        </p>
        {(needsEquationContext || w.context.sex) && (
          <p className="mt-2 text-sm">
            Sexo para ecuaciones:{" "}
            {w.context.sex === "male"
              ? "Masculino"
              : w.context.sex === "female"
                ? "Femenino"
                : "pendiente"}
            {w.context.sex && w.context.fromPatient ? " · del expediente" : ""}
          </p>
        )}
        {(!w.context.birthDate || (needsEquationContext && !w.context.sex)) && (
          <p className="mt-2 text-sm text-[#63786c]">
            Completa una vez los datos que faltan. Se conservarán en el
            expediente al guardar; el género no sustituye al sexo requerido por
            la ecuación.
          </p>
        )}
        <details
          className="mt-3"
          open={!w.context.birthDate || (needsEquationContext && !w.context.sex)}
        >
          <summary className="cursor-pointer text-sm">
            Revisar datos del expediente
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className={field}>
              Fecha de nacimiento
              <input
                type="date"
                className="nuth-input mt-2"
                max={consultation.consultation_date.slice(0, 10)}
                value={w.context.birthDate ?? ""}
                onChange={(e) =>
                  updateContext({ birthDate: e.target.value || null })
                }
              />
            </label>
            <label className={field}>
              Sexo requerido por la ecuación
              <select
                className="nuth-input mt-2"
                value={w.context.sex}
                onChange={(e) =>
                  updateContext({
                    sex: e.target.value as AssessmentInput["sex"],
                  })
                }
              >
                <option value="">Sin registrar</option>
                <option value="male">Masculino</option>
                <option value="female">Femenino</option>
              </select>
            </label>
          </div>
        </details>
        {selected.length > 0 || Object.keys(w.entries).length > 0 ? (
          <label className={field + " mt-4"}>
            Contexto para fórmulas y referencias
            <select
              className="nuth-input mt-2"
              value={payload.input.context}
              onChange={(e) =>
                change(w, {
                  ...payload.input,
                  context: e.target.value as AssessmentInput["context"],
                })
              }
            >
              <option value="">Sin confirmar · no clasificar</option>
              <option value="adult">Adulto no gestante</option>
              <option value="pregnancy">Gestación</option>
              <option value="other">Menor u otra población</option>
            </select>
          </label>
        ) : null}
      </section>
      {needsDevice && (
        <section className={panel}>
          <h3 className="font-semibold">Equipo de medición</h3>
          <p className="mt-1 text-sm">
            Los datos que reporta el equipo se guardan como mediciones del
            dispositivo.
          </p>
          <label className={field + " mt-3"}>
            Buscar fabricante o modelo
            <input
              className="nuth-input mt-2"
              type="search"
              value={deviceSearch}
              onChange={(e) => setDeviceSearch(e.target.value)}
              placeholder="InBody, Tanita, Omron, SECA…"
            />
          </label>
          <label className={field + " mt-3"}>
            Equipo utilizado
            <select
              className="nuth-input mt-2"
              value={c.deviceId ?? ""}
              onChange={(e) => configure({ deviceId: e.target.value || null })}
            >
              <option value="">Selecciona el equipo</option>
              {devices
                .filter(
                  (d) =>
                    d.id === c.deviceId ||
                    (d.manufacturer + " " + d.model)
                      .toLowerCase()
                      .includes(deviceSearch.toLowerCase()),
                )
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.manufacturer} {d.model}
                    {d.is_system_device ? "" : " · personalizado"}
                  </option>
                ))}
            </select>
          </label>
          <p className="mt-2 text-xs">
            Al cambiar de equipo se limpian sus valores de esta consulta para
            volver a capturarlos.
          </p>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Registrar otro equipo
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["manufacturer", "Fabricante"],
                  ["model", "Modelo / identificador"],
                  ["technology", "Tecnología"],
                  ["notes", "Notas del equipo"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className={field}>
                  {label}
                  <input
                    className="nuth-input mt-2"
                    maxLength={120}
                    value={customDevice[key]}
                    onChange={(e) =>
                      setCustomDevice({
                        ...customDevice,
                        [key]: e.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="nuth-button-secondary mt-3"
              disabled={
                busy ||
                !customDevice.manufacturer.trim() ||
                !customDevice.model.trim()
              }
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const device = await createMeasurementDevice(
                    customDevice,
                    consultation.professional_id,
                  );
                  onDevices([...devices, device]);
                  configure({ deviceId: device.id });
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "No se pudo guardar",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Guardar equipo personalizado
            </button>
          </details>
          <label className={field + " mt-4"}>
            Modo, software o protocolo BIA
            <input
              className="nuth-input mt-2"
              maxLength={160}
              value={c.biaProtocol}
              onChange={(e) => configure({ biaProtocol: e.target.value })}
              placeholder="Mismo modo y protocolo para comparar"
            />
          </label>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Condiciones de bioimpedancia
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className={field}>
                Horas de ayuno
                <input
                  type="number"
                  min="0"
                  max="72"
                  className="nuth-input mt-2"
                  value={payload.input.bia.fastingHours ?? ""}
                  onChange={(e) =>
                    change(w, {
                      ...payload.input,
                      bia: {
                        ...payload.input.bia,
                        fastingHours:
                          e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
              <label className={field}>
                Ejercicio reciente
                <select
                  className="nuth-input mt-2"
                  value={payload.input.bia.recentExercise}
                  onChange={(e) =>
                    change(w, {
                      ...payload.input,
                      bia: {
                        ...payload.input.bia,
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
              </label>
              <label className={field}>
                Hidratación
                <select
                  className="nuth-input mt-2"
                  value={payload.input.bia.hydration}
                  onChange={(e) =>
                    change(w, {
                      ...payload.input,
                      bia: {
                        ...payload.input.bia,
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
              </label>
              <label className={field}>
                Otras condiciones
                <input
                  className="nuth-input mt-2"
                  maxLength={500}
                  value={payload.input.bia.notes}
                  onChange={(e) =>
                    change(w, {
                      ...payload.input,
                      bia: { ...payload.input.bia, notes: e.target.value },
                    })
                  }
                />
              </label>
            </div>
          </details>
        </section>
      )}
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">
            Registradas · mediciones de hoy
          </h3>
          <button
            type="button"
            className="nuth-button-secondary"
            aria-expanded={catalogOpen}
            onClick={() => setCatalogOpen(!catalogOpen)}
          >
            Agregar medición
          </button>
        </div>
        {!selected.length && (
          <p className="mt-4 text-sm">
            Selecciona las medidas que quieres registrar en esta consulta.
          </p>
        )}
        {catalogOpen && (
          <div className="my-4 rounded-xl border bg-[#f8faf7] p-4">
            <label className={field}>
              Buscar medición
              <input
                type="search"
                className="nuth-input mt-2"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre de la medida"
              />
            </label>
            <div className="mt-3 max-h-80 space-y-4 overflow-y-auto">
              {Object.entries(categoryNames).map(([category, name]) => (
                <div key={category}>
                  <h4 className="font-semibold">{name}</h4>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {types
                      .filter(
                        (t) =>
                          t.is_active &&
                          t.category === category &&
                          (t.name + " " + t.code)
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .map((t) => (
                        <label key={t.code} className="flex gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selected.includes(t.code)}
                            onChange={() => toggleMeasurement(t.code)}
                          />
                          {t.name} · {t.unit}
                        </label>
                      ))}
                  </div>
                </div>
              ))}
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Crear medición personalizada
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className={field}>
                  Nombre de medición
                  <input
                    className="nuth-input mt-2"
                    value={customType.name}
                    maxLength={120}
                    onChange={(e) =>
                      setCustomType({ ...customType, name: e.target.value })
                    }
                  />
                </label>
                <label className={field}>
                  Categoría
                  <select
                    className="nuth-input mt-2"
                    value={customType.category}
                    onChange={(e) =>
                      setCustomType({
                        ...customType,
                        category: e.target.value as MeasurementCategory,
                      })
                    }
                  >
                    {Object.entries(categoryNames).map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={field}>
                  Unidad
                  <select
                    className="nuth-input mt-2"
                    value={customType.unit}
                    onChange={(e) =>
                      setCustomType({
                        ...customType,
                        unit: e.target.value as MeasurementUnit,
                      })
                    }
                  >
                    {[
                      "kg",
                      "cm",
                      "mm",
                      "%",
                      "L",
                      "kcal/día",
                      "años",
                      "nivel",
                      "g/cm³",
                      "ratio",
                      "mg/dL",
                      "unidad",
                    ].map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    ["min_value", "Mínimo de captura"],
                    ["max_value", "Máximo de captura"],
                    ["decimal_places", "Decimales mostrados"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className={field}>
                    {label}
                    <input
                      type="number"
                      className="nuth-input mt-2"
                      value={customType[key]}
                      onChange={(e) =>
                        setCustomType({
                          ...customType,
                          [key]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
                <label className={field}>
                  Descripción
                  <input
                    className="nuth-input mt-2"
                    maxLength={500}
                    value={customType.description}
                    onChange={(e) =>
                      setCustomType({
                        ...customType,
                        description: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="nuth-button-secondary mt-3"
                disabled={
                  busy ||
                  !customType.name.trim() ||
                  customType.min_value >= customType.max_value ||
                  customType.decimal_places < 0 ||
                  customType.decimal_places > 6
                }
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const type = await createMeasurementType(
                      { ...customType, data_type: "number", is_active: true },
                      consultation.professional_id,
                    );
                    onTypes([...types, type]);
                    configure({ measurements: [...c.measurements, type.code] });
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "No se pudo guardar",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Guardar medición personalizada
              </button>
            </details>
          </div>
        )}
        {Object.entries(categoryNames).map(([category, name]) => {
          const list = selected
            .map((k) => types.find((t) => t.code === k))
            .filter(
              (t): t is MeasurementType => !!t && t.category === category,
            );
          if (!list.length) return null;
          return (
            <section key={category} className="mt-5">
              <h4 className="border-b pb-2 font-semibold">{name}</h4>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((t) => (
                  <div key={t.code} className="min-w-0 rounded-xl border p-4">
                    <label className={field}>
                      {t.name} ({t.unit})
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        min={t.min_value}
                        max={t.max_value}
                        className="nuth-input mt-2"
                        value={w.entries[t.code]?.value ?? ""}
                        onChange={(e) => setEntry(t, e.target.value)}
                      />
                    </label>
                    <p className="mt-2 text-xs text-[#63786c]">
                      {required.has(t.code)
                        ? "Puede activar cálculos automáticos cuando se complete el resto de los datos."
                        : "Medición de seguimiento."}
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-xs underline"
                      onClick={() => toggleMeasurement(t.code)}
                    >
                      Retirar {t.name}
                    </button>
                    {t.code === "height" &&
                      previousHeight &&
                      !w.entries.height && (
                        <div className="mt-3 rounded-lg bg-[#edf4ee] p-3 text-sm">
                          <p>Última talla: {previousHeight.value} cm</p>
                          <p className="text-xs">
                            {new Date(
                              previousHeight.original_measured_at ??
                                previousHeight.measured_at,
                            ).toLocaleDateString("es-MX")}{" "}
                            · consulta anterior
                          </p>
                          <button
                            type="button"
                            className="mt-2 font-semibold underline"
                            onClick={() =>
                              change({
                                ...w,
                                entries: {
                                  ...w.entries,
                                  height: {
                                    ...previousHeight,
                                    id: crypto.randomUUID(),
                                    consultation_id: consultation.id,
                                    created_at: new Date().toISOString(),
                                    reused_from_id: previousHeight.id,
                                    original_measured_at:
                                      previousHeight.original_measured_at ??
                                      previousHeight.measured_at,
                                  },
                                },
                              })
                            }
                          >
                            Usar esta talla anterior
                          </button>
                        </div>
                      )}
                    {w.entries[t.code]?.reused_from_id && (
                      <p className="mt-2 text-xs">
                        Reutilizada del{" "}
                        {new Date(
                          w.entries[t.code].original_measured_at!,
                        ).toLocaleDateString("es-MX")}
                        ; cambia el valor para medir de nuevo.
                      </p>
                    )}
                    {w.entries[t.code] && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs">
                          Procedencia y notas
                        </summary>
                        <p className="mt-2 text-xs">
                          {w.entries[t.code].source_type === "device"
                            ? "Del dispositivo"
                            : w.entries[t.code].source_type === "imported"
                              ? "Importada"
                              : "Registrada por el profesional"}{" "}
                          ·{" "}
                          {new Date(
                            w.entries[t.code].measured_at,
                          ).toLocaleDateString("es-MX")}
                        </p>
                        {t.category !== "bioimpedance" && (
                          <label className={field + " mt-2"}>
                            Origen
                            <select
                              className="nuth-input mt-2"
                              value={w.entries[t.code].source_type}
                              onChange={(e) => {
                                const entry = w.entries[t.code];
                                const source = e.target
                                  .value as RegisteredMeasurement["source_type"];
                                const refreshed = createEntry(
                                  t,
                                  entry.value,
                                  w,
                                  consultation,
                                  entry.measured_at,
                                  devices,
                                  source,
                                );
                                change({
                                  ...w,
                                  entries: {
                                    ...w.entries,
                                    [t.code]: {
                                      ...entry,
                                      ...refreshed,
                                      id: crypto.randomUUID(),
                                      source_type: source,
                                      notes: entry.notes,
                                    },
                                  },
                                });
                              }}
                            >
                              <option value="manual">Manual</option>
                              <option value="imported">Importado</option>
                              <option value="device">Dispositivo</option>
                            </select>
                          </label>
                        )}
                        <label className={field + " mt-2"}>
                          Notas de {t.name}
                          <input
                            className="nuth-input mt-2"
                            maxLength={1000}
                            value={w.entries[t.code].notes}
                            onChange={(e) =>
                              change({
                                ...w,
                                entries: {
                                  ...w.entries,
                                  [t.code]: {
                                    ...w.entries[t.code],
                                    notes: e.target.value,
                                  },
                                },
                              })
                            }
                          />
                        </label>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        <details className="mt-5 rounded-xl border border-[#dfe5e1] p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Guion de medición: fecha, protocolo y equipo
          </summary>
          <p className="mt-2 text-sm">
            Esta información documenta cómo se ejecutó la medición; no cambia
            qué fórmulas calcula el sistema. Se recuerda para el seguimiento.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className={field}>
              Fecha de medición
              <input
                type="datetime-local"
                className="nuth-input mt-2"
                value={new Date(
                  new Date(payload.input.measuredAt).getTime() -
                    new Date(payload.input.measuredAt).getTimezoneOffset() *
                      60000,
                )
                  .toISOString()
                  .slice(0, 16)}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const date = new Date(e.target.value).toISOString();
                  change(
                    {
                      ...w,
                      entries: Object.fromEntries(
                        Object.entries(w.entries).map(([k, v]) => [
                          k,
                          v.reused_from_id
                            ? v
                            : {
                                ...v,
                                id: crypto.randomUUID(),
                                measured_at: date,
                              },
                        ]),
                      ),
                    },
                    { ...payload.input, measuredAt: date },
                  );
                }}
              />
            </label>
            {(
              [
                ["protocol", "Protocolo de medición"],
                ["scale", "Báscula / equipo"],
                ["caliper", "Plicómetro"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className={field}>
                {label}
                <input
                  className="nuth-input mt-2"
                  maxLength={160}
                  value={c[key]}
                  onChange={(e) => configure({ [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </details>
      </section>
      {(selected.length > 0 || Object.keys(w.entries).length > 0) && (
        <section className={panel}>
          <h3 className="text-lg font-semibold">
            Cálculos automáticos
          </h3>
          <p className="mt-1 text-sm">
            {statuses.filter((s) => s.state === "available").length} resultados
            disponibles · {statuses.filter((s) => s.state === "pending").length}{" "}
            con datos insuficientes. Se actualizan mientras capturas.
          </p>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Ver disponibilidad y datos faltantes
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {statuses.map((s) => (
                <div key={s.key} className="min-w-0 rounded-xl bg-[#f4f7f3] p-3">
                  <p className="text-sm font-semibold">
                    {s.state === "available" ? "✓ Disponible" : "Datos insuficientes"}
                  </p>
                  <p className="text-sm">{s.name} · {s.method}</p>
                  {s.missing.length > 0 && (
                    <p className="mt-1 text-xs text-[#63786c]">
                      Falta: {s.missing.join(", ")}.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </details>
        </section>
      )}
      {formulaOpen && (() => {
        const choice = calculationChoices.find((item) => item.id === formulaOpen)!;
        const definitions = definitionsForChoice(formulaOpen);
        const requiredNames = measurementCodesForChoice(formulaOpen).map(
          (code) => types.find((type) => type.code === code)?.name ?? code,
        );
        const references = [
          ...new Map(
            definitions
              .flatMap((definition) => definition.referenceUrls)
              .map((url) => [
                url,
                calculationReferences.find((reference) => reference.url === url),
              ]),
          ).entries(),
        ];
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-6">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Cerrar información de fórmula"
              onClick={() => setFormulaOpen(null)}
            />
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="formula-detail-title"
              className="relative z-10 max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-7"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8b6a2b]">
                    Ficha informativa
                  </p>
                  <h3 id="formula-detail-title" className="mt-1 text-2xl font-semibold">
                    {choice.name}
                  </h3>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold"
                  onClick={() => setFormulaOpen(null)}
                >
                  Cerrar
                </button>
              </div>
              <div className="mt-5 space-y-5 text-sm [overflow-wrap:anywhere]">
                <div>
                  <h4 className="font-semibold">¿Qué es?</h4>
                  <p className="mt-1">{choice.short}</p>
                </div>
                <div>
                  <h4 className="font-semibold">¿Para qué se utiliza?</h4>
                  <p className="mt-1">{choice.use}</p>
                </div>
                <div>
                  <h4 className="font-semibold">Datos necesarios</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {requiredNames.map((name) => <li key={name}>{name}</li>)}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold">Cálculo</h4>
                  {definitions.map((definition) => (
                    <p key={definition.code} className="mt-1">
                      <span className="font-medium">{definition.name}:</span>{" "}
                      {definition.calculation}
                    </p>
                  ))}
                </div>
                <div>
                  <h4 className="font-semibold">Resultado</h4>
                  <p className="mt-1">{choice.result}.</p>
                </div>
                <div>
                  <h4 className="font-semibold">Interpretación</h4>
                  <p className="mt-1">
                    {choice.id === "bmi"
                      ? "La clasificación OMS se presenta únicamente cuando el contexto adulto no gestante y la referencia están confirmados."
                      : "Nuthrick muestra el resultado sin asignar etiquetas de bueno, malo o normal cuando no existe una referencia de clasificación configurada y aplicable."}
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold">Limitaciones</h4>
                  {[...new Set(definitions.map((definition) => definition.limitations))].map(
                    (limitation) => <p key={limitation} className="mt-1">{limitation}</p>,
                  )}
                </div>
                <div>
                  <h4 className="font-semibold">Aplicabilidad</h4>
                  <p className="mt-1">{choice.applicability}</p>
                </div>
                <div>
                  <h4 className="font-semibold">Referencia</h4>
                  {references.length ? references.map(([url, reference]) => (
                    <a
                      key={url}
                      className="mt-1 block underline"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {reference?.title ?? "Referencia técnica"}
                    </a>
                  )) : <p className="mt-1">Sin referencia de clasificación configurada.</p>}
                </div>
                <div>
                  <h4 className="font-semibold">Versión</h4>
                  <p className="mt-1">
                    {[...new Set(definitions.map((definition) => definition.version))].join(", ")}
                  </p>
                </div>
                <p className="rounded-xl bg-[#f5f1e9] p-3 text-xs">
                  Esta orientación no constituye un diagnóstico nutricional. La
                  interpretación clínica pertenece al profesional.
                </p>
              </div>
            </section>
          </div>
        );
      })()}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
    </div>
  );
}
