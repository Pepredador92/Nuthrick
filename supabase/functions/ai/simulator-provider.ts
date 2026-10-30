import { AIError, type AIProvider, type ProviderInput, type ProviderResult } from './core.ts';
import { strategyFields } from '../_shared/interventions.ts';
import { SimulatedDietProvider } from './diet-provider-test.ts';
import { instructionAgreement } from './clinical.ts';

type Fact={id:string;source:string;finding:string};
type Context={facts?:Fact[];approvedPes?:{etiology:string;signsSymptoms:string};approvedGoals?:{index:number}[];narrative?:string;format?:string;diet_count?:number;meal_schedule?:{name:string}[];selected_meal_indexes?:number[]};
const exampleMeal=(diet:number,meal:number)=>({
  title:`Ejemplo de platillo ${diet+1} · ${meal+1}`,
  ingredients:[`1 pieza de ${['manzana','pera','naranja','plátano','durazno','mandarina','guayaba'][diet%7]}`,'1 taza de avena cocida'],
  preparation:'Propuesta ficticia para explorar la revisión y edición del plan. Este contenido de demostración debe sustituirse para cualquier uso clínico.',
});
const nutrients={energy_kcal:null,protein_g:null,carbohydrate_g:null,fat_g:null};

/** No SDK, API key, network transport or paid model. This provider is selected
 * exclusively from a server-verified Auth app_metadata marker. Existing context,
 * schema/evidence checks, saved proposal recovery and approval guards remain. */
export class SimulatorExampleProvider implements AIProvider {
  countInput(){return Promise.resolve(1);}
  async run(input:ProviderInput):Promise<ProviderResult> {
    const context=input.context as Context;
    const facts=context.facts??[];
    const first=facts[0];
    let output:unknown;
    switch(input.config.feature){
      case 'pes_diagnosis': {
        if(!first)throw new AIError('context_unavailable');
        const props=input.schema.properties as Record<string,unknown>;
        const base={problem:'Patrón de alimentación irregular · ejemplo',etiology:'posibles barreras de organización alimentaria del caso ficticio',signsSymptoms:['irregularidad de las comidas descrita en el ejemplo de simulación'],missingContext:['Contenido ficticio para recorrer la interfaz; no es una valoración clínica de IA.']};
        output='priority' in props?{...base,evidenceFactIds:[first.id],priority:{text:'Ejemplo de priorización para explorar la revisión profesional.',evidenceFactIds:[first.id]},uncertainties:[]}:
          {...base,pesStatement:'',...('evidenceFactIds' in props?{evidenceFactIds:[first.id]}:{evidence:[{source:first.source,finding:first.finding}]}),uncertainties:[]};
        break;
      }
      case 'consultation_support': {
        const sign=facts.find(f=>f.source==='PES actual aprobado · Signos y síntomas');
        if(!sign)throw new AIError('pes_approval_required');
        const props=((input.schema.properties as Record<string,{items:{properties:Record<string,unknown>}}>).objectives.items.properties);
        const goal={outcome:'Anota cómo organizas tus comidas para reconocer qué puedes mejorar.',indicator:'Registro de horarios y dificultades para organizar las comidas.',target:'Completar un registro sencillo que podamos revisar juntos.',timeframe:'Revisarlo en 2 semanas, como propuesta por acordar.',monitoring:'Trae tu registro para conversar sobre lo que resultó fácil y lo que necesitas ajustar.',feasibility:'',baselineFactId:sign.id,evidenceFactIds:[sign.id]};
        output={objectives:['signFactId' in props?{...goal,signFactId:sign.id}:{...goal,etiology:context.approvedPes?.etiology??'',sign:sign.finding}]};
        break;
      }
      case 'intervention_strategy': {
        const goal=facts.find(f=>/^Objetivo (?:aprobado|en borrador) · /.test(f.source));
        if(!goal||!context.approvedGoals?.length)throw new AIError('strategy_planning_required');
        output={strategies:[{
          ...Object.fromEntries(strategyFields.filter(k=>!k.startsWith('reference')).map(k=>[k,''])),
          title:'Organiza tus comidas · ejemplo',action:'Prepara un registro sencillo de tus comidas para revisarlo en consulta.',
          etiologyLink:'Este ejemplo permite practicar cómo organizar las comidas y revisar las dificultades.',
          method:'Anota qué te resulta fácil y qué necesitas ajustar. Revisaremos juntos tus anotaciones.',
          monitoring:'Revisaremos el registro y las dificultades que quieras comentar.',category:'education',route:'not_applicable',priority:1,
          goalIndexes:[context.approvedGoals[0].index],evidenceFactIds:[goal.id],referenceIds:[],missingContext:['Estrategia ficticia de demostración; los acuerdos se revisan por separado.'],
        }]};
        break;
      }
      case 'patient_instructions': {
        const agreement=facts.find(f=>instructionAgreement(f.source));
        if(!agreement)throw new AIError('instruction_agreements_required');
        output={instructions:[{text:'Ejemplo de indicación: conserva tus anotaciones y tráelas a la siguiente revisión para conversar sobre tus avances y dificultades.',evidenceFactIds:[agreement.id]}]};
        break;
      }
      case 'recall_24h':
        output={meals:[{mealLabel:'Comida de ejemplo',description:'Registro ficticio para explorar la revisión del recordatorio.',energy_kcal:400,protein_g:20,carbohydrate_g:50,fat_g:13}],assumptions:['Valores ficticios de demostración; no calculados a partir de alimentos.'],uncertainties:['Utiliza estos datos únicamente para revisar la interfaz del simulador.'],confidence:'low'};
        break;
      case 'diet_draft': {
        if(context.format==='text_diet'){
          output={diets:Array.from({length:context.diet_count??1},(_,i)=>({meals:(context.meal_schedule??[]).map((_,j)=>exampleMeal(i,j))}))};
        }else if(context.format==='text_diet_edit'){
          const count=context.meal_schedule?.length??0;
          const estimate={nutrients,assumptions:['Valores de demostración, sin estimación nutricional real.']};
          output={baseline:Object.fromEntries(Array.from({length:count},(_,i)=>[`m${i}`,estimate])),replacements:Object.fromEntries((context.selected_meal_indexes??[]).map(i=>[`m${i}`,{...exampleMeal(1,i),...estimate}])),explanation:'Alternativa ficticia para explorar la comparación y aceptación de cambios. No se calcularon nutrientes ni se llamó a un modelo de IA.'};
        }else return new SimulatedDietProvider().run(input);
        break;
      }
      default:throw new AIError('feature_not_implemented');
    }
    return {status:'completed',output,usage:{input_tokens:0,output_tokens:0,cached_tokens:0},responseId:`simulation:${input.generationId}`,model:'nuthrick-simulation-examples-v1',latencyMs:0};
  }
}
