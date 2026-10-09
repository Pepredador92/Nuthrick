import type {
  GrocerySchedule,
  GroceryItem,
} from "../../../../supabase/functions/_shared/groceries";
import {
  inferGroceryCategory,
  type GroceryCategory,
} from "../../../../supabase/functions/_shared/grocery-categories";
export type GroceryDraftRow = {
  name: string;
  quantity: number | null;
  unit: string;
  category?: GroceryCategory;
  source: string;
  needsReview: boolean;
};
const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
// Normalize common singular/plural names without removing preparation or product qualifiers.
const productKey = (name: string) =>
  key(name).replace(
    /\b(huevos|tortillas|manzanas|peras|platanos|naranjas|tostadas|bolillos|zanahorias)\b/g,
    (word) => word.slice(0, -1),
  );
const fractions: Record<string, number> = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};
const unitMap: Record<string, [string, number]> = {
  g: ["g", 1],
  gr: ["g", 1],
  grs: ["g", 1],
  gramo: ["g", 1],
  gramos: ["g", 1],
  kg: ["g", 1000],
  kilogramo: ["g", 1000],
  kilogramos: ["g", 1000],
  ml: ["ml", 1],
  mililitro: ["ml", 1],
  mililitros: ["ml", 1],
  l: ["ml", 1000],
  litro: ["ml", 1000],
  litros: ["ml", 1000],
  taza: ["taza", 1],
  tazas: ["taza", 1],
  cucharada: ["cucharada", 1],
  cucharadas: ["cucharada", 1],
  cda: ["cucharada", 1],
  cdas: ["cucharada", 1],
  cucharadita: ["cucharadita", 1],
  cucharaditas: ["cucharadita", 1],
  cdta: ["cucharadita", 1],
  cdtas: ["cucharadita", 1],
  pieza: ["pieza", 1],
  piezas: ["pieza", 1],
  pza: ["pieza", 1],
  pzas: ["pieza", 1],
  rebanada: ["rebanada", 1],
  rebanadas: ["rebanada", 1],
  vaso: ["vaso", 1],
  vasos: ["vaso", 1],
  unidad: ["pieza", 1],
  unidades: ["pieza", 1],
  diente: ["diente", 1],
  dientes: ["diente", 1],
  lata: ["lata", 1],
  latas: ["lata", 1],
  paquete: ["paquete", 1],
  paquetes: ["paquete", 1],
  pizca: ["pizca", 1],
  pizcas: ["pizca", 1],
};
const numberPattern =
  "(?:\\d+\\s+)?\\d+\\/\\d+|\\d+\\s*[½¼¾⅓⅔⅛⅜⅝⅞]|[½¼¾⅓⅔⅛⅜⅝⅞]|\\d+(?:[.,]\\d+)?";
const units = Object.keys(unitMap)
  .sort((a, b) => b.length - a.length)
  .join("|");
