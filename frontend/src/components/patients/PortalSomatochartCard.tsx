import type { LongitudinalSeries } from "@/src/features/evolution/longitudinal";
import type { SharedResult } from "@/src/services/patientPortal";
import { portalSomatochart } from "@/src/features/patients/portalSomatochart";
import { SomatochartCard } from "./EvolutionCharts";

/**
 * Adapts the patient-only published DTO to the same SomatochartCard used by
 * the professional patient profile. The portal never derives coordinates;
 * it only passes through the saved X/Y pair that was explicitly published.
 */
export function PortalSomatochartCard({ result, compact = false, showMethod = false }: {
  result: SharedResult;
  compact?: boolean;
  showMethod?: boolean;
}) {
  const { valid } = portalSomatochart(result);
  if (!valid.length) {
    return (
      <article className="portal-result rounded-2xl border border-[#e1e9e4] bg-[#fbfdfb] p-4">
        <h3 className="font-semibold text-[#25453b]">{showMethod ? result.label : "Mi somatocarta"}</h3>
        <p className="mt-3 text-sm leading-6 text-[#61776c]">
          Aún no hay un punto con las dos coordenadas y una fecha válida para mostrar tu somatocarta.
        </p>
      </article>
    );
  }
  const series: LongitudinalSeries = {
    id: result.id,
    label: showMethod ? result.label : "Mi somatocarta",
    category: "calculations",
    concept: "Somatocarta",
    unit: showMethod ? result.unit : null,
    sourceType: "calculation",
    method: showMethod ? result.method : null,
    provenance: showMethod ? result.method : null,
    visualization: "somatochart",
    graphable: valid.length > 0,
    points: valid.map((point) => ({
      consultation_id: point.consultationId,
      consultation_date: point.date,
      raw_value: point.coordinates.x,
      display_value: point.value,
      unit: showMethod ? result.unit : null,
      source_reference: {},
      coordinates: point.coordinates,
    })),
  };

  return <SomatochartCard series={series} compact={compact} patientView={!showMethod} />;
}
