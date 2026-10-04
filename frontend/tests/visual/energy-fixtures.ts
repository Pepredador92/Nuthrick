// Synthetic data for the Energy design preview. All page reads/writes stay local.
import type { NutritionPlan } from '../../src/types/domain';
export * from '../../src/services/dietPlans';
export * from '../../src/services/patients';
export * from '../../src/services/dietLibrary';
const patient = { id: 'energy-demo-patient', full_name: 'Paciente de demostración', birth_date: '1991-04-15', equation_sex: 'female', weight_kg: 72, height_cm: 165 };
const consultation = { id: 'energy-demo-consultation', patient_id: patient.id, consultation_date: '2026-10-04T12:00:00Z', status: 'completed', consultation_type: 'initial', sequence_number: 0 };
let plan = {
  id: 'energy-demo', professional_id: 'preview', patient_id: patient.id, consultation_id: consultation.id,
  title: 'Plan de alimentación · Octubre', status: 'draft', assigned_at: '2026-10-04', review_date: null,
  plan_type: null, category: null, target_calories: null, energy_calculation: null, macro_distribution: null,
  exchange_prescription: null, meal_distribution: null, diet_menu: null,
  created_at: '2026-10-04T12:00:00Z', updated_at: '2026-10-04T12:00:00Z',
} as NutritionPlan;
export const getDietPlan = async () => plan;
export const updateDietPlan = async (_id: string, patch: Partial<NutritionPlan>) => (plan = { ...plan, ...patch });
export const listDietPlans = async () => [plan];
export const listDietPlanVersions = async () => [];
export const loadDietReferenceData = async () => ({ weight: { value: 72, unit: 'kg' }, height: { value: 165, unit: 'cm' } });
export const getPatient = async () => patient;
export const listPatients = async () => ({ rows: [patient], total: 1 });
export const listConsultations = async () => [consultation];
export const dietLibraryRecovery = async () => null;
export const listDietLibrary = async () => [];
