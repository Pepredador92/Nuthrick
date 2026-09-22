import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {DietWorkshopAI} from './DietWorkshopAI';
import {DietMenuStep} from './DietMenuStep';
import {uxFixture} from '../../../tests/fixtures/dietCopilotUX';
import {AIRequestError} from '../../services/ai';

beforeEach(()=>sessionStorage.clear());
function mount(mode='valid'){
  const f=uxFixture(mode),before=vi.fn(async()=>f.input.source.plan),onApplied=vi.fn();
  const generate=vi.spyOn(f.transport,'generate'),decide=vi.spyOn(f.transport,'decide');
  render(<DietWorkshopAI plan={f.input.source.plan} before={before} onApplied={onApplied} transport={f.transport}/>);
  return {...f,before,onApplied,generate,decide};
}
async function open(){fireEvent.click(screen.getByRole('button',{name:'Crear propuesta con IA'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Cerrar propuesta'})).toBeEnabled());}
async function generate(){await open();fireEvent.click(screen.getByRole('button',{name:'Generar propuesta'}));await screen.findByText('Propuesta lista para revisar');}
async function accept(){const c=screen.queryByRole('checkbox',{name:'Revisé las diferencias de la propuesta'});if(c)fireEvent.click(c);}

describe('Copilot mínimo Fase 4B',()=>{
  it('is a single secondary action in Mesa, preserving classic/manual actions',()=>{
    const f=uxFixture();render(<DietMenuStep plan={f.input.source.plan} catalog={f.input.source.catalog} onSave={vi.fn()} onGoToMeals={vi.fn()} headerActions={<DietWorkshopAI plan={f.input.source.plan} before={async()=>f.input.source.plan} onApplied={vi.fn()} transport={f.transport}/>}/>);
    expect(screen.getAllByRole('button',{name:'Crear propuesta con IA'})).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'Vista clásica'}));expect(screen.getByRole('button',{name:'Volver a la mesa'})).toBeInTheDocument();
    const page=readFileSync('src/screens/DietWorkshopPage.tsx','utf8');expect(page.match(/<DietWorkshopAI/g)).toHaveLength(1);expect(page.indexOf('<DietWorkshopAI')).toBeGreaterThan(page.indexOf('activeStep === "menu" && <DietMenuStep'));
    expect(readFileSync('src/screens/ConsultationPage.tsx','utf8')).not.toContain('DietWorkshopAI');
  });
  it('eligible enables generation and presents real safe context only on demand',async()=>{
    const f=mount();await open();expect(screen.getByRole('button',{name:'Generar propuesta'})).toBeEnabled();expect(screen.queryByText('PES aprobado sintético')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Revisar contexto'}));
    expect(screen.getByText('PES aprobado sintético')).toBeInTheDocument();expect(screen.getByText('Objetivo sintético')).toBeInTheDocument();expect(screen.getAllByText(/No especificado/).length).toBeGreaterThan(0);
    for(const privateText of [f.input.source.plan.id,f.input.source.plan.patient_id!,f.input.source.stamp,'PRIVATE','candidate_ref','snapshotHash'])expect(screen.getByRole('dialog').textContent).not.toContain(privateText);
    expect(f.generate).not.toHaveBeenCalled();
  });
  it('ineligible shows concrete cause without internal code',async()=>{
    mount('blocked');await open();expect(screen.getByRole('button',{name:'Generar propuesta'})).toBeDisabled();expect(screen.getByText('Aprueba el PES de esta consulta.')).toBeInTheDocument();expect(screen.getByRole('dialog').textContent).not.toContain('pes_approval_required');
  });
  it('passes instructions, locks synchronous double click and shows loading',async()=>{
    const f=mount();let release!:()=>void;const gate=new Promise<void>(r=>release=r);const original=uxFixture().transport.generate;
    f.generate.mockImplementationOnce(async(...args)=>{await gate;return original(...args);});
    await open();fireEvent.change(screen.getByLabelText('Indicaciones adicionales'),{target:{value:'Desayuno para llevar'}});const b=screen.getByRole('button',{name:'Generar propuesta'});fireEvent.click(b);fireEvent.click(b);
    await waitFor(()=>expect(f.generate).toHaveBeenCalledTimes(1));expect(f.generate.mock.calls[0][1]).toBe('Desayuno para llevar');expect(screen.getByText('Preparando propuesta…')).toBeInTheDocument();expect(b).toBeDisabled();release();await screen.findByText('Propuesta lista para revisar');
  });
  it.each(['valid','needs_adjustment','invalid'])('renders fake %s with validator totals, not provider nutrition',async mode=>{
    const f=mount(mode);await generate();const dialog=screen.getByRole('dialog');expect(dialog.textContent).not.toContain('hidden-generation');expect(dialog.textContent).not.toContain('candidate_ref');
    if(mode==='invalid'){expect(screen.getByText('Esta propuesta no se puede aplicar')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Aplicar al borrador'})).not.toBeInTheDocument();}
    else {expect(screen.getByText(mode==='valid'?'Compatible con la prescripción':'Requiere revisión')).toBeInTheDocument();const result=await f.generate.mock.results[0].value;expect(screen.getByRole('region',{name:'Comparación nutricional'})).toHaveTextContent(new Intl.NumberFormat('es-MX',{maximumFractionDigits:1}).format(result.validation.totals.energy_kcal));expect(screen.getByRole('button',{name:'Aplicar al borrador'})).toBeDisabled();}
  });
  it('applies an ordinary draft, closes dialog, never publishes',async()=>{
    const f=mount();await generate();await accept();fireEvent.click(screen.getByRole('button',{name:'Aplicar al borrador'}));await waitFor(()=>expect(f.onApplied).toHaveBeenCalledOnce());expect(f.onApplied.mock.calls[0][0].status).toBe('draft');expect(f.onApplied.mock.calls[0][0].current_version_id).toBeNull();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(f.decide).toHaveBeenCalledWith(expect.anything(),true,false,true);
  });
  it('protects manual menu, cancellation preserves it, explicit replacement applies',async()=>{
    const f=mount('replace'),original=JSON.stringify(f.input.source.plan);await generate();await accept();fireEvent.click(screen.getByRole('button',{name:'Aplicar al borrador'}));await screen.findByRole('region',{name:'Confirmar reemplazo'});expect(f.decide).not.toHaveBeenCalled();expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(JSON.stringify(f.input.source.plan)).toBe(original);expect(f.onApplied).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Aplicar al borrador'}));await screen.findByRole('region',{name:'Confirmar reemplazo'});fireEvent.click(screen.getByRole('button',{name:'Reemplazar con propuesta IA'}));await waitFor(()=>expect(f.onApplied).toHaveBeenCalledOnce());expect(f.decide).toHaveBeenCalledWith(expect.anything(),true,true,true);
  });
  it('blocks stale context before applying',async()=>{
    const f=mount();await generate();await accept();f.input.source.stamp='changed';fireEvent.click(screen.getByRole('button',{name:'Aplicar al borrador'}));await screen.findByText(/El contexto del plan cambió/);expect(f.decide).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Aplicar al borrador'})).toBeDisabled();
  });
  it('discards only proposal and restores focus',async()=>{
    const f=mount('replace'),original=JSON.stringify(f.input.source.plan);await generate();fireEvent.click(screen.getByRole('button',{name:'Descartar propuesta'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(JSON.stringify(f.input.source.plan)).toBe(original);expect(f.onApplied).not.toHaveBeenCalled();expect(f.decide).toHaveBeenCalledWith(expect.anything(),false,false,false);expect(screen.getByRole('button',{name:'Crear propuesta con IA'})).toHaveFocus();
  });
  it('preserves unknown-outcome key and prevents another request after reopen',async()=>{
    const f=mount();f.generate.mockRejectedValue(new AIRequestError('provider_outcome_unknown'));await open();fireEvent.click(screen.getByRole('button',{name:'Generar propuesta'}));await screen.findByRole('button',{name:'Consultar solicitud pendiente'});expect(screen.getByRole('button',{name:'Generar propuesta'})).toBeDisabled();expect(sessionStorage.getItem(`workshop-ai-pending:${f.input.source.plan.id}`)).toBeTruthy();expect(f.generate).toHaveBeenCalledTimes(1);
  });
});
