import { supabase } from "@/src/lib/supabase";
import {
  buildLongitudinalHistory,
  type HistoricalCalculation,
  type HistoricalDeviceSession,
} from "@/src/features/evolution/longitudinal";
import type { CatalogMeasurement, ConsultationMeasurement } from "@/src/services/consultationMeasurements";
import type { Consultation, PatientMeasurement } from "@/src/types/domain";
import type { LaboratoryReport, LaboratoryResult } from "@/src/services/laboratories";

/**
 * Reads the existing clinical records in bounded queries. Each table already
 * applies its RLS owner policy, so this service never receives another
 * professional's patient history and does not write a denormalized copy.
 */
export async function loadLongitudinalHistory(patientId: string) {
  const [
    consultationsResult,
    catalogResult,
    measurementsResult,
    legacyMeasurementsResult,
    calculationsResult,
    sessionsResult,
    reportsResult,
    laboratoryResultsResult,
  ] = await Promise.all([
    supabase.from("consultations").select("*").eq("patient_id", patientId),
    supabase
      .from("measurement_types")
      .select("id,code,name,display_name,clinical_name,category,subcategory,unit,data_type,min_value,max_value,decimal_places,description,synonyms,display_order,source_kind,choice_options")
      .order("display_order"),
    supabase
      .from("consultation_measurements")
      .select("id,consultation_id,measurement_type_id,value,unit,data_type,measured_at,device_session_id,source_metadata")
      .eq("patient_id", patientId),
    supabase.from("patient_measurements").select("*").eq("patient_id", patientId),
    supabase
      .from("consultation_calculation_results")
      .select("id,consultation_id,calculation_code,result_key,method_name,method_version,raw_result,displayed_result,unit,definition_snapshot")
      .eq("patient_id", patientId),
    supabase
      .from("consultation_device_sessions")
      .select("id,consultation_id,professional_device_id,capture_source,device_snapshot")
      .eq("patient_id", patientId),
    supabase.from("laboratory_reports").select("*").eq("patient_id", patientId),
    supabase.from("laboratory_results").select("*").eq("patient_id", patientId),
  ]);

  const results = [
    consultationsResult,
    catalogResult,
    measurementsResult,
    legacyMeasurementsResult,
    calculationsResult,
    sessionsResult,
    reportsResult,
    laboratoryResultsResult,
  ];
  if (results.some((result) => result.error)) {
    throw new Error("No pudimos cargar el historial comparativo de este paciente.");
  }

  return buildLongitudinalHistory({
    consultations: (consultationsResult.data ?? []) as Consultation[],
    catalog: (catalogResult.data ?? []) as CatalogMeasurement[],
    measurements: (measurementsResult.data ?? []) as ConsultationMeasurement[],
    legacyMeasurements: (legacyMeasurementsResult.data ?? []) as PatientMeasurement[],
    calculations: (calculationsResult.data ?? []) as HistoricalCalculation[],
    deviceSessions: (sessionsResult.data ?? []) as HistoricalDeviceSession[],
    laboratoryReports: (reportsResult.data ?? []) as LaboratoryReport[],
    laboratoryResults: (laboratoryResultsResult.data ?? []) as LaboratoryResult[],
  });
}
