import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, Sparkles, X } from "lucide-react";
import type { NutritionPlan } from "@/src/types/domain";
import { useAccess } from "@/src/features/admin/AccessProvider";
import { canUseFeature } from "@/src/features/admin/api";
import { AIRequestError } from "@/src/services/ai";
import {
  textDietEditTransport,
  type TextDietEditProposal,
} from "@/src/services/textDietAI";
import {
  estimatedTotal,
  textDietMealSegments,
  type EstimatedNutrition,
  type TextDietEdit,
} from "../../../../supabase/functions/_shared/text-diet-edit";
import { numberText, nutritionLabels } from "./dietCopilotPresentation";
import "./TextDietAdjustment.css";

export function TextDietAdjustment({
  plan,
  dietId,
  before,
  onApplied,
}: {
  plan: NutritionPlan;
  dietId: string;
  before: () => Promise<NutritionPlan | undefined>;
  onApplied: (plan: NutritionPlan, dietId: string) => void;
}) {
  const { data: access } = useAccess();
  const available = !access || canUseFeature(access.access, "ai.diet_draft");
  const storageKey = `text-diet-edit-pending:${plan.id}`;
  const [pending, setPending] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [savedPlan, setSavedPlan] = useState<NutritionPlan | null>(null);
  const [scope, setScope] = useState<TextDietEdit["scope"]>("meals");
  const [selected, setSelected] = useState<number[]>([]),
    [instructions, setInstructions] = useState("");
  const [proposal, setProposal] = useState<TextDietEditProposal | null>(null);
  const [comparison, setComparison] = useState<"proposal" | "original">(
    "proposal",
  );
  const dialog = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLButtonElement>(null),
    lock = useRef(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    node?.showModal();
    node?.querySelector<HTMLElement>("h2")?.focus();
    return () => node?.close();
  }, [open]);
  function remember(key: string | null) {
    setPending(key);
    try {
      if (key) sessionStorage.setItem(storageKey, key);
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* Keep the current session recoverable in memory. */
    }
  }
  function fail(cause: unknown) {
    setError(
      cause instanceof AIRequestError
        ? cause.code === "invalid_output"
          ? "La respuesta no entregó un ajuste completo para los tiempos seleccionados. Tu dieta original se conserva."
          : cause.code === "context_unavailable" ||
              cause.code === "context_changed"
            ? "El plan cambió o tiene cambios pendientes. La propuesta se conserva; no se reemplazó tu dieta. Revisa el borrador antes de solicitar otro ajuste."
            : cause.message
        : cause instanceof Error
          ? cause.message
          : "No pudimos completar el ajuste. Tu dieta original se conserva.",
    );
  }
  async function recover(key = pending) {
    if (lock.current || !key) return;
    lock.current = true;
    setBusy("Consultando la solicitud existente…");
    setError("");
    try {
      const result = await textDietEditTransport.status(key);
      if (result?.status === "succeeded") {
        setProposal(await textDietEditTransport.recover(result.generationId));
        setComparison("proposal");
      } else if (
        result &&
        ["failed", "invalid_output"].includes(result.status)
      ) {
        remember(null);
        throw new AIRequestError(result.errorCode ?? "invalid_output");
      } else if (!result) {
        setError(
          "La solicitud todavía no aparece en el registro. Espera unos segundos y vuelve a consultarla antes de generar otra.",
        );
      } else throw new AIRequestError("provider_outcome_unknown");
    } catch (cause) {
      fail(cause);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function show() {
    if (lock.current || !available) return;
    setOpen(true);
    setError("");
    if (pending) {
      await recover();
      return;
    }
    lock.current = true;
    setBusy("Guardando el borrador actual…");
    try {
      const saved = await before();
      if (!saved?.text_diet)
        throw new Error(
          "Guarda el borrador de texto antes de solicitar un ajuste.",
        );
      setSavedPlan(saved);
      setProposal(null);
      if (
        !textDietMealSegments(
          saved.text_diet.diets.find((diet) => diet.id === dietId)?.text ?? "",
          saved.text_diet.meals,
        )
      )
        setScope("diet");
    } catch (cause) {
      fail(cause);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function generate() {
    if (lock.current || pending || !savedPlan) return;
    if (!instructions.trim() || (scope === "meals" && !selected.length)) {
      setError(
        !instructions.trim()
          ? "Describe qué quieres cambiar."
          : "Selecciona al menos un tiempo de comida.",
      );
      return;
    }
    lock.current = true;
    setBusy("Analizando el aporte actual y preparando el ajuste…");
    setError("");
    let key: string | null = null;
    try {
      const edit: TextDietEdit = {
        version: 1,
        dietId,
        scope,
        mealIndexes: scope === "diet" ? [] : selected,
      };
      await textDietEditTransport.preflight(savedPlan, edit, instructions);
      key = crypto.randomUUID();
      remember(key);
      setProposal(
        await textDietEditTransport.generate(
          savedPlan,
          edit,
          instructions,
          key,
        ),
      );
      setComparison("proposal");
    } catch (cause) {
      if (
        !key ||
        (cause instanceof AIRequestError &&
          ![
            "provider_outcome_unknown",
            "service_unavailable",
            "result_unavailable",
          ].includes(cause.code))
      )
        remember(null);
      fail(cause);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function decide(accept: boolean) {
    if (lock.current || !proposal) return;
    lock.current = true;
    setBusy(accept ? "Guardando el ajuste…" : "Conservando la dieta original…");
    setError("");
    try {
      if (accept) {
        const updated = await textDietEditTransport.apply(
          proposal.generationId,
        );
        onApplied(updated, proposal.adjustment.dietId);
      } else await textDietEditTransport.discard(proposal.generationId);
      remember(null);
      setProposal(null);
      setOpen(false);
    } catch (cause) {
      fail(cause);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  const currentPlan = savedPlan ?? plan,
    draft = currentPlan.text_diet;
  const diet = draft?.diets.find((row) => row.id === dietId);
  const separable =
    !!draft && !!diet && !!textDietMealSegments(diet.text, draft.meals);
  const close = () => {
    if (busy) return;
    setOpen(false);
    opener.current?.focus();
  };
  const number = (value: number | null) =>
    value === null ? "Sin estimación" : numberText(value);
  const difference = (value: number | null, target: number | null) =>
    value === null || target === null
      ? "—"
      : `${value > target ? "+" : ""}${numberText(value - target)}`;
  const report = proposal?.adjustment;
  const selectedBefore = report
    ? estimatedTotal(
        report.meals
          .filter((meal) => report.selectedMeals.includes(meal.index))
          .map((meal) => meal.before),
      )
    : null;
  const selectedAfter = report
    ? estimatedTotal(
        report.meals
          .filter((meal) => report.selectedMeals.includes(meal.index))
          .map((meal) => meal.after),
      )
    : null;
  function table(
    beforeValues: EstimatedNutrition,
    afterValues: EstimatedNutrition,
    daily = false,
  ) {
    return (
      <div className="text-diet-adjustment-table">
        <table>
          <caption>
            {daily
              ? "Día completo · comparación estimada"
              : "Tiempos seleccionados · aporte estimado"}
          </caption>
          <thead>
            <tr>
              <th>Nutriente</th>
              <th>Antes</th>
              <th>Después</th>
              <th>{daily ? "Meta para alimentos" : "% del día actual"}</th>
              {daily && <th>Diferencia con la meta</th>}
            </tr>
          </thead>
          <tbody>
            {nutritionLabels.map(([key, label, unit]) => {
              const share =
                report?.before[key] && beforeValues[key] !== null
                  ? (100 * beforeValues[key]!) / report.before[key]!
                  : null;
              return (
                <tr key={key}>
                  <th>
                    {label} ({unit})
                  </th>
                  <td>{number(beforeValues[key])}</td>
                  <td>{number(afterValues[key])}</td>
                  <td>
                    {daily
                      ? number(report!.target[key])
                      : share === null
                        ? "—"
                        : `${numberText(share)} %`}
                  </td>
                  {daily && (
                    <td>{difference(afterValues[key], report!.target[key])}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <>
      <button
        ref={opener}
        type="button"
        className="nuth-button-secondary"
        disabled={!available || !!busy}
        onClick={() => void show()}
      >
        <Sparkles size={16} />
        {pending ? "Revisar ajuste pendiente" : "Ajustar con IA"}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="text-diet-adjustment"
          aria-labelledby={`${id}-title`}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <header>
            <div>
              <p className="nuth-eyebrow">
                Edición con IA · {report?.dietTitle ?? diet?.title ?? "Dieta"}
              </p>
              <h2 id={`${id}-title`} tabIndex={-1}>
                {proposal
                  ? "Revisa el ajuste propuesto"
                  : "¿Qué quieres modificar?"}
              </h2>
            </div>
            <button
              type="button"
              className="nuth-button-secondary !p-2"
              aria-label="Cerrar ajuste de dieta"
              disabled={!!busy}
              onClick={close}
            >
              <X size={20} />
            </button>
          </header>
          <div className="text-diet-adjustment-body">
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950"
              >
                {error}
              </p>
            )}
            {busy && (
              <p role="status" className="my-3 flex gap-2 text-sm">
                <LoaderCircle size={18} className="animate-spin" />
                {busy}
              </p>
            )}
            {!proposal && !pending && (
              <fieldset disabled={!!busy || !savedPlan} className="space-y-4">
                <p>
                  Solicita una alternativa sobre este borrador. La IA
                  considerará el aporte del tiempo actual, el día completo y las
                  calorías y macros configurados.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["meals", "diet"] as const).map((option) => (
                    <label
                      key={option}
                      className="rounded-xl border border-[#dce6de] p-4"
                    >
                      <input
                        type="radio"
                        name={`${id}-scope`}
                        checked={scope === option}
                        disabled={option === "meals" && !separable}
                        onChange={() => setScope(option)}
                      />{" "}
                      {option === "meals"
                        ? "Uno o varios tiempos"
                        : "Otra dieta completa"}
                    </label>
                  ))}
                </div>
                {!separable && (
                  <p className="text-sm text-[#687870]">
                    Para ajustar tiempos específicos, cada nombre de tiempo debe
                    estar en una línea separada, como en la propuesta original.
                    También puedes generar otra dieta completa.
                  </p>
                )}
                {scope === "meals" && (
                  <div
                    role="group"
                    aria-label="Tiempos que quieres modificar"
                    className="flex flex-wrap gap-3"
                  >
                    {draft?.meals.map((meal, index) => (
                      <label
                        key={index}
                        className="rounded-lg border border-[#dce6de] px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(index)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, index]
                                : current.filter((i) => i !== index),
                            )
                          }
                        />{" "}
                        {meal.name}
                        {meal.time ? ` · ${meal.time}` : ""}
                      </label>
                    ))}
                  </div>
                )}
                <label
                  className="block font-semibold"
                  htmlFor={`${id}-instructions`}
                >
                  ¿Qué quieres cambiar?
                  <textarea
                    id={`${id}-instructions`}
                    className="nuth-input mt-2 min-h-28 font-normal"
                    maxLength={1200}
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder="Por ejemplo: cambia el almuerzo por algo fácil de llevar al trabajo, sin atún y sin refrigeración."
                  />
                </label>
                <p className="text-sm text-[#687870]">
                  Generar el ajuste consume créditos según el uso de IA. Puedes
                  revisarlo antes de reemplazar el borrador.
                </p>
              </fieldset>
            )}
            {pending && !proposal && !busy && (
              <section className="mt-3">
                <p>
                  Consulta la solicitud existente antes de generar otra
                  propuesta.
                </p>
                <button
                  type="button"
                  className="nuth-button-secondary mt-3"
                  onClick={() => void recover()}
                >
                  Consultar ajuste pendiente
                </button>
              </section>
            )}
            {proposal && report && (
              <>
                <p className="my-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
                  Cifras aproximadas de IA, sin cálculo nutricional verificado.
                  Revisa los supuestos, las porciones y las restricciones antes
                  de aceptar. Las metas para alimentos descuentan suplementos
                  cuando corresponde.
                </p>
                <p className="my-3">{report.explanation}</p>
                {report.scope === "meals" &&
                  selectedBefore &&
                  selectedAfter &&
                  table(selectedBefore, selectedAfter)}
                {table(report.before, report.after, true)}
                <details className="my-4 rounded-xl border border-[#dce6de] p-3">
                  <summary className="font-semibold">
                    Supuestos y detalle por tiempo
                  </summary>
                  {report.meals.map((meal) => (
                    <section key={meal.index} className="mt-3 text-sm">
                      <h3 className="font-semibold">
                        {meal.name}
                        {report.selectedMeals.includes(meal.index)
                          ? " · ajustado"
                          : ""}
                      </h3>
                      <p>
                        Energía: {number(meal.before.energy_kcal)} →{" "}
                        {number(meal.after.energy_kcal)} kcal
                      </p>
                      {meal.assumptions.length > 0 ? (
                        <ul className="ml-5 list-disc">
                          {meal.assumptions.map((assumption, index) => (
                            <li key={index}>{assumption}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>Sin supuestos adicionales informados.</p>
                      )}
                    </section>
                  ))}
                </details>
                <div
                  className="my-3 flex gap-2"
                  role="group"
                  aria-label="Comparar textos"
                >
                  <button
                    type="button"
                    aria-pressed={comparison === "proposal"}
                    className="nuth-button-secondary"
                    onClick={() => setComparison("proposal")}
                  >
                    Propuesta
                  </button>
                  <button
                    type="button"
                    aria-pressed={comparison === "original"}
                    className="nuth-button-secondary"
                    onClick={() => setComparison("original")}
                  >
                    Texto anterior
                  </button>
                </div>
                <pre className="whitespace-pre-wrap rounded-xl border border-[#dce6de] p-4 font-sans text-sm leading-7">
                  {comparison === "original"
                    ? report.beforeText
                    : proposal.textDraft.diets.find(
                        (row) => row.id === report.dietId,
                      )?.text}
                </pre>
              </>
            )}
          </div>
          <footer>
            {proposal ? (
              <>
                <button
                  type="button"
                  className="nuth-button-secondary"
                  disabled={!!busy}
                  onClick={() => void decide(false)}
                >
                  Conservar texto anterior
                </button>
                <button
                  type="button"
                  className="nuth-button"
                  disabled={!!busy}
                  onClick={() => void decide(true)}
                >
                  Aceptar y guardar ajuste
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="nuth-button-secondary"
                  disabled={!!busy}
                  onClick={close}
                >
                  Volver al borrador
                </button>
                {!pending && (
                  <button
                    type="button"
                    className="nuth-button"
                    disabled={
                      !!busy ||
                      !savedPlan ||
                      !instructions.trim() ||
                      (scope === "meals" && !selected.length)
                    }
                    onClick={() => void generate()}
                  >
                    <Sparkles size={16} />
                    Generar ajuste
                  </button>
                )}
              </>
            )}
          </footer>
        </dialog>
      )}
    </>
  );
}
