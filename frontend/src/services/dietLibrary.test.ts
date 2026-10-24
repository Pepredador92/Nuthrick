import { beforeEach, expect, it, vi } from "vitest";
import { freeTextDietPlan } from "../../tests/fixtures/freeTextDiet";
import { saveFreeDietLibrary, createDietLibraryEditingDraft } from "./dietLibrary";
import type { DietLibraryItem } from "../features/diet-library/model";

const db = vi.hoisted(() => ({ row: null as DietLibraryItem | null, writes: [] as Record<string, unknown>[], plans: [] as Record<string, unknown>[] }));
vi.mock("@/src/lib/supabase", () => ({ supabase: { from: (table: string) => {
  const read = { eq: () => read, maybeSingle: async () => ({ data: db.row, error: null }) };
  const write = (payload: Record<string, unknown>, update = false) => {
    const query = { eq: () => query, select: () => query, single: async () => ({ data: payload, error: null }), maybeSingle: async () => {
      db.writes.push(payload);
      db.row = { ...db.row, ...payload, owner_id: "owner", revision: update ? db.row!.revision + 1 : 1, archived: false } as DietLibraryItem;
      return { data: db.row, error: null };
    } };
    if (table === "nutrition_plans") db.plans.push(payload);
    return query;
  };
  return { select: () => read, insert: (payload: Record<string, unknown>) => write(payload), update: (payload: Record<string, unknown>) => write(payload, true) };
} } }));
beforeEach(() => { db.row = null; db.writes = []; db.plans = []; });

it("updates one private template for repeated saves while preserving all diets and excluding formula inputs", async () => {
  const plan = freeTextDietPlan();
  const first = await saveFreeDietLibrary(plan);
  expect(first.id).toBe(plan.id);
  plan.text_diet!.diets[0].text += "\nUna indicación completa al final.";
  const second = await saveFreeDietLibrary(plan);
  expect(second.id).toBe(first.id);
  expect(second.revision).toBe(2);
  expect(second.content.text_diet!.diets).toEqual(plan.text_diet!.diets.map((diet, i) => ({ ...diet, id: `diet-${i + 1}` })));
  expect(JSON.stringify(second.content)).not.toMatch(/reviewed_at|macro_distribution|reference_weight_kg|patient_id/);
});
it("requires the current free diet review and creates an unapproved editable copy from a library entry", async () => {
  const plan = freeTextDietPlan();
  const saved = await saveFreeDietLibrary(plan);
  const copied = await createDietLibraryEditingDraft(saved);
  expect(copied.patient_id).toBeNull();
  expect(copied.consultation_id).toBeNull();
  expect(copied.text_diet!.reviewed_at).toBeNull();
  expect(copied.text_diet!.diets.map(d => d.text)).toEqual(plan.text_diet!.diets.map(d => d.text));
  plan.text_diet!.reviewed_at = null;
  await expect(saveFreeDietLibrary(plan)).rejects.toThrow(/Revisa y aprueba/);
  expect(db.writes).toHaveLength(1);
});
