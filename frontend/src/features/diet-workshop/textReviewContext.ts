import type {DietContextSource} from './generationContext';

const answerKeys=['food_reactions_status','food_reactions_v2','food_preferences','eating_preferences','usual_pattern','daily_schedule','cooking_time','food_equipment'];
const goalKeys=['treatment_objective','objectives','next_objectives'];
const present=(v:unknown):boolean=>v!==null&&v!==undefined&&(typeof v!=='string'||!!v.trim())&&(!Array.isArray(v)||v.length>0);
const goalText=(v:unknown):string=>typeof v==='string'?v.trim():Array.isArray(v)?v.map(goalText).filter(Boolean).join('\n'):v&&typeof v==='object'&&'objetivo' in v?goalText(v.objetivo):'';

/** Only already-authorized visits from the server loader. Historical facts retain
 * their date; missing is never translated into "No" or a current confirmation. */
export function textDietReviewSource(source:DietContextSource) {
  const visits=[...(source.datedContext??[])].filter(v=>Number.isFinite(Date.parse(v.date)))
    .sort((a,b)=>Number(b.current)-Number(a.current)||b.date.localeCompare(a.date));
  const current=visits.find(v=>v.current);
  const answers={...source.answers};
  for(const key of answerKeys){
    if(present(answers[key]?.value)){
      if(current)answers[key]={...answers[key],recordedAt:current.date,historical:false};
      continue;
    }
    for(const visit of visits){
      const fact=visit.facts.find(f=>f.key===key&&present(f.value));
      if(fact){answers[key]={value:fact.value,response_area:'patient_reported',recordedAt:visit.date,historical:!visit.current};break;}
    }
  }
  let suggestion=source.objectiveSuggestion?.trim()??'';
  let suggestionOrigin: {date:string;historical:boolean}|undefined=suggestion&&current?{date:current.date,historical:false}:undefined;
  if(!suggestion)outer:for(const visit of visits){
    for(const key of goalKeys){
      const candidate=goalText(visit.facts.find(f=>f.key===key)?.value);
      if(candidate){suggestion=candidate.slice(0,1200);suggestionOrigin={date:visit.date,historical:!visit.current};break outer;}
    }
  }
  const priority=new Set([...answerKeys,...goalKeys]);
  return {source:{...source,answers,objectiveSuggestion:suggestion,
    // Keep restrictions and objectives inside the bounded history projection.
    datedContext:source.datedContext?.map(v=>({...v,facts:[...v.facts].sort((a,b)=>Number(priority.has(b.key))-Number(priority.has(a.key)))}))},suggestionOrigin};
}
