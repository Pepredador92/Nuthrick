export type ObjectiveGoal = {
  outcome: string;
  etiology: string;
  sign: string;
  indicator: string;
  baseline: string;
  target: string;
  timeframe: string;
  monitoring: string;
  feasibility: string;
  agreement: "pending" | "patient" | "caregiver";
};
export type ObjectivePlan = {
  version: 1;
  pesApprovedAt: string;
  goals: ObjectiveGoal[];
};
export const objectiveFields = [
  "outcome",
  "etiology",
  "sign",
  "indicator",
  "baseline",
  "target",
  "timeframe",
  "monitoring",
  "feasibility",
] as const;
export const emptyObjective = (): ObjectiveGoal => ({
  outcome: "",
  etiology: "",
  sign: "",
  indicator: "",
  baseline: "",
  target: "",
  timeframe: "",
  monitoring: "",
  feasibility: "",
  agreement: "pending",
});
const clean = (text: string) => text.trim().replace(/[.;\s]+$/g, "");
export function composeObjective(goal: ObjectiveGoal): string {
  const parts = [clean(goal.outcome)];
  for (
    const [key, label] of [
      ["indicator", "Indicador"],
      ["baseline", "Situación inicial"],
      ["target", "Meta"],
      ["timeframe", "Reevaluación"],
      ["monitoring", "Seguimiento"],
    ] as const
  ) {
    if (goal[key].trim()) parts.push(`${label}: ${clean(goal[key])}`);
  }
  return parts.filter(Boolean).join(". ") + (parts.some(Boolean) ? "." : "");
}
export function objectiveIssues(goal: ObjectiveGoal): string[] {
  const labels = {
    outcome: "resultado esperado",
    etiology: "relación con la etiología",
    sign: "signo o síntoma del PES",
    indicator: "indicador",
    baseline: "situación inicial",
    target: "meta",
    timeframe: "plazo de reevaluación",
    monitoring: "método de seguimiento",
    feasibility: "viabilidad, barreras y preferencias",
  };
  return [
    ...objectiveFields.flatMap((key) =>
      !goal[key].trim() ? [`Completa ${labels[key]}.`] : goal[key].length >
          (key === "sign" ? 2000 : key === "etiology" ? 1500 : 400)
        ? [`Acorta ${labels[key]} al límite del campo.`]
        : []
    ),
    ...(!["patient", "caregiver"].includes(goal.agreement)
      ? ["Registra el acuerdo con el paciente o cuidador."]
      : []),
  ];
}
export function isObjectivePlan(value: unknown): value is ObjectivePlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as ObjectivePlan;
  return plan.version === 1 && typeof plan.pesApprovedAt === "string" &&
    Array.isArray(plan.goals) && plan.goals.length <= 3 &&
    plan.goals.every((goal) =>
      goal && objectiveFields.every((key) =>
        typeof goal[key] === "string" &&
        goal[key].length <=
          (key === "sign" ? 2000 : key === "etiology" ? 1500 : 400)
      ) && ["pending", "patient", "caregiver"].includes(goal.agreement)
    );
}
/** JSONB may reorder object keys. Goal array order and all field values matter. */
export function objectivePlansEqual(
  a: ObjectivePlan,
  b: ObjectivePlan,
): boolean {
  return a.version === b.version && a.pesApprovedAt === b.pesApprovedAt &&
    a.goals.length === b.goals.length && a.goals.every((goal, index) => {
      const other = b.goals[index];
      return goal.agreement === other.agreement &&
        objectiveFields.every((key) => goal[key] === other[key]);
    });
}
