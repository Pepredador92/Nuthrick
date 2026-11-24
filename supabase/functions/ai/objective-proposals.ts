import { unsupportedPesNumbers } from '../_shared/pes.ts';
import { pesSignSource, pesEtiologySource } from '../_shared/clinical-batch.ts';

type Fact = {id:string;source:string;finding:string;consultation_date?:string|null};
type Context = {facts:Fact[];approvedPes?:{etiology:string;signsSymptoms:string}|null};
type Proposal = {
  outcome:string;etiologyRelation:string;indicator:string;target:string;timeframe:string;monitoring:string;feasibility:string;
  signFactId:string;baselineFactId:string;evidenceFactIds:string[];
};
type Normalized = Omit<Proposal,'signFactId'> & {
  etiology:string;baseline:string;sign:string;textStyle:'patient_v1';targetOrigin:'documented'|'proposed';
};
const object = (properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const text = (maxLength:number, minLength=0)=>({type:'string',maxLength,minLength});
// A completed JSON response may still contain prose cut to the string limit.
// Use the editor's capacity and require an ending in newly generated prose.
const sentenceEnding = '[^.\\s…][.!?]["»”)]*\\s*$';
const sentence = ()=>({...text(400,1),pattern:sentenceEnding});
const reference = {type:'string',pattern:'^f[1-9][0-9]?$'};
const properties = {
  outcome:sentence(),etiologyRelation:sentence(),indicator:sentence(),target:sentence(),timeframe:{type:'string',enum:['']},monitoring:sentence(),feasibility:sentence(),
  baselineFactId:{type:'string',pattern:'^(f[1-9][0-9]?)?$'},
  evidenceFactIds:{type:'array',minItems:1,maxItems:6,items:reference},
};
export const objectiveProposalsSchema=object({objectives:{type:'array',maxItems:3,items:object({...properties,signFactId:reference})}});
export const normalizedObjectiveProposalsSchema=object({objectives:{type:'array',maxItems:3,items:object({...properties,
  evidenceFactIds:{...properties.evidenceFactIds,maxItems:12},etiology:text(1500,1),baseline:text(400,1),sign:text(2000),
  textStyle:{type:'string',enum:['patient_v1']},targetOrigin:{type:'string',enum:['documented','proposed']},
})}});
const agreementFact=(fact:Fact)=>/^Entrevista · (objectives|next objectives|treatment objective|first actions|adjustments)(?: ·|$)/.test(fact.source);
// Adding a closing period to a documented fragment does not change its numbers
// or its status as an agreement. All other wording must remain literal.
const containsAgreement=(fact:Fact,value:string)=>{
  const fragment=value.trim().replace(/\.$/u,'');
  return agreementFact(fact) && !!fragment && fact.finding.includes(fragment);
};
const unsupported=(value:string,facts:Fact[])=>unsupportedPesNumbers({problem:value,etiology:'',signsSymptoms:[]},facts).length>0;
// A new behavioral proposal may contain planned frequencies and review dates.
// Clinical prescriptions still require a documented agreement, never a baseline.
const clinicalQuantity=/(?:\b(?:kg|kcal|kilocalor[ií]as?|calor[ií]as?|gramos?|mg|mcg|mmol|mmhg|ml|mililitros?|litros?|cm|cent[ií]metros?)\b|\b\d+(?:[.,]\d+)?\s*g\b)/iu;
const clinicalPrescription=(value:string)=>/\d/.test(value) && (clinicalQuantity.test(value) || (value.includes('%') && /peso|grasa|glucosa|presi[oó]n|prote[ií]na|carbohidrato/iu.test(value)));

export function objectiveBaseline(fact?: Pick<Fact,'finding'|'consultation_date'>) {
  const finding = fact?.finding.trim() ?? '';
  const date = fact?.consultation_date;
  const dated = date && /^\d{4}-\d{2}-\d{2}$/u.test(date) && !finding.includes(date) ? `${finding} (${date})` : finding;
  return (finding && (dated.length <= 400 ? dated : finding.length <= 400 ? finding : '')) ||
    'Establezcan el punto de partida con el primer registro de este objetivo.';
}

export const objectiveFeasibilityPrompt = 'Acuerden un paso que encaje en tu rutina y revisen qué podría facilitarlo o dificultarlo.';

export function normalizeObjectiveProposals(output:unknown,context:unknown) {
  const {objectives}=output as {objectives:Proposal[]};
  const {facts,approvedPes}=context as Context;
  if(!approvedPes) return objectives.length ? null : {objectives:[]};
  const result:Normalized[]=[];
  for(const raw of objectives) {
    if(raw.evidenceFactIds.some(id=>!facts.some(f=>f.id===id)))return null;
    const sign=facts.find(f=>f.id===raw.signFactId && pesSignSource(f.source));
    if(!sign || !approvedPes.signsSymptoms.split('\n').map(s=>s.trim()).includes(sign.finding))return null;
    const baseline=facts.find(f=>f.id===raw.baselineFactId && f.finding.length<=400);
    const ids=new Set(raw.evidenceFactIds);ids.add(sign.id);
    const etiology=facts.find(f=>pesEtiologySource(f.source) && f.finding===approvedPes.etiology);
    if(etiology)ids.add(etiology.id);
    if(baseline)ids.add(baseline.id);
    const targetAgreement=facts.find(f=>containsAgreement(f,raw.target));
    if(targetAgreement)ids.add(targetAgreement.id);
    const goal:Normalized={outcome:raw.outcome.trim(),etiologyRelation:raw.etiologyRelation.trim(),indicator:raw.indicator.trim(),target:raw.target.trim(),timeframe:'',
      monitoring:raw.monitoring.trim(),feasibility:raw.feasibility.trim(),baselineFactId:baseline?.id??'',evidenceFactIds:[...ids],
      etiology:raw.etiologyRelation.trim(),baseline:objectiveBaseline(baseline),sign:sign.finding,textStyle:'patient_v1',
      targetOrigin:targetAgreement?'documented':'proposed'};
    const evidence=facts.filter(f=>ids.has(f.id));
    if(!goal.feasibility || unsupported(goal.feasibility,evidence))goal.feasibility=objectiveFeasibilityPrompt;
    if(!objectiveProposalsValid({objectives:[goal]},context))return null;
    result.push(goal);
  }
  return {objectives:result};
}
export function objectiveProposalsValid(output:unknown,context:unknown):boolean {
  const {objectives}=output as {objectives:Normalized[]};
  const {facts,approvedPes}=context as Context;
  if(!approvedPes)return objectives.length===0;
  return objectives.every(goal=>{
    const evidence=facts.filter(f=>goal.evidenceFactIds.includes(f.id));
    if(evidence.length!==goal.evidenceFactIds.length || !goal.etiology.trim() || unsupported(goal.etiology,evidence) || !evidence.some(f=>pesSignSource(f.source) && f.finding===goal.sign))return false;
    if(!approvedPes.signsSymptoms.split('\n').map(s=>s.trim()).includes(goal.sign))return false;
    if(['outcome','indicator','target','monitoring','baseline','feasibility'].some(field=>!goal[field as keyof Normalized]?.toString().trim()) || goal.timeframe!=='')return false;
    if(goal.baselineFactId && !evidence.some(f=>f.id===goal.baselineFactId))return false;
    if(goal.targetOrigin==='documented' && !evidence.some(f=>containsAgreement(f,goal.target)))return false;
    for(const field of ['outcome','indicator','target','monitoring'] as const) {
      if(clinicalPrescription(goal[field]) && !evidence.some(f=>containsAgreement(f,goal[field])))return false;
    }
    return !unsupported(goal.feasibility,evidence);
  });
}
export const objectivePlanningReferences=[
  {title:'Academy · Metas SMART y atención individualizada',url:'https://www.eatrightpro.org/practice/nutrition-care-process/ncp-overview/nutrition-intervention'},
  {title:'Academy · Seguimiento y evaluación',url:'https://www.eatrightpro.org/practice/nutrition-care-process/ncp-overview/nutrition-monitoring-and-evaluation'},
  {title:'NIDDK · Apoyo conductual y seguimiento frecuente',url:'https://www.niddk.nih.gov/health-information/weight-management/adult-overweight-obesity/treatment'},
];
export const objectiveProposalInstructions=`
Propón de cero a tres objetivos nutricionales SMART a partir de la valoración actual y de los hechos registrados. Devuelve solo el JSON solicitado. Cada objetivo debe responder a la etiología y reevaluar un signo del PES. signFactId debe citar un hecho de «PES actual aprobado · Signos y síntomas». En etiologyRelation escribe en una oración cómo el cambio propuesto atiende la causa registrada. Conserva el grado de certeza de la causa. evidenceFactIds incluye las fuentes que sostienen el objetivo, incluida la causa y el contexto de viabilidad cuando corresponda. Para baselineFactId elige el mejor hecho fechado que describa el punto de partida de ese objetivo, cuando se conozca. Sin un hecho pertinente, deja baselineFactId vacío para indicar que el punto de partida se establecerá con el primer registro.

COMPLETA LA PROPUESTA. EL NUTRIÓLOGO ELIGE EL PLAZO
Completa resultado, relación con el diagnóstico, meta, indicador, punto de partida, método y viabilidad. Deja timeframe como cadena vacía. No indiques plazos de reevaluación en otros campos. Si existe una meta acordada, conserva su fragmento literal y cita su fuente. En caso contrario propón un criterio observable. Registra todas las acciones futuras como propuestas y deja pendiente el acuerdo con la persona.
Cuando el contexto incluya previousDraft, mantén la cantidad y el orden de los objetivos, salvo que las indicaciones profesionales pidan un cambio en el conjunto. Integra las especificaciones que se pidan en clinicalFeedback y conserva lo pertinente de cada objetivo. previousDraft describe lo que se va a revisar. Solo los hechos del contexto sustentan la propuesta.

La meta puede consistir en completar un registro útil, identificar un patrón o practicar un cambio factible vinculado al PES. En un autorregistro, concreta qué se anotará y un criterio verificable de suficiencia; puede proponer días de observación alcanzables, sin convertirlos en frecuencia actual. Evita metas universales o exigencias de perfección. No presentes la omisión compensatoria como estrategia para lograr un objetivo. El registro de episodios no equivale a diagnosticar un trastorno alimentario. No propongas por tu cuenta metas de peso, grasa corporal, glucosa, presión, kcal/macros, líquidos, suplementos, tratamientos o reanálisis de laboratorio: esos valores requieren un acuerdo clínico documentado. No conviertas una medición en una meta.

LENGUAJE QUE ENTENDERÁ EL PACIENTE
Todos los campos que redactes deben terminar en una oración completa con punto u otro signo de cierre, incluida la meta. Dispones de hasta 400 caracteres por campo; es capacidad, no una longitud que debas alcanzar. Prioriza una oración breve por campo y evita repetir detalles entre campos. Si necesitas resumir, reformula toda la idea: nunca cortes una palabra, dejes una frase abierta, termines en un conector ni uses puntos suspensivos para ocultar contenido faltante. Revisa especialmente el final de la meta y del método de seguimiento antes de devolver el JSON. Puedes añadir un punto de cierre a un fragmento literal de una meta acordada, sin cambiar sus parámetros. Si retomas un borrador anterior con texto incompleto, consulta los hechos originales; no copies su corte ni inventes el fragmento faltante.
Escribe outcome, target y monitoring con palabras cotidianas, trato de tú, frases breves y una sola acción principal por objetivo. Explica qué hacer, qué anotar y cómo se revisará. Evita «la persona realizará», «autorregulación», «plenitud», «disponibilidad temporal», «correlacionar», «adherencia» y repeticiones. Por ejemplo, usa «sentirte demasiado lleno», «comer rápido», «anota en un registro sencillo» o «revisaremos juntos». No des por hecho que tiene teléfono, una aplicación, apoyo familiar o acceso a llamadas. No inventes emociones ni uses lenguaje culpabilizante. No repitas la misma idea en todos los campos: outcome expresa el cambio; target cómo reconocer el avance; monitoring el método de registro y revisión. No escribas prefijos como «Meta:» dentro de los campos; la interfaz los agrega.

indicator describe claramente qué observarán. feasibility propone una forma concreta de adaptar el objetivo a las barreras, preferencias o apoyos registrados. Si estos datos faltan, sugiere qué decisión práctica revisar con la persona, sin asumir cuáles son sus recursos o barreras. El resumen compartido al paciente no incluye la etiología ni el texto clínico de la situación inicial; esos datos siguen en el editor profesional. Conserva las cifras históricas y los hechos fechados como antecedentes. No apruebes, guardes ni publiques los objetivos. Si falta PES aprobado o no hay base para un objetivo pertinente, devuelve objectives vacío.
`;

export const objectiveFollowupInstructions = `
OBJETIVOS EN SEGUIMIENTO
El servidor ya comprobó que existe un PES aprobado con etiología y signos. Basa las propuestas en esa causa y en los hallazgos actuales, contrastando los antecedentes cuando aporten información. Si no se conoce la frecuencia inicial de una conducta, puedes proponer observarla y registrarla para establecer el punto de partida, con un criterio de registro propuesto. No confundas la ausencia de una meta numérica previa con falta de base para cualquier objetivo. No exijas un recordatorio completo para objetivos que se sostienen con otros hechos. Evita repetir objetivos ya logrados o atribuir al paciente conductas no documentadas. Si realmente no hay una propuesta sustentable, devuelve la lista vacía; nunca inventes una para llenar el esquema.
`;
