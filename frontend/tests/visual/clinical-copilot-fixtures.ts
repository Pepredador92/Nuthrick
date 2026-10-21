// Offline visual/E2E fixture only. Never imported by the application build.
import { type ObjectivePlan } from '../../../supabase/functions/_shared/objectives';
import type { FoodItem } from "../../src/types/domain";
import type { ClinicalMeasurementFact } from '../../src/features/consultations/clinicalCopilot';
export const reviewFacts: ClinicalMeasurementFact[] = [
  { source: 'Antropometría · Peso · Captura directa', finding: '92 kg · consulta 2026-10-18', metric_code: 'weight', origin: 'measurement', numeric_value: 92, unit: 'kg', method: 'Captura directa', consultation_date: '2026-10-18' },
  { source: 'Historial · Peso · Captura directa', finding: '94 kg · consulta 2026-09-01', metric_code: 'weight', origin: 'measurement', numeric_value: 94, unit: 'kg', method: 'Captura directa', consultation_date: '2026-09-01' },
  { source: 'Antropometría · Grasa (%) · Equipo A', finding: '30 % · consulta 2026-10-18', metric_code: 'body_fat_percentage_device', origin: 'measurement', numeric_value: 30, unit: '%', method: 'Equipo A', consultation_date: '2026-10-18' },
  { source: 'Historial · Grasa (%) · Equipo A', finding: '32 % · consulta 2026-09-01', metric_code: 'body_fat_percentage_device', origin: 'measurement', numeric_value: 32, unit: '%', method: 'Equipo A', consultation_date: '2026-09-01' },
  { source: 'Dato de ficha · Estatura', finding: '170 cm · dato de ficha; fecha de medición no registrada', metric_code: 'height', origin: 'baseline' },
];
export const hasSupabaseConfig = false;
export const aiMessages = {
  insufficient_credits: "No tienes créditos de IA disponibles.",
  provider_outcome_unknown: "Comprueba la solicitud pendiente.",
};
export type AIState =
  "idle" | "generating" | "ready" | "error" | "insufficient" | "uncertain";
