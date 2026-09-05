import { supabase } from "@/src/lib/supabase";
import type { InterpretationReference } from "@/src/features/interpretations/types";
import type { SavedCalculationResult } from "@/src/features/interpretations/history";
import { pregnancyFromLifeStage } from "@/src/features/interpretations/engine";

export async function loadInterpretationData(consultationId: string) {
  const [references, results, consultation, snapshot] = await Promise.all([
    supabase
      .from("interpretation_references")
      .select("definition")
      .eq("active", true)
      .order("id"),
    supabase
      .from("consultation_calculation_results")
      .select("*")
      .eq("consultation_id", consultationId),
    supabase
      .from("consultations")
      .select("interpretation_pregnancy")
      .eq("id", consultationId)
      .single(),
    supabase
      .from("consultation_snapshots")
      .select("revision")
      .eq("consultation_id", consultationId)
      .maybeSingle(),
  ]);
  if (references.error || results.error || consultation.error || snapshot.error)
    throw new Error(
      "No pudimos cargar las referencias y los resultados guardados.",
    );
  let pregnancyFromInterview: boolean | null = null;
  if (snapshot.data) {
    const answer = await supabase
      .from("consultation_answers")
      .select("value")
      .eq("consultation_id", consultationId)
      .eq("revision", snapshot.data.revision)
      .eq("question_key", "life_stage")
      .maybeSingle();
    if (answer.error)
      throw new Error("No pudimos consultar el contexto de la entrevista.");
    pregnancyFromInterview = pregnancyFromLifeStage(answer.data?.value);
  }
  return {
    references: (references.data ?? []).map(
      (r) => r.definition,
    ) as InterpretationReference[],
    saved: (results.data ?? []) as SavedCalculationResult[],
    pregnancyFromInterview,
    pregnant:
      pregnancyFromInterview ??
      consultation.data.interpretation_pregnancy ??
      null,
  };
}
