// Server-side patient projection. Raw clinical snapshots never reach the browser.
type ObjectValue = Record<string, unknown>;
const object = (v: unknown): ObjectValue => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('invalid_plan');
  return v as ObjectValue;
};
const list = (v: unknown, max: number): unknown[] => {
  if (!Array.isArray(v) || v.length > max) throw new Error('invalid_plan');
  return v;
};
const text = (v: unknown, max = 500): string => {
  if (typeof v !== 'string' || v.length > max) throw new Error('invalid_plan');
  return v;
};
const positive = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error('invalid_plan');
  return v;
};
const unitNames: Record<string, string> = {g:'g',ml:'ml',piece:'pieza',half:'mitades',cup:'taza',tablespoon:'cucharada',teaspoon:'cucharadita',slice:'rebanada',tortilla:'tortilla',glass:'vaso',serving:'porción',unit:'unidad',recipe_serving:'porción'};
const unit = (v: unknown) => {
  if (typeof v !== 'string' || !Object.hasOwn(unitNames,v)) throw new Error('invalid_plan');
  return unitNames[v];
};
const days: Record<string,string> = {mon:'Lunes',tue:'Martes',wed:'Miércoles',thu:'Jueves',fri:'Viernes',sat:'Sábado',sun:'Domingo'};
const canonical = (v: unknown) => JSON.stringify(v, (_key,value: unknown) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en'))) : value);
export type PortalPlanIngredient = {name:string;amount:number;unit:string;alternatives:{name:string;amount:number;unit:string}[]};
export type PortalPlan = {title:string;versionNumber:number;publishedAt:string;days:{name:string;meals:{name:string;time:string|null;title:string;ingredients:PortalPlanIngredient[];instructions:string[]}[]}[]};

export function projectPortalPlan(raw: unknown): PortalPlan | null {
  if (raw === null) return null;
  const published = object(raw), snapshot = object(published.snapshot);
  const distribution = object(object(snapshot.prescription).meal_distribution);
  const times = list(distribution.meal_times, 50).map(object);
  return {
    title:text(object(snapshot.plan).title), versionNumber:positive(published.versionNumber), publishedAt:text(published.publishedAt,50),
    days:list(snapshot.calendar,7).map(value=>{
      const day = object(value), dayCode = text(day.day,3);
      if (!Object.hasOwn(days,dayCode)) throw new Error('invalid_plan');
      return {name:days[dayCode], meals:list(day.assignments,50).map(object)
        .sort((a,b)=>Number(times.find(t=>t.id===a.meal_time_id)?.display_order||0)-Number(times.find(t=>t.id===b.meal_time_id)?.display_order||0))
        .map(applied=>{
          const meal = times.find(t=>t.id===applied.meal_time_id);
          if (!meal) throw new Error('invalid_plan');
          const option = object(applied.option_snapshot), entries = list(option.entries,200).map(object);
          const saved = option.patient_substitutions ? object(option.patient_substitutions) : null;
          const reviewed = saved?.schema_version===1 && saved.source_key===canonical(entries);
          const ingredients: PortalPlanIngredient[] = [], instructions: string[] = [], titles: string[] = [];
          const add = (key:string,name:unknown,amount:number,rawUnit:unknown,food:unknown) => {
            const group = food ? String(object(food).group_code||'') : '';
            const important = group.startsWith('AOA_') || group.startsWith('CEREALS_');
            const alternatives = reviewed && important ? object(saved!.ingredients)[key] || [] : [];
            ingredients.push({name:text(name),amount:positive(amount),unit:unit(rawUnit),alternatives:list(alternatives,20).map(value=>{
              const alt = object(value), alternativeFood = object(alt.food);
              if (alternativeFood.group_code!==group) throw new Error('invalid_plan');
              return {name:text(alternativeFood.name),amount:positive(alt.amount),unit:unit(alt.unit)};
            })});
          };
          for (const entry of entries) {
            const quantity = positive(entry.quantity), id = text(entry.id);
            if (entry.recipe_snapshot) {
              const recipe = object(entry.recipe_snapshot), factor = quantity/positive(recipe.servings);
              const items = list(recipe.items,200).map(object);
              const isDrink = entry.culinary_role ? entry.culinary_role==='drink' : Array.isArray(recipe.tags) && recipe.tags.includes('nuthrick:drink');
              if (!isDrink) titles.push(text(entry.name_snapshot));
              items.forEach((item,index)=>add(`${id}:${index}`,object(item.food_snapshot).name,positive(item.amount)*factor,item.unit,item.food_snapshot));
              if (!items.length) add(id,entry.name_snapshot,quantity,entry.unit,null);
              if (recipe.instructions) instructions.push(text(recipe.instructions,30000));
            } else add(id,entry.name_snapshot,quantity,entry.unit,entry.food_snapshot);
          }
          return {name:text(meal.display_name),time:meal.time ? text(meal.time,30):null,title:titles.join(' + ')||text(option.name||'Preparación del tiempo'),ingredients,instructions};
        })};
    }),
  };
}
