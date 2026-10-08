import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { drawProfessionalHeader } from '../../../supabase/functions/agenda/document-letterhead';
import { DocumentLayout } from '../../../supabase/functions/agenda/document-layout';

describe('document card pagination', () => {
 it('keeps a section with its first card instead of leaving an orphan heading', () => {
  const pdf=new jsPDF({unit:'mm',format:'a4'});
  const layout=new DocumentLayout(pdf,{fullName:'Profesional'});
  const rendered:Array<{text:string,page:number}>=[];
  const native=pdf.text.bind(pdf);
  vi.spyOn(pdf,'text').mockImplementation((...args:Parameters<typeof pdf.text>)=>{
   rendered.push({text:String(args[0]),page:pdf.getNumberOfPages()});
   return native(...args);
  });
  layout.y=244;
  layout.section('Mi próximo día');
  layout.card('Desayuno',[{label:'Porciones',value:'2 piezas de tortilla\n1 pieza de huevo\n1 taza de verduras'}]);
  expect(rendered.find(item=>item.text==='Mi próximo día')?.page).toBe(2);
  expect(rendered.find(item=>item.text==='Desayuno')?.page).toBe(2);
 });
 it('preserves a long answer across continuation cards and keeps text above the footer',()=>{
  const pdf=new jsPDF({unit:'mm',format:'a4'});
  const layout=new DocumentLayout(pdf,{fullName:'Profesional'});
  const rendered:Array<{text:string,y:number}>=[];
  const native=pdf.text.bind(pdf);
  vi.spyOn(pdf,'text').mockImplementation((...args:Parameters<typeof pdf.text>)=>{
   rendered.push({text:String(args[0]),y:args[2] as number});
   return native(...args);
  });
  const tokens=Array.from({length:800},(_,i)=>`dato${i}`);
  layout.card('Registro completo',[{value:tokens.join(' ')}],{eyebrow:'CONSULTA'});
  const text=rendered.map(item=>item.text).join(' ');
  for(const token of tokens)expect(text).toContain(token);
  expect(text).toContain('continuación');
  expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
  expect(rendered.every(item=>item.y<276)).toBe(true);
 });
});


describe('professional first-page letterhead', () => {
 it('wraps long credentials and contacts above the clinical content, and keeps following pages compact', () => {
  const pdf = new jsPDF({unit:'mm',format:'a4'});
  const professional = {
   fullName: 'María Fernanda de los Ángeles Rodríguez Hernández',
   businessName: 'Centro de Nutrición Clínica y Atención Integral de la Salud',
   professionalTitle: 'Licenciada en Nutrición, especialista en acompañamiento nutricional',
   licenseNumber: '1234567890',
   businessAddress: 'Avenida de la Salud 123, consultorio 456, colonia Centro, Ciudad de México, México',
   contactLines: ['Teléfono: +52 555 123 4567 · Correo: consultas@ejemplo.invalid'],
  };
  const rendered:Array<{bottom:number;text:string}> = [];
  const native = pdf.text.bind(pdf);
  vi.spyOn(pdf,'text').mockImplementation((...args:Parameters<typeof pdf.text>) => {
   const count = Array.isArray(args[0]) ? args[0].length : 1;
   rendered.push({text:String(args[0]),bottom:(args[2] as number)+(count-1)*pdf.getFontSize()*.3528*1.4});
   return native(...args);
  });
  const start = drawProfessionalHeader(pdf,professional,null,false,'FAST',true);
  expect(rendered.every(item=>item.bottom<start)).toBe(true);
  expect(rendered.map(item=>item.text).join(' ').replaceAll(',', ' ')).toContain('1234567890');
  expect(start).toBeLessThan(150);
  expect(drawProfessionalHeader(pdf,professional,null,true)).toBeLessThan(start);
 });
});
