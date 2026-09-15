/** Deterministic curated import. No DB calls and no patient identifiers.
 * Run with Vite's module runner (scripts/run-library-import.mjs).
 */
import sources from './data/library-pdf-recipes.json';
import catalog from './data/library-food-snapshots.json';
import { normalizeCatalogPortion } from '../frontend/src/features/menu/units';
import { createFoodSnapshot, exchangeContributionForFood, createDietMenu } from '../frontend/src/features/menu/model';
import { createMealDistribution, createMealTime, calculateDerivedMealTotals } from '../frontend/src/features/meal-distribution/model';
import { calculateExchangeTotals } from '../frontend/src/features/exchanges/model';
import { makeLibraryContent, libraryNutrition, libraryReady, type DietLibraryItem } from '../frontend/src/features/diet-library/model';
import type { DietMenuEntry, FoodItem, FoodUnitCode, MealOption } from '../frontend/src/types/domain';

const fractions: Record<string, number> = { '¼': 1/4, '½': 1/2, '¾': 3/4, '⅓': 1/3, '⅔': 2/3, '⅛': 1/8, '⅙': 1/6 };
const foods = new Map(catalog.map(f => [f.stable_code, normalizeCatalogPortion({ ...f, is_custom: false, owner_id: null } as unknown as FoodItem)]));
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function parseIngredient(text: string) {
  const match = text.trim().match(/^(\d+)?([¼½¾⅓⅔⅛⅙])?(?:\s+|(?=[a-z]))(.*)$/i);
  if (!match || (!match[1] && !match[2])) return null;
  let amount = Number(match[1] ?? 0) + (fractions[match[2]] ?? 0);
  let rest = normalize(match[3]).replace(/[.]$/, '');
  let unit: FoodUnitCode = 'piece';
  for (const [pattern, code] of [[/^g de /,'g'],[/^tazas?(?: de)? /,'cup'],[/^de taza(?: de)? /,'cup'],[/^cucharaditas?(?: de)? /,'teaspoon'],[/^cucharadas?(?: de)? /,'tablespoon'],[/^rebanadas?(?: de)? /,'slice']] as [RegExp,FoodUnitCode][]) {
    if (pattern.test(rest)) { unit=code; rest=rest.replace(pattern,''); break; }
  }
  rest = rest.replace(/^de /,'');
  // A printed choice isn't permission to silently choose either ingredient.
  if (/\so\s|\blata\b|scoop|iso100|^leche$|yogur|yogurt|^fruta|bolillo|soya|cherry/.test(rest)) return null;
  let code: string | null = null;
  if (/^tortillas?/.test(rest)) { code='MX_CORN_TORTILLA'; unit='tortilla'; }
  else if (/^tostadas/.test(rest)) code='MX_BAKED_TOSTADA';
  else if (/^huevos?/.test(rest)) code='MX_WHOLE_EGG';
  else if (/^claras?/.test(rest)) code='MX_EGG_WHITE';
  else if (/^frijoles/.test(rest)) code='MX_COOKED_BEANS';
  else if (/^aguacate/.test(rest)) code='MX_AVOCADO';
  else if (/^platano/.test(rest)) code='MX_BANANA';
  else if (/^papaya/.test(rest)) code='MX_PAPAYA';
  else if (/^manzana/.test(rest)) code='MX_APPLE';
  else if (/^guayaba/.test(rest)) code='MX_GUAVA';
  else if (/^naranja/.test(rest)) code='MX_ORANGE_SEGMENTS';
  else if (/^pollo cocido|^pollo deshebrado/.test(rest)) code='MX_COOKED_CHICKEN_BREAST';
  else if (/^papa mediana/.test(rest)) code='MX_COOKED_POTATO';
  else if (/^arroz integral cocido/.test(rest)) code='MX_COOKED_BROWN_RICE';
  else if (/^arroz cocido/.test(rest)) code='MX_COOKED_WHITE_RICE';
  else if (/^pasta integral cocida/.test(rest)) code='MX_COOKED_WHOLE_WHEAT_PASTA';
  else if (/^pasta cocida/.test(rest)) code='MX_COOKED_PASTA';
  else if (/^leche entera/.test(rest)) code='MX_WHOLE_MILK';
  else if (/^leche descremada/.test(rest)) code='MX_SKIM_MILK';
  else if (/^queso panela/.test(rest)) code='MX_PANELA_CHEESE';
  else if (/^verduras/.test(rest)) code='MX_MIXED_VEGETABLES';
  else if (/^nopales con/.test(rest)) code='MX_MIXED_VEGETABLES';
  else if (/^nopales$/.test(rest)) code='MX_COOKED_NOPAL';
  else if (/^avena cruda/.test(rest) && unit==='cup') code='MX_ROLLED_OATS';
  else if (/^crema de cacahuate/.test(rest)) code='MX_PEANUT_BUTTER';
  else if (/^aceite de oliva/.test(rest)) code='MX_OLIVE_OIL';
  else if (/^aceite$/.test(rest)) code='MX_VEGETABLE_OIL';
  else if (/^pan integral/.test(rest)) code='MX_WHOLE_WHEAT_BREAD';
  if (!code) return null;
  const food=foods.get(code)!;
  if (unit==='tablespoon' && food.portion_unit==='teaspoon') { amount*=3; unit='teaspoon'; }
  if (unit!==food.portion_unit) {
    const alternate=food.alternate_portions.find(a => a.unit===unit);
    if (!alternate) return null;
    amount=amount/alternate.amount*Number(food.portion_amount); unit=food.portion_unit;
  }
  return { food, amount, unit };
}
export function buildPdfLibrary() {
  // Omitting the supplement makes sources 01 and 03 the same three diets.
  // Keep the original food-only versions; don't create duplicate library cards.
  return sources.filter(source => !source.code.startsWith('PDF01-')).map(source => {
    const pending: string[]=[];
    const assumptions: string[]=[];
    const distribution=createMealDistribution();
    distribution.meal_times=source.meals.map((meal,i)=>createMealTime(meal.time,i,null,`${source.code}-meal${i}`));
    distribution.distribution=[];
    const menu=createDietMenu(distribution,()=>`${source.code}-menu`);
    const options: MealOption[]=source.meals.map((meal,i)=> {
      const mealId=distribution.meal_times[i].id;
      let raw=meal.ingredients.replace(/[.]$/, '');
      if (/Opción A:/.test(raw)) {
        assumptions.push(`${meal.time}: se calcula únicamente la opción A. Alternativa no sumada: ${raw.split('Opción B:')[1]}`);
        raw=raw.split('Opción B:')[0].replace('Opción A:','').trim().replace(/[.]$/,'');
      }
      const segments=raw.split(/,\s*|\s+y\s+(?=[\d¼½¾⅓⅔⅛⅙])/);
      if(source.code==='PDF07-D1' && i===2) { segments.push('1 naranja'); assumptions.push('Cena: se estima una naranja pequeña mencionada en la preparación sin cantidad.'); }
      if(source.code==='PDF10-D2' && i===2) { segments.push('1 cucharadita de aceite de oliva'); assumptions.push('Cena: se incluye la cucharadita de aceite indicada en la preparación.'); }
      const resolved: NonNullable<ReturnType<typeof parseIngredient>>[]=[];
      const unresolved: string[]=[];
      for (const segment of segments) {
        if (/scoop|ISO100/i.test(segment)) continue;
        const notes: string[]=[];
        const value=estimateIngredient(segment, notes); if (value) resolved.push(value); else { unresolved.push(segment); pending.push(`${meal.time}: ${segment}`); }
        assumptions.push(...notes.map(note=>`${meal.time}: ${note}`));
      }
      const recipeItems=resolved.map(({food,amount,unit})=>({amount,unit,food_snapshot:createFoodSnapshot(food),exchange_contribution:exchangeContributionForFood(food,amount)}));
      const entries: DietMenuEntry[]=[];
      if (recipeItems.length) entries.push({ id:`${source.code}-${i}-recipe`,type:'recipe',source_id:`${source.code}-${i}`,name_snapshot:meal.name,quantity:1,unit:'recipe_serving',exchange_contributions:recipeItems.flatMap(x=>x.exchange_contribution),recipe_snapshot:{recipe_id:`${source.code}-${i}`,name:meal.name,servings:1,instructions:meal.preparation,source:'NUTHRICK_PDF_RECIPE_IMPORT',items:recipeItems} });
      unresolved.forEach((text,j)=>entries.push({id:`${source.code}-${i}-pending${j}`,type:'food',source_id:`unresolved-${source.code}-${i}-${j}`,name_snapshot:`Por verificar: ${text}`,quantity:1,unit:'serving',exchange_contributions:[]}));
      for (const entry of entries) for(const contribution of entry.exchange_contributions) {
        const existing=distribution.distribution.find(r=>r.meal_time_id===mealId && r.group_code===contribution.group_code);
        if(existing) existing.portions+=contribution.portions;
        else distribution.distribution.push({meal_time_id:mealId,...contribution});
      }
      menu.menus[0].meal_menus[i].entries=entries;
      return {id:`${source.code}-option${i}`,meal_time_id:mealId,name:meal.name,entries,revision:1,status:'draft',confirmed_at:null,prescription_key:null};
    });
    menu.meal_options=options;
    menu.week_plan={schema_version:1,days:[{day:'mon',assignments:options.map(o=>({meal_time_id:o.meal_time_id,option_id:o.id,option_snapshot:o,fixed:false}))}]};
    distribution.derived_meal_totals=calculateDerivedMealTotals(distribution.distribution,distribution.meal_times);
    const content=makeLibraryContent({target_calories:null,macro_distribution:null,meal_distribution:distribution,diet_menu:menu,exchange_prescription:null});
    const groups=new Map<string,number>();
    for(const row of distribution.distribution) groups.set(row.group_code,(groups.get(row.group_code)??0)+row.portions);
    content.exchange_groups=[...groups].map(([group_code,portions])=>({group_code:group_code as typeof content.exchange_groups[number]['group_code'],portions}));
    const totals=libraryNutrition(content)[0]?.totals;
    if(totals) content.reference_targets={...totals,energy_kcal:totals.protein_g*4+totals.carbohydrate_g*4+totals.fat_g*9};
    content.estimation={method:'Promedios por equivalentes del catálogo Nuthrick. Estimación orientativa, no análisis exacto ni recomendación clínica.',assumptions:['Porciones domésticas y aportes promedio del catálogo; pueden variar por marca, preparación y tamaño. No se incluyen suplementos de proteína.',...new Set(assumptions)],sources:['Catálogo SMAE / NOM-037-SSA2-2012 de Nuthrick','https://smartlabel.pepsico.info/030000010204-0001-en-US/index.html']};
    if(pending.length) throw new Error('Ingredientes sin estimación explícita: '+pending.join('; '));
    const kcal=totals ? Math.round(totals.energy_kcal) : 0;
    return {name:`${mealTitles[source.code] ?? source.meals[0].name} · ${kcal} kcal`,content,provenance:{kind:'provided_pdf',source_key:source.code,import_version:2,label:'Colección de cocina cotidiana · Nuthrick',declared_energy:source.declared_energy??undefined,
      target_basis:'Aportes aproximados calculados por equivalentes. Los objetivos de referencia usan energía 4/4/9; no son la meta declarada en el documento.',
      notes:['Dieta de un día editable. Revisar ingredientes, porciones y adecuación al paciente.','No se añade aceite ni azúcar que no figure en los ingredientes o con cantidad explícita en la preparación. Las verduras mixtas incluyen la guarnición; condimentos sin cantidad no se contabilizan por separado.']},ready:libraryReady(content),known_totals:calculateExchangeTotals(content.exchange_groups)};
  });
}

