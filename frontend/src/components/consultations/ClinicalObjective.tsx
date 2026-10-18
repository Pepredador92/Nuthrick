import { useEffect, useRef, useState } from "react";
import {
  clinicalObjective,
  type ObjectiveWorkspace,
} from "@/src/services/clinicalCopilot";
import { ConsultationObjectiveAI } from "./ConsultationObjectiveAI";
import {
  composeObjective,
  emptyObjective,
  isObjectivePlan,
  type ObjectiveGoal,
  objectiveIssues,
  type ObjectivePlan,
} from "../../../../supabase/functions/_shared/objectives";

type Props = {
  consultationId: string;
  revision: number;
  questionKey: string;
  value: unknown;
  before: () => Promise<boolean>;
  patientId?: string;
  active?: boolean;
  contextVersion?: number;
  onApplySuggestion?: (text: string) => void;
  onChangeText?: (text: string, texts: string[]) => void;
  onPendingChange?: (pending: boolean) => void;
  maxLength?: number;
};
const fields = [
  [
    "outcome",
    "Resultado esperado",
    "¿Qué cambio esperas observar en la persona?",
  ],
  [
    "etiology",
    "Causa del PES que se abordará",
    "Explica cómo este resultado responde a la etiología.",
  ],
  [
    "indicator",
    "Indicador de seguimiento",
    "Qué medirás y en qué unidad o escala.",
  ],
  [
    "baseline",
    "Situación inicial y fecha",
    "Dato registrado y su fecha. Si falta, indica cómo se obtendrá.",
  ],
  [
    "target",
    "Meta o criterio de logro",
    "Valor, rango o conducta observable que se acordará.",
  ],
  [
    "timeframe",
    "Plazo de reevaluación",
    "Fecha, duración o próxima consulta de seguimiento.",
  ],
  [
    "monitoring",
    "Cómo se evaluará",
    "Método de registro o medición y frecuencia.",
  ],
  [
    "feasibility",
    "Viabilidad, barreras y preferencias",
    "Qué lo hace alcanzable y qué apoyos o adaptaciones se necesitan.",
  ],
] as const;
const blankPlan = (): ObjectivePlan => ({
  version: 1,
  pesApprovedAt: "",
  goals: [],
});
export function ClinicalObjective(props: Props) {
  const {
    consultationId,
    revision,
    questionKey,
    value,
    before,
    patientId,
    active,
    onPendingChange,
    maxLength = 2000,
  } = props;
  const cacheKey =
    `objective-draft:${consultationId}:${revision}:${questionKey}`;
  const [plan, setPlan] = useState<ObjectivePlan>(() => {
    try {
      const cached: unknown = JSON.parse(
        sessionStorage.getItem(cacheKey) || "null",
      );
      return isObjectivePlan(cached) ? cached : blankPlan();
    } catch {
      return blankPlan();
    }
  });
  const [dirty, setDirty] = useState(() => {
    try {
      return isObjectivePlan(
        JSON.parse(sessionStorage.getItem(cacheKey) || "null"),
      );
    } catch {
      return false;
    }
  });
  const dirtyRef = useRef(dirty);
  const [workspace, setWorkspace] = useState<ObjectiveWorkspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const text = plan.goals.map(composeObjective).filter(Boolean).join("\n\n");
  const legacy = typeof value === "string"
    ? value
    : Array.isArray(value)
    ? value.map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object"
        ? Object.values(item).filter((v) => typeof v === "string" && v).join(
          " · ",
        )
        : ""
    ).join("\n\n")
    : "";
  const approved = !dirty && !!workspace?.objective?.smart_plan &&
    workspace.objective.question_key === questionKey &&
    JSON.stringify(workspace.objective.value) === JSON.stringify(value) &&
    JSON.stringify(workspace.objective.smart_plan) ===
      JSON.stringify({
        version: plan.version,
        pesApprovedAt: plan.pesApprovedAt,
        goals: plan.goals,
      });
  const issues = plan.goals.flatMap((goal, index) =>
    objectiveIssues(goal).map((issue) => `Objetivo ${index + 1}: ${issue}`)
  );
  const pesChanged = !!workspace?.pes && plan.goals.length > 0 &&
    plan.pesApprovedAt !== workspace.pes.approved_at;
  const signs =
    workspace?.pes?.signsSymptoms?.split("\n").map((sign) => sign.trim())
      .filter(Boolean) ?? [];
  const staleSigns = plan.goals.some((goal) => !signs.includes(goal.sign));
  const pendingCallback = useRef(onPendingChange);
  useEffect(() => {
    pendingCallback.current = onPendingChange;
  }, [onPendingChange]);
  useEffect(() => {
    pendingCallback.current?.(dirty || busy);
  }, [dirty, busy]);
  useEffect(() => () => pendingCallback.current?.(false), []);
  useEffect(() => {
    let alive = true;
    void clinicalObjective(consultationId, revision).then((w) => {
      if (!alive) return;
      setWorkspace(w);
      const saved = w.plans?.[questionKey];
      if (!dirtyRef.current && isObjectivePlan(saved)) {
        setPlan({
          version: 1,
          pesApprovedAt: saved.pesApprovedAt,
          goals: saved.goals,
        });
      }
    }).catch((error) => {
      if (alive) setMessage(error.message);
    });
    return () => {
      alive = false;
    };
  }, [consultationId, revision, questionKey, active, props.contextVersion]);
  // Recovered drafts also restore the existing interview answer, which remains
  // the canonical text used by closure, exports and explicit portal publication.
  const onChangeRef = useRef(props.onChangeText);
  useEffect(() => {
    onChangeRef.current = props.onChangeText;
  }, [props.onChangeText]);
  useEffect(() => {
    if (dirtyRef.current && text.length <= maxLength) {
      onChangeRef.current?.(text, plan.goals.map(composeObjective));
    }
  }, [text, maxLength, plan.goals]);
  function change(next: ObjectivePlan) {
    setPlan(next);
    dirtyRef.current = true;
    setDirty(true);
    setMessage("");
    sessionStorage.setItem(cacheKey, JSON.stringify(next));
    const texts = next.goals.map(composeObjective).filter(Boolean);
    const composed = texts.join("\n\n");
    if (composed.length <= maxLength) props.onChangeText?.(composed, texts);
  }
  function update(index: number, patch: Partial<ObjectiveGoal>) {
    change({
      ...plan,
      goals: plan.goals.map((goal, i) =>
        i === index ? { ...goal, ...patch } : goal
      ),
    });
  }
  function add(goal = emptyObjective()) {
    if (plan.goals.length >= 3) return;
    goal = {
      ...goal,
      etiology: goal.etiology || workspace?.pes?.etiology || "",
      sign: goal.sign || (signs.length === 1 ? signs[0] : ""),
    };
    change({
      ...plan,
      pesApprovedAt: plan.goals.length
        ? plan.pesApprovedAt
        : workspace?.pes?.approved_at ?? "",
      goals: [...plan.goals, goal],
    });
  }
  async function persist(action: "save" | "approve" | "revoke") {
    setBusy(true);
    setMessage("");
    try {
      if (!(await before())) {
        throw new Error("Guarda la entrevista antes de continuar.");
      }
      const fresh = await clinicalObjective(consultationId, revision);
      setWorkspace(fresh);
      if (
        action === "approve" && fresh.pes?.approved_at !== plan.pesApprovedAt
      ) {
        throw new Error(
          "El PES cambió. Vincula los objetivos al PES actual y revisa la evidencia.",
        );
      }
      const saved = await clinicalObjective(
        consultationId,
        revision,
        action,
        fresh.stamp,
        questionKey,
        action === "revoke" ? undefined : plan,
      );
      setWorkspace(saved);
      dirtyRef.current = false;
      setDirty(false);
      sessionStorage.removeItem(cacheKey);
      setMessage(
        action === "approve"
          ? "Objetivos aprobados para seguimiento."
          : action === "save"
          ? "Borrador guardado. Puedes continuar y revisarlo después."
          : "Objetivos pendientes de revisión.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No pudimos guardar los objetivos.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Revisión del objetivo" className="clinical-assistant">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Define objetivos SMART</h3>
        <span className="text-xs text-[var(--nuth-muted)]">
          {approved
            ? "Aprobados"
            : dirty
            ? "Borrador sin guardar"
            : "Pendientes de revisión"}
        </span>
      </header>
      <p className="mt-2 text-sm text-[var(--nuth-muted)]">
        Describe el cambio esperado, cómo lo medirás y cuándo lo revisarás.
        Ordena hasta tres objetivos por prioridad clínica.
      </p>
      {workspace?.pes
        ? (
          <details open className="mt-3 text-sm">
            <summary>PES aprobado</summary>
            <dl className="mt-2 space-y-2">
              <div>
                <dt className="font-semibold">Etiología</dt>
                <dd>{workspace.pes.etiology}</dd>
              </div>
              <div>
                <dt className="font-semibold">Signos y síntomas</dt>
                <dd className="whitespace-pre-line">
                  {workspace.pes.signsSymptoms}
                </dd>
              </div>
            </dl>
          </details>
        )
        : (
          <p className="mt-3 text-sm text-[var(--nuth-muted)]">
            Puedes redactar y guardar un borrador. Para aprobarlo, revisa
            primero el PES.
          </p>
        )}
      {!plan.goals.length && legacy && (
        <div className="mt-4 rounded-lg border border-[var(--nuth-line)] p-3">
          <p className="text-xs font-semibold">
            Objetivo registrado anteriormente
          </p>
          <p className="mt-2 whitespace-pre-line text-sm">{legacy}</p>
          <p className="mt-2 text-xs text-[var(--nuth-muted)]">
            Conserva su texto hasta que elijas revisarlo con la estructura
            SMART.
          </p>
          <button
            type="button"
            className="nuth-button-secondary mt-3 !text-xs"
            disabled={busy || legacy.length > 400}
            onClick={() => add({ ...emptyObjective(), outcome: legacy })}
          >
            Usar texto como resultado esperado
          </button>
        </div>
      )}
      {workspace?.objective && !workspace.objective.smart_plan && (
        <p className="mt-3 text-xs text-[var(--nuth-muted)]">
          Aprobación anterior conservada. Revisa los criterios SMART para una
          nueva aprobación.
        </p>
      )}
      {pesChanged && (
        <div role="alert" className="mt-3 text-sm">
          <p>
            El PES cambió. Revisa la causa, el signo y las metas antes de volver
            a aprobar.
          </p>
          <button
            type="button"
            className="nuth-button-secondary mt-2 !text-xs"
            disabled={busy}
            onClick={() =>
              change({
                ...plan,
                pesApprovedAt: workspace?.pes?.approved_at ?? "",
              })}
          >
            Vincular al PES actual
          </button>
        </div>
      )}
      <fieldset disabled={busy} className="mt-4 min-w-0 space-y-4">
        {plan.goals.map((goal, index) => (
          <section
            key={index}
            aria-label={`Objetivo ${index + 1}`}
            className="rounded-xl border border-[var(--nuth-line)] p-3 sm:p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">Objetivo {index + 1}</h4>
              <div className="flex gap-2">
                {index > 0 && (
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => {
                      const goals = [...plan.goals];
                      [goals[index - 1], goals[index]] = [
                        goals[index],
                        goals[index - 1],
                      ];
                      change({ ...plan, goals });
                    }}
                  >
                    Subir prioridad
                  </button>
                )}
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() =>
                    change({
                      ...plan,
                      goals: plan.goals.filter((_, i) => i !== index),
                    })}
                >
                  Quitar objetivo {index + 1}
                </button>
              </div>
            </div>
            <div className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">
              {fields.map(([key, label, hint]) => (
                <label key={key} className="min-w-0 text-sm">
                  {label}
                  <textarea
                    aria-label={`${label} · objetivo ${index + 1}`}
                    className="nuth-input mt-1 w-full !text-sm"
                    rows={2}
                    maxLength={key === "etiology" ? 1500 : 400}
                    value={goal[key]}
                    placeholder={hint}
                    onChange={(event) =>
                      update(index, { [key]: event.target.value })}
                  />
                  <span className="mt-1 block text-xs text-[var(--nuth-muted)]">
                    {hint}
                  </span>
                </label>
              ))}
              <label className="min-w-0 text-sm">
                Signo o síntoma del PES<select
                  aria-label={`Signo o síntoma del PES · objetivo ${index + 1}`}
                  className="nuth-input mt-1 w-full !text-sm"
                  value={goal.sign}
                  onChange={(event) =>
                    update(index, { sign: event.target.value })}
                >
                  <option value="">
                    Selecciona la evidencia que reevaluarás
                  </option>
                  {goal.sign && !signs.includes(goal.sign) && (
                    <option value={goal.sign}>
                      {goal.sign} · revisar vigencia
                    </option>
                  )}
                  {signs.map((sign) => (
                    <option key={sign} value={sign}>{sign}</option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-sm">
                Acuerdo con la persona<select
                  aria-label={`Acuerdo · objetivo ${index + 1}`}
                  className="nuth-input mt-1 w-full !text-sm"
                  value={goal.agreement}
                  onChange={(event) =>
                    update(index, {
                      agreement: event.target
                        .value as ObjectiveGoal["agreement"],
                    })}
                >
                  <option value="pending">Pendiente de conversar</option>
                  <option value="patient">Acordado con el paciente</option>
                  <option value="caregiver">
                    Acordado con cuidador o representante
                  </option>
                </select>
              </label>
            </div>
            <p className="mt-4 text-xs font-semibold">Enunciado del objetivo</p>
            <output
              aria-label={`Enunciado del objetivo ${index + 1}`}
              className="mt-1 block whitespace-pre-line break-words text-sm"
            >
              {composeObjective(goal) ||
                "Completa el resultado y sus criterios de seguimiento."}
            </output>
            <p className="mt-2 text-xs text-[var(--nuth-muted)]">
              {objectiveIssues(goal).length
                ? "Pendiente de completar o acordar."
                : "Criterios documentados para revisión profesional."}
            </p>
          </section>
        ))}
        <button
          type="button"
          className="nuth-button-secondary !text-sm"
          disabled={plan.goals.length >= 3}
          onClick={() =>
            add()}
        >
          Agregar objetivo
        </button>
      </fieldset>
      <details className="mt-4 text-xs text-[var(--nuth-muted)]">
        <summary>Consultar datos de valoración registrados</summary>
        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto break-words">
          {workspace?.facts.map((fact, index) => (
            <li key={index}>
              <strong>{fact.source}:</strong> {fact.finding}
            </li>
          ))}
        </ul>
      </details>
      {patientId && (
        <ConsultationObjectiveAI
          key={workspace?.pes?.approved_at ?? "no-pes"}
          patientId={patientId}
          consultationId={consultationId}
          revision={revision}
          before={before}
          disabled={busy || !workspace?.pes || plan.goals.length >= 3}
          onApply={(text) =>
            add({ ...emptyObjective(), outcome: text.slice(0, 400) })}
          onApplyGoal={(goal) => add(goal)}
        />
      )}
      {text.length > maxLength && (
        <p role="alert" className="mt-3 text-sm">
          El texto de los objetivos supera el límite de {maxLength}{" "}
          caracteres de esta pregunta. Resume los enunciados antes de guardar.
        </p>
      )}
      {plan.goals.length > 0 && (
        <details className="mt-4 text-xs text-[var(--nuth-muted)]">
          <summary>Qué falta para aprobar</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {issues.map((issue, index) => <li key={index}>{issue}</li>)}
            {staleSigns && (
              <li>Selecciona un signo del PES vigente para cada objetivo.</li>
            )}
            {!issues.length && !staleSigns && (
              <li>
                Revisa la pertinencia clínica y que lo documentado represente lo
                acordado.
              </li>
            )}
          </ul>
        </details>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="nuth-button-secondary !text-sm"
          disabled={busy || !dirty || text.length > maxLength}
          onClick={() => void persist("save")}
        >
          Guardar borrador
        </button>
        <button
          type="button"
          className="nuth-button !text-sm"
          disabled={busy || !plan.goals.length || !!issues.length ||
            staleSigns || !workspace?.pes || pesChanged || approved ||
            text.length > maxLength}
          onClick={() => void persist("approve")}
        >
          {busy ? "Guardando…" : "Aprobar objetivos"}
        </button>
        {approved && (
          <button
            type="button"
            className="nuth-button-secondary !text-sm"
            onClick={() => void persist("revoke")}
          >
            Volver a revisar
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-[var(--nuth-muted)]">
        Al aprobar confirmas la relación con el PES, la viabilidad y el acuerdo
        registrado. Las indicaciones se documentan en el siguiente paso.
      </p>
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    </section>
  );
}
