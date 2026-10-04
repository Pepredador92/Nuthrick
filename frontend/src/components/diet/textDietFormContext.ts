import type {TextDietPreflight} from '@/src/services/textDietAI';
export function dietFactDate(origin?:{date?:string;historical?:boolean}) {
  if(!origin?.date)return '';
  const date=origin.date.slice(0,10).split('-').reverse().join('/');
  return `${origin.historical?'Antecedente':'Consulta'} del ${date}`;
}
export function dietRestrictionsSuggestion(context:TextDietPreflight['context']) {
  const {reaction_status:status,reactions}=context.restrictions;
  // A dietary preference alone cannot stand in for reviewing absent allergy data.
  if(status.fact.state!=='known'&&reactions.fact.state!=='known')return '';
  const rows:string[]=[];
  const add=(text:string,origin:Parameters<typeof dietFactDate>[0])=>rows.push(`${text}${dietFactDate(origin)?` (${dietFactDate(origin)})`:''}.`);
  if(status.fact.state==='known')add(`Reacciones alimentarias reportadas: ${status.fact.value}`,status.origin);
  if(reactions.fact.state==='known')add(`Reacciones registradas: ${reactions.fact.value.map(r=>`${r.food}: ${r.classification}${r.management?`; ${r.management}`:''}`).join('; ')}`,reactions.origin);
  const pattern=context.preferences.eating_pattern,foods=context.preferences.foods;
  if(pattern.fact.state==='known')add(`Patrón alimentario: ${pattern.fact.value.join(', ')}`,pattern.origin);
  if(foods.fact.state==='known')add(`Preferencias y exclusiones: ${foods.fact.value.map(f=>`${f.food}: ${f.category}`).join('; ')}`,foods.origin);
  const text=rows.join('\n');
  // Never truncate an allergy list mid-entry; ask the professional to summarize.
  return text.length<=1500?text:'';
}
