import type { jsPDF } from "jspdf";
import { brandArcs, brandPerson } from "../_shared/brand-mark.ts";
export interface ProfessionalDocumentInfo {
 fullName:string; professionalTitle?:string|null;licenseNumber?:string|null;businessName?:string|null;businessAddress?:string|null;contactLines?:string[];logoUrl?:string|null;
}
/** Light, printable canvas with subtle depth and the day theme's teal/blue accents. */
export function drawDocumentCanvas(pdf: jsPDF) {
 const width=pdf.internal.pageSize.getWidth(),height=pdf.internal.pageSize.getHeight();
 pdf.setFillColor(238,244,245);pdf.rect(0,0,width,height,'F');
 pdf.setFillColor(226,235,240);pdf.roundedRect(8,8,width-14,height-13,4,4,'F');
 pdf.setFillColor(252,253,253);pdf.roundedRect(6,5,width-12,height-12,4,4,'F');
 pdf.setFillColor(228,241,238);pdf.rect(6,5,55,2,'F');
 pdf.setFillColor(231,228,244);pdf.rect(61,5,width-67,2,'F');
}
/** Prominent first-page letterhead; subsequent pages keep a compact identity. */
export function drawProfessionalHeader(pdf:jsPDF,professional:ProfessionalDocumentInfo,logo:string|null,compact=false,compression:'FAST'|'NONE'='FAST',includeContacts=false,strictLogo=false):number {
 drawDocumentCanvas(pdf);
 const width=pdf.internal.pageSize.getWidth(),margin=16;
 const institution=professional.businessName?.trim();
 const name=professional.fullName.trim()||institution||'Nuthrick';
 if(compact){
  pdf.setFont('helvetica','bold');pdf.setFontSize(9);pdf.setTextColor(32,61,72);
  const lines=pdf.splitTextToSize(institution?`${name} · ${institution}`:name,width-32) as string[];
  pdf.text(lines,margin,15,{lineHeightFactor:1.3});
  const y=15+lines.length*4.2;
  pdf.setDrawColor(218,230,232);pdf.setLineWidth(.2);pdf.line(margin,y+2,width-margin,y+2);
  return y+10;
 }
 // Measure every block before painting the card so long identities remain intact.
 const logoSize=43, textX=logo?margin+logoSize+13:margin+8;
 const textWidth=width-margin-8-textX;
 let y=20;
 const blocks:Array<{lines:string[];y:number;size:number;bold:boolean;color:[number,number,number]}>=[];
 const block=(value:string|undefined|null,size:number,bold:boolean,color:[number,number,number],gap:number)=>{
  if(!value?.trim())return;
  pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);
  const lines=pdf.splitTextToSize(value.trim(),textWidth) as string[];
  blocks.push({lines,y:y+size*.3528*.82,size,bold,color});
  y+=lines.length*size*.3528*1.3+gap;
 };
 block(institution,10,true,[65,103,108],3);
 block(name,22,true,[24,61,65],3);
 block(professional.professionalTitle,10,false,[65,86,98],1.5);
 block(professional.licenseNumber?`Cédula profesional: ${professional.licenseNumber}`:null,9,false,[65,86,98],0);
 y=Math.max(y,logo?65:52);
 const contacts=includeContacts?[professional.businessAddress,...(professional.contactLines??[])].filter((v):v is string=>Boolean(v?.trim())):[];
 pdf.setFont('helvetica','normal');pdf.setFontSize(8.5);
 const contactLines=contacts.flatMap(value=>pdf.splitTextToSize(value,width-48) as string[]);
 const contactTop=y+5;
 const bottom=contactLines.length?contactTop+6+contactLines.length*4.1+5:y+6;
 pdf.setFillColor(221,232,234);pdf.roundedRect(margin+.7,13,width-32,bottom-12,3,3,'F');
 pdf.setFillColor(241,247,247);pdf.setDrawColor(212,228,230);pdf.setLineWidth(.2);
 pdf.roundedRect(margin,12,width-32,bottom-12,3,3,'FD');
 pdf.setFillColor(20,126,134);pdf.roundedRect(margin,20,1.2,20,.6,.6,'F');
 for(const item of blocks){
  pdf.setFont('helvetica',item.bold?'bold':'normal');pdf.setFontSize(item.size);pdf.setTextColor(...item.color);
  pdf.text(item.lines,textX,item.y,{lineHeightFactor:1.3});
 }
 if(logo){try{
  const pngHeader=logo.startsWith('data:image/png;base64,')?atob(logo.split(',')[1].slice(0,44)):null;
  const dimension=(at:number)=>pngHeader!.charCodeAt(at)*16777216+pngHeader!.charCodeAt(at+1)*65536+pngHeader!.charCodeAt(at+2)*256+pngHeader!.charCodeAt(at+3);
  const properties=pngHeader&&pngHeader.length>=24?{width:dimension(16),height:dimension(20),fileType:'PNG'}:pdf.getImageProperties(logo);
  const scale=Math.min((logoSize-6)/properties.width,(logoSize-6)/properties.height);
  const logoX=margin+6,logoY=20;
  pdf.setFillColor(255,255,255);pdf.roundedRect(logoX,logoY,logoSize,logoSize,3,3,'F');
  pdf.addImage(logo,properties.fileType,logoX+(logoSize-properties.width*scale)/2,logoY+(logoSize-properties.height*scale)/2,properties.width*scale,properties.height*scale,undefined,compression);
 }catch{
  if(strictLogo)throw new Error("No pudimos incorporar el logo al PDF. Revisa la imagen guardada en Perfil y vuelve a exportar.");
  // Optional branding never hides clinical content.
 }}
 if(contactLines.length){
  pdf.setDrawColor(212,228,230);pdf.line(margin+8,contactTop,width-margin-8,contactTop);
  pdf.setFont('helvetica','normal');pdf.setFontSize(8.5);pdf.setTextColor(65,86,98);
  pdf.text(contactLines,margin+8,contactTop+6,{lineHeightFactor:4.1/(8.5*.3528)});
 }
 return bottom+10;
}
/** Render the same brand curves as the UI, without network assets or raster blur. */
function drawNuthrickMark(pdf: jsPDF, x: number, y: number, size: number) {
 const scale=size/104;
 pdf.saveGraphicsState();pdf.setDrawColor(23,63,57);pdf.setFillColor(23,63,57);pdf.setLineWidth(7*scale);pdf.setLineCap('round');
 const path=(value:string)=>{
  for(const command of value.matchAll(/([MCZ])([^MCZ]*)/g)){
   const points=command[2].trim().split(/\s+/).filter(Boolean).map(Number).map((v,i)=>v*scale+(i%2?y:x));
   if(command[1]==='M')pdf.moveTo(points[0],points[1]);
   else if(command[1]==='C')pdf.curveTo(points[0],points[1],points[2],points[3],points[4],points[5]);
   else pdf.close();
  }
 };
 for(const arc of brandArcs){path(arc);pdf.stroke();}
 pdf.circle(x+50*scale,y+50*scale,7.6*scale,'F');path(brandPerson);pdf.fill();pdf.restoreGraphicsState();
}
export function drawDocumentFooters(pdf:jsPDF,label='Documento privado · Información clínica confidencial') {
 const count=pdf.getNumberOfPages(),width=pdf.internal.pageSize.getWidth(),height=pdf.internal.pageSize.getHeight();
 for(let page=1;page<=count;page++){
  pdf.setPage(page);pdf.setDrawColor(218,230,232);pdf.setLineWidth(.2);pdf.line(16,height-15,width-16,height-15);pdf.setFont('helvetica','normal');pdf.setFontSize(7);pdf.setTextColor(98,118,129);
  drawNuthrickMark(pdf,16,height-13.5,4.5);pdf.text(`Nuthrick · ${label}`,22,height-10);pdf.text(`Página ${page} de ${count}`,width-16,height-10,{align:'right'});
 }
}
export const drawPrivateFooters=(pdf:jsPDF)=>drawDocumentFooters(pdf);
