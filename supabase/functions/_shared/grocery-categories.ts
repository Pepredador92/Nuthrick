/** Shared supermarket sections for review, patient views and document exports. */
export const groceryCategories = [
  { id: "produce", label: "Frutas y verduras" },
  { id: "grains", label: "Cereales, pan y tortillas" },
  { id: "legumes", label: "Leguminosas" },
  { id: "protein", label: "Carnes, pescado y huevo" },
  { id: "dairy", label: "Lácteos y alternativas" },
  { id: "fats", label: "Aceites, semillas y frutos secos" },
  { id: "pantry", label: "Condimentos y despensa" },
  { id: "drinks", label: "Bebidas" },
  { id: "other", label: "Otros productos" },
] as const;
export type GroceryCategory = (typeof groceryCategories)[number]["id"];
export const isGroceryCategory = (value: unknown): value is GroceryCategory =>
  groceryCategories.some((c) => c.id === value);
const normalize = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
/** Specific product forms take precedence over ingredients in their names. Unknown foods remain reviewable. */
export function inferGroceryCategory(name: string): GroceryCategory {
  const n = normalize(name);
  if (
    !/\bcrema de cacahuate\b/.test(n) &&
    /\b(leche|leches|yogur|yogurt|yoghurt|quesos?|panela|requeson|jocoque|kefir|bebida (?:de|vegetal)|crema)\b/.test(
      n,
    )
  )
    return "dairy";
  if (
    /\b(aceite|aceites|semillas?|nueces|nuez|almendras?|cacahuates?|pistaches?|pepitas?|ajonjoli|chia|linaza|mantequillas?|crema de cacahuate)\b/.test(
      n,
    )
  )
    return "fats";
  if (
    /\b(frijol|frijoles|lentejas?|garbanzos?|habas?|alubias?|soya|tofu|edamame)\b/.test(
      n,
    )
  )
    return "legumes";
  if (
    /\b(pollo|pavo|res|cerdo|pescado|atun|salmon|sardinas?|huevos?|claras?|yemas?|camarones?|camaron|bistec|carne|jamon|pechuga|filete)\b/.test(
      n,
    )
  )
    return "protein";
  if (
    /\b(arroz|avena|pan|panes|tortillas?|tostadas?|pasta|espagueti|fideos?|cereal|cereales|amaranto|quinoa|bolillos?|galletas?|harina|maiz)\b/.test(
      n,
    )
  )
    return "grains";
  if (
    /\b(sal|pimienta|oregano|canela|comino|vinagre|salsa|mostaza|miel|azucar|cacao|vainilla|consome|especias?)\b/.test(
      n,
    )
  )
    return "pantry";
  if (/\b(agua|cafe|te|infusion|jugo)\b/.test(n)) return "drinks";
  if (
    /\b(aguacates?|elotes?|papas?|camotes?|manzanas?|peras?|platanos?|bananas?|papaya|melon|sandia|mango|fresas?|uvas?|naranjas?|mandarinas?|toronja|kiwi|pina|duraznos?|guayabas?|limones?|limon|frutas?|verduras?|calabacitas?|calabaza|zanahorias?|chayotes?|jitomates?|tomates?|cebollas?|ajos?|ajo|espinacas?|acelgas?|brocoli|coliflor|lechugas?|pepinos?|nopales?|nopal|pimientos?|chiles?|champi[nñ]ones?|hongos?|ejotes?|apio|col|betabel|cilantro|perejil|jicama|rabano|esparragos?)\b/.test(
      n,
    )
  )
    return "produce";
  return "other";
}
export function groupGroceries<
  T extends { name: string; category?: GroceryCategory },
>(items: T[]) {
  return groceryCategories
    .map((category) => ({
      ...category,
      items: items.filter(
        (item) =>
          (item.category ?? inferGroceryCategory(item.name)) === category.id,
      ),
    }))
    .filter((group) => group.items.length > 0);
}
