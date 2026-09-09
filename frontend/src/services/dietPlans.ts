import { supabase } from "@/src/lib/supabase";
import type { NutritionPlan } from "@/src/types/domain";

export type DietPlanPatch = {
  title?: string;
  patient_id?: string | null;
  consultation_id?: string | null;
  status?: NutritionPlan["status"];
};

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
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw dietPlanError(error, "No pudimos cargar tus planes.");
  return (data ?? []) as NutritionPlan[];
}

export async function getDietPlan(id: string): Promise<NutritionPlan | null> {
  const { data, error } = await supabase
    .from("nutrition_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw dietPlanError(error, "No pudimos abrir este plan.");
  return data as NutritionPlan | null;
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
  return data as NutritionPlan;
}

export async function updateDietPlan(
  id: string,
  patch: DietPlanPatch,
): Promise<NutritionPlan> {
  const payload = {
    ...patch,
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
  };
  const { data, error } = await supabase
    .from("nutrition_plans")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw dietPlanError(error, "No pudimos guardar el plan.");
  return data as NutritionPlan;
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
