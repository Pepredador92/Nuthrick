import type { ExchangeGroupCode } from "@/src/types/domain";

export const EXCHANGE_SYSTEM_CODE = "SMAE_NOM037_2012";
export const EXCHANGE_CATALOG_VERSION = "1.0.0";

export type ExchangeCatalogGroup = {
  systemCode: typeof EXCHANGE_SYSTEM_CODE;
  catalogVersion: typeof EXCHANGE_CATALOG_VERSION;
  groupCode: ExchangeGroupCode;
  groupName: string;
  shortName: string;
  category: "produce" | "grains" | "animal" | "milk" | "fats" | "sugars";
  categoryName: string;
  displayOrder: number;
  energyKcal: number;
  carbohydrateG: number;
  proteinG: number;
  fatG: number;
  active: true;
  source: "SMAE / NOM-037-SSA2-2012";
};

const group = (
  groupCode: ExchangeGroupCode, groupName: string, shortName: string, category: ExchangeCatalogGroup["category"], categoryName: string,
  displayOrder: number, energyKcal: number, carbohydrateG: number, proteinG: number, fatG: number,
): ExchangeCatalogGroup => ({
  systemCode: EXCHANGE_SYSTEM_CODE, catalogVersion: EXCHANGE_CATALOG_VERSION, groupCode, groupName, shortName, category, categoryName,
  displayOrder, energyKcal, carbohydrateG, proteinG, fatG, active: true, source: "SMAE / NOM-037-SSA2-2012",
});

/** Versioned equivalent exchanges. Values are the official per-exchange averages. */
export const exchangeCatalog: readonly ExchangeCatalogGroup[] = [
  group("VEGETABLES", "Verduras", "Verduras", "produce", "Vegetales y frutas", 10, 25, 4, 2, 0),
  group("FRUITS", "Frutas", "Frutas", "produce", "Vegetales y frutas", 20, 60, 15, 0, 0),
  group("CEREALS_NO_FAT", "Cereales y tubérculos sin grasa", "Cereales sin grasa", "grains", "Cereales y leguminosas", 30, 70, 15, 2, 0),
  group("CEREALS_WITH_FAT", "Cereales y tubérculos con grasa", "Cereales con grasa", "grains", "Cereales y leguminosas", 40, 115, 15, 2, 5),
  group("LEGUMES", "Leguminosas", "Leguminosas", "grains", "Cereales y leguminosas", 50, 120, 20, 8, 1),
  group("AOA_VERY_LOW_FAT", "AOA · muy bajos en grasa", "AOA muy bajos", "animal", "Alimentos de origen animal", 60, 40, 0, 7, 1),
  group("AOA_LOW_FAT", "AOA · bajos en grasa", "AOA bajos", "animal", "Alimentos de origen animal", 70, 55, 0, 7, 3),
  group("AOA_MODERATE_FAT", "AOA · moderados en grasa", "AOA moderados", "animal", "Alimentos de origen animal", 80, 75, 0, 7, 5),
  group("AOA_HIGH_FAT", "AOA · altos en grasa", "AOA altos", "animal", "Alimentos de origen animal", 90, 100, 0, 7, 8),
  group("MILK_SKIM", "Leche descremada", "Descremada", "milk", "Leches", 100, 95, 12, 9, 2),
  group("MILK_SEMI_SKIM", "Leche semidescremada", "Semidescremada", "milk", "Leches", 110, 110, 12, 9, 4),
  group("MILK_WHOLE", "Leche entera", "Entera", "milk", "Leches", 120, 150, 12, 9, 8),
  group("MILK_WITH_SUGAR", "Leche con azúcar", "Con azúcar", "milk", "Leches", 130, 200, 30, 8, 8),
  group("FATS_NO_PROTEIN", "Aceites y grasas sin proteína", "Sin proteína", "fats", "Grasas", 140, 45, 0, 0, 5),
  group("FATS_WITH_PROTEIN", "Aceites y grasas con proteína", "Con proteína", "fats", "Grasas", 150, 70, 3, 3, 5),
  group("SUGARS_NO_FAT", "Azúcares sin grasa", "Sin grasa", "sugars", "Azúcares", 160, 40, 10, 0, 0),
  group("SUGARS_WITH_FAT", "Azúcares con grasa", "Con grasa", "sugars", "Azúcares", 170, 85, 10, 0, 5),
] as const;

export const exchangeCatalogCategories = [...new Map(exchangeCatalog.map((item) => [item.category, item.categoryName])).entries()]
  .map(([category, label]) => ({ category, label }));

export function getExchangeGroup(code: ExchangeGroupCode): ExchangeCatalogGroup {
  const result = exchangeCatalog.find((group) => group.groupCode === code);
  if (!result) throw new Error(`Grupo de equivalentes no encontrado: ${code}`);
  return result;
}
