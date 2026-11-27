import { supabase } from "@/src/lib/supabase";
import {
  prenatalTemplateKey,
  type PhysicalActivity,
  type PregnancyType,
  type WeightSource,
} from "@/src/features/consultations/prenatalMeasurements";

export type PrenatalContext = {
  gestation_days: number | null;
  pregnancy_type: PregnancyType | null;
  pre_pregnancy_weight: number | null;
  weight_source: WeightSource | null;
  activity: PhysicalActivity | null;
  edema: boolean | null;
  previous_weight: number | null;
  previous_date: string | null;
};

export type PrenatalRecord = PrenatalContext & {
  consultation_id: string;
  pregnancy_id: string;
  date: string;
  weight: number | null;
  height: number | null;
};

export type PrenatalMeasurements = {
  records: PrenatalRecord[];
  measurements: Record<string, number | null>;
};

export async function hasPersonalPrenatalWorkspace() {
  const { data, error } = await supabase.from("consultation_templates")
    .select("id").eq("template_key", prenatalTemplateKey).eq("is_system", false).maybeSingle();
  return !error && Boolean(data);
}

export async function loadPrenatalMeasurements(consultationId: string): Promise<PrenatalMeasurements> {
  const { data, error } = await supabase.rpc("load_prenatal_measurements", {
    p_consultation_id: consultationId,
  });
  if (error || !data) throw new Error("No pudimos cargar las mediciones prenatales.");
  return data;
}

export async function savePrenatalMeasurements(
  consultationId: string, pregnancyId: string | null, context: PrenatalContext,
  measurements: Record<string, number | null>,
): Promise<PrenatalMeasurements> {
  const { data, error } = await supabase.rpc("save_prenatal_measurements", {
    p_consultation_id: consultationId,
    p_pregnancy_id: pregnancyId,
    p_context: context,
    p_measurements: measurements,
  });
  if (error || !data) {
    if (error?.code === "42501") throw new Error("Esta consulta ya no está disponible para guardar mediciones.");
    if (error?.code === "23514") throw new Error("Revisa las fechas y los valores capturados antes de guardar.");
    throw new Error("No pudimos guardar las mediciones prenatales. Tus cambios siguen en pantalla.");
  }
  return data;
}
