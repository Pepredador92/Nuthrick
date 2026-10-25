import { AIError } from "./core.ts";
import { dietHash } from "./diet.ts";
import { redactClinicalText } from "./clinical.ts";
import { textDietContext, type TextDietSource } from "./text-diet.ts";
import { isTextDiet, type TextDiet } from "../_shared/text-diet.ts";
import {
  estimatedTotal,
  isTextDietEdit,
  textDietMealSegments,
  type EstimatedNutrition,
  type TextDietEdit,
  type TextDietEditReport,
} from "../_shared/text-diet-edit.ts";

type EditSource = TextDietSource & {
  originalTextContext?: Record<string, unknown> | null;
};
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function editableTextDiet(loaded: TextDietSource): TextDiet {
  const value = (loaded.source.plan as unknown as { text_diet?: unknown })
    .text_diet;
  if (!isTextDiet(value)) throw new AIError("text_diet_required");
  return value;
}
function editContext(
  loaded: EditSource,
  edit: TextDietEdit,
  instructions: string,
) {
  if (!isTextDietEdit(edit) || !instructions.trim())
    throw new AIError("invalid_request");
  const draft = editableTextDiet(loaded),
    current = draft.diets.find((diet) => diet.id === edit.dietId);
  if (!current || edit.mealIndexes.some((index) => index >= draft.meals.length))
    throw new AIError("invalid_request");
  const segments = textDietMealSegments(current.text, draft.meals);
  if (edit.scope === "meals" && !segments)
    throw new AIError("meal_sections_unavailable");
  const original = loaded.originalTextContext ?? {};
  const originalRestrictions =
    obj(original.restrictions) &&
    typeof original.restrictions.professional_review === "string"
      ? original.restrictions.professional_review
      : "";
  const guidance = {
    version: 1 as const,
    dietCount: draft.requested_count,
    meals: draft.meals,
    objective: "",
    contextReviewed: true,
    restrictionsReviewed: true,
    restrictions: originalRestrictions,
  };
  const { payload, reasons } = textDietContext(loaded, guidance, "");
  const blocker = reasons.find((reason) =>
    [
      "draft_required",
      "context_mismatch",
      "energy_required",
      "macros_required",
      "prescription_inconsistent",
    ].includes(reason.code),
  );
  if (blocker) throw new AIError(blocker.code);
  const clean = (s: string) =>
    redactClinicalText(
      s,
      loaded.identifiers.filter(
        (v): v is string => typeof v === "string" && !!v,
      ),
    );
  const cleanValue = (v: unknown): unknown =>
    typeof v === "string"
      ? clean(v)
      : Array.isArray(v)
        ? v.map(cleanValue)
        : obj(v)
          ? Object.fromEntries(
              Object.entries(v).map(([key, value]) => [key, cleanValue(value)]),
            )
          : v;
  const selected =
    edit.scope === "diet"
      ? draft.meals.map((_, index) => index)
      : [...edit.mealIndexes].sort((a, b) => a - b);
  return {
    draft,
    current,
    selected,
    payload: {
      ...payload,
      format: "text_diet_edit" as const,
      scope: edit.scope,
      selected_meal_indexes: selected,
      original_preferences: cleanValue({
        restrictions: original.restrictions ?? null,
        preferences: original.preferences ?? null,
        professional_instructions: original.professional_instructions ?? null,
      }),
      current_diet: {
        title: clean(current.title),
        text: clean(current.text),
        meals:
          segments?.map((segment) => ({
            meal_index: segment.index,
            text: clean(current.text.slice(segment.start, segment.end)),
          })) ?? null,
      },
      editing_instruction: clean(instructions),
    },
  };
}
export type TextDietEditSnapshot = {
  version: 1;
  format: "text_diet";
  hash: string;
  sourceStamp: string;
  prescription: TextDiet["prescription"];
  payload: ReturnType<typeof editContext>["payload"];
  edit: {
    dietId: string;
    scope: TextDietEdit["scope"];
    selected: number[];
    baseHash: string;
  };
};
export async function textDietEditPreflight(
  loaded: EditSource,
  edit: TextDietEdit,
  instructions: string,
) {
  const context = editContext(loaded, edit, instructions);
  return {
    eligible: true,
    selectedMeals: context.selected,
    contextToken: await dietHash([loaded.source.stamp, edit, instructions]),
  };
}
export async function prepareTextDietEditSnapshot(
  loaded: EditSource,
  edit: TextDietEdit,
  instructions: string,
): Promise<TextDietEditSnapshot> {
  const { payload, selected, draft } = editContext(loaded, edit, instructions);
  const value = {
    version: 1 as const,
    format: "text_diet" as const,
    sourceStamp: loaded.source.stamp,
    payload,
    prescription: {
      target_calories: loaded.source.plan.target_calories,
      macro_distribution: loaded.source.plan.macro_distribution,
    },
    edit: {
      dietId: edit.dietId,
      scope: edit.scope,
      selected,
      baseHash: await dietHash(draft),
    },
  };
  return { ...value, hash: await dietHash(value) };
}
type ModelEstimate = {
  meal_index: number;
  nutrients: EstimatedNutrition;
  assumptions: string[];
};
type ModelReplacement = ModelEstimate & {
  title: string;
  ingredients: string[];
  preparation: string;
};
export function validateTextDietEditOutput(
  output: unknown,
  snapshot: TextDietEditSnapshot,
  base: TextDiet,
): { textDraft: TextDiet; adjustment: TextDietEditReport } | null {
  const raw = output as {
    baseline?: Record<string, Omit<ModelEstimate, "meal_index">>;
    replacements?: Record<string, Omit<ModelReplacement, "meal_index">>;
    explanation?: string;
  } | null;
  const selected = snapshot.edit.selected,
    count = base.meals.length;
  if (!obj(raw?.baseline) || !obj(raw?.replacements)) return null;
  const value = {
    baseline: Array.from({ length: count }, (_, index) => ({
      meal_index: index,
      ...raw.baseline![`m${index}`],
    })),
    replacements: selected.map((index) => ({
      meal_index: index,
      ...raw.replacements![`m${index}`],
    })),
    explanation: raw.explanation,
  };
  if (
    !Array.isArray(value?.baseline) ||
    value.baseline.length !== count ||
    new Set(value.baseline.map((row) => row.meal_index)).size !== count ||
    value.baseline.some(
      (row) => row.meal_index < 0 || row.meal_index >= count,
    ) ||
    !Array.isArray(value.replacements) ||
    value.replacements.length !== selected.length ||
    new Set(value.replacements.map((row) => row.meal_index)).size !==
      selected.length ||
    value.replacements.some((row) => !selected.includes(row.meal_index)) ||
    typeof value.explanation !== "string"
  )
    return null;
  const current = base.diets.find((diet) => diet.id === snapshot.edit.dietId);
  if (!current) return null;
  const clean = (text: string) => redactClinicalText(text, []).trim();
  const body = (row: ModelReplacement) =>
    `${clean(row.title)}\n${row.ingredients.map((s) => "• " + clean(s)).join("\n")}\nPreparación: ${clean(row.preparation)}`;
  let text = current.text;
  if (snapshot.edit.scope === "diet") {
    text = base.meals
      .map(
        (meal, index) =>
          `${meal.name}${meal.time ? " · " + meal.time : ""}\n${body(value.replacements!.find((row) => row.meal_index === index)!)}`,
      )
      .join("\n\n");
  } else {
    const segments = textDietMealSegments(current.text, base.meals);
    if (!segments) return null;
    // The model never emits the resulting whole diet in partial mode. Apply
    // exact slices from the saved original, descending to preserve offsets.
    for (const segment of segments
      .filter((item) => selected.includes(item.index))
      .sort((a, b) => b.contentStart - a.contentStart)) {
      const replacement = value.replacements.find(
        (row) => row.meal_index === segment.index,
      )!;
      text =
        text.slice(0, segment.contentStart) +
        (segment.contentStart > 0 && text[segment.contentStart - 1] !== "\n"
          ? "\n"
          : "") +
        body(replacement) +
        text.slice(segment.end);
    }
  }
  const next: TextDiet = {
    ...base,
    reviewed_at: null,
    shopping_list: undefined,
    prescription: snapshot.prescription,
    diets: base.diets.map((diet) =>
      diet.id === current.id ? { ...diet, text } : diet,
    ),
  };
  if (!isTextDiet(next)) return null;
  const meals = base.meals.map((meal, index) => {
    const previous = value.baseline!.find((row) => row.meal_index === index)!;
    const replacement = value.replacements!.find(
      (row) => row.meal_index === index,
    );
    return {
      index,
      name: meal.name,
      before: previous.nutrients,
      after: replacement?.nutrients ?? previous.nutrients,
      assumptions: [
        ...new Set(
          [...previous.assumptions, ...(replacement?.assumptions ?? [])].map(
            clean,
          ),
        ),
      ],
    };
  });
  const energy = snapshot.payload.prescription.energy_kcal.fact,
    macros = snapshot.payload.prescription.macros.fact;
  return {
    textDraft: next,
    adjustment: {
      version: 1,
      dietId: current.id,
      dietTitle: current.title,
      scope: snapshot.edit.scope,
      selectedMeals: selected,
      before: estimatedTotal(meals.map((meal) => meal.before)),
      after: estimatedTotal(meals.map((meal) => meal.after)),
      target: {
        energy_kcal: energy.state === "known" ? energy.value : null,
        protein_g: macros.state === "known" ? macros.value.PROTEIN.grams : null,
        carbohydrate_g:
          macros.state === "known" ? macros.value.CARBOHYDRATE.grams : null,
        fat_g: macros.state === "known" ? macros.value.FAT.grams : null,
      },
      meals,
      beforeText: current.text,
      explanation: clean(value.explanation),
    },
  };
}
