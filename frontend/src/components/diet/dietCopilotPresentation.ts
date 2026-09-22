import type { Fact } from '@/src/features/diet-workshop/generationContext';
import type { WorkshopContext } from '@/src/services/dietWorkshopAI';

const messages:Record<string,string> = {
  draft_required:'Abre un borrador para crear la propuesta.', consultation_required:'Selecciona la consulta del paciente.',
  context_mismatch:'Actualiza el contexto de la consulta.', context_unavailable:'No se pudo leer el contexto. Revisa la consulta seleccionada y vuelve a abrir el diálogo.',
  energy_required:'Falta definir la energía de la prescripción.', macros_required:'Falta definir los macronutrientes.',
  prescription_inconsistent:'Revisa la prescripción de energía y macronutrientes.', exchanges_unconfirmed:'Confirma los equivalentes de la prescripción.',
  pes_approval_required:'Aprueba el PES de esta consulta.', objective_approval_required:'Aprueba el objetivo de esta consulta.',
  meal_structure_required:'Configura los tiempos de comida.', meal_structure_invalid:'Revisa los tiempos de comida.',
  distribution_invalid:'Revisa la distribución de porciones.', invalid_distribution:'Configura y confirma los tiempos de comida.',
  restrictions_need_review:'Revisa las restricciones pendientes antes de generar.', instructions_too_long:'Las indicaciones adicionales admiten hasta 1200 caracteres.',
  catalog_required:'No hay un catálogo disponible para esta propuesta.', candidate_coverage_missing:'El catálogo no cubre todos los grupos de estos tiempos.',
  feature_disabled:'IA no disponible actualmente.', configuration_required:'IA no disponible actualmente.',
  insufficient_credits:'Presupuesto de IA no disponible.', account_disabled:'Presupuesto de IA no disponible.',
  pilot_daily_budget:'El presupuesto diario de IA no está disponible.',pilot_daily_limit:'Se alcanzó el límite diario de propuestas.',pilot_limit_reached:'Se alcanzó el límite de propuestas disponible.',
  provider_credit_exhausted:'El servicio de IA no tiene presupuesto disponible actualmente.',
  provider_outcome_unknown:'Hay una solicitud pendiente. Consulta su estado antes de generar otra.',
  service_unavailable:'No pudimos verificar el resultado. Tu borrador permanece sin cambios.',
  context_changed:'El contexto del plan cambió desde que se generó esta propuesta. Revisa los datos antes de continuar.',
  candidate_not_authorized:'La propuesta contiene una referencia no permitida por el catálogo o las restricciones.',
  portion_not_authorized:'La propuesta contiene una cantidad o unidad no compatible.',
  meal_not_authorized:'La propuesta contiene un tiempo de comida no compatible.', meal_missing:'Falta un tiempo de comida en la propuesta.',
  invalid_output:'La respuesta no cumple la estructura requerida.', invalid_nutrition:'No se pudo verificar el aporte nutricional.',
  portion_difference:'Hay diferencias respecto a las porciones distribuidas.', input_too_large:'El contexto supera el tamaño admitido para una propuesta.',
  replacement_confirmation_required:'Confirma el reemplazo del menú existente.', difference_confirmation_required:'Revisa y acepta las diferencias antes de aplicar.',
};
export const copilotMessage=(code:string)=>messages[code] ?? 'No se pudo validar esta propuesta. Tu borrador permanece sin cambios.';
export const factText=<T,>(fact:Fact<T>, format:(value:T)=>string=String):string => fact.state==='known'?format(fact.value):fact.state==='not_applicable'?'No aplica':'No especificado';
export function targetNutrition(context:WorkshopContext) {
  const energy=context.prescription.energy_kcal.fact,macros=context.prescription.macros.fact;
  return {energy_kcal:energy.state==='known'?energy.value:0,
    protein_g:macros.state==='known'?macros.value.PROTEIN.grams:0,
    carbohydrate_g:macros.state==='known'?macros.value.CARBOHYDRATE.grams:0,
    fat_g:macros.state==='known'?macros.value.FAT.grams:0};
}
export const nutritionLabels = [['energy_kcal','Energía','kcal'],['protein_g','Proteína','g'],['carbohydrate_g','Carbohidratos','g'],['fat_g','Grasa','g']] as const;
export const numberText=(value:number)=>new Intl.NumberFormat('es-MX',{maximumFractionDigits:1}).format(value);
