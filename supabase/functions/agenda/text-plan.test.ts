import {strict as assert} from 'node:assert';
import {projectPortalPlan} from './portal-plan.ts';
import {buildPlanDocument,planDocumentBlocks,renderPlanPdf,renderPlanTex} from './plan-document.ts';
import type {TextDiet} from '../_shared/text-diet.ts';
Deno.test('published text is preserved across portal, PDF and TEX; source context stays private',()=>{
 const text='Desayuno\n• 2 tortillas\n• Huevo a la mexicana\nPreparación: cocinar.\nCambio profesional: 50% menos & sin queso.\n\\input{secret}';
 const draft:TextDiet={schema_version:1,requested_count:3,diets:[1,2,3].map(i=>({id:`d${i}`,title:`Dieta ${i}`,text:text+`\nDía ${i}`})),meals:[{name:'Desayuno',time:'08:00'}],reviewed_at:'2026-10-04T12:00:00Z',prescription:{target_calories:2000,macro_distribution:null}};
 const raw={versionNumber:1,publishedAt:'2026-10-04T12:00:00Z',snapshot:{text_diet:draft,plan:{title:'Plan de prueba'},patient:{full_name:'Paciente sintético'},professional:{full_name:'Profesional sintético'},prescription:{macro_distribution:null},clinical:{privateNote:'DO NOT SHARE'}}};
 const projection=projectPortalPlan(raw)!;assert.equal(projection.days.length,3);assert.equal(projection.days[0].text,draft.diets[0].text);assert.ok(!JSON.stringify(projection).includes('DO NOT SHARE'));assert.ok(!JSON.stringify(projection).includes('target_calories'));
 const model=buildPlanDocument(raw,{}),blocks=planDocumentBlocks(model);assert.equal(blocks.filter(b=>b.kind==='day').length,3);assert.ok(blocks.some(b=>b.text==='• 2 tortillas'));
 const tex=renderPlanTex(model);assert.ok(tex.includes('50\\% menos \\& sin queso'));assert.ok(tex.includes('\\textbackslash{}input\\{secret\\}'));assert.ok(!tex.includes('\\input{secret}'));
 const pdf=renderPlanPdf(model);assert.equal(new TextDecoder().decode(pdf.slice(0,4)),'%PDF');
 raw.snapshot.text_diet.reviewed_at=null;assert.throws(()=>projectPortalPlan(raw),/invalid_plan/);
});
