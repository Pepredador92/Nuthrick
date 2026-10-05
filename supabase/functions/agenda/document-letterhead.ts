import type { jsPDF } from "jspdf";
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
/** Compact identity. Contacts have a dedicated card, leaving the reader room for content. */
export function drawProfessionalHeader(pdf:jsPDF,professional:ProfessionalDocumentInfo,logo:string|null,compact=false,compression:'FAST'|'NONE'='FAST'):number {
 drawDocumentCanvas(pdf);
 const width=pdf.internal.pageSize.getWidth(),margin=16;
 const brand=professional.businessName?.trim()||professional.fullName.trim()||'Nuthrick';
 const textWidth=width-32-((logo||professional.logoUrl)&&!compact?30:0);
 pdf.setFont('helvetica','bold');pdf.setFontSize(compact?9:12);pdf.setTextColor(32,61,72);
 const brandLines=pdf.splitTextToSize(brand,textWidth) as string[];
 pdf.text(brandLines,margin,compact?15:18,{lineHeightFactor:1.3});
 let y=(compact?15:18)+brandLines.length*(compact?4.2:5.5);
 if(!compact){
  pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.setTextColor(98,118,129);
  const identity=[professional.businessName?professional.fullName:null,professional.professionalTitle,professional.licenseNumber?`Cédula profesional ${professional.licenseNumber}`:null].filter(Boolean).join(' · ');
  if(identity){const lines=pdf.splitTextToSize(identity,textWidth) as string[];pdf.text(lines,margin,y);y+=lines.length*3.8;}
 }
 if(logo&&!compact){try{
  const pngHeader=logo.startsWith('data:image/png;base64,')?atob(logo.split(',')[1].slice(0,44)):null;
  const dimension=(at:number)=>pngHeader!.charCodeAt(at)*16777216+pngHeader!.charCodeAt(at+1)*65536+pngHeader!.charCodeAt(at+2)*256+pngHeader!.charCodeAt(at+3);
  const properties=pngHeader&&pngHeader.length>=24?{width:dimension(16),height:dimension(20),fileType:'PNG'}:pdf.getImageProperties(logo);
  const scale=Math.min(23/properties.width,18/properties.height);
  pdf.addImage(logo,properties.fileType,width-margin-23,12,properties.width*scale,properties.height*scale,undefined,compression);
  y=Math.max(y,31);
 }catch{/* Optional branding never hides clinical content. */}}
 pdf.setDrawColor(218,230,232);pdf.setLineWidth(.2);pdf.line(margin,y+2,width-margin,y+2);
 return y+10;
}
export function drawDocumentFooters(pdf:jsPDF,label='Documento privado · Información clínica confidencial') {
 const count=pdf.getNumberOfPages(),width=pdf.internal.pageSize.getWidth(),height=pdf.internal.pageSize.getHeight();
 for(let page=1;page<=count;page++){
  pdf.setPage(page);pdf.setDrawColor(218,230,232);pdf.setLineWidth(.2);pdf.line(16,height-15,width-16,height-15);pdf.setFont('helvetica','normal');pdf.setFontSize(7);pdf.setTextColor(98,118,129);
  pdf.text(label,16,height-10);pdf.text(`Página ${page} de ${count}`,width-16,height-10,{align:'right'});
 }
}
export const drawPrivateFooters=(pdf:jsPDF)=>drawDocumentFooters(pdf);
