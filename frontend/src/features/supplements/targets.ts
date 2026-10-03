import {splitSupplementTargets} from '../../../../supabase/functions/_shared/supplements';
import type {NutritionPlan} from '../../types/domain';
export function dietNutritionSplit(plan: Pick<NutritionPlan,'target_calories'|'macro_distribution'>) {
 const m=plan.macro_distribution;
 return splitSupplementTargets({energy_kcal:plan.target_calories??0,carbohydrate_g:m?.macros?.CARBOHYDRATE?.grams??0,protein_g:m?.macros?.PROTEIN?.grams??0,fat_g:m?.macros?.FAT?.grams??0},m?.supplements??[]);
}
export const foodTargetsFor = (plan: Pick<NutritionPlan,'target_calories'|'macro_distribution'>) => dietNutritionSplit(plan).food;
