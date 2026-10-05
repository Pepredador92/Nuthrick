import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
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
