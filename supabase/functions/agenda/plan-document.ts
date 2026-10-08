import {projectPortalPlan,type PortalPlan} from './portal-plan.ts';
import {drawPrivateFooters,type ProfessionalDocumentInfo} from './document-letterhead.ts';
import {jsPDF} from 'jspdf';
import {DocumentLayout,type DocumentField} from './document-layout.ts';
export type PlanDocumentContext = {
 birthDate?:string;sex?:string;recordReference?:string;
 consultationLabel?:string;consultationDate?:string;
 pes?:string;objective?:string;instructions?:string;sharedAt?:string;
};

export type PublishedNutritionPlanDocumentModel = {
  templateVersion:'clinical-letterhead-v1'; patientName:string; professional:ProfessionalDocumentInfo; plan:PortalPlan;
  context?:PlanDocumentContext;
  nutrition?: {energy?:number;carbohydrate?:number;protein?:number;fat?:number};
};
const safeText=(v:unknown,max=12000):string=>{
  if(typeof v!=='string'||v.length>max) throw new Error('invalid_plan');
  // deno-lint-ignore no-control-regex -- strip non-printable characters from document text.
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
};
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('invalid_plan');return v as Record<string,unknown>;};
/** One patient-safe document model. Neither renderer reads editable plans. */
export function buildPlanDocument(raw:unknown,profile:unknown,context:PlanDocumentContext={}):PublishedNutritionPlanDocumentModel {
 const source=obj(raw),snapshot=obj(source.snapshot),identity=obj(snapshot.professional),p=obj(profile);
 const plan=projectPortalPlan(raw);
 if(!plan||!Number.isInteger(plan.versionNumber)||!Number.isFinite(Date.parse(plan.publishedAt)))throw new Error('invalid_plan');
 const optional=(v:unknown)=>v==null?null:safeText(v,1000);
 const prescription=obj(snapshot.prescription),distribution=prescription.macro_distribution as Record<string,unknown>|null;
 const macros=distribution?.macros as Record<string,{grams?:unknown}>|undefined;
 const nutrient=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:undefined;
 const patient=obj(snapshot.patient),consultation=snapshot.consultation?obj(snapshot.consultation):{};
 const identityContext:PlanDocumentContext={recordReference:optional(patient.id)??undefined,consultationDate:optional(consultation.date)??undefined,...context};
 return {templateVersion:'clinical-letterhead-v1',patientName:safeText(patient.full_name,200),plan,context:identityContext,
  nutrition:{energy:nutrient(prescription.target_calories),carbohydrate:nutrient(macros?.CARBOHYDRATE?.grams),protein:nutrient(macros?.PROTEIN?.grams),fat:nutrient(macros?.FAT?.grams)},
  professional:{fullName:safeText(identity.full_name,200),professionalTitle:optional(identity.professional_title),licenseNumber:optional(p.licenseNumber),businessName:optional(p.businessName),businessAddress:optional(p.businessAddress),contactLines:Array.isArray(p.contactLines)?p.contactLines.map(v=>safeText(v,1000)):[]}};
}
export const planFileName=(model:PublishedNutritionPlanDocumentModel,format:'pdf'|'tex')=>{
 const name=model.patientName.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,80)||'paciente';
 return `plan_nutricional_${name}_v${model.plan.versionNumber}_${model.plan.publishedAt.slice(0,10)}.${format}`;
};
export const planDate=(value:string)=>new Date(value).toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Mexico_City'});
const amount=(value:number)=>new Intl.NumberFormat('es-MX',{maximumFractionDigits:3}).format(value);
const macroAmount=(value:number)=>new Intl.NumberFormat('es-MX',{maximumFractionDigits:1}).format(value);
export type PlanDocumentBlock={kind:'day'|'meal'|'title'|'text'|'label'|'supplement-heading'|'supplement-title'|'supplement-text';text:string};
/** Shared clinical ordering and wording for PDF and TEX. */
export function planDocumentBlocks(model:PublishedNutritionPlanDocumentModel):PlanDocumentBlock[] {
 const blocks:PlanDocumentBlock[]=[];
 if(model.plan.supplements?.length){
  blocks.push({kind:'supplement-heading',text:'TU SUPLEMENTACIÓN'},{kind:'supplement-text',text:'Cantidades diarias indicadas por tu nutriólogo.'});
  for(const item of model.plan.supplements){
   blocks.push({kind:'supplement-title',text:item.name});
   const brand=[item.brand,item.presentation].filter(Boolean).join(' · ');
   if(brand)blocks.push({kind:'supplement-text',text:brand});
   blocks.push({kind:'supplement-text',text:item.quantity});
   if(item.instructions)blocks.push({kind:'supplement-text',text:item.instructions});
  }
 }
 for(const day of model.plan.days){
  blocks.push({kind:'day',text:day.name});
  if(day.text!==undefined){for(const line of day.text.split('\n'))blocks.push({kind:'text',text:line||' '});continue;}
  for(const meal of day.meals){
   blocks.push({kind:'meal',text:[meal.name,meal.time].filter(Boolean).join(' · ')},{kind:'title',text:meal.title});
   for(const i of meal.ingredients)blocks.push({kind:'text',text:`${i.name} - ${amount(i.amount)} ${i.unit}`});
   if(meal.instructions.length){blocks.push({kind:'label',text:'Preparación'});for(const text of meal.instructions)blocks.push({kind:'text',text});}
   const alternatives=meal.ingredients.filter(i=>i.alternatives.length);
   if(alternatives.length){blocks.push({kind:'label',text:'Sustituciones'},{kind:'text',text:'Elige una alternativa; no la agregues a la porción.'});for(const i of alternatives)blocks.push({kind:'text',text:`${i.name}: ${i.alternatives.map(a=>`${amount(a.amount)} ${a.unit} de ${a.name}`).join(' o ')}.`});}
  }
 }
 if(model.plan.shoppingList){
  const list=model.plan.shoppingList;
  blocks.push({kind:'day',text:'Tu carrito del súper'},{kind:'text',text:groceryPeriod(list)});
  for(const item of list.items)blocks.push({kind:'text',text:`${item.name} - ${amount(item.quantity)} ${item.unit}`});
 }
 return blocks;
}
function groceryPeriod(list:NonNullable<PortalPlan['shoppingList']>):string {
 return 'Para una persona · '+list.schedule.reduce((n,row)=>n+row.days,0)+' días. '+list.schedule.filter(row=>row.days>0).map(row=>`${row.title}: ${row.days} días`).join(' · ');
}
/** Date-only birth dates must never move to the previous day in Mexico. */
export function birthDateDetails(birthDate:string|undefined,reference:string):string|undefined {
 if(!birthDate||!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))return;
 const birth=new Date(`${birthDate}T12:00:00Z`);
 if(!Number.isFinite(birth.valueOf())||birth.toISOString().slice(0,10)!==birthDate)return;
 const ref=new Date(reference.length===10?`${reference}T12:00:00Z`:reference);
 if(!Number.isFinite(ref.valueOf()))return;
 const parts=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Mexico_City'}).formatToParts(ref);
 const part=(name:string)=>Number(parts.find(p=>p.type===name)?.value);
 const [year,month,day]=birthDate.split('-').map(Number);
 const age=part('year')-year-(part('month')<month||(part('month')===month&&part('day')<day)?1:0);
 if(age<0||age>130)return;
 return `${birth.toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})} · ${age} años`;
}
export function planIdentityFields(model:PublishedNutritionPlanDocumentModel):DocumentField[] {
 const c=model.context??{},birth=birthDateDetails(c.birthDate,c.consultationDate??model.plan.publishedAt);
 return [
  ...(birth?[{label:c.consultationDate?'Nacimiento · edad en la consulta':'Nacimiento · edad al publicar',value:birth}]:[]),
  ...(c.sex?[{label:'Sexo registrado',value:c.sex}]:[]),
  ...(c.recordReference?[{label:'Referencia de expediente Nuthrick',value:c.recordReference}]:[]),
  {label:'Consulta de origen',value:[c.consultationLabel,c.consultationDate?planDate(c.consultationDate):null].filter(Boolean).join(' · ')||'Sin consulta asociada'},
  {label:'Plan de alimentación',value:model.plan.title},
  {label:'Versión y publicación',value:`Versión ${model.plan.versionNumber} · ${planDate(model.plan.publishedAt)}`},
 ];
}
export function planClinicalFields(model:PublishedNutritionPlanDocumentModel):DocumentField[] {
 const c=model.context??{};
 return [
  ...(c.pes?[{label:'Diagnóstico nutricional PES · aprobado',value:c.pes}]:[]),
  ...(c.objective?[{label:'Objetivo acordado',value:c.objective}]:[]),
  ...(c.instructions?[{label:'Indicaciones para ti',value:c.instructions}]:[]),
  ...(c.sharedAt?[{label:'Objetivo e indicaciones compartidos',value:planDate(c.sharedAt)}]:[]),
 ];
}
export function renderPlanPdf(model:PublishedNutritionPlanDocumentModel,logo:string|null=null):Uint8Array {
 const pdf=new jsPDF({unit:'mm',format:'a4'}),layout=new DocumentLayout(pdf,model.professional,logo,{contacts:true,continuation:`${model.patientName} · Plan de alimentación · Versión ${model.plan.versionNumber}`});
 layout.section('Plan de alimentación','Documento nutricional personalizado');
 layout.card(model.patientName,planIdentityFields(model),{tone:'blue',columns:2,eyebrow:'IDENTIFICACIÓN DEL PACIENTE Y DEL DOCUMENTO'});
 const clinical=planClinicalFields(model);
 if(clinical.length)layout.card('Objetivo y cuidados acordados',clinical,{tone:'violet',eyebrow:'GUÍA DE TU ATENCIÓN',flow:true});
 const n=model.nutrition;
 if(n?.energy&&n.energy>0){
  const macros=[['Carbohidratos',n.carbohydrate],['Proteínas',n.protein],['Grasas',n.fat]].filter(([,value])=>value!==undefined).map(([label,value])=>`${label}: ${macroAmount(value as number)} g`).join(' · ');
  layout.card('Prescripción diaria',[{label:'Energía total',value:`${amount(n.energy)} kcal / día`},...(macros?[{label:'Macronutrientes totales · alimentos y suplementos',value:macros}]:[])],{columns:2});
 }
 for(const day of model.plan.days){
  layout.section(day.name);
  if(day.text!==undefined){
   // Preserve the reviewed text exactly. Paragraphs make even free-text diets readable.
   layout.card('Indicaciones del día',day.text.split(/\n\s*\n/).map(value=>({value})),{eyebrow:day.name,flow:true});
   continue;
  }
  for(const meal of day.meals){
   const fields:DocumentField[]=[{label:'Ingredientes y porciones',value:meal.ingredients.map(i=>`${amount(i.amount)} ${i.unit} - ${i.name}`).join('\n')}];
   if(meal.instructions.length)fields.push({label:'Preparación',value:meal.instructions.join('\n\n')});
   const alternatives=meal.ingredients.filter(i=>i.alternatives.length);
   if(alternatives.length)fields.push({label:'Puedes sustituir',value:'Elige una alternativa; no la agregues a la porción.\n'+alternatives.map(i=>`${i.name}: ${i.alternatives.map(a=>`${amount(a.amount)} ${a.unit} de ${a.name}`).join(' o ')}.`).join('\n')});
   layout.card(meal.title,fields,{eyebrow:[day.name,meal.name,meal.time].filter(Boolean).join(' · ')});
  }
 }
 if(model.plan.supplements?.length){
  layout.section('Tu suplementación','Cantidades e indicaciones registradas por tu nutriólogo.');
  for(const item of model.plan.supplements){
   const fields:DocumentField[]=[{label:'Porción diaria',value:item.quantity}];
   const brand=[item.brand,item.presentation].filter(Boolean).join(' · ');
   if(brand)fields.push({label:'Producto',value:brand});
   if(item.instructions)fields.push({label:'Cómo tomarlo',value:item.instructions});
   layout.card(item.name,fields,{tone:'mint',eyebrow:'SUPLEMENTO',flow:true});
  }
 }
 if(model.plan.shoppingList){
  const list=model.plan.shoppingList;
  layout.section('Tu carrito del súper',groceryPeriod(list));
  layout.card('Antes de comprar',[{value:'Revisa lo que ya tienes en casa. Las cantidades corresponden a las porciones del plan y conservan el estado indicado, crudo o cocido; no son conversiones a peso de compra ni a tamaños de envase.'}],{tone:'mint'});
  for(let i=0;i<list.items.length;i+=12)layout.card('Alimentos y cantidades totales',list.items.slice(i,i+12).map(item=>({label:item.name,value:`${amount(item.quantity)} ${item.unit}`})),{tone:'mint',columns:2});
 }
 layout.flushSection();drawPrivateFooters(pdf);return new Uint8Array(pdf.output('arraybuffer'));
}
export function escapeLatex(text:string):string {
 const escapes:Record<string,string>={'\\':'\\textbackslash{}','{':'\\{','}':'\\}','#':'\\#','$':'\\$','%':'\\%','&':'\\&','_':'\\_','~':'\\textasciitilde{}','^':'\\textasciicircum{}'};
 return text.replace(/[\\{}#$%&_~^]/g,c=>escapes[c]).replace(/\r\n?|\n/g,'\\par\n');
}
/** UTF-8 source, compile with LuaLaTeX. All dynamic text is escaped. */
export function renderPlanTex(model:PublishedNutritionPlanDocumentModel,logo:string|null=null):string {
 const e=escapeLatex,p=model.professional,brand=p.businessName||p.fullName;
 const contact=[p.businessAddress,...(p.contactLines||[])].filter(Boolean).map(x=>e(x!)).join('\\par\n');
 const card=(title:string,body:string,mint=false)=>`\\begin{nuthcard}{${e(title)}}{${mint?'nuthmint':'white'}}\n${body}\n\\end{nuthcard}`;
 const field=(label:string,value:string)=>`{\\small\\bfseries\\color{nuthmuted} ${e(label)}}\\par\\nopagebreak[3]\n${e(value)}\\par\\medskip`;
 const blocks:string[]=[];
 for(const day of model.plan.days){
  blocks.push(`\\section*{${e(day.name)}}`);
  if(day.text!==undefined){blocks.push(card('Indicaciones del día',e(day.text)));continue;}
  for(const meal of day.meals){
   const alternatives=meal.ingredients.filter(i=>i.alternatives.length);
   const content=[`{\\small\\color{nuthteal} ${e([meal.name,meal.time].filter(Boolean).join(' · '))}}\\par\\medskip`,field('Ingredientes y porciones',meal.ingredients.map(i=>`${amount(i.amount)} ${i.unit} - ${i.name}`).join('\n')),meal.instructions.length?field('Preparación',meal.instructions.join('\n\n')):'',alternatives.length?field('Puedes sustituir','Elige una alternativa; no la agregues a la porción.\n'+alternatives.map(i=>`${i.name}: ${i.alternatives.map(a=>`${amount(a.amount)} ${a.unit} de ${a.name}`).join(' o ')}.`).join('\n')):''];
   blocks.push(card(meal.title,content.join('\n')));
  }
 }
 if(model.plan.supplements?.length){
  blocks.push('\\section*{Tu suplementación}', 'Cantidades diarias indicadas por tu nutriólogo.');
  for(const item of model.plan.supplements)blocks.push(card(item.name,[field('Porción diaria',item.quantity),[item.brand,item.presentation].filter(Boolean).length?field('Producto',[item.brand,item.presentation].filter(Boolean).join(' · ')):'',item.instructions?field('Cómo tomarlo',item.instructions):''].join('\n'),true));
 }
 if(model.plan.shoppingList){
  const list=model.plan.shoppingList;
  blocks.push(card('Tu carrito del súper',e(groceryPeriod(list))+'\\par\n'+e('Revisa lo que ya tienes en casa. Se conserva el estado indicado, crudo o cocido; no son conversiones a peso de compra.')+'\\par\n'+list.items.map(item=>field(item.name,`${amount(item.quantity)} ${item.unit}`)).join('\n'),true));
 }
 // Embed the optional verified raster image as hexadecimal, never TeX commands
 // or external URLs. LuaLaTeX uses a unique temporary file and removes it after
 // embedding; no shell escape, persistent asset or user-controlled path.
 const logoHex=logo&&/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(logo)?Array.from(atob(logo.split(',')[1]),c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(''):null;
 const logoTex=logoHex?`\\directlua{local temp=os.tmpname(); os.remove(temp); local path="nuthrick-logo-"..temp:match("([^/]+)$")..".png"; local f=assert(io.open(path,"wb")); local bytes=("${logoHex}"):gsub("..",function(h) return string.char(tonumber(h,16)) end); f:write(bytes); f:close(); local picture=img.scan{filename=path,width=tex.sp("25mm")}; img.immediatewrite(picture); node.write(img.node(picture)); os.remove(path)}\\par`:'';
 return `%% Nuthrick card layout. UTF-8. Compile with LuaLaTeX; no shell escape required.
\\documentclass[10pt,a4paper]{article}
\\usepackage[margin=16mm,bottom=23mm,headheight=14pt]{geometry}
\\usepackage{fontspec}
\\IfFontExistsTF{TeX Gyre Heros}{\\setmainfont{TeX Gyre Heros}}{\\IfFontExistsTF{Latin Modern Sans}{\\setmainfont{Latin Modern Sans}}{\\setmainfont{lmroman10-regular.otf}[BoldFont=lmroman10-bold.otf]}}
\\IfFileExists{spanish.ldf}{\\usepackage[spanish]{babel}}{}
\\usepackage{xcolor,fancyhdr}

\\definecolor{nuthgreen}{HTML}{203D48}
\\definecolor{nuthmint}{HTML}{EDF6F0}
\\definecolor{nuthblue}{HTML}{EDF5FA}
\\definecolor{nuthline}{HTML}{DCE6E8}
\\definecolor{nuthmuted}{HTML}{627681}
\\definecolor{nuthteal}{HTML}{147E86}
\\definecolor{nuthpaper}{HTML}{F7FAFB}
\\pagecolor{nuthpaper}\\color{nuthgreen}
\\newenvironment{nuthcard}[2]{\\par\\medskip\\noindent\\fcolorbox{nuthline}{#2}{\\parbox{\\dimexpr\\linewidth-2\\fboxsep-2\\fboxrule\\relax}{\\large\\bfseries #1}}\\par\\nopagebreak[4]\\smallskip}{\\par\\bigskip}
\\pagestyle{fancy}\\fancyhf{}
\\fancyhead[L]{\\small\\textcolor{nuthgreen}{${e(brand)}}}
\\fancyfoot[L]{\\scriptsize Documento privado · Información clínica confidencial}
\\fancyfoot[R]{\\scriptsize Página \\thepage{} de \\pageref{LastPage}}
\\setlength{\\parindent}{0pt}\\setlength{\\parskip}{4pt}
\\emergencystretch=3em
\\begin{document}
${logoTex}
{\\large\\bfseries ${e(brand)}}\\par
${[p.businessName?p.fullName:null,p.professionalTitle,p.licenseNumber?`Cédula profesional ${p.licenseNumber}`:null].filter(Boolean).map(x=>e(x!)).join(' · ')}\\par\\bigskip
${contact?`{\\small ${contact}}\\par\\bigskip`:''}
{\\LARGE\\bfseries Tu plan de alimentación}\\par
Documento nutricional personalizado\\par
\\begin{nuthcard}{${e(model.patientName)}}{nuthblue}
${planIdentityFields(model).map(f=>field(f.label!,f.value)).join('\n')}
\\end{nuthcard}
${planClinicalFields(model).length?card('Objetivo y cuidados acordados',planClinicalFields(model).map(f=>field(f.label!,f.value)).join('\n')):''}
${model.nutrition?.energy?card('Prescripción diaria',field('Energía total',`${amount(model.nutrition.energy)} kcal / día`)+field('Macronutrientes totales · alimentos y suplementos',[['Carbohidratos',model.nutrition.carbohydrate],['Proteínas',model.nutrition.protein],['Grasas',model.nutrition.fat]].filter(([,v])=>v!==undefined).map(([k,v])=>`${k}: ${macroAmount(v as number)} g`).join(' · '))):''}
${blocks.join('\n')}
\\label{LastPage}\\end{document}
`;
}
