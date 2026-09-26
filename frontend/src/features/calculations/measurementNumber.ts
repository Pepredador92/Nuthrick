type NumericDefinition = { unit?: string | null; min_value?: number | null; max_value?: number | null };
export type MeasurementNumber = { value?: number; error?: string };

/** One decimal separator, optional exact field unit, and no implicit unit conversion. */
export function parseMeasurementNumber(raw: unknown, definition: NumericDefinition = {}): MeasurementNumber {
  if (raw == null || (typeof raw === "string" && !raw.trim())) return {};
  if (typeof raw !== "string" && typeof raw !== "number") return { error: "Escribe una cantidad numérica." };
  let text = String(raw).trim();
  const unit = definition.unit?.trim();
  if (unit && text.toLocaleLowerCase().endsWith(unit.toLocaleLowerCase())) text = text.slice(0, -unit.length).trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return { error: `Usa punto o coma para el decimal${unit ? ` y la unidad ${unit}` : ""}, sin separadores de miles.` };
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value)) return { error: "Escribe una cantidad numérica válida." };
  if (definition.min_value != null && value < definition.min_value) return { error: `El mínimo permitido es ${definition.min_value}${unit ? ` ${unit}` : ""}.` };
  if (definition.max_value != null && value > definition.max_value) return { error: `El máximo permitido es ${definition.max_value}${unit ? ` ${unit}` : ""}.` };
  return { value };
}
