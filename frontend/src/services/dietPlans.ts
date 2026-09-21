import { supabase } from "@/src/lib/supabase";
import type { DietMenu, ExchangePrescription, MacroDistribution, MealDistribution, NutritionPlan, NutritionPlanVersion, PlanEnergyCalculation } from "@/src/types/domain";

export type DietPlanPatch = {
  title?: string;
  patient_id?: string | null;
  consultation_id?: string | null;
  status?: NutritionPlan["status"];
  target_calories?: number | null;
  energy_calculation?: PlanEnergyCalculation | null;
  macro_distribution?: MacroDistribution | null;
  exchange_prescription?: ExchangePrescription | null;
  meal_distribution?: MealDistribution | null;
  diet_menu?: DietMenu | null;
};

export class DietPlanRevisionConflictError extends Error {
  constructor() {
    super("Este borrador cambió en otra pestaña. Actualiza la revisión antes de guardar o publicar.");
    this.name = "DietPlanRevisionConflictError";
  }
}

function normalizeDietPlan(row: NutritionPlan): NutritionPlan {
  return {
    ...row,
    draft_revision: Number(row.draft_revision ?? 1),
    current_version_id: row.current_version_id ?? null,
  };
}

export type DietReferenceValue = {
  value: number;
  unit: string;
  source: "consultation_measurements" | "patient_measurements";
};

export type DietReferenceData = {
  weight: DietReferenceValue | null;
  height: DietReferenceValue | null;
};

function dietPlanError(error: { code?: string } | null, fallback: string) {
  if (error?.code === "23503" || error?.code === "23514")
    return new Error("La consulta seleccionada no pertenece al paciente o ya no está disponible.");
  if (error?.code === "42501" || error?.code === "PGRST116")
    return new Error("No tienes autorización para acceder a este plan.");
  return new Error(fallback);
}

export async function listDietPlans(): Promise<NutritionPlan[]> {
  const { data, error } = await supabase
    .from("nutrition_plans")
    .select("*, patients!nutrition_plans_professional_id_patient_id_fkey(full_name), nutrition_plan_versions!nutrition_plan_versions_professional_id_plan_id_fkey(version_number)")
    .order("updated_at", { ascending: false });
  if (error) throw dietPlanError(error, "No pudimos cargar tus planes.");
  return (data ?? []).map((row) => {
    const versions = row.nutrition_plan_versions as Array<{version_number: number}>;
    return normalizeDietPlan({ ...row, patient_name: row.patients?.full_name ?? null,
      has_published_versions: versions.length > 0,
      published_version_number: versions.length ? Math.max(...versions.map(v => v.version_number)) : null } as NutritionPlan);
  });
}

export async function deleteDietDraft(id: string, revision: number): Promise<void> {
  const { error } = await supabase.rpc("delete_nutrition_plan_draft", { p_plan_id: id, p_expected_revision: revision });
  if (error?.code === "40001") throw new DietPlanRevisionConflictError();
  if (error?.code === "23514") throw new Error("Este plan tiene publicaciones o ya no es un borrador. Su historial está protegido.");
  if (error) throw dietPlanError(error, "No pudimos eliminar el borrador. Intenta de nuevo.");
}

