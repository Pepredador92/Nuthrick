import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import type { CatalogMeasurement } from "@/src/services/consultationMeasurements";
import { groupedMeasurements, measurementGroup } from "@/src/features/calculations/measurementGroups";

export function MeasurementGrid({ measurements, disabled, onMove, renderField }: {
  measurements: CatalogMeasurement[];
  disabled: boolean;
  onMove: (from: string, to: string) => void;
  renderField: (measurement: CatalogMeasurement) => ReactNode;
}) {
  const [dragged, setDragged] = useState<CatalogMeasurement | null>(null);
  return <div className="mt-4 space-y-6">
    <p className="text-xs text-[#60766a]">Arrastra el asa o usa las flechas para ordenar cada categoría. El orden se guarda en tu espacio de trabajo.</p>
    {groupedMeasurements(measurements).map((group) => <section key={group.key} aria-label={group.label}>
      <h4 className={`mb-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${group.className}`}>{group.label}</h4>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {group.measurements.map((item, index) => {
          const validTarget = !disabled && dragged && dragged.id !== item.id && measurementGroup(dragged).key === group.key;
          const label = item.display_name || item.name;
          return <div key={item.id} data-measurement={item.code} className={`min-w-0 rounded-2xl border transition-colors ${dragged?.id === item.id ? "border-[#709883] opacity-50" : validTarget ? "border-[#709883] bg-[#edf5ef]" : "border-transparent"}`}
            onDragOver={(event) => { if (validTarget) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
            onDrop={(event) => { event.preventDefault(); if (validTarget && dragged) onMove(dragged.id, item.id); setDragged(null); }}>
            <div className="flex items-center justify-end gap-1 px-2 py-1">
              <button type="button" draggable={!disabled && group.measurements.length > 1} disabled={disabled || group.measurements.length < 2}
                tabIndex={-1} aria-label={`Arrastrar ${label}`} title={`Arrastrar ${label}`} className="mr-auto cursor-grab rounded-lg p-2 text-[#60766a] active:cursor-grabbing disabled:opacity-30"
                onDragStart={(event) => { if (disabled) { event.preventDefault(); return; } setDragged(item); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }} onDragEnd={() => setDragged(null)}><GripVertical size={16} aria-hidden="true" /></button>
              <button type="button" aria-label={`Subir ${label}`} className="rounded-lg p-2 text-[#315e4f] hover:bg-[#edf5ef] disabled:opacity-30" disabled={disabled || index === 0} onClick={() => onMove(item.id, group.measurements[index - 1].id)}><ArrowUp size={16} aria-hidden="true" /></button>
              <button type="button" aria-label={`Bajar ${label}`} className="rounded-lg p-2 text-[#315e4f] hover:bg-[#edf5ef] disabled:opacity-30" disabled={disabled || index === group.measurements.length - 1} onClick={() => onMove(item.id, group.measurements[index + 1].id)}><ArrowDown size={16} aria-hidden="true" /></button>
            </div>
            {renderField(item)}
          </div>;
        })}
      </div>
    </section>)}
  </div>;
}
