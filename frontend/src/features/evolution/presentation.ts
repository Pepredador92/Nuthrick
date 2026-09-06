import type { LongitudinalCategory, LongitudinalSeries } from "@/src/features/evolution/longitudinal";

export const evolutionCategoryStyles: Record<
  LongitudinalCategory,
  { label: string; line: string; tint: string; text: string }
> = {
  measurements: { label: "Mediciones", line: "#3d705d", tint: "#e8f2ec", text: "#315e4f" },
  calculations: { label: "Datos calculados", line: "#566fb4", tint: "#edf0fb", text: "#40558f" },
  bioimpedance: { label: "Bioimpedancia", line: "#aa702f", tint: "#fbf1df", text: "#80501b" },
  laboratories: { label: "Laboratorios", line: "#a65371", tint: "#fbeaf0", text: "#7e3852" },
};

const catalogCategoryNames: Record<string, string> = {
  general: "Mediciones registradas",
  clinical: "Mediciones registradas",
  skinfold: "Antropometría",
  circumference: "Antropometría",
  bone_breadth: "Antropometría",
  anthropometric_length: "Antropometría",
  bioimpedance: "Bioimpedancia",
  laboratory: "Laboratorios",
};

const catalogSubcategoryNames: Record<string, string> = {
  generales: "Generales",
  temperatura: "Temperatura",
  pulso: "Pulso",
  otros_registrados: "Otros datos conservados",
  pliegues_cutaneos: "Pliegues cutáneos",
  circunferencias: "Circunferencias",
  diametros: "Diámetros",
  longitudes: "Longitudes",
  composicion_general: "Composición general",
  segmental: "Segmental",
  otros_dispositivo: "Otros datos del dispositivo",
};

export function selectionGroupLabel(series: LongitudinalSeries) {
  const category = series.catalogCategory && catalogCategoryNames[series.catalogCategory];
  const subcategory = series.catalogSubcategory && catalogSubcategoryNames[series.catalogSubcategory];
  if (category && subcategory) return `${category} · ${subcategory}`;
  return category ?? evolutionCategoryStyles[series.category].label;
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16)) as [number, number, number];
}
