import type { MacroCode } from "@/src/types/domain";

export type MacroCatalogEntry = {
  code: MacroCode;
  label: string;
  shortLabel: string;
  kcalPerGram: number;
  color: string;
};

/** Centralized Atwater factors used by the diet workshop. */
export const macroCatalog: readonly MacroCatalogEntry[] = [
  { code: "CARBOHYDRATE", label: "Carbohidratos", shortLabel: "CHO", kcalPerGram: 4, color: "#4d8bdb" },
  { code: "PROTEIN", label: "Proteína", shortLabel: "PRO", kcalPerGram: 4, color: "#8a62bf" },
  { code: "FAT", label: "Grasas", shortLabel: "GRASA", kcalPerGram: 9, color: "#d99032" },
];

export const MACRO_ENERGY_TOLERANCE_KCAL = 1;
export const MACRO_PERCENTAGE_TOLERANCE = 0.000001;

export function getMacroCatalogEntry(code: MacroCode): MacroCatalogEntry {
  const macro = macroCatalog.find((item) => item.code === code);
  if (!macro) throw new Error(`Macronutriente no registrado: ${code}`);
  return macro;
}
