// Synthetic supplement library for the local visual preview; no backend calls.
import type { SupplementInput } from '../../src/services/supplements';
import type { SupplementCatalogItem } from '../../../supabase/functions/_shared/supplements';
const products: SupplementCatalogItem[] = [{
  id: 'preview-protein', owner_id: null, active: true,
  name: 'Proteína de demostración', brand: 'Ejemplo visual', presentation: 'Sin sabor',
  serving_label: '1 scoop (30 g)', serving_grams: 30, scoops_per_serving: 1,
  energy_kcal: 120, protein_g: 25, carbohydrate_g: 3, fat_g: 1,
  source_url: null, label_url: null, verified_at: null,
}];
export const listSupplements = async () => products.filter(product => product.active);
export const saveCustomSupplement = async (input: SupplementInput, id?: string) => {
  const product: SupplementCatalogItem = { ...input, id: id ?? crypto.randomUUID(), owner_id: 'preview', active: true, source_url: null, label_url: null, verified_at: null };
  const index = products.findIndex(item => item.id === product.id);
  if (index < 0) products.push(product); else products[index] = product;
  return product;
};
export const archiveCustomSupplement = async (id: string) => {
  const product = products.find(item => item.id === id);
  if (product) product.active = false;
};
