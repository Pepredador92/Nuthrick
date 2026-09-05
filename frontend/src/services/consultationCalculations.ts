import { supabase } from "@/src/lib/supabase";
import type { CalculationCatalogItem } from "@/src/features/calculations/catalog";

export async function loadCalculationCatalog(): Promise<CalculationCatalogItem[]> {
  const { data, error } = await supabase
    .from("calculation_definitions")
    .select("code, name, category, method_version, status, definition, display_order")
    .eq("is_catalog_visible", true)
    .order("display_order");
  if (error) throw new Error("No pudimos cargar el catálogo de cálculos.");
  return (data ?? []) as CalculationCatalogItem[];
}

export async function saveConsultationCalculationResults(
  consultationId: string,
  results: Record<string, unknown>,
  pregnant: boolean | null = null,
) {
  const { data, error } = await supabase.rpc("save_calculations_with_context", {
    p_consultation_id: consultationId,
    p_results: results,
    p_pregnancy: pregnant,
  });
  if (error) throw new Error("Las mediciones se guardaron, pero no pudimos conservar sus cálculos.");
  return data ?? [];
}
