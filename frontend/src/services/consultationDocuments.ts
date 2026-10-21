import { clinicalInterventions } from "./clinicalInterventions";
import { loadLongitudinalHistory } from "./longitudinalHistory";
import { buildClinicalDocumentData } from "@/src/features/consultations/clinicalDocument";
import type { ConsultationSnapshot } from "@/src/types/domain";

export async function loadConsultationDocumentData(
  patientId: string,
  snapshot: ConsultationSnapshot,
) {
  const [strategies, history] = await Promise.all([
    clinicalInterventions(snapshot.consultation_id, snapshot.revision),
    loadLongitudinalHistory(patientId),
  ]);
  return buildClinicalDocumentData(snapshot, strategies.items, history);
}