const mealTitles: Record<string,string>={
 'PDF02-D1':'Huevos con frijoles y tacos de res','PDF02-D2':'Avena y quesadillas de pollo',
 'PDF03-D1':'Avena con plátano y pollo con arroz','PDF03-D2':'Huevos, res y tostadas de atún','PDF03-D3':'Molletes y pasta con pollo',
 'PDF04-D1':'Huevos con fruta y res con papa','PDF04-D2':'Mollete con huevo y quesadillas','PDF04-D3':'Avena y tacos de carne',
 'PDF05-D1':'Huevos con leche y tostadas de atún','PDF05-D2':'Molletes y guisado de res','PDF05-D3':'Avena cremosa y pasta con pollo',
 'PDF06-D1':'Cocina casera con pollo y res','PDF06-D2':'Avena con fruta y carne con arroz',
 'PDF07-D1':'Huevos con frijoles y tacos con queso','PDF07-D2':'Avena con plátano y tacos de huevo',
 'PDF09-D1':'Avena con soya y tacos de carne','PDF09-D2':'Tostadas con huevo y pasta con res',
 'PDF10-D1':'Huevos con yogurt y quesadillas de bistec','PDF10-D2':'Toast de huevo y pescado con pasta',
 'PDF11-D1':'Avena con soya y pollo con arroz','PDF11-D2':'Tostadas con frijoles y tacos de pollo',
};

