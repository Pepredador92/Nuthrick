import { describe, expect, it } from 'vitest';
import { buildPdfLibrary, parseIngredient } from '../../../../scripts/build-pdf-library';
import { currentTargets, libraryNutrition, referenceMacros } from './model';
describe('curated PDF import',()=>{
 it('parses fractions without matching banana as a tuna can',()=>{
   expect(parseIngredient('½ plátano')?.amount).toBe(0.5);
   expect(parseIngredient('1 lata de atún en agua escurrida')).toBeNull();
   expect(parseIngredient('⅓ de taza de frijoles')?.amount).toBeCloseTo(1/3);
 });
 it('omits scoops, clinical information, duplicate supplement variants and invented calendars',()=>{
   const bases=buildPdfLibrary(); expect(bases).toHaveLength(21);
   const serialized=JSON.stringify(bases);
   for(const forbidden of ['ISO100','scoop','patient_id','consultation_id','15524400','hotmail','medicamento','Helicobacter']) expect(serialized).not.toContain(forbidden);
   for(const base of bases) {
     expect(base.content.menu.week_plan?.days).toHaveLength(1);
     expect(base.content.distribution.meal_times).toHaveLength(3);
     if(base.ready) expect(referenceMacros(base.content.reference_targets)).not.toBeNull();
     else expect(libraryNutrition(base.content)[0].totals).toBeNull();
   }
 });
 it('does not equate documented energy targets with calculated food contributions',()=>{
   const base=buildPdfLibrary().find(x=>x.provenance.declared_energy?.includes('1,400'))!;
   expect(base).toBeDefined(); expect(base.content.reference_targets).toBeNull();
   expect(base.provenance.notes.join(' ')).toContain('cantidad');
 });
 it('keeps imported macro goals aligned with whole-kcal plan storage',()=>{
   const target=buildPdfLibrary().find(x=>x.ready)!.content.reference_targets!;
   const macro=referenceMacros(target)!;
   expect(macro.target_energy_kcal).toBe(Math.round(target.energy_kcal));
   expect(currentTargets({target_calories:Math.round(target.energy_kcal),macro_distribution:macro})).not.toBeNull();
 });
});