export class AIRequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export const getAIBalance = async () => ({
  available_credits: 100,
  reserved_credits: 0,
});
export const getAIGenerationStatus = async () => null;
export async function clinicalObjective(
  _id: string,
  revision: number,
  action = "read",
  _stamp?: string,
  questionKey?: string,
  plan?: ObjectivePlan,
) {
  const records = JSON.parse(
    localStorage.getItem("qa-clinical-records") || "{}",
  );
  const parts = JSON.parse(localStorage.getItem('qa-pes-parts') || '{}');
  const pes = records.pes ? { ...records.pes, ...parts, pesStatement: parts.pes_statement ?? records.pes.pesStatement, etiology: parts.pes_etiology ?? records.pes.etiology, signsSymptoms: parts.pes_evidence ?? records.pes.signsSymptoms?.join('\n') } : null;
  const plans = JSON.parse(localStorage.getItem('qa-objective-plans') || '{}');
  if (['save','approve'].includes(action) && plan && questionKey) { plans[questionKey] = plan; localStorage.setItem('qa-objective-plans', JSON.stringify(plans)); objectiveReset(); }
  function objectiveReset() { localStorage.removeItem('qa-clinical-objective'); }
  let objective = JSON.parse(
    localStorage.getItem("qa-clinical-objective") || "null",
  );
  if (action === "save") objective = null;
  if (action === "approve") {
    if (!pes) throw new Error("Revisa y aprueba primero el PES.");
    const value = localStorage.getItem("qa-goal-text") || "";
    objective = {
      question_key: questionKey,
      pes_statement: pes.pesStatement,
      pes_approved_at: pes.approved_at,
      smart_plan: plan,
      value,
      content: value,
      revision,
      approved_at: new Date().toISOString(),
    };
    localStorage.setItem("qa-clinical-objective", JSON.stringify(objective));
  } else if (action === "revoke") {
    objective = null;
    localStorage.removeItem("qa-clinical-objective");
  }
  return {
    stamp: "synthetic-stamp",
    pes,
    plans,
    objective,
    facts: [
      {
        source: "Entrevista · Motivo",
        finding: "Mejorar la regularidad de comidas",
      },
      {
        source: "Antropometría · Estatura",
        finding: "170 cm · medición 2026-09-21",
      },
    ],
    target: null,
  };
}
const food = (
  id: string,
  name: string,
  group_code: FoodItem["group_code"],
  portion_amount: number,
  portion_unit: FoodItem["portion_unit"],
  edible_grams: number,
): FoodItem => ({
  id,
  owner_id: null,
  name,
  normalized_name: name.toLowerCase(),
  aliases: [],
  active: true,
  is_custom: false,
  portion_amount,
  portion_unit,
  edible_grams,
  group_code,
  attributes: {},
  portion_description: `${portion_amount} ${portion_unit}`,
  exchange_system_code: "SMAE_NOM037_2012",
  exchange_catalog_version: "1.0.0",
  source: "Fixture",
  source_version: "1",
  stable_code: null,
  catalog_code: null,
  brand: null,
  category: null,
  alternate_portions: [],
  source_reference: null,
  use_count: 0,
  created_at: "2026-09-21",
  updated_at: "2026-09-21",
  energy_kcal: null,
  carbohydrate_g: null,
  protein_g: null,
  fat_g: null,
  fiber_g: null,
  sodium_mg: null,
});
export const foods = [
  food("egg", "Huevo entero", "AOA_MODERATE_FAT", 1, "piece", 50),
  food("tortilla", "Tortilla de maíz", "CEREALS_NO_FAT", 1, "tortilla", 30),
  food("beans", "Frijoles cocidos", "LEGUMES", 0.5, "cup", 90),
  food("chicken", "Pollo cocido", "AOA_VERY_LOW_FAT", 30, "g", 30),
  food("rice", "Arroz cocido", "CEREALS_NO_FAT", 0.25, "cup", 50),
];
const chain = {
  select: () => chain,
  or: () => chain,
  eq: () => chain,
  order: () => chain,
  range: async () => ({ data: foods, error: null }),
};
export const supabase = {
  auth: {
    getUser: async () => ({ data: { user: { id: "offline" } }, error: null }),
  },
  from: () => chain,
};
export async function clinicalWorkspace(
  _id: string,
  _revision: number,
  kind?: string,
  payload?: Record<string, unknown>,
) {
  const records = JSON.parse(
    localStorage.getItem("qa-clinical-records") || "{}",
  );
  if (kind && payload) {
    records[kind] = { ...payload, approved_at: new Date().toISOString() };
    if (kind === "recall" && payload.method !== "ai_estimate")
      records[kind].items = (payload.items as { foodId: string }[]).map(
        (i) => ({ ...i, food: foods.find((f) => f.id === i.foodId) }),
      );
    if (kind === "recall" && payload.method === "ai_estimate") records[kind].items = [];
    localStorage.setItem("qa-clinical-records", JSON.stringify(records));
  }
  return {
    stamp: "synthetic-stamp",
    records,
    readiness: {
      interview: true,
      objective: true,
      anthropometry: true,
      laboratories: false,
    },
    target: {
      energy_kcal: 2000,
      protein_g: 100,
      carbohydrate_g: 250,
      fat_g: 66.7,
    },
  };
}
export async function runAIRequest(request: {
  feature: string;
  narrative?: string;
}) {
  await new Promise((r) => setTimeout(r, 250));
  if (request.feature === 'intervention_strategy') return { generationId:crypto.randomUUID(), status:'succeeded', replay:false, output:{strategies:[syntheticStrategy()]} };
  if (request.feature === "consultation_support") return {
    generationId: crypto.randomUUID(), status: "succeeded", replay: false,
    output: { objectives: [{
      goal: {
        outcome: 'Mejorar la suficiencia de la ingesta oral',
        etiology: 'disminución del apetito referida en la entrevista',
        sign: 'consumo registrado de 1200 kcal en el día evaluado',
        indicator: 'Consumo energético registrado en kcal/día',
        baseline: '1200 kcal en el día evaluado; confirmar representatividad',
        target: '', timeframe: '', monitoring: 'Revisar registro de consumo con el profesional',
        feasibility: '', agreement: 'pending',
      },
      evidence: [{ source: 'PES actual aprobado · Signos y síntomas', finding: 'consumo registrado de 1200 kcal en el día evaluado' }],
    }] },
  };
  return {
    generationId: crypto.randomUUID(),
    status: "succeeded",
    replay: false,
    output:
      request.feature === "pes_diagnosis"
        ? {
            problem: "Ingesta oral insuficiente",
            etiology: "disminución del apetito referida en la entrevista",
            signsSymptoms: ["consumo registrado de 1200 kcal en el día evaluado"],
            pesStatement: "Borrador de prueba para revisión profesional.",
            evidence: [
              { source: "Entrevista · Apetito", finding: "La persona refiere disminución del apetito." },
              { source: "Recordatorio confirmado", finding: "Consumo registrado de 1200 kcal en el día evaluado." },
            ],
            missingContext: ["Cantidades del recordatorio por precisar"],
            uncertainties: [
              "Información de prueba; no es un diagnóstico clínico",
            ],
          }
        : {
            confidence: 'low',
            assumptions: ['Para la leche se asumió un vaso de 240 ml.', 'Se estimaron porciones domésticas para el arroz y los frijoles.'],
            uncertainties: ['Confirmar la cantidad de arroz y frijoles y cómo se prepararon las alitas.'],
            meals: [
              { mealLabel: 'Desayuno', description: 'Dos gorditas de chicharrón con papa y un vaso de refresco.', energy_kcal: 700, protein_g: 18, carbohydrate_g: 80, fat_g: 34 },
              { mealLabel: 'Comida', description: 'Alitas, dos tortillas, arroz, frijoles y agua de limón; las porciones faltantes son supuestas.', energy_kcal: 850, protein_g: 36, carbohydrate_g: 105, fat_g: 32 },
              { mealLabel: 'Cena', description: 'Una lata de atún con jitomate y cebolla, galletas saladas y un vaso de leche.', energy_kcal: 490, protein_g: 39, carbohydrate_g: 42, fat_g: 18 },
            ],
          },
  };
}
export async function removeClinicalRecall() {
  const records = JSON.parse(localStorage.getItem('qa-clinical-records') || '{}');
  delete records.recall; delete records.pes;
  localStorage.setItem('qa-clinical-records', JSON.stringify(records));
}

