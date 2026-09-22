import { useEffect, useState } from "react";
import { Check, Circle, X } from "lucide-react";
import { AIButton } from "@/src/components/ai/AIControls";
import { CustomFoodForm } from "@/src/components/diet/MenuEditors";
import {
  AIRequestError,
  getAIGenerationStatus,
  runAIRequest,
  type AIState,
} from "@/src/services/ai";
import {
  clinicalWorkspace,
  type ClinicalWorkspace,
} from "@/src/services/clinicalCopilot";
import { createCustomFood, listFoodItems } from "@/src/services/foodCatalog";
import { foodUnitLabels } from "@/src/features/menu/units";
import { getExchangeGroup } from "@/src/features/exchanges/catalog";
import {
  calculateRecall,
  canonicalRecallItem,
  matchRecallFoods,
  recallRows,
  type PesDraft,
  type RecallExtraction,
  type RecallRow,
  type RecallSavedItem,
} from "@/src/features/consultations/clinicalCopilot";
import type { FoodItem } from "@/src/types/domain";

type Props = {
  patientId: string;
  consultationId: string;
  revision: number;
  before: () => Promise<boolean>;
  onPes?: (draft: PesDraft) => void;
};
const input =
  "mt-1 w-full rounded-lg border border-[#dfe5e1] bg-white px-3 py-2 text-sm text-[#173d36]";
const secondary =
  "rounded-lg border border-[#dfe5e1] bg-white px-3 py-2 text-sm text-[#315e4f] disabled:opacity-50";
