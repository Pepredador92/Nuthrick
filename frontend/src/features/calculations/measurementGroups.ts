import type { CatalogMeasurement } from "@/src/services/consultationMeasurements";

export const measurementGroups = [
  { key: "general", label: "Mediciones básicas", className: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  { key: "circumference", label: "Circunferencias", className: "border-sky-200 bg-sky-50 text-sky-900" },
  { key: "skinfold", label: "Pliegues cutáneos", className: "border-amber-200 bg-amber-50 text-amber-900" },
  { key: "bone_breadth", label: "Diámetros", className: "border-violet-200 bg-violet-50 text-violet-900" },
  { key: "anthropometric_length", label: "Longitudes", className: "border-teal-200 bg-teal-50 text-teal-900" },
  { key: "clinical", label: "Otras mediciones", className: "border-slate-200 bg-slate-50 text-slate-800" },
];
export function measurementGroup(item: Pick<CatalogMeasurement, "category">) {
  return measurementGroups.find((group) => group.key === item.category) ?? measurementGroups[5];
}
export function groupedMeasurements(items: CatalogMeasurement[]) {
  return measurementGroups.flatMap((group) => {
    const measurements = items.filter((item) => measurementGroup(item).key === group.key);
    return measurements.length ? [{ ...group, measurements }] : [];
  });
}

/** Reorders only the source category's slots; values and other categories are untouched. */
export function reorderMeasurements(ids: string[], catalog: CatalogMeasurement[], from: string, to: string) {
  const source = catalog.find((item) => item.id === from);
  const target = catalog.find((item) => item.id === to);
  if (!source || !target || from === to || !ids.includes(from) || !ids.includes(to) || measurementGroup(source).key !== measurementGroup(target).key) return ids;
  const groupIds = new Set(catalog.filter((item) => measurementGroup(item).key === measurementGroup(source).key).map((item) => item.id));
  const ordered = ids.filter((id) => groupIds.has(id));
  const destination = ordered.indexOf(to);
  ordered.splice(ordered.indexOf(from), 1);
  ordered.splice(destination, 0, from);
  let index = 0;
  return ids.map((id) => groupIds.has(id) ? ordered[index++] : id);
}
