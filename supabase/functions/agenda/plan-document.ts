import {projectPortalPlan,type PortalPlan} from './portal-plan.ts';
import {drawPrivateFooters,type ProfessionalDocumentInfo} from './document-letterhead.ts';
import {jsPDF} from 'jspdf';
import {DocumentLayout,type DocumentField} from './document-layout.ts';

export type PublishedNutritionPlanDocumentModel = {
  templateVersion:'clinical-letterhead-v1'; patientName:string; professional:ProfessionalDocumentInfo; plan:PortalPlan;
};
const safeText=(v:unknown,max=12000):string=>{
  if(typeof v!=='string'||v.length>max) throw new Error('invalid_plan');
  // deno-lint-ignore no-control-regex -- strip non-printable characters from document text.
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'');
};
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('invalid_plan');return v as Record<string,unknown>;};
/** One patient-safe document model. Neither renderer reads editable plans. */
export function buildPlanDocument(raw:unknown,profile:unknown):PublishedNutritionPlanDocumentModel {
 const source=obj(raw),snapshot=obj(source.snapshot),identity=obj(snapshot.professional),p=obj(profile);
 const plan=projectPortalPlan(raw);
 if(!plan||!Number.isInteger(plan.versionNumber)||!Number.isFinite(Date.parse(plan.publishedAt)))throw new Error('invalid_plan');
 const optional=(v:unknown)=>v==null?null:safeText(v,1000);
 return {templateVersion:'clinical-letterhead-v1',patientName:safeText(obj(snapshot.patient).full_name,200),plan,
  professional:{fullName:safeText(identity.full_name,200),professionalTitle:optional(identity.professional_title),licenseNumber:optional(p.licenseNumber),businessName:optional(p.businessName),businessAddress:optional(p.businessAddress),contactLines:Array.isArray(p.contactLines)?p.contactLines.map(v=>safeText(v,1000)):[]}};
}
export const planFileName=(model:PublishedNutritionPlanDocumentModel,format:'pdf'|'tex')=>{
 const name=model.patientName.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,80)||'paciente';
 return `plan_nutricional_${name}_v${model.plan.versionNumber}_${model.plan.publishedAt.slice(0,10)}.${format}`;
};
export const planDate=(value:string)=>new Date(value).toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Mexico_City'});
const amount=(value:number)=>new Intl.NumberFormat('es-MX',{maximumFractionDigits:3}).format(value);
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
 return blocks;
}
export function renderPlanPdf(model:PublishedNutritionPlanDocumentModel,logo:string|null=null):Uint8Array {
 const pdf=new jsPDF({unit:'mm',format:'a4'}),layout=new DocumentLayout(pdf,model.professional,logo);
 layout.section('Tu plan de alimentación','Porciones, preparación y alternativas, paso a paso.');
 layout.card(model.patientName,[{label:'Plan',value:model.plan.title},{label:'Publicación',value:`Versión ${model.plan.versionNumber} · ${planDate(model.plan.publishedAt)}`}],{tone:'blue',columns:2});
 layout.contacts();
 if(model.plan.supplements?.length){
  layout.section('Tu suplementación','Cantidades diarias indicadas por tu nutriólogo.');
  for(const item of model.plan.supplements){
   const fields:DocumentField[]=[{label:'Porción diaria',value:item.quantity}];
   const brand=[item.brand,item.presentation].filter(Boolean).join(' · ');
   if(brand)fields.push({label:'Producto',value:brand});
   if(item.instructions)fields.push({label:'Cómo tomarlo',value:item.instructions});
   layout.card(item.name,fields,{tone:'mint',eyebrow:'SUPLEMENTO'});
  }
 }
 for(const day of model.plan.days){
  layout.section(day.name);
  if(day.text!==undefined){
   // Preserve the reviewed text exactly. Paragraphs make even free-text diets readable.
   layout.card('Indicaciones del día',day.text.split(/\n\s*\n/).map(value=>({value})),{eyebrow:day.name});
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
 if(model.plan.supplements?.length){
  blocks.push('\\section*{Tu suplementación}', 'Cantidades diarias indicadas por tu nutriólogo.');
  for(const item of model.plan.supplements)blocks.push(card(item.name,[field('Porción diaria',item.quantity),[item.brand,item.presentation].filter(Boolean).length?field('Producto',[item.brand,item.presentation].filter(Boolean).join(' · ')):'',item.instructions?field('Cómo tomarlo',item.instructions):''].join('\n'),true));
 }
 for(const day of model.plan.days){
  blocks.push(`\\section*{${e(day.name)}}`);
  if(day.text!==undefined){blocks.push(card('Indicaciones del día',e(day.text)));continue;}
  for(const meal of day.meals){
   const alternatives=meal.ingredients.filter(i=>i.alternatives.length);
   const content=[`{\\small\\color{nuthteal} ${e([meal.name,meal.time].filter(Boolean).join(' · '))}}\\par\\medskip`,field('Ingredientes y porciones',meal.ingredients.map(i=>`${amount(i.amount)} ${i.unit} - ${i.name}`).join('\n')),meal.instructions.length?field('Preparación',meal.instructions.join('\n\n')):'',alternatives.length?field('Puedes sustituir','Elige una alternativa; no la agregues a la porción.\n'+alternatives.map(i=>`${i.name}: ${i.alternatives.map(a=>`${amount(a.amount)} ${a.unit} de ${a.name}`).join(' o ')}.`).join('\n')):''];
   blocks.push(card(meal.title,content.join('\n')));
  }
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
{\\LARGE\\bfseries Tu plan de alimentación}\\par
Porciones, preparación y alternativas, paso a paso.\\par
\\begin{nuthcard}{${e(model.patientName)}}{nuthblue}
\\textbf{${e(model.plan.title)}}\\par
Versión ${model.plan.versionNumber} · Publicado: ${e(planDate(model.plan.publishedAt))}
\\end{nuthcard}
${blocks.join('\n')}
${contact?`\\begin{nuthcard}{Tu profesional}{nuthblue}\n${contact}\n\\end{nuthcard}`:''}
\\label{LastPage}\\end{document}
`;
}
