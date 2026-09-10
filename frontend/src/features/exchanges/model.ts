import type { ExchangeDerivedTotals, ExchangeGroupCode, ExchangePrescription, ExchangeTargetSnapshot } from "@/src/types/domain";
import { EXCHANGE_CATALOG_VERSION, EXCHANGE_SYSTEM_CODE, exchangeCatalog, getExchangeGroup } from "./catalog";

const zeroTotals = (): ExchangeDerivedTotals => ({ energy_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0 });
const currentTime = () => new Date().toISOString();
const validPortions = (value: number) => Number.isFinite(value) && value >= 0;

export function sameExchangeTargets(a: ExchangeTargetSnapshot, b: ExchangeTargetSnapshot) {
  return a.energy_kcal === b.energy_kcal && a.carbohydrate_g === b.carbohydrate_g && a.protein_g === b.protein_g && a.fat_g === b.fat_g;
}

export function calculateExchangeTotals(groups: ExchangePrescription["groups"]): ExchangeDerivedTotals {
  return groups.reduce((totals, item) => {
    const catalog = getExchangeGroup(item.group_code);
    return {
      energy_kcal: totals.energy_kcal + item.portions * catalog.energyKcal,
      carbohydrate_g: totals.carbohydrate_g + item.portions * catalog.carbohydrateG,
      protein_g: totals.protein_g + item.portions * catalog.proteinG,
      fat_g: totals.fat_g + item.portions * catalog.fatG,
    };
  }, zeroTotals());
}

export function calculateExchangeDifferences(actual: ExchangeDerivedTotals, target: ExchangeTargetSnapshot): ExchangeDerivedTotals {
  return {
    energy_kcal: actual.energy_kcal - target.energy_kcal,
    carbohydrate_g: actual.carbohydrate_g - target.carbohydrate_g,
    protein_g: actual.protein_g - target.protein_g,
    fat_g: actual.fat_g - target.fat_g,
  };
}

export function createExchangePrescription(target: ExchangeTargetSnapshot): ExchangePrescription {
  const groups = exchangeCatalog.map((group) => ({ group_code: group.groupCode, portions: 0 }));
  const totals = calculateExchangeTotals(groups);
  return {
    schema_version: 1,
    exchange_system_code: EXCHANGE_SYSTEM_CODE,
    catalog_version: EXCHANGE_CATALOG_VERSION,
    target_snapshot: target,
    confirmed_target_snapshot: null,
    groups,
    derived_totals: totals,
    differences: calculateExchangeDifferences(totals, target),
    status: "not_started",
    confirmed_at: null,
    updated_at: currentTime(),
  };
}

function buildPrescription(
  prescription: ExchangePrescription,
  target: ExchangeTargetSnapshot,
  groups = prescription.groups,
  status = prescription.status,
  confirmedAt = prescription.confirmed_at,
): ExchangePrescription {
  const totals = calculateExchangeTotals(groups);
  return {
    ...prescription,
    exchange_system_code: EXCHANGE_SYSTEM_CODE,
    catalog_version: EXCHANGE_CATALOG_VERSION,
    target_snapshot: target,
    groups,
    derived_totals: totals,
    differences: calculateExchangeDifferences(totals, target),
    status,
    confirmed_at: confirmedAt,
    updated_at: currentTime(),
  };
}

export function setExchangePortions(
  prescription: ExchangePrescription,
  target: ExchangeTargetSnapshot,
  groupCode: ExchangeGroupCode,
  portions: number,
): ExchangePrescription {
  if (!validPortions(portions)) return prescription;
  const groups = prescription.groups.map((group) => group.group_code === groupCode ? { ...group, portions } : group);
  const hasValues = groups.some((group) => group.portions > 0);
  return buildPrescription(prescription, target, groups, hasValues ? "editing" : "not_started", null);
}

export function reconcileExchangePrescription(prescription: ExchangePrescription, target: ExchangeTargetSnapshot): ExchangePrescription {
  if (sameExchangeTargets(prescription.target_snapshot, target)) return prescription;
  const status = prescription.status === "ready" ? "editing" : prescription.status;
  return buildPrescription(prescription, target, prescription.groups, status, status === "editing" ? null : prescription.confirmed_at);
}

export function confirmExchangePrescription(prescription: ExchangePrescription, target: ExchangeTargetSnapshot): ExchangePrescription {
  const reconciled = reconcileExchangePrescription(prescription, target);
  return {
    ...buildPrescription(reconciled, target, reconciled.groups, "ready", currentTime()),
    confirmed_target_snapshot: target,
  };
}

export function resetExchangePrescription(target: ExchangeTargetSnapshot): ExchangePrescription {
  return createExchangePrescription(target);
}

export function objectivesChangedSinceConfirmation(prescription: ExchangePrescription) {
  return prescription.confirmed_target_snapshot !== null && !sameExchangeTargets(prescription.confirmed_target_snapshot, prescription.target_snapshot);
}

export function totalExchangePortions(prescription: ExchangePrescription) {
  return prescription.groups.reduce((total, group) => total + group.portions, 0);
}
