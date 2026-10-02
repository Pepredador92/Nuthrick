type InstructionParts = {
  action: string;
  timing: string;
  alternative: string;
  review: string;
};

const valuesAsText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value))
    return value.map(valuesAsText).filter(Boolean).join("; ");
  if (value && typeof value === "object")
    return Object.entries(value)
      .map(([key, item]) => {
        const text = valuesAsText(item);
        return text ? `${key.replaceAll("_", " ")}: ${text}` : "";
      })
      .filter(Boolean)
      .join("; ");
  return "";
};

const sources: Record<string, [string, string][]> = {
  measurement_notes: [
    ["indicators_reviewed", "Indicadores revisados"],
    ["indicator_progress", "Progreso registrado"],
  ],
  indicator_progress: [
    ["changes_since_last", "Cambios desde la consulta anterior"],
    ["progress_perception", "Progreso referido"],
    ["symptoms_changes", "Cambios en síntomas"],
    ["indicators_reviewed", "Indicadores revisados"],
  ],
  first_actions: [
    ["interview_priorities", "Prioridades expresadas"],
    ["access_barriers", "Barreras registradas"],
    ["eating_drivers", "Aspectos relacionados con la alimentación"],
  ],
  professional_notes: [
    ["indicators_reviewed", "Indicadores revisados"],
    ["measurement_notes", "Notas de medición"],
    ["indicator_progress", "Progreso registrado"],
  ],
};

const headings: Record<string, string> = {
  measurement_notes: "En esta revisión se registraron los siguientes datos:",
  indicator_progress: "En el seguimiento se registró lo siguiente:",
  first_actions: "Para acordar las primeras acciones, se registró este contexto:",
  professional_notes: "Notas reunidas de la consulta:",
};

export function composeInterviewDraft(
  target: string,
  answers: Record<string, unknown>,
): string {
  const selected = sources[target];
  if (!selected) return "";
  const lines = selected.flatMap(([key, label]) => {
    const text = valuesAsText(answers[key]);
    return text ? [`• ${label}: ${text}`] : [];
  });
  return lines.length ? `${headings[target]}\n${lines.join("\n")}` : "";
}

export function composePatientInstructions(parts: InstructionParts): string {
  const action = parts.action.trim();
  if (!action) return "";
  const lines = [`• Qué harás: ${action}`];
  if (parts.timing.trim()) lines.push(`• Cuándo: ${parts.timing.trim()}`);
  if (parts.alternative.trim())
    lines.push(`• Si se te complica: ${parts.alternative.trim()}`);
  if (parts.review.trim())
    lines.push(`• En la próxima consulta: ${parts.review.trim()}`);
  return `Tus indicaciones\n${lines.join("\n")}`;
}

export function appendComposedText(existing: unknown, addition: string): string {
  const current = typeof existing === "string" ? existing.trim() : "";
  const next = addition.trim();
  if (!next) return current;
  if (!current) return next;
  if (current.toLocaleLowerCase().includes(next.toLocaleLowerCase()))
    return current;
  return `${current}\n\n${next}`;
}
