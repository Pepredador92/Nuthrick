import type { ClinicalBatchFeature } from "../_shared/clinical-batch.ts";

export const currentClinicalNote = (source: string) =>
  /^Nota de la consulta · |^Entrevista · (?:professional notes|clinical notes|interview notes)(?: ·|$)/i
    .test(source);

export const clinicalPlanningInstructions: Record<
  ClinicalBatchFeature,
  string
> = {
  pes_diagnosis:
    "Identifica qué cambió, qué sigue afectando a la persona y qué puede abordarse en esta consulta. Evalúa las notas actuales aunque falte la entrevista. Separa lo que la persona refirió, lo que el profesional observó y lo que propuso trabajar. Elige el problema con evidencia directa y relevancia para la persona. Cuando un hallazgo medido sustenta el problema, inclúyelo con su unidad y fecha. Usa el resto para valorar la evolución. Antes de dejar Etiología pendiente, consulta antecedentes específicos cuya vigencia pueda contrastarse con los hechos actuales. Conserva la incertidumbre sobre la causa y pregunta qué falta confirmar.",
  consultation_support:
    "Prioriza cambios útiles y alcanzables para la persona a partir del PES y los hallazgos vigentes. Usa las barreras, prioridades, preferencias y apoyos registrados para proponer qué intentar, cómo reconocer el avance y cuándo revisarlo. Si la persona ya inició un cambio, reconócelo y valora si procede mantenerlo o ajustarlo. Verificar fechas, técnicas o cifras es una tarea del profesional. Solo propón un objetivo centrado en la medición si hay una duda documentada que afecta una decisión clínica y la persona tiene un papel concreto en resolverla.",
  intervention_strategy:
    "Describe qué hará el nutriólogo para trabajar el objetivo con la persona. Usa verbos en infinitivo como explorar, practicar, acordar o adaptar. Propón cómo aplicar la estrategia en una situación real documentada, qué barrera o preferencia abordará y qué revisará el profesional después. Reserva las frases dirigidas a la persona para las indicaciones. Mantén el texto claro y práctico para el nutriólogo.",
  patient_instructions:
    "Traduce la acción de la estrategia o del acuerdo en pasos concretos para la persona. Háblale de tú, con palabras sencillas, y explica cómo aplicar el paso a su rutina. Incluye cuándo hacerlo y qué podrán revisar juntos si el contexto lo sustenta. Deja la verificación de expedientes, fechas, técnicas de medición e interpretación clínica al profesional. Incluye cifras únicamente si son necesarias para seguir un acuerdo documentado.",
};

export const clinicalPlanningPriority =
  " Empieza por los cambios, prioridades y barreras que constan en las notas y en los demás datos de la consulta actual. La cantidad de mediciones no determina la prioridad. Cita los hechos directos pertinentes y conserva las mediciones para sustentar el diagnóstico o evaluar el progreso cuando corresponda. Cuando compares registros, usa la observación más reciente de cada indicador que sea comparable y conserva su fecha, unidad y método. Una nota anterior o un PES previo no prueba que un problema siga vigente. Una propuesta de otra etapa orienta el plan, pero no es evidencia de hechos ni de que la persona ya aceptó algo.";

export const completeClinicalSentence = (value: string) =>
  /[^.\s…<>][.!?]["»”)]*\s*$/u.test(value) && !/\.{2,}|…|<<|>>/u.test(value);

// Only validate newly generated narrative. Saved or manually edited fields
// and literal operational parameters retain their existing contract.
export function completeStrategyProse<
  T extends {
    action: string;
    method: string;
    monitoring: string;
    adaptations: string;
    adjustmentCriteria: string;
    comprehensionCheck: string;
    missingContext: string[];
  },
>(item: T): T | null {
  if (!completeClinicalSentence(item.action)) return null;
  const optional = {
    method: "el método",
    monitoring: "el seguimiento",
    adaptations: "las adaptaciones",
    adjustmentCriteria: "el criterio de ajuste",
    comprehensionCheck: "la comprobación de comprensión",
  } as const;
  const result = { ...item };
  const gaps: string[] = [];
  for (const key of Object.keys(optional) as (keyof typeof optional)[]) {
    if (!item[key].trim() || completeClinicalSentence(item[key])) continue;
    result[key] = "";
    gaps.push(
      `Completar ${optional[key]}. El texto generado quedó incompleto.`,
    );
  }
  return {
    ...result,
    missingContext: [...new Set([...gaps, ...item.missingContext])].slice(
      0,
      15,
    ),
  };
}
