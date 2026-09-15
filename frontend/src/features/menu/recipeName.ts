import type { FoodItem, FoodSnapshot } from "@/src/types/domain";

type RecipeNameIngredient = Pick<FoodItem | FoodSnapshot, "name" | "group_code"> & {
  aliases?: string[];
};

const groupPriority: Record<RecipeNameIngredient["group_code"], number> = {
  AOA_VERY_LOW_FAT: 0,
  AOA_LOW_FAT: 0,
  AOA_MODERATE_FAT: 0,
  AOA_HIGH_FAT: 0,
  CEREALS_NO_FAT: 1,
  CEREALS_WITH_FAT: 1,
  LEGUMES: 2,
  FATS_WITH_PROTEIN: 2.5,
  FATS_NO_PROTEIN: 6,
  VEGETABLES: 3,
  FRUITS: 4,
  MILK_SKIM: 5,
  MILK_SEMI_SKIM: 5,
  MILK_WHOLE: 5,
  MILK_WITH_SUGAR: 5,
  SUGARS_NO_FAT: 6,
  SUGARS_WITH_FAT: 6,
};

function namingBucket(groupCode: RecipeNameIngredient["group_code"]) {
  if (groupCode.startsWith("AOA_")) return "aoa";
  if (groupCode.startsWith("CEREALS_")) return "cereals";
  if (groupCode.startsWith("MILK_")) return "milk";
  if (groupCode.startsWith("FATS_")) return "fats";
  if (groupCode.startsWith("SUGARS_")) return "sugars";
  return groupCode;
}

const friendlyNames: Array<[RegExp, string]> = [
  [/huevo/i, "Huevo"],
  [/(pechuga de )?pollo/i, "Pollo"],
  [/at[uú]n/i, "Atún"],
  [/carne/i, "Carne"],
  [/salm[oó]n/i, "Salmón"],
  [/arroz/i, "Arroz"],
  [/tostada/i, "Tostadas"],
  [/tortilla/i, "Tortilla"],
  [/papaya/i, "Papaya"],
  [/papa/i, "Papa"],
  [/frijol/i, "Frijoles"],
  [/verdura/i, "Verduras"],
  [/nopal/i, "Nopales"],
  [/aguacate/i, "Aguacate"],
  [/manzana/i, "Manzana"],
];

function displayName(ingredient: RecipeNameIngredient) {
  const source = ingredient.aliases?.[0] || ingredient.name;
  return friendlyNames.find(([pattern]) => pattern.test(source))?.[1]
    ?? source.trim().replace(/\s+(cocid[oa]|crudo|sin piel|natural|escurrido|picad[oa])\b.*$/i, "");
}

function isInsignificant(ingredient: RecipeNameIngredient) {
  if (ingredient.group_code === "FATS_NO_PROTEIN") return true;
  return /^(aceite|lim[oó]n|ajo|sal|pimienta|canela|vinagre)/i.test(ingredient.name.trim());
}

/** Produces a concise, deterministic, patient-friendly recipe name. */
export function generateRecipeName(ingredients: RecipeNameIngredient[]) {
  const seen = new Set<string>();
  const usedBuckets = new Set<string>();
  const names = ingredients
    .filter((ingredient) => !isInsignificant(ingredient))
    .map((ingredient, index) => ({
      name: displayName(ingredient),
      priority: groupPriority[ingredient.group_code],
      bucket: namingBucket(ingredient.group_code),
      index,
    }))
    .filter((ingredient) => {
      const key = ingredient.name.toLocaleLowerCase("es-MX");
      if (!ingredient.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .filter((ingredient) => {
      if (usedBuckets.has(ingredient.bucket)) return false;
      usedBuckets.add(ingredient.bucket);
      return true;
    })
    .slice(0, 3)
    .map((ingredient) => ingredient.name);

  if (!names.length) return "";
  const sentenceCase = (value: string) => `${value.slice(0, 1).toLocaleUpperCase("es-MX")}${value.slice(1).toLocaleLowerCase("es-MX")}`;
  const normalized = names.map((name) => name.toLocaleLowerCase("es-MX"));
  if (normalized.length === 1) return sentenceCase(normalized[0]);
  if (normalized.length === 2) return sentenceCase(`${normalized[0]} con ${normalized[1]}`);
  return sentenceCase(`${normalized[0]} con ${normalized[1]} y ${normalized[2]}`);
}
