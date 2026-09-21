import {projectPortalPlan,type PortalPlan} from './portal-plan.ts';
import {drawProfessionalHeader,drawPrivateFooters,type ProfessionalDocumentInfo} from './document-letterhead.ts';
import {jsPDF} from 'jspdf';

export type PublishedNutritionPlanDocumentModel = {
  templateVersion:'clinical-letterhead-v1'; patientName:string; professional:ProfessionalDocumentInfo; plan:PortalPlan;
};
const safeText=(v:unknown,max=12000):string=>{
  if(typeof v!=='string'||v.length>max) throw new Error('invalid_plan');
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
export type PlanDocumentBlock={kind:'day'|'meal'|'title'|'text'|'label';text:string};
/** Shared clinical ordering and wording for PDF and TEX. */
export function planDocumentBlocks(model:PublishedNutritionPlanDocumentModel):PlanDocumentBlock[] {
 const blocks:PlanDocumentBlock[]=[];
 for(const day of model.plan.days){
  blocks.push({kind:'day',text:day.name});
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
 const pdf=new jsPDF({unit:'mm',format:'a4'}),width=pdf.internal.pageSize.getWidth(),bottom=pdf.internal.pageSize.getHeight()-19;
 let y=drawProfessionalHeader(pdf,model.professional,logo,false,'NONE');
 const page=()=>{pdf.addPage();y=drawProfessionalHeader(pdf,model.professional,logo,true,'NONE');};
 const write=(text:string,size=10,bold=false,gap=5)=>{
  pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);
  const lines=pdf.splitTextToSize(text,width-32) as string[];
  for(const line of lines){if(y+gap>bottom)page();pdf.setTextColor(55,77,69);pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.text(line,16,y);y+=gap;}
  y+=2;
 };
 write('PLAN DE ALIMENTACIÓN',17,true,7);
 write(model.plan.title,12,true,6);
 write(`Paciente: ${model.patientName}`);
 write(`Versión ${model.plan.versionNumber} · Publicado: ${planDate(model.plan.publishedAt)}`,9);
 for(const block of planDocumentBlocks(model)){
  if(block.kind==='day'||block.kind==='meal'){
   if(y+28>bottom)page();y+=4;
   if(block.kind==='day'){pdf.setFillColor(237,243,239);pdf.roundedRect(16,y-4,width-32,9,2,2,'F');}
   write(block.text,block.kind==='day'?12:11,true,6);
  }else {if((block.kind==='title'||block.kind==='label')&&y+16>bottom)page();write(block.text,block.kind==='text'?9.5:10,block.kind!=='text');}
  if(pdf.getNumberOfPages()>120)throw new Error('document_too_large');
 }
 drawPrivateFooters(pdf);return new Uint8Array(pdf.output('arraybuffer'));
}
export function escapeLatex(text:string):string {
 const escapes:Record<string,string>={'\\':'\\textbackslash{}','{':'\\{','}':'\\}','#':'\\#','$':'\\$','%':'\\%','&':'\\&','_':'\\_','~':'\\textasciitilde{}','^':'\\textasciicircum{}'};
 return text.replace(/[\\{}#$%&_~^]/g,c=>escapes[c]).replace(/\r\n?|\n/g,'\\par\n');
}
/** UTF-8 source, compile with LuaLaTeX. All dynamic text is escaped. */
export function renderPlanTex(model:PublishedNutritionPlanDocumentModel,logo:string|null=null):string {
 const e=escapeLatex,p=model.professional,brand=p.businessName||p.fullName;
 const contact=[p.businessAddress,...(p.contactLines||[])].filter(Boolean).map(x=>e(x!)).join('\\par\n');
 const blocks=planDocumentBlocks(model).map(b=>b.kind==='day'?`\\section*{${e(b.text)}}`:b.kind==='meal'?`\\subsection*{${e(b.text)}}`:b.kind==='title'||b.kind==='label'?`\\noindent\\textbf{${e(b.text)}}\\par\\nopagebreak[3]`:`\\noindent ${e(b.text)}\\par`).join('\n');
 // Embed the optional verified raster image as hexadecimal, never TeX commands
 // or external URLs. LuaLaTeX uses a unique temporary file and removes it after
 // embedding; no shell escape, persistent asset or user-controlled path.
 const logoHex=logo&&/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(logo)?Array.from(atob(logo.split(',')[1]),c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(''):null;
 const logoTex=logoHex?`\\directlua{local temp=os.tmpname(); os.remove(temp); local path="nuthrick-logo-"..temp:match("([^/]+)$")..".png"; local f=assert(io.open(path,"wb")); local bytes=("${logoHex}"):gsub("..",function(h) return string.char(tonumber(h,16)) end); f:write(bytes); f:close(); local picture=img.scan{filename=path,width=tex.sp("25mm")}; img.immediatewrite(picture); node.write(img.node(picture)); os.remove(path)}\\par`:'';
 return `%% Nuthrick clinical-letterhead-v1. UTF-8. Compile with LuaLaTeX; no shell escape required.
\\documentclass[10pt,a4paper]{article}
\\usepackage[margin=16mm,bottom=22mm,headheight=14pt]{geometry}
\\usepackage{fontspec}
\\IfFontExistsTF{TeX Gyre Heros}{\\setmainfont{TeX Gyre Heros}}{\\setmainfont{Latin Modern Sans}}
\\IfFileExists{spanish.ldf}{\\usepackage[spanish]{babel}}{}
\\usepackage{xcolor,fancyhdr}
\\definecolor{nuthgreen}{RGB}{23,61,54}
\\definecolor{nuthgold}{RGB}{205,161,96}
\\pagestyle{fancy}\\fancyhf{}
\\fancyhead[L]{\\small\\textcolor{nuthgreen}{${e(brand)}}}
\\fancyfoot[L]{\\scriptsize Documento privado · Información clínica confidencial}
\\fancyfoot[R]{\\scriptsize Página \\thepage}
\\setlength{\\parindent}{0pt}\\setlength{\\parskip}{5pt}
\\emergencystretch=3em
\\begin{document}
\\thispagestyle{fancy}
${logoTex}
{\\color{nuthgreen}\\rule{\\linewidth}{2pt}}\\par
{\\color{nuthgold}\\small NUTRICIÓN Y BIENESTAR}\\par
{\\color{nuthgreen}\\LARGE\\bfseries ${e(brand)}}\\par
\\textbf{${e(p.fullName)}}\\par
${[p.professionalTitle,p.licenseNumber?`Cédula profesional ${p.licenseNumber}`:null].filter(Boolean).map(x=>e(x!)).join(' · ')}\\par
{\\small ${contact}}\\par
{\\Large\\bfseries PLAN DE ALIMENTACIÓN}\\par
\\textbf{${e(model.plan.title)}}\\par
Paciente: ${e(model.patientName)}\\par
Versión ${model.plan.versionNumber} · Publicado: ${e(planDate(model.plan.publishedAt))}\\par
${blocks}
\\end{document}
`;
}
