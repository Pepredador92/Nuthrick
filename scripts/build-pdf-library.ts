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
    const distribution=createMealDistribution();
    distribution.meal_times=source.meals.map((meal,i)=>createMealTime(meal.time,i,null,`${source.code}-meal${i}`));
    distribution.distribution=[];
    const menu=createDietMenu(distribution,()=>`${source.code}-menu`);
    const options: MealOption[]=source.meals.map((meal,i)=> {
      const mealId=distribution.meal_times[i].id;
      const raw=meal.ingredients.replace(/[.]$/, '');
      const segments=/Opci[oó]n [AB]:/.test(raw) ? [raw] : raw.split(/,\s*|\s+y\s+(?=[\d¼½¾⅓⅔⅛⅙])/);
      const resolved: NonNullable<ReturnType<typeof parseIngredient>>[]=[];
      const unresolved: string[]=[];
      for (const segment of segments) {
        if (/scoop|ISO100/i.test(segment)) continue;
        const value=parseIngredient(segment); if (value) resolved.push(value); else { unresolved.push(segment); pending.push(`${meal.time}: ${segment}`); }
      }
      // Instructions are not used to invent missing ingredient quantities.
      if (source.code==='PDF07-D1' && i===2) pending.push('Cena: la preparación menciona naranja sin cantidad en ingredientes.');
      const recipeItems=resolved.map(({food,amount,unit})=>({amount,unit,food_snapshot:createFoodSnapshot(food),exchange_contribution:exchangeContributionForFood(food,amount)}));
      const entries: DietMenuEntry[]=[];
      if (recipeItems.length) entries.push({ id:`${source.code}-${i}-recipe`,type:'recipe',source_id:`${source.code}-${i}`,name_snapshot:meal.name,quantity:1,unit:'recipe_serving',exchange_contributions:recipeItems.flatMap(x=>x.exchange_contribution),recipe_snapshot:{recipe_id:`${source.code}-${i}`,name:meal.name,servings:1,instructions:meal.preparation,source:'NUTHRICK_PDF_RECIPE_IMPORT',items:recipeItems} });
      unresolved.forEach((text,j)=>entries.push({id:`${source.code}-${i}-pending${j}`,type:'food',source_id:`unresolved-${source.code}-${i}-${j}`,name_snapshot:`Por verificar: ${text}`,quantity:1,unit:'serving',exchange_contributions:[]}));
      if (source.code==='PDF07-D1' && i===2) entries.push({id:`${source.code}-missing-orange`,type:'food',source_id:`unresolved-${source.code}-orange`,name_snapshot:'Por verificar: naranja mencionada en preparación, cantidad no indicada',quantity:1,unit:'serving',exchange_contributions:[]});
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
    return {name:`${source.code} · ${source.meals[0].name}`,content,provenance:{kind:'provided_pdf',label:`Documento aportado · ${source.code} · página ${source.page}`,declared_energy:source.declared_energy??undefined,
      target_basis:totals?'Referencia calculada a partir de ingredientes: energía 4/4/9 y gramos calculados por equivalentes. No es una distribución de macros declarada en el PDF.':'El documento no declara una distribución completa de macros. Falta verificar ingredientes antes de calcular el total y proponer objetivos.',
      notes:['Dieta de un día reutilizable; las etapas de varios días no se convirtieron en un calendario semanal.','Las cantidades domésticas explícitas se conservan. Los valores en gramos entre paréntesis no sustituyen la medida principal. Las mezclas de verduras usan el promedio del catálogo. Las sustituciones del PDF requieren nueva revisión.',...(pending.length?['Pendiente de correspondencia o cantidad: '+pending.join('; ')]:[])]},ready:libraryReady(content),known_totals:calculateExchangeTotals(content.exchange_groups)};
  });
}
