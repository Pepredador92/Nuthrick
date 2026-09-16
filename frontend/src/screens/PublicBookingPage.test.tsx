import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicBookingPage } from './PublicBookingPage';
import { AgendaResponsePage } from './AgendaResponsePage';
import { agendaApi, AgendaError } from '@/src/services/agenda';
vi.mock('@/src/services/agenda', async original => ({...(await original<typeof import('@/src/services/agenda')>()),agendaApi:vi.fn()}));
const availability={name:'Profesional de prueba',slug:'prueba',timezone:'America/Mexico_City',duration:60,horizonDays:60,minimumNoticeMinutes:120,hasSchedule:true,requestsEnabled:true,connectionError:false,locations:[],options:[{modality:'online',location_id:null}],slots:[{start:'2026-09-20T16:00:00Z',end:'2026-09-20T17:00:00Z',modality:'online',locationId:null}]};
const api=vi.mocked(agendaApi);
const mount=()=>render(<MemoryRouter initialEntries={['/p/prueba/agendar']}><Routes><Route path="/p/:slug/agendar" element={<PublicBookingPage/>}/></Routes></MemoryRouter>);
beforeEach(()=>{api.mockImplementation(async(op)=>{
  if(op==='availability')return availability;
  if(op==='send_code')return {id:'challenge',delivery:'sent'};
  if(op==='verify_code')return {proof:'verified-proof'};
  if(op==='book')return {id:'appointment',status:'confirmed',start:availability.slots[0].start};
  return {};
});});
afterEach(()=>{cleanup();vi.clearAllMocks();window.history.replaceState(null,'','/');});
async function verifyContact(){
  mount(); await screen.findByText('Agenda una cita con Profesional de prueba');
  fireEvent.click(await screen.findByRole('button',{name:/10:00/}));
  fireEvent.change(screen.getByLabelText('Nombre completo'),{target:{value:'Persona ficticia'}});
  fireEvent.change(screen.getByLabelText('Correo electrónico'),{target:{value:'synthetic@example.invalid'}});
  fireEvent.click(screen.getByRole('button',{name:'Verificar correo'}));
  await screen.findByLabelText('Código de 6 dígitos');
  fireEvent.change(screen.getByLabelText('Código de 6 dígitos'),{target:{value:'123456'}});
  fireEvent.click(screen.getByRole('button',{name:'Comprobar código'}));
  await screen.findByRole('button',{name:'Confirmar cita'});
}
describe('public booking',()=>{
  it('shows the visited professional and requires a slot before email verification',async()=>{
    mount();await screen.findByText('Agenda una cita con Profesional de prueba');
    expect(screen.getByRole('button',{name:'Verificar correo'})).toBeDisabled();
    expect(screen.queryByRole('button',{name:'Confirmar cita'})).not.toBeInTheDocument();
    expect(screen.getByText(/Sin crear una cuenta/)).toBeInTheDocument();
  });
  it('uses verified contact, no patient or professional id supplied by visitor',async()=>{
    await verifyContact();fireEvent.click(screen.getByRole('button',{name:'Confirmar cita'}));
    await screen.findByText('Tu cita quedó agendada.');
    const call=api.mock.calls.find(([op])=>op==='book')![1]!;
    expect(call.slug).toBe('prueba');expect(call.proof).toBe('verified-proof');
    expect(call).not.toHaveProperty('patientId');expect(call).not.toHaveProperty('professionalId');
    expect(screen.queryByText(/correo fue recibido/i)).not.toBeInTheDocument();
  });
  it('preserves contact after a race and refreshes availability',async()=>{
    const fallback=api.getMockImplementation()!;
    api.mockImplementation(async(op,...args)=>{if(op==='book')throw new AgendaError('slot_taken');return fallback(op,...args);});
    await verifyContact();fireEvent.click(screen.getByRole('button',{name:'Confirmar cita'}));
    await waitFor(()=>expect(api.mock.calls.filter(([op])=>op==='availability').length).toBeGreaterThan(1));
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Persona ficticia');
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('synthetic@example.invalid');
  });
  it('reuses the same operation key after a lost response',async()=>{
    const fallback=api.getMockImplementation()!;let attempts=0;
    api.mockImplementation(async(op,...args)=>{if(op==='book'&&attempts++===0)throw new Error('Conexión interrumpida');return fallback(op,...args);});
    await verifyContact();fireEvent.click(screen.getByRole('button',{name:'Confirmar cita'}));
    await screen.findByText('Conexión interrumpida');
    fireEvent.click(screen.getByRole('button',{name:'Confirmar cita'}));
    await screen.findByText('Tu cita quedó agendada.');
    const calls=api.mock.calls.filter(([op])=>op==='book');
    expect(calls[0][1]!.operationKey).toBe(calls[1][1]!.operationKey);
  });
  it('opening a private proposal never accepts it',async()=>{
    window.history.replaceState(null,'','/agenda/responder#private-test-token');
    api.mockResolvedValue({name:'Profesional de prueba',start:availability.slots[0].start,end:availability.slots[0].end,timezone:availability.timezone,modality:'online',expiresAt:'2026-09-19T16:00:00Z'});
    render(<MemoryRouter><AgendaResponsePage/></MemoryRouter>);await screen.findByRole('button',{name:'Aceptar horario'});
    expect(api).toHaveBeenCalledWith('response_info',{token:'private-test-token'});
    expect(api.mock.calls.some(([op])=>op==='respond')).toBe(false);
    expect(window.location.hash).toBe('');
  });
});
