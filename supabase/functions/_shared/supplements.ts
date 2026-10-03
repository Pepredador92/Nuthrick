// Shared arithmetic and validation for editor, publication and patient projection.
export type SupplementNutrition = { energy_kcal: number; carbohydrate_g: number; protein_g: number; fat_g: number };
export type SupplementProduct = SupplementNutrition & {
  id: string; name: string; brand: string; presentation: string; serving_label: string;
  serving_grams: number | null; scoops_per_serving: number | null;
  source_url: string | null; label_url: string | null; verified_at: string | null;
};
export type SupplementItem = { id: string; product: SupplementProduct; quantity: number; unit: 'serving' | 'scoop' | 'g'; instructions: string };
export type SupplementCatalogItem = SupplementProduct & { owner_id: string | null; active: boolean };
export const nutritionKeys = ['energy_kcal','carbohydrate_g','protein_g','fat_g'] as const;
export const zeroNutrition = (): SupplementNutrition => ({energy_kcal:0,carbohydrate_g:0,protein_g:0,fat_g:0});
const finite = (v: unknown, positive = false): v is number => typeof v === 'number' && Number.isFinite(v) && (positive ? v > 0 : v >= 0) && v <= 100000;
const nonempty = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const nullableNumber = (v: unknown) => v === null || finite(v, true);
const optionalText = (v: unknown, max: number) => v === null || typeof v === 'string' && v.length <= max;
export function isSupplementProduct(value: unknown): value is SupplementProduct {
  if (!value || typeof value !== 'object') return false;
  const p = value as SupplementProduct;
  return nonempty(p.id,100) && nonempty(p.name,180) && typeof p.brand === 'string' && p.brand.length <= 120
    && typeof p.presentation === 'string' && p.presentation.length <= 120 && nonempty(p.serving_label,180)
    && nullableNumber(p.serving_grams) && nullableNumber(p.scoops_per_serving)
    && optionalText(p.source_url,2000) && optionalText(p.label_url,2000) && optionalText(p.verified_at,50)
    && nutritionKeys.every(k => finite(p[k]));
}
export function isSupplementList(value: unknown): value is SupplementItem[] {
  if (!Array.isArray(value) || value.length > 30) return false;
  const ids = new Set<string>();
  return value.every((v: SupplementItem) => {
    if (!v || !nonempty(v.id,100) || ids.has(v.id) || !isSupplementProduct(v.product) || !finite(v.quantity,true)
      || !['serving','scoop','g'].includes(v.unit) || typeof v.instructions !== 'string' || v.instructions.length > 1500
      || v.unit === 'g' && !v.product.serving_grams || v.unit === 'scoop' && !v.product.scoops_per_serving) return false;
    ids.add(v.id); return true;
  });
}
export const roundNutrition = (value: number) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
export function supplementServings(item: SupplementItem) {
  return item.unit === 'g' ? item.quantity / item.product.serving_grams! : item.unit === 'scoop' ? item.quantity / item.product.scoops_per_serving! : item.quantity;
}
export function supplementTotals(items: SupplementItem[] = []): SupplementNutrition {
  if (!isSupplementList(items)) throw new Error('La suplementación contiene cantidades o etiquetas inválidas.');
  const total = zeroNutrition();
  for (const item of items) for (const k of nutritionKeys) total[k] += item.product[k] * supplementServings(item);
  for (const k of nutritionKeys) total[k] = roundNutrition(total[k]);
  return total;
}
export function splitSupplementTargets(daily: SupplementNutrition, items: SupplementItem[] = []) {
  const supplements = supplementTotals(items), food = zeroNutrition(), excess = zeroNutrition();
  for (const k of nutritionKeys) {
    food[k] = roundNutrition(Math.max(0, daily[k] - supplements[k]));
    excess[k] = roundNutrition(Math.max(0, supplements[k] - daily[k]));
  }
  return { daily, supplements, food, excess };
}
export function supplementQuantityLabel(item: SupplementItem) {
  const amount = item.quantity.toLocaleString('es-MX',{maximumFractionDigits:3});
  if (item.unit === 'g') return `${amount} g al día`;
  if (item.unit === 'scoop') return `${amount} medida${item.quantity === 1 ? '' : 's'} del producto al día${item.product.serving_grams ? ` (${roundNutrition(supplementServings(item)*item.product.serving_grams)} g)` : ''}`;
  return `${amount} porción${item.quantity === 1 ? '' : 'es'} al día · Porción de referencia: ${item.product.serving_label}`;
}