const measure = `(${numberPattern})\\s*(?:de\\s+)?(${units})\\.?(?=\\s|$|\\))`;
function numeric(raw: string): number {
  const text = raw.trim();
  if (fractions[text]) return fractions[text];
  const mixed = text.match(/^(\d+)\s+(.+)$/);
  if (mixed) return Number(mixed[1]) + numeric(mixed[2]);
  if (text.includes("/")) {
    const [a, b] = text.split("/").map(Number);
    return b > 0 ? a / b : NaN;
  }
  return Number(text.replace(",", "."));
}
// A conjunction can join preparation descriptors of one food, not just two foods.
function combinedProducts(name: string): boolean {
  if (/\scon\s/i.test(name)) return true;
  const preparation =
    /^(?:(?:bien|finamente)\s+)?(?:cocid[oa]s?|pelad[oa]s?|machacad[oa]s?|picad[oa]s?|colad[oa]s?|escurrid[oa]s?|deshebrad[oa]s?|rallad[oa]s?|lavad[oa]s?|desinfectad[oa]s?|triturad[oa]s?|molidos?|molidas?|sin (?:piel|cascara|semillas?|espinas?))(?:\s+(?:finamente|bien|en (?:cubos|trozos|tiras|rodajas)))?$/;
  return key(name)
    .split(/\s+y\s+/)
    .slice(1)
    .some((part) => !preparation.test(part));
}
export function parseGroceryIngredient(source: string): GroceryDraftRow {
  const text = source.replace(/\*\*|__/g, "").trim();
  const fallback: GroceryDraftRow = {
    name: text,
    quantity: null,
    unit: "",
    category: inferGroceryCategory(text),
    source,
    needsReview: true,
  };
  if (
    /\b(o|a gusto|al gusto|aprox(?:imadamente)?)\b|\d\s*[-–]\s*\d/i.test(text)
  )
    return fallback;
  let quantityText = "",
    unitWord = "",
    name = "";
  const leading = text.match(
    new RegExp(`^${measure}\\s+(?:de\\s+)?(.+)$`, "i"),
  );
  const trailing = text.match(
    new RegExp(`^(.+?)\\s*(?::|[-–—])\\s*${measure}$`, "i"),
  );
  const parenthetical = text.match(
    new RegExp(`^(.+?)\\s*\\(${measure}\\)$`, "i"),
  );
  if (leading) {
    [, quantityText, unitWord, name] = leading;
  } else if (trailing || parenthetical) {
    [, name, quantityText, unitWord] = (trailing || parenthetical)!;
  } else {
    // Countable ingredients such as "2 huevos" are pieces; unknown words are never assumed to be units.
    const pieces = text.match(
      new RegExp(
        `^(${numberPattern})\\s+((?:huevos?|tortillas?|manzanas?|peras?|platanos?|plátanos?|naranjas?|tostadas?|bolillos?|zanahorias?)(?:\\s+.*)?)$`,
        "i",
      ),
    );
    if (!pieces) return fallback;
    [, quantityText, name] = pieces;
    unitWord = "pieza";
  }
  const quantity = numeric(quantityText.replace(/(\d)([½¼¾⅓⅔⅛⅜⅝⅞])/, "$1 $2"));
  name = name
    .trim()
    .replace(/^de\s+/i, "")
    .replace(/[.;]$/, "");
  // A parenthetical second measure describes the same portion, not a second purchase.
  // Keep it as part of the product text to avoid merging incompatible portion sizes.
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !name ||
    combinedProducts(name)
  )
    return fallback;
  const unit = unitMap[key(unitWord)];
  return {
    name,
    quantity: quantity * unit[1],
    unit: unit[0],
    category: inferGroceryCategory(name),
    source,
    needsReview: false,
  };
}
export function compileGroceries(
  diets: { id: string; title: string; text: string }[],
  schedule: GrocerySchedule,
): GroceryDraftRow[] {
  const result: GroceryDraftRow[] = [],
    grouped = new Map<string, GroceryDraftRow>();
  for (const diet of diets) {
    const count = schedule.find((s) => s.diet_id === diet.id)?.days ?? 0;
    if (!Number.isInteger(count) || count <= 0 || count > 31) continue;
    const ingredients = diet.text
      .split("\n")
      .filter((line) => /^\s*[•*\-]\s+/.test(line))
      .map((line) => line.replace(/^\s*[•*\-]\s+/, "").trim());
    if (!ingredients.length) {
      result.push({
        name: `Revisar ingredientes de ${diet.title}`,
        quantity: null,
        unit: "",
        category: "other",
        source: diet.text,
        needsReview: true,
      });
      continue;
    }
    for (const ingredient of ingredients) {
      const row = parseGroceryIngredient(ingredient);
      row.source = `${diet.title} × ${count}: ${ingredient}`;
      if (row.quantity !== null) row.quantity *= count;
      const id = `${productKey(row.name)}|${row.unit}`;
      const previous = grouped.get(id);
      if (previous && row.quantity !== null && previous.quantity !== null) {
        previous.quantity += row.quantity;
        previous.source += `\n${row.source}`;
        previous.needsReview ||= row.needsReview;
      } else {
        result.push(row);
        if (row.quantity !== null) grouped.set(id, row);
      }
    }
  }
  return result.map((row) => ({
    ...row,
    quantity:
      row.quantity === null ? null : Math.round(row.quantity * 1000) / 1000,
  }));
}
export function validGroceryRows(rows: GroceryDraftRow[]): boolean {
  return (
    rows.length > 0 &&
    rows.length <= 400 &&
    rows.every(
      (r) =>
        r.name.trim().length > 0 &&
        r.name.length <= 180 &&
        r.unit.trim().length > 0 &&
        r.unit.length <= 40 &&
        r.quantity !== null &&
        Number.isFinite(r.quantity) &&
        r.quantity > 0 &&
        r.quantity <= 1000000,
    )
  );
}
export const groceryItems = (rows: GroceryDraftRow[]): GroceryItem[] =>
  rows.map((r) => ({
    name: r.name.trim(),
    quantity: r.quantity!,
    unit: r.unit.trim(),
    category: r.category ?? inferGroceryCategory(r.name),
  }));
