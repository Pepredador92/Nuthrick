import { supabase } from "@/src/lib/supabase";
import {
  copyLibraryWorkspace,
  prepareLibraryBase,
  type DietLibraryItem,
  type LibraryContent,
  type LibraryTargetMode,
  referenceMacros,
} from "@/src/features/diet-library/model";
import type { NutritionPlan } from "@/src/types/domain";

const fail = (error: { message?: string; code?: string }) =>
  new Error(
    error.code === "40001"
      ? error.message
      : "No pudimos completar la operación en la biblioteca. Intenta de nuevo.",
  );
const stable = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b, "en")),
        )
      : v,
  );
export async function listDietLibrary(): Promise<DietLibraryItem[]> {
  const all: DietLibraryItem[] = [];
  for (let offset = 0; ; offset += 250) {
    const { data, error } = await supabase
      .from("diet_library_items")
      .select("*")
      .order("id")
      .range(offset, offset + 249);
    if (error) throw fail(error);
    all.push(...((data ?? []) as DietLibraryItem[]));
    if (!data || data.length < 250) return all;
  }
}
export async function saveDietLibrary(
  id: string,
  name: string,
  content: LibraryContent,
  revision?: number,
): Promise<DietLibraryItem> {
  const query =
    revision === undefined
      ? supabase
          .from("diet_library_items")
          .insert({ id, name: name.trim(), content })
      : supabase
          .from("diet_library_items")
          .update({ name: name.trim(), content })
          .eq("id", id)
          .eq("revision", revision);
  const { data, error } = await query.select("*").maybeSingle();
  if (error?.code === "23505" && revision === undefined) {
    const retry = await supabase
      .from("diet_library_items")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (
      !retry.error &&
      retry.data &&
      retry.data.name === name.trim() &&
      stable(retry.data.content) === stable(content)
    )
      return retry.data as DietLibraryItem;
  }
  if (error) throw fail(error);
  if (!data)
    throw new Error(
      "La base cambió en otra pestaña. Vuelve a abrirla antes de guardar.",
    );
  return data as DietLibraryItem;
}
export async function archiveDietLibrary(
  item: DietLibraryItem,
  archived: boolean,
) {
  const { data, error } = await supabase
    .from("diet_library_items")
    .update({ archived })
    .eq("id", item.id)
    .eq("revision", item.revision)
    .select("id")
    .maybeSingle();
  if (error) throw fail(error);
  if (!data) throw new Error("La base cambió. Actualiza la biblioteca.");
}
export async function applyDietLibrary(
  item: DietLibraryItem,
  plan: NutritionPlan,
  token: string,
  targetMode: LibraryTargetMode = "preserve",
): Promise<NutritionPlan> {
  const { data, error } = await supabase.rpc("apply_diet_library_with_targets", {
    p_plan_id: plan.id,
    p_expected_revision: plan.draft_revision ?? 1,
    p_source_id: item.id,
    p_source_revision: item.revision,
    p_token: token,
    p_content: prepareLibraryBase(item, plan, undefined, targetMode),
    p_target_mode: targetMode,
  });
  if (error) throw fail(error);
  return data as NutritionPlan;
}
export async function dietLibraryRecovery(
  planId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("diet_library_recovery", {
    p_plan_id: planId,
  });
  if (error) throw fail(error);
  return data as string | null;
}
export async function restoreDietLibrary(
  plan: NutritionPlan,
  token: string,
): Promise<NutritionPlan> {
  const { data, error } = await supabase.rpc("restore_diet_library_backup", {
    p_plan_id: plan.id,
    p_token: token,
    p_expected_revision: plan.draft_revision ?? 1,
  });
  if (error) throw fail(error);
  return data as NutritionPlan;
}
export async function createDietLibraryEditingDraft(
  item: DietLibraryItem,
): Promise<NutritionPlan> {
  const source = await supabase
    .from("diet_library_items")
    .select("*")
    .eq("id", item.id)
    .eq("revision", item.revision)
    .eq("archived", false)
    .maybeSingle();
  if (source.error) throw fail(source.error);
  if (!source.data)
    throw new Error(
      "La base cambió o ya no está disponible. Actualiza la biblioteca.",
    );
  const content = (source.data as DietLibraryItem).content;
  const target = content.reference_targets;
  const macro = referenceMacros(target);
  const { data, error } = await supabase
    .from("nutrition_plans")
    .insert({
      title: source.data.name,
      patient_id: null,
      consultation_id: null,
      status: "draft",
      target_calories: target?.energy_kcal ?? null,
      macro_distribution: macro,
      ...copyLibraryWorkspace(content, target ?? undefined),
    })
    .select("*")
    .single();
  if (error) throw fail(error);
  return data as NutritionPlan;
}

export type LibraryContribution = {
  id: string; source_id: string; source_revision: number; name: string; content: LibraryContent;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  created_at: string; review_note: string | null; published_item_id: string | null;
};
export async function libraryContributionAccess() {
  const { data, error } = await supabase.rpc("can_review_diet_library");
  if (error) throw fail(error);
  return data === true;
}
export async function listLibraryContributions(): Promise<LibraryContribution[]> {
  const rows: LibraryContribution[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.from("diet_library_contributions")
      .select("id,source_id,source_revision,name,content,status,created_at,review_note,published_item_id")
      .order("created_at", { ascending: false }).order("id").range(offset, offset + 99);
    if (error) throw fail(error);
    rows.push(...(data ?? []) as LibraryContribution[]);
    if (!data || data.length < 100) return rows;
  }
}
export async function submitLibraryContribution(item: DietLibraryItem, consent: boolean) {
  const { error } = await supabase.rpc("submit_diet_library", { p_source_id: item.id, p_revision: item.revision, p_consent: consent });
  if (error) throw fail(error);
}
export async function withdrawLibraryContribution(id: string) {
  const { error } = await supabase.rpc("withdraw_diet_library_contribution", { p_id: id });
  if (error) throw fail(error);
}
export async function reviewLibraryContribution(id: string, approve: boolean, note: string, reviewed: boolean) {
  const { error } = await supabase.rpc("review_diet_library_contribution", { p_id: id, p_approve: approve, p_note: note, p_reviewed: reviewed });
  if (error) throw fail(error);
}
