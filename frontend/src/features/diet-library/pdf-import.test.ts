import { describe, expect, it } from 'vitest';
import { buildPdfLibrary, estimateIngredient, parseIngredient } from '../../../../scripts/build-pdf-library';
import { currentTargets, libraryNutrition, referenceMacros, copyLibraryWorkspace, makeLibraryContent } from './model';
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
   expect(base).toBeDefined(); expect(base.content.reference_targets).not.toBeNull();
   expect(base.content.reference_targets!.energy_kcal).not.toBe(1400);
   expect(base.provenance.notes.join(' ')).toContain('cantidad');
 });
 it('gives every base a descriptive unique name and complete estimated macros',()=>{
   const bases=buildPdfLibrary();
   expect(new Set(bases.map(b=>b.name)).size).toBe(21);
   for(const base of bases) {
     expect(base.name).not.toMatch(/PDF|D\d|página/i);
     expect(base.ready).toBe(true);
     const totals=libraryNutrition(base.content)[0].totals!;
     expect(totals.energy_kcal).toBeGreaterThan(900);
     expect(totals.energy_kcal).toBeLessThan(3500);
     for(const key of ['protein_g','carbohydrate_g','fat_g'] as const) expect(totals[key]).toBeGreaterThan(0);
     expect(base.content.estimation?.assumptions.length).toBeGreaterThan(0);
     expect(base.content.reference_targets!.energy_kcal).toBeCloseTo(4*totals.protein_g+4*totals.carbohydrate_g+9*totals.fat_g);
   }
 });
 it('makes portion assumptions explicit and does not count both printed alternatives',()=>{
   const notes:string[]=[];
   expect(estimateIngredient('1 lata de atún en agua escurrida',notes)?.amount).toBe(100);
   expect(notes.join(' ')).toContain('100 g drenados');
   const choice=estimateIngredient('1 taza de papaya o 1 manzana',notes)!;
   expect(choice.food.name).toContain('Papaya'); expect(choice.amount).toBe(1);
   expect(notes.join(' ')).toContain('no ambas alternativas');
   expect(estimateIngredient('40 g de avena cruda',notes)?.amount).toBe(0.5);
 });
 it('keeps imported macro goals aligned with whole-kcal plan storage',()=>{
   const target=buildPdfLibrary().find(x=>x.ready)!.content.reference_targets!;
   const macro=referenceMacros(target)!;
   expect(macro.target_energy_kcal).toBe(Math.round(target.energy_kcal));
   expect(currentTargets({target_calories:Math.round(target.energy_kcal),macro_distribution:macro})).not.toBeNull();
 });
 it('preserves estimation provenance when copying and saving a personal base',()=>{
   const content=buildPdfLibrary()[0].content;
   const workspace=copyLibraryWorkspace(content);
   expect(workspace.diet_menu.library_estimation).toEqual(content.estimation);
   const saved=makeLibraryContent({...workspace,target_calories:null,macro_distribution:null});
   expect(saved.estimation).toEqual(content.estimation);
 });
});