// Strategy preview uses localStorage only; no database or provider calls.
import { emptyStrategy, type StrategyDocument } from '../../../supabase/functions/_shared/interventions';
import type { InterventionAction, InterventionItem, InterventionWorkspace } from '../../src/services/clinicalInterventions';
export function seedInterventionPreview() {
 const now = new Date().toISOString();
 const pes = { approved_at: now, problem: 'Conocimientos insuficientes para organizar colaciones', etiology: 'ausencia de orientación práctica previa', signsSymptoms: ['No identifica opciones para la jornada laboral'], pesStatement: 'Conocimientos insuficientes para organizar colaciones relacionados con ausencia de orientación práctica previa, evidenciados por dificultad para identificar opciones.' };
 const plan: ObjectivePlan = {version:1,pesApprovedAt:now,goals:[{outcome:'Identificar opciones de colación que pueda preparar',etiology:pes.etiology,sign:pes.signsSymptoms[0],indicator:'Opciones explicadas por la persona',baseline:'No identifica opciones en la entrevista sintética',target:'Explicar tres opciones compatibles con sus recursos',timeframe:'Al finalizar la sesión educativa',monitoring:'Comprobación práctica de comprensión',feasibility:'Usar alimentos habituales y preparación sencilla',agreement:'patient'}]};
 localStorage.setItem('qa-clinical-records',JSON.stringify({pes}));
 localStorage.setItem('qa-pes-parts',JSON.stringify({pes_problem:pes.problem,pes_etiology:pes.etiology,pes_evidence:pes.signsSymptoms.join('\n'),pes_statement:pes.pesStatement}));
 localStorage.setItem('qa-clinical-objective',JSON.stringify({approved_at:now,question_key:'treatment_objective',value:'Objetivo sintético revisado',content:'Objetivo sintético revisado',pes_statement:pes.pesStatement,pes_approved_at:now,revision:1,smart_plan:plan}));
 localStorage.setItem('qa-objective-plans',JSON.stringify({treatment_objective:plan}));
 localStorage.setItem('qa-interventions','[]');
 sessionStorage.removeItem('intervention-drafts:synthetic-consultation:1');
 sessionStorage.removeItem('clinical-pending:synthetic-consultation:1:intervention_strategy');
}
function syntheticStrategy(): StrategyDocument {
 const pes=JSON.parse(localStorage.getItem('qa-clinical-records')||'{}').pes;
 const objective=JSON.parse(localStorage.getItem('qa-clinical-objective')||'null');
 return {version:1,pesApprovedAt:pes?.approved_at??'',objectiveApprovedAt:objective?.approved_at??'',strategy:{...emptyStrategy(),category:'education',goalIndexes:[0],title:'Sesión práctica para organizar colaciones',action:'Explorar y practicar opciones de colación para la jornada laboral.',etiologyLink:'La orientación práctica aborda la ausencia previa de educación.',method:'Construir ejemplos con los alimentos que la persona reconoce como accesibles.',frequency:'Una sesión inicial y revisión en seguimiento',duration:'Durante el periodo acordado',startDate:'En esta consulta, tras acordarlo',responsible:'Nutriólogo tratante',executor:'Nutriólogo con participación del paciente',adaptations:'Usar alimentos habituales y preparaciones sencillas.',monitoring:'La persona explica las opciones que prepararía.',reviewAt:'Al finalizar la sesión y en la siguiente consulta',adjustmentCriteria:'Revisar si persisten dudas o aparecen barreras de acceso.',educationTopic:'Organización práctica de colaciones',materials:'Ejemplos de combinaciones y lista de opciones',comprehensionCheck:'Pedir que explique cómo prepararía sus opciones.',referenceIds:['academy-intervention','academy-monitoring'],evidence:[{source:'Objetivo aprobado · 1',finding:'Identificar opciones de colación que pueda preparar'}],missingContext:['Confirmar el acuerdo con la persona antes de aprobar.']}};
}
export async function clinicalInterventions(_consultation:string,revision:number,action:InterventionAction='read',data:Record<string,unknown>={}):Promise<InterventionWorkspace> {
 const w=await clinicalObjective(_consultation,revision);
 let items:InterventionItem[]=JSON.parse(localStorage.getItem('qa-interventions')||'[]');
 const id=data.id as string;let item=items.find(i=>i.id===id);const now=new Date().toISOString();
 if(action!=='read'){
  if(item&&data.expectedUpdatedAt!==item.updated_at)throw new Error('Esta estrategia cambió. Actualiza el contexto.');
  if(action==='delete')items=items.filter(i=>i.id!==id);
  else if(action==='save'||action==='approve'){
   const document=data.document as StrategyDocument;
   if(!item){item={id,draft:null,approved:null,version:0,updated_at:now,state:'draft',requiresReview:false,execution:{},history:[]};items.push(item);}
   if(action==='save')item.draft=document;
   else {if(!w.pes||!w.objective)throw new Error('Aprueba primero el PES y los objetivos.');item.version++;item.approved={document,version:item.version,approvedAt:now,goals:w.objective.smart_plan?.goals??[]};item.draft=null;item.state='approved';item.execution={};item.history.unshift({id:crypto.randomUUID(),action,version:item.version,recorded_at:now,payload:item.approved});}
  }else if(item){
   if(action==='revert')item.draft=null;
   if(action==='start'){item.state='executing';item.execution={...item.execution,startDate:String(data.startDate),executor:String(data.executor)};}
   if(action==='communicate')item.execution.communication={recipient:String(data.recipient),recordedAt:now};
   if(action==='complete')item.state='completed';if(action==='withdraw')item.state='withdrawn';
   item.history.unshift({id:crypto.randomUUID(),action,version:item.version,recorded_at:now,payload:{reason:data.reason,recipient:data.recipient}});
  }
  if(item)item.updated_at=now;
  localStorage.setItem('qa-interventions',JSON.stringify(items));
 }
 items=items.map(item=>({...item,requiresReview:['approved','executing'].includes(item.state)&&!!item.approved&&(!!item.draft||item.approved.document.pesApprovedAt!==w.pes?.approved_at||item.approved.document.objectiveApprovedAt!==w.objective?.approved_at)}));
 return {...w,items};
}