function useClinical(props: Props, feature: "pes_diagnosis" | "recall_24h") {
  const storageKey = `clinical-pending:${props.consultationId}:${feature}`;
  const [workspace, setWorkspace] = useState<ClinicalWorkspace | null>(null);
  const [state, setState] = useState<AIState>(() =>
    sessionStorage.getItem(storageKey) ? "uncertain" : "idle",
  );
  const [message, setMessage] = useState("");
  const [generation, setGeneration] = useState<string>();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    void clinicalWorkspace(props.consultationId, props.revision)
      .then((w) => {
        if (alive) setWorkspace(w);
      })
      .catch((e) => {
        if (alive) setMessage(e.message);
      });
    return () => {
      alive = false;
    };
  }, [props.consultationId, props.revision]);
  async function refresh() {
    if (!(await props.before()))
      throw new Error("Guarda la entrevista antes de continuar.");
    const w = await clinicalWorkspace(props.consultationId, props.revision);
    setWorkspace(w);
    return w;
  }
  async function generate(narrative?: string) {
    if (sessionStorage.getItem(storageKey)) {
      setState("uncertain");
      setMessage("Comprueba primero la solicitud pendiente.");
      return null;
    }
    setState("generating");
    setMessage("");
    try {
      await refresh();
      const key = crypto.randomUUID();
      sessionStorage.setItem(storageKey, key);
      const result = await runAIRequest({
        feature,
        idempotencyKey: key,
        patientId: props.patientId,
        consultationId: props.consultationId,
        revision: props.revision,
        ...(narrative !== undefined ? { narrative } : {}),
      });
      if (result.status !== "succeeded" || !result.output) {
        setState("uncertain");
        setMessage("Comprueba el estado antes de generar otra propuesta.");
        return null;
      }
      sessionStorage.removeItem(storageKey);
      setGeneration(result.generationId);
      setState("ready");
      return result.output;
    } catch (e) {
      const uncertain =
        e instanceof AIRequestError &&
        ["provider_outcome_unknown", "service_unavailable"].includes(e.code);
      if (!uncertain) sessionStorage.removeItem(storageKey);
      setState(
        uncertain
          ? "uncertain"
          : e instanceof AIRequestError && e.code === "insufficient_credits"
            ? "insufficient"
            : "error",
      );
      setMessage(e instanceof Error ? e.message : "No se pudo generar.");
      return null;
    }
  }
  async function check() {
    const key = sessionStorage.getItem(storageKey);
    if (!key) return;
    try {
      const result = await getAIGenerationStatus(key);
      if (
        !result ||
        ["succeeded", "failed", "invalid_output"].includes(result.status)
      ) {
        sessionStorage.removeItem(storageKey);
        setState("idle");
        setMessage(
          result?.status === "succeeded"
            ? "La solicitud terminó. La propuesta no está disponible en esta sesión; generar otra implica un nuevo consumo."
            : "Solicitud resuelta. Puedes continuar manualmente o volver a generar.",
        );
      } else
        setMessage(
          "La solicitud sigue pendiente. Puedes continuar manualmente.",
        );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo comprobar.");
    }
  }
  async function approve(kind: "pes" | "recall", payload: object) {
    setSaving(true);
    setMessage("");
    try {
      const w = await refresh();
      await clinicalWorkspace(
        props.consultationId,
        props.revision,
        kind,
        { ...payload, stamp: w.stamp },
        generation,
      );
      setWorkspace(
        await clinicalWorkspace(props.consultationId, props.revision),
      );
      setMessage(kind === "pes" ? "PES aprobado." : "Recordatorio confirmado.");
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  return {
    workspace,
    state,
    message,
    setMessage,
    generation,
    setGeneration,
    saving,
    generate,
    approve,
    refresh,
    check,
  };
}
function Feedback({ clinical }: { clinical: ReturnType<typeof useClinical> }) {
  return (
    <>
      {clinical.message && (
        <p role="status" className="mt-3 text-sm text-[#52675f]">
          {clinical.message}
        </p>
      )}
      {clinical.state === "uncertain" && (
        <button
          type="button"
          className={secondary + " mt-2"}
          onClick={() => void clinical.check()}
        >
          Comprobar solicitud
        </button>
      )}
    </>
  );
}
export function PesCopilot(props: Props) {
  const clinical = useClinical(props, "pes_diagnosis");
  const [draft, setDraft] = useState<PesDraft | null>(null);
  const [replacement, setReplacement] = useState<PesDraft | null>(null);
  const [previousGeneration, setPreviousGeneration] = useState<string>();
  const [editing, setEditing] = useState(true);
  async function generate() {
    setPreviousGeneration(clinical.generation);
    const output = await clinical.generate();
    if (!output) return;
    if (draft) setReplacement(output as PesDraft);
    else setDraft(output as PesDraft);
  }
  return (
    <section
      aria-label="Asistencia PES"
      className="mt-5 rounded-2xl border border-[#dfe5e1] bg-[#f7faf8] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-[#173d36]">Diagnóstico PES</h3>
        <span className="text-xs text-[#687870]">
          {clinical.workspace?.records.pes
            ? "Aprobado en esta revisión"
            : "Borrador bajo revisión profesional"}
        </span>
      </div>
      <div
        className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#52675f]"
        aria-label="Información disponible"
      >
        {(
          [
            ["interview", "Entrevista"],
            ["objective", "Objetivo"],
            ["anthropometry", "Antropometría"],
            ["laboratories", "Laboratorios"],
          ] as const
        ).map(([key, label]) => {
          const available = clinical.workspace?.readiness[key];
          const Icon = available ? Check : Circle;
          return (
            <span key={key} className="inline-flex items-center gap-1">
              <Icon size={13} aria-hidden="true" />
              {label}
              {available ? " disponible" : " sin registrar"}
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[#687870]">
        {clinical.workspace?.readiness.anthropometry
          ? "Los laboratorios no son obligatorios."
          : "Agregar antropometría puede aportar más contexto; no es obligatorio."}{" "}
        Puedes redactar el PES manualmente.
      </p>
      {!draft && (
        <AIButton
          className="mt-4"
          state={clinical.state}
          disabled={clinical.saving || !clinical.workspace}
          onClick={() => void generate()}
        >
          Generar borrador
        </AIButton>
      )}
      {clinical.state === "generating" && (
        <p role="status" className="mt-3 text-sm">
          Analizando la información de la consulta…
        </p>
      )}
      {draft && (
        <div className="mt-4 space-y-3">
          <h4 className="text-sm font-semibold">Borrador de diagnóstico PES</h4>
          {(
            [
              ["problem", "Problema"],
              ["etiology", "Etiología"],
              ["pesStatement", "Enunciado PES"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-xs font-medium">
              {label}
              <textarea
                className={input}
                readOnly={!editing}
                maxLength={
                  key === "problem" ? 500 : key === "etiology" ? 1500 : 2000
                }
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="block text-xs font-medium">
            Signos y síntomas
            <textarea
              className={input}
              readOnly={!editing}
              maxLength={1500}
              value={draft.signsSymptoms.join("\n")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  signsSymptoms: e.target.value.split("\n"),
                })
              }
            />
          </label>
          <details className="text-xs text-[#52675f]">
            <summary className="cursor-pointer">
              Información utilizada y límites
            </summary>
            <ul className="mt-2 space-y-2">
              {draft.evidence.map((e, i) => (
                <li key={i}>
                  <strong>{e.source}</strong>: {e.finding}
                </li>
              ))}
            </ul>
            {(["missingContext", "uncertainties"] as const).map((key) => (
              <label key={key} className="mt-3 block">
                {key === "missingContext"
                  ? "Datos faltantes"
                  : "Incertidumbres"}
                <textarea
                  className={input}
                  readOnly={!editing}
                  value={draft[key].join("\n")}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value.split("\n") })
                  }
                />
              </label>
            ))}
          </details>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondary}
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Ver propuesta" : "Editar"}
            </button>
            <button
              type="button"
              className={secondary}
              disabled={
                clinical.saving ||
                !!replacement ||
                clinical.state === "generating" ||
                !draft.pesStatement.trim()
              }
              onClick={() =>
                void clinical.approve("pes", draft).then((ok) => {
                  if (ok) {
                    props.onPes?.(draft);
                    setDraft(null);
                  }
                })
              }
            >
              {clinical.saving ? "Guardando…" : "Aprobar"}
            </button>
            <button
              type="button"
              className={secondary}
              disabled={clinical.state === "generating" || clinical.saving}
              onClick={() => {
                setDraft(null);
                setReplacement(null);
                clinical.setGeneration(undefined);
              }}
            >
              Descartar
            </button>
            <AIButton
              state={clinical.state}
              disabled={clinical.saving || !!replacement}
              onClick={() => void generate()}
            >
              Otra propuesta
            </AIButton>
          </div>
          {replacement && (
            <div className="rounded-xl border border-[#ccdcd0] p-3 text-sm">
              <p className="font-semibold">
                Nueva propuesta · aún no reemplaza la anterior
              </p>
              <p className="mt-2">{replacement.pesStatement}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    setDraft(replacement);
                    setReplacement(null);
                  }}
                >
                  Revisar nueva propuesta
                </button>
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    setReplacement(null);
                    clinical.setGeneration(previousGeneration);
                  }}
                >
                  Conservar anterior
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <Feedback clinical={clinical} />
    </section>
  );
}

export function RecallTotals({
  items,
  target,
  provisional = false,
}: {
  items: RecallSavedItem[];
  target?: ClinicalWorkspace["target"];
  provisional?: boolean;
}) {
  const result = calculateRecall(items);
  return (
    <div className="mt-4 rounded-xl bg-[#edf5ef] p-3 text-sm text-[#315e4f]">
      <p>
        <strong>{result.total.energy_kcal.toFixed(0)} kcal estimadas</strong> ·
        Proteína {result.total.protein_g.toFixed(1)} g · Carbohidratos{" "}
        {result.total.carbohydrate_g.toFixed(1)} g · Grasa{" "}
        {result.total.fat_g.toFixed(1)} g
      </p>
      <ul className="mt-2 text-xs">
        {result.meals.map((m) => (
          <li key={m.mealLabel}>
            {m.mealLabel}: {m.energy_kcal.toFixed(0)} kcal ·{" "}
            {m.energyPercent.toFixed(0)} %
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">
        Estimación por equivalentes del catálogo.{" "}
        {provisional
          ? "Vista preliminar: revisa las cantidades antes de confirmar."
          : "Solo incluye alimentos revisados."}
      </p>
      {result.groups.length > 0 && (
        <details className="mt-2 text-xs">
          <summary>Equivalentes utilizados</summary>
          <ul className="mt-1">
            {[...new Set(result.groups.map((g) => g.group_code))].map(
              (code) => (
                <li key={code}>
                  {getExchangeGroup(code).shortName}:{" "}
                  {result.groups
                    .filter((g) => g.group_code === code)
                    .reduce((n, g) => n + g.portions, 0)
                    .toFixed(2)}
                </li>
              ),
            )}
          </ul>
        </details>
      )}
      {target?.energy_kcal && (
        <p className="mt-2 text-xs">
          Objetivo del plan de esta consulta: {target.energy_kcal} kcal
          {target.protein_g != null
            ? ` · Proteína ${Number(target.protein_g).toFixed(1)} g`
            : ""}
          {target.carbohydrate_g != null
            ? ` · Carbohidratos ${Number(target.carbohydrate_g).toFixed(1)} g`
            : ""}
          {target.fat_g != null
            ? ` · Grasa ${Number(target.fat_g).toFixed(1)} g`
            : ""}
          . Comparación informativa, sin clasificación automática.
        </p>
      )}
    </div>
  );
}
export function ConfirmedRecall({
  record,
}: {
  record: { narrative: string; items: RecallSavedItem[] };
}) {
  return (
    <div className="mt-4 text-sm">
      <h4 className="font-semibold text-[#173d36]">Recordatorio confirmado</h4>
      {[...new Set(record.items.map((i) => i.mealLabel))].map((meal) => (
        <div key={meal} className="mt-3">
          <h5 className="font-medium">{meal}</h5>
          <ul className="mt-1 space-y-1 text-[#52675f]">
            {record.items
              .filter((i) => i.mealLabel === meal)
              .map((i, index) => (
                <li key={index}>
                  {i.food.name} · {Number(i.quantity.toFixed(3))}{" "}
                  {foodUnitLabels[i.food.portion_unit]}
                </li>
              ))}
          </ul>
        </div>
      ))}
      <details className="mt-3 text-xs text-[#687870]">
        <summary>Texto original</summary>
        <p className="mt-2 whitespace-pre-wrap">{record.narrative}</p>
      </details>
      <RecallTotals items={record.items} />
    </div>
  );
}
export function RecallCopilot(props: Props) {
  const clinical = useClinical(props, "recall_24h");
  const [open, setOpen] = useState(false);
  const [narrative, setNarrative] = useState("");
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [rows, setRows] = useState<RecallRow[]>([]);
  const [ambiguities, setAmbiguities] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [replacement, setReplacement] = useState<RecallExtraction | null>(null);
  const [previousGeneration, setPreviousGeneration] = useState<string>();
  const setMessage = clinical.setMessage;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void listFoodItems()
      .then((v) => {
        if (alive) setFoods(v);
      })
      .catch((e) => {
        if (alive) setMessage(e.message);
      });
    return () => {
      alive = false;
    };
  }, [open, setMessage]);
  function apply(extraction: RecallExtraction) {
    setRows(recallRows(extraction, foods));
    setAmbiguities([...extraction.ambiguities, ...extraction.unresolvedItems]);
    setReplacement(null);
  }
  const update = (id: string, patch: Partial<RecallRow>) =>
    setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const items = rows
    .map((r) => canonicalRecallItem(r, foods))
    .filter((i): i is RecallSavedItem => !!i);
  const previewItems = rows
    .map((r) => canonicalRecallItem({ ...r, confirmed: true }, foods))
    .filter((i): i is RecallSavedItem => !!i);
  function start() {
    const saved = clinical.workspace?.records.recall;
    setNarrative(saved?.narrative ?? "");
    setRows(
      saved?.items.map((i) => ({
        id: crypto.randomUUID(),
        mealLabel: i.mealLabel,
        rawText: i.rawText,
        search: i.food.name,
        foodId: i.food.id,
        quantity: String(i.quantity),
        unit: i.unit,
        confirmed: true,
      })) ?? [],
    );
    setOpen(true);
  }
  return (
    <section
      aria-label="Recordatorio estructurado"
      className="mt-5 rounded-2xl border border-[#dfe5e1] bg-[#f7faf8] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-[#173d36]">
          Texto libre y análisis de alimentos
        </h3>
        {!open && (
          <button type="button" className={secondary} onClick={start}>
            {clinical.workspace?.records.recall
              ? "Revisar recordatorio"
              : "Capturar recordatorio"}
          </button>
        )}
      </div>
      {!open && clinical.workspace?.records.recall && (
        <ConfirmedRecall record={clinical.workspace.records.recall} />
      )}
      {open && (
        <div className="mt-4 space-y-4">
          <label className="block text-sm">
            Texto capturado
            <textarea
              className={input}
              rows={4}
              maxLength={8000}
              disabled={clinical.state === "generating" || clinical.saving}
              placeholder="Describe lo que comió y bebió, con las cantidades que recuerde."
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <AIButton
              state={clinical.state}
              disabled={
                !narrative.trim() ||
                !foods.length ||
                clinical.saving ||
                !!replacement
              }
              onClick={() =>
                void (async () => {
                  setPreviousGeneration(clinical.generation);
                  const result = await clinical.generate(narrative);
                  if (result) {
                    if (rows.length) setReplacement(result as RecallExtraction);
                    else apply(result as RecallExtraction);
                  }
                })()
              }
            >
              Organizar alimentos
            </AIButton>
            <button
              type="button"
              className={secondary}
              onClick={() =>
                setRows([
                  ...rows,
                  {
                    id: crypto.randomUUID(),
                    mealLabel: "Desayuno",
                    rawText: "",
                    search: "",
                    foodId: "",
                    quantity: "",
                    unit: "",
                    confirmed: false,
                  },
                ])
              }
            >
              Agregar alimento manualmente
            </button>
          </div>
          {replacement && (
            <div className="rounded-xl border p-3 text-sm">
              <p>
                Hay una nueva interpretación. Tu captura actual sigue intacta.
              </p>
              <button
                type="button"
                className={secondary + " mt-2"}
                onClick={() => apply(replacement)}
              >
                Revisar nueva interpretación
              </button>
              <button
                type="button"
                className={secondary + " ml-2"}
                onClick={() => {
                  setReplacement(null);
                  clinical.setGeneration(previousGeneration);
                }}
              >
                Conservar captura
              </button>
            </div>
          )}
          {ambiguities.length > 0 && (
            <p role="status" className="text-xs text-[#856127]">
              Por revisar: {ambiguities.join(" · ")}
            </p>
          )}
          {rows.map((row, index) => {
            const food = foods.find((f) => f.id === row.foodId);
            const matches = matchRecallFoods(row.search, foods).slice(0, 20);
            return (
              <div
                key={row.id}
                className="rounded-xl border border-[#dfe5e1] bg-white p-3"
              >
                {row.rawText && (
                  <p className="mb-2 text-xs text-[#687870]">
                    Texto original: {row.rawText}
                  </p>
                )}
                <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-[1fr_2fr_1fr_1fr_auto]">
                  <label className="text-xs">
                    Tiempo
                    <input
                      aria-label={`Tiempo ${index + 1}`}
                      className={input}
                      maxLength={120}
                      value={row.mealLabel}
                      onChange={(e) =>
                        update(row.id, { mealLabel: e.target.value })
                      }
                    />
                  </label>
                  <label className="text-xs">
                    Alimento
                    <input
                      aria-label={`Buscar alimento ${index + 1}`}
                      className={input}
                      value={row.search}
                      placeholder="Buscar en catálogo"
                      onChange={(e) =>
                        update(row.id, {
                          search: e.target.value,
                          foodId: "",
                          confirmed: false,
                        })
                      }
                    />
                    <select
                      aria-label={`Alimento ${index + 1}`}
                      className={input}
                      value={row.foodId}
                      onChange={(e) => {
                        const f = foods.find((f) => f.id === e.target.value);
                        update(row.id, {
                          foodId: e.target.value,
                          unit: f?.portion_unit ?? "",
                          confirmed: false,
                        });
                      }}
                    >
                      <option value="">Selecciona del catálogo</option>
                      {food && !matches.some((f) => f.id === food.id) && (
                        <option value={food.id}>{food.name}</option>
                      )}
                      {matches.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} · {f.portion_description}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    Cantidad
                    <input
                      aria-label={`Cantidad ${index + 1}`}
                      className={input}
                      type="number"
                      min="0.001"
                      max="10000"
                      step="any"
                      placeholder="Por confirmar"
                      value={row.quantity}
                      onChange={(e) =>
                        update(row.id, {
                          quantity: e.target.value,
                          confirmed: false,
                        })
                      }
                    />
                  </label>
                  <label className="text-xs">
                    Unidad
                    <select
                      aria-label={`Unidad ${index + 1}`}
                      className={input}
                      value={row.unit}
                      onChange={(e) =>
                        update(row.id, {
                          unit: e.target.value,
                          confirmed: false,
                        })
                      }
                    >
                      <option value="">Elegir</option>
                      {food && (
                        <option value={food.portion_unit}>
                          {foodUnitLabels[food.portion_unit]}
                        </option>
                      )}
                      {food?.edible_grams && food.portion_unit !== "g" ? (
                        <option value="g">g comestibles</option>
                      ) : null}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="self-start p-2 text-[#8b5750]"
                    aria-label={`Omitir alimento ${index + 1}`}
                    onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
                  >
                    <X size={16} />
                  </button>
                </div>
                {!row.foodId && row.search && matches.length === 0 && (
                  <p className="mt-2 text-xs">
                    No encontré este alimento en tu catálogo. Busca otro nombre,{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setCreating(true)}
                    >
                      crea un alimento
                    </button>{" "}
                    u omítelo.
                  </p>
                )}
                <label className="mt-3 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={row.confirmed}
                    onChange={(e) =>
                      update(row.id, { confirmed: e.target.checked })
                    }
                  />
                  Revisé alimento, cantidad y unidad
                </label>
              </div>
            );
          })}
          {creating && (
            <CustomFoodForm
              initialGroup="VEGETABLES"
              busy={creatingBusy}
              onCancel={() => setCreating(false)}
              onCreate={(v) => {
                setCreatingBusy(true);
                void createCustomFood(v)
                  .then((f) => {
                    setFoods((all) => [...all, f]);
                    setCreating(false);
                  })
                  .catch((e) => clinical.setMessage(e.message))
                  .finally(() => setCreatingBusy(false));
              }}
            />
          )}
          {rows.length > 0 && (
            <>
              {previewItems.length > 0 ? (
                <RecallTotals
                  items={previewItems}
                  target={clinical.workspace?.target}
                  provisional={items.length !== rows.length}
                />
              ) : (
                <p className="text-sm text-[#687870]">
                  Completa alimento, cantidad y unidad para estimar nutrientes.
                </p>
              )}
              <p className="text-xs text-[#687870]">
                {items.length} de {rows.length} alimentos revisados. Resuelve u
                omite los pendientes antes de confirmar.
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondary}
              disabled={
                clinical.saving ||
                clinical.state === "generating" ||
                !!replacement ||
                !items.length ||
                items.length !== rows.length
              }
              onClick={() =>
                void clinical
                  .approve("recall", {
                    narrative,
                    items: rows.map((r) => ({
                      foodId: r.foodId,
                      mealLabel: r.mealLabel,
                      rawText: r.rawText,
                      quantity: Number(r.quantity),
                      unit: r.unit,
                    })),
                  })
                  .then((ok) => {
                    if (ok) setOpen(false);
                  })
              }
            >
              {clinical.saving ? "Guardando…" : "Confirmar recordatorio"}
            </button>
            <button
              type="button"
              className={secondary}
              disabled={clinical.saving || clinical.state === "generating"}
              onClick={() => {
                setOpen(false);
                setReplacement(null);
                clinical.setGeneration(undefined);
              }}
            >
              Descartar cambios
            </button>
          </div>
        </div>
      )}
      <Feedback clinical={clinical} />
    </section>
  );
}
