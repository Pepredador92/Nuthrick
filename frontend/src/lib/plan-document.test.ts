import {expect,it} from 'vitest';
import {buildPlanDocument,escapeLatex,planDocumentBlocks,planFileName,renderPlanPdf,renderPlanTex} from '../../../supabase/functions/agenda/plan-document';
const raw=(food:string,versionNumber:number)=>({versionNumber,publishedAt:'2026-09-21T18:00:00Z',snapshot:{plan:{title:'Plan_A #1 $500 50%'},patient:{full_name:'José & María'},professional:{full_name:'Nutrióloga Ñ',professional_title:'Nutrición'},prescription:{meal_distribution:{meal_times:[{id:'meal',display_name:'Comida',display_order:0}]}},calendar:[{day:'mon',assignments:[{meal_time_id:'meal',option_snapshot:{name:'Mi comida',entries:[{id:'food',name_snapshot:food,quantity:2,unit:'cup',food_snapshot:{group_code:'CEREALS_NO_FAT'}}]}}]}],debug:'SECRET'}});
it('projects only the immutable snapshot and uses the same clinical blocks for PDF and TEX',()=>{
 const one=buildPlanDocument(raw('Arroz',1),{}),two=buildPlanDocument(raw('Tortillas',2),{});
 expect(planDocumentBlocks(one).map(b=>b.text).join('\n')).toContain('Arroz - 2 taza');
 expect(renderPlanTex(one)).toContain('Arroz');expect(renderPlanTex(one)).not.toContain('Tortillas');
 expect(renderPlanTex(two)).toContain('Tortillas');expect(JSON.stringify(one)).not.toContain('SECRET');
 expect(new TextDecoder().decode(renderPlanPdf(one)).startsWith('%PDF')).toBe(true);
 expect(planFileName(one,'pdf')).toBe('plan_nutricional_jose_maria_v1_2026-09-21.pdf');
});
it('escapes every TeX metacharacter, preserves Spanish, and cannot inject user commands',()=>{
 expect(escapeLatex('José & María 50% Plan_A $500 #1 \\input{secret} ~^')).toBe('José \\& María 50\\% Plan\\_A \\$500 \\#1 \\textbackslash{}input\\{secret\\} \\textasciitilde{}\\textasciicircum{}');
 expect(renderPlanTex(buildPlanDocument(raw('Arroz',1),{}))).toContain('José \\& María');
});
it('rejects drafts or malformed versions instead of exporting partial clinical content',()=>{
 expect(()=>buildPlanDocument({snapshot:{}},{})).toThrow();
 expect(()=>buildPlanDocument({...raw('Arroz',1),versionNumber:0},{})).toThrow();
});
