import type { GrocerySchedule, GroceryItem } from '../../../../supabase/functions/_shared/groceries';
export type GroceryDraftRow = { name: string; quantity: number | null; unit: string; source: string; needsReview: boolean };
const key = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const fractions: Record<string, number> = { '½': .5, '¼': .25, '¾': .75, '⅓': 1/3, '⅔': 2/3, '⅛': .125 };
const unitMap: Record<string, [string, number]> = {
 g:['g',1], gr:['g',1], gramo:['g',1], gramos:['g',1], kg:['g',1000], kilogramo:['g',1000], kilogramos:['g',1000],
 ml:['ml',1], mililitro:['ml',1], mililitros:['ml',1], l:['ml',1000], litro:['ml',1000], litros:['ml',1000],
 taza:['taza',1], tazas:['taza',1], cucharada:['cucharada',1], cucharadas:['cucharada',1], cucharadita:['cucharadita',1], cucharaditas:['cucharadita',1],
 pieza:['pieza',1], piezas:['pieza',1], rebanada:['rebanada',1], rebanadas:['rebanada',1], vaso:['vaso',1], vasos:['vaso',1], unidad:['unidad',1], unidades:['unidad',1],
};
function numeric(raw: string): number {
 const text=raw.trim(); if(fractions[text])return fractions[text];
 const mixed=text.match(/^(\d+)\s+(.+)$/); if(mixed)return Number(mixed[1])+numeric(mixed[2]);
 if(text.includes('/')){const [a,b]=text.split('/').map(Number);return b>0?a/b:NaN;}return Number(text.replace(',','.'));
}
export function parseGroceryIngredient(source: string): GroceryDraftRow {
 const fallback: GroceryDraftRow = {name:source,quantity:null,unit:'',source,needsReview:true};
 // Ranges, alternatives and combined ingredients require professional interpretation.
 if(/\b(o|a gusto|al gusto|aprox(?:imadamente)?)\b|\d\s*[-–]\s*\d/i.test(source))return fallback;
 const match=source.trim().match(/^((?:\d+\s+)?\d+\/\d+|\d+\s*[½¼¾⅓⅔⅛]|[½¼¾⅓⅔⅛]|\d+(?:[.,]\d+)?)\s+(.+)$/);
 if(!match)return fallback;
 const quantity=numeric(match[1].replace(/(\d)([½¼¾⅓⅔⅛])/,'$1 $2')); if(!Number.isFinite(quantity)||quantity<=0)return fallback;
 const remainder=match[2].trim(), [word,...rest]=remainder.split(/\s+/), unit=unitMap[key(word)];
 const name=(unit?rest.join(' '):remainder).replace(/^de\s+/i,'').trim();
 if(!name || /\s(?:y|con)\s/i.test(name))return fallback;
 // Preserve preparation state and any parenthetical measure; do not assume raw yields or densities.
 return {name,quantity:quantity*(unit?.[1]??1),unit:unit?.[0]??'pieza',source,needsReview:!unit};
}
export function compileGroceries(diets: {id:string;title:string;text:string}[], schedule:GrocerySchedule): GroceryDraftRow[] {
 const result:GroceryDraftRow[]=[], grouped=new Map<string,GroceryDraftRow>();
 for(const diet of diets){const count=schedule.find(s=>s.diet_id===diet.id)?.days??0;if(count<=0)continue;
  const ingredients=diet.text.split('\n').filter(line=>/^\s*[•*\-]\s+/.test(line)).map(line=>line.replace(/^\s*[•*\-]\s+/,'').trim());
  if(!ingredients.length){result.push({name:`Revisar ingredientes de ${diet.title}`,quantity:null,unit:'',source:diet.text,needsReview:true});continue;}
  for(const ingredient of ingredients){const row=parseGroceryIngredient(ingredient);row.source=`${diet.title} × ${count}: ${ingredient}`;
   if(row.quantity!==null)row.quantity*=count;
   const id=`${key(row.name)}|${row.unit}`;
   const previous=grouped.get(id);
   if(previous&&row.quantity!==null&&previous.quantity!==null){previous.quantity+=row.quantity;previous.source+=`\n${row.source}`;previous.needsReview ||= row.needsReview;}
   else {result.push(row);if(row.quantity!==null)grouped.set(id,row);}
  }
 }
 return result.map(row=>({...row,quantity:row.quantity===null?null:Math.round(row.quantity*1000)/1000}));
}
export function validGroceryRows(rows: GroceryDraftRow[]): boolean {
 return rows.length>0&&rows.length<=400&&rows.every(r=>r.name.trim().length>0&&r.name.length<=180&&r.unit.trim().length>0&&r.unit.length<=40&&r.quantity!==null&&Number.isFinite(r.quantity)&&r.quantity>0&&r.quantity<=1000000);
}
export const groceryItems = (rows:GroceryDraftRow[]):GroceryItem[] => rows.map(r=>({name:r.name.trim(),quantity:r.quantity!,unit:r.unit.trim()}));