export async function getDietPlan(id: string): Promise<NutritionPlan | null> {
  const { data, error } = await supabase
    .from("nutrition_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw dietPlanError(error, "No pudimos abrir este plan.");
  return data ? normalizeDietPlan(data as NutritionPlan) : null;
}

export async function createDietPlan(context: {
  patientId?: string | null;
  consultationId?: string | null;
  title?: string;
}): Promise<NutritionPlan> {
  const { data, error } = await supabase
    .from("nutrition_plans")
    .insert({
      patient_id: context.patientId ?? null,
      consultation_id: context.consultationId ?? null,
      title: context.title?.trim() || "Plan nutricional",
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw dietPlanError(error, "No pudimos crear el borrador del plan.");
  return normalizeDietPlan(data as NutritionPlan);
}

export async function updateDietPlan(
  id: string,
  patch: DietPlanPatch,
  expectedDraftRevision?: number,
): Promise<NutritionPlan> {
  const payload = {
    ...patch,
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
  };
  let query = supabase
    .from("nutrition_plans")
    .update(payload)
    .eq("id", id);
  if (Number.isFinite(expectedDraftRevision)) query = query.eq("draft_revision", expectedDraftRevision!);
  const { data, error } = await query.select("*").maybeSingle();
  if (!data && !error && expectedDraftRevision !== undefined) throw new DietPlanRevisionConflictError();
  if (error) throw dietPlanError(error, "No pudimos guardar el plan.");
  if (!data) throw new Error("No pudimos guardar el plan.");
  return normalizeDietPlan(data as NutritionPlan);
}

export async function listDietPlanVersions(planId: string): Promise<NutritionPlanVersion[]> {
  const { data, error } = await supabase
    .from("nutrition_plan_versions")
    .select("*")
    .eq("plan_id", planId)
    .order("version_number", { ascending: false });
  if (error) throw dietPlanError(error, "No pudimos cargar el historial de publicaciones.");
  return (data ?? []) as NutritionPlanVersion[];
}

export type PublishDietPlanVersionResult = {
  version_id: string;
  version_number: number;
  published_at: string;
  reused: boolean;
  already_current: boolean;
};

function readablePublicationError(detail: unknown) {
  if (typeof detail !== "string") return "Revisa los pendientes antes de publicar.";
  try {
    const issues = JSON.parse(detail) as Array<{ message?: unknown }>;
    const messages = issues
      .map((issue) => typeof issue?.message === "string" ? issue.message : null)
      .filter((message): message is string => Boolean(message));
    return messages.length ? `Revisa los pendientes: ${messages.join(" ")}` : "Revisa los pendientes antes de publicar.";
  } catch {
    return "Revisa los pendientes antes de publicar.";
  }
}

export async function publishDietPlanVersion(input: {
  planId: string;
  expectedDraftRevision: number;
  idempotencyKey: string;
}): Promise<PublishDietPlanVersionResult> {
  const { data, error } = await supabase.rpc("publish_nutrition_plan_version", {
    p_plan_id: input.planId,
    p_expected_draft_revision: input.expectedDraftRevision,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error?.code === "40001") throw new DietPlanRevisionConflictError();
  if (error?.code === "23514") throw new Error(readablePublicationError(error.details));
  if (error) throw dietPlanError(error, "No pudimos publicar la versión del plan.");
  return data as PublishDietPlanVersionResult;
}

export async function loadDietReferenceData(
  consultationId: string,
): Promise<DietReferenceData> {
  const [catalogResult, valuesResult, legacyResult] = await Promise.all([
    supabase
      .from("measurement_types")
      .select("id,code,unit")
      .in("code", ["weight", "height"]),
    supabase
      .from("consultation_measurements")
      .select("measurement_type_id,value,unit")
      .eq("consultation_id", consultationId),
    supabase
      .from("patient_measurements")
      .select("weight_kg,height_cm")
      .eq("consultation_id", consultationId)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (catalogResult.error || valuesResult.error || legacyResult.error)
    throw new Error("No pudimos leer los datos de referencia de esta consulta.");

  const catalog = new Map((catalogResult.data ?? []).map((item) => [item.id as string, item]));
  const valuesByCode = new Map<string, { value: unknown; unit: string | null }>();
  for (const row of valuesResult.data ?? []) {
    const item = catalog.get(row.measurement_type_id as string);
    if (item?.code) valuesByCode.set(item.code as string, { value: row.value, unit: row.unit });
  }
  const directValue = (code: "weight" | "height"): DietReferenceValue | null => {
    const row = valuesByCode.get(code);
    const value = Number(row?.value);
    if (!Number.isFinite(value)) return null;
    return { value, unit: row?.unit || (code === "weight" ? "kg" : "cm"), source: "consultation_measurements" };
  };
  const legacy = legacyResult.data;
  const legacyValue = (code: "weight" | "height"): DietReferenceValue | null => {
    const value = Number(code === "weight" ? legacy?.weight_kg : legacy?.height_cm);
    if (!Number.isFinite(value)) return null;
    return { value, unit: code === "weight" ? "kg" : "cm", source: "patient_measurements" };
  };
  return {
    weight: directValue("weight") ?? legacyValue("weight"),
    height: directValue("height") ?? legacyValue("height"),
  };
}