/** Explicit, user-authorized approximations. Never applied to unrelated patient data. */
export function estimateIngredient(original: string, notes: string[]) {
  let text=original.trim();
  if (/scoop|ISO100/i.test(text)) return null;
  if (/Oaxaca light o panela/.test(text)) { text=text.replace('Oaxaca light o panela','panela'); notes.push(`${original}: se usa panela como alternativa de referencia.`); }
  else if (/\so\s/.test(text)) { text=text.split(/\so\s/)[0]; notes.push(`${original}: se calcula solo «${text}», no ambas alternativas.`); }
  const direct=parseIngredient(text); if(direct) return direct;
  const normalized=normalize(text);
  const match=text.match(/^(\d+)?([¼½¾⅓⅔⅛⅙])?/);
  const amount=Number(match?.[1]??0)+(fractions[match?.[2]??'']??0);
  const known=(code:string,quantity:number,unit:FoodUnitCode,note:string)=>{
    const food=foods.get(code); if(!food) throw new Error(`Missing catalog food ${code}`);
    notes.push(`${original}: ${note}`); return {food,amount:quantity,unit};
  };
  if(/carne de res|bistec/.test(normalized)) return known('MX_COOKED_LEAN_BEEF',amount,'g','peso interpretado como cocido, corte magro; promedio del catálogo.');
  if(/pescado blanco/.test(normalized)) return known('MX_COOKED_WHITE_FISH',amount,'g','peso interpretado como pescado blanco cocido.');
  if(/lata.*atun/.test(normalized)) return known('MX_TUNA_WATER_DRAINED',100*amount,'g','se estiman 100 g drenados por lata; verificar presentación.');
  if(/avena cruda/.test(normalized)) return known('MX_ROLLED_OATS',amount/80,'cup',`${amount} g ≈ ${amount/80} taza; conversión 40 g = ½ taza (Quaker), aporte por equivalentes del catálogo.`);
  if(/bolillo/.test(normalized)) return known('MX_BOLILLO_NO_CRUMB',amount,'piece','se usa el bolillo sin migajón del catálogo como aproximación.');
  if(/bebida de soya/.test(normalized)) return known('MX_SMAE_MILK_SKIM_BEBIDA_DE_SOYA',amount,'cup','bebida de soya del catálogo, aporte promedio; verificar marca y azúcar.');
  if(/leche/.test(normalized)) return known('MX_SEMI_SKIM_MILK',amount,'cup','al no indicarse tipo, se estima leche semidescremada.');
  if(/yogur/.test(normalized)) return known('MX_NATURAL_SKIM_YOGURT',amount,'cup','se estima yogurt natural descremado sin azúcar.');
  if(/fruta/.test(normalized)) return known(/taza/.test(normalized)?'MX_PAPAYA':'MX_APPLE',amount,/taza/.test(normalized)?'cup':'piece','fruta genérica representada por papaya si es taza o manzana pequeña si es pieza.');
  if(/ensalada|jitomates cherry/.test(normalized)) return known('MX_MIXED_VEGETABLES',amount,'cup','promedio de verduras del catálogo, sin aderezo.');
  if(/champinones/.test(normalized)) return known('MX_RAW_MUSHROOM',amount,'cup','champiñones medidos en crudo, sin aceite adicional.');
  if(normalized==='jitomate y cebolla') return known('MX_MIXED_VEGETABLES',0.25,'cup','se estima ¼ taza total de la guarnición sin cantidad indicada.');
  if(normalized==='cebolla y chile al gusto') return known('MX_MIXED_VEGETABLES',0.25,'cup','se estima ¼ taza total de cebolla y chile sin cantidad indicada.');
  if(normalized==='pepino') return known('MX_RAW_CUCUMBER',0.5,'cup','se estima ½ taza sin cantidad indicada.');
  if(normalized==='jitomate') return known('MX_TOMATO',0.5,'piece','se estima ½ pieza sin cantidad indicada.');
  if(/zanahoria y cebolla al gusto/.test(normalized)) return known('MX_MIXED_VEGETABLES',0.25,'cup','se estima ¼ taza total de la mezcla sin cantidad indicada.');
  if(/queso$/.test(normalized)) return known('MX_PANELA_CHEESE',amount,'g','queso genérico representado por panela.');
  return null;
}
