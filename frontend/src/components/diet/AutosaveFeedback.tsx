import type { AutosaveStatus } from "@/src/features/diet-workshop/autosave";

export function AutosaveFeedback({ status, savingLabel = "Guardando…" }: { status: AutosaveStatus; savingLabel?: string }) {
  if (status === "clean") return null;
  const label = status === "saving" ? savingLabel : status === "dirty" ? "Cambios pendientes" : status === "error" ? "No se pudo guardar" : "Guardado";
  return <p role="status" className={`text-xs ${status === "error" ? "text-[#a64a3d]" : "text-[#74817d]"}`}>{label}</p>;
}
