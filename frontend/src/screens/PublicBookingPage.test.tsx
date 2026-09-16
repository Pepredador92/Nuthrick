import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicBookingPage, PublicBookingPanel } from './PublicBookingPage';
import { AgendaResponsePage } from './AgendaResponsePage';
import { agendaApi, AgendaError } from '@/src/services/agenda';
vi.mock('@/src/services/agenda', async original => ({...(await original<typeof import('@/src/services/agenda')>()),agendaApi:vi.fn()}));
const availability={name:'Profesional de prueba',slug:'prueba',timezone:'America/Mexico_City',duration:60,horizonDays:60,minimumNoticeMinutes:120,hasSchedule:true,requestsEnabled:true,connectionError:false,locations:[],options:[{modality:'online',location_id:null}],slots:[{start:'2026-09-20T16:00:00Z',end:'2026-09-20T17:00:00Z',modality:'online',locationId:null}]};
const api=vi.mocked(agendaApi);
const mount=()=>render(<MemoryRouter initialEntries={['/p/prueba/agendar']}><Routes><Route path="/p/:slug/agendar" element={<PublicBookingPage/>}/><Route path="/p/:slug/agendar/datos" element={<PublicBookingPage/>}/></Routes></MemoryRouter>);
beforeEach(()=>{api.mockImplementation(async(op)=>{
  if(op==='availability')return availability;
  if(op==='send_code')return {id:'challenge',delivery:'sent'};
  if(op==='verify_code')return {proof:'verified-proof'};
  if(op==='book')return {id:'appointment',status:'pending_confirmation',start:availability.slots[0].start};
  return {};
});});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();window.history.replaceState(null,'','/');});
async function verifyContact(){
  mount(); await screen.findByText('Agenda una cita con Profesional de prueba');
  fireEvent.click(await screen.findByRole('button',{name:/10:00/}));
  fireEvent.click(screen.getByRole('button',{name:'Reservar'}));
  fireEvent.change(await screen.findByLabelText('Nombre completo'),{target:{value:'Persona ficticia'}});
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento'),{target:{value:'1990-03-12'}});
  fireEvent.change(screen.getByLabelText(/Número de WhatsApp/),{target:{value:'4920000001'}});
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Correo electrónico'),{target:{value:'synthetic@example.invalid'}});
  fireEvent.click(screen.getByRole('button',{name:'Verificar correo'}));
  await screen.findByLabelText('Código de 6 dígitos');
  fireEvent.change(screen.getByLabelText('Código de 6 dígitos'),{target:{value:'123456'}});
  fireEvent.click(screen.getByRole('button',{name:'Comprobar código'}));
  await screen.findByRole('button',{name:'Completar reserva'});
}
describe('public booking',()=>{
  it('requires basic registration and consent, but never requests clinical measurements',async()=>{
    mount(); fireEvent.click(await screen.findByRole('button',{name:'10:00'}));
    fireEvent.click(screen.getByRole('button',{name:'Reservar'}));
    await screen.findByLabelText('Nombre completo');
    expect(screen.getByRole('button',{name:'Verificar correo'})).toBeDisabled();
    expect(screen.queryByLabelText(/Peso|Estatura|Sexo/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre completo'),{target:{value:'Prueba'}});
    fireEvent.change(screen.getByLabelText('Correo electrónico'),{target:{value:'synthetic@example.invalid'}});
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'),{target:{value:'1990-03-12'}});
    fireEvent.change(screen.getByLabelText(/Número de WhatsApp/),{target:{value:'4920000001'}});
    expect(screen.getByRole('button',{name:'Verificar correo'})).toBeDisabled();
    expect(screen.getByText(/años · calculados automáticamente/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button',{name:'Verificar correo'})).toBeEnabled();
    fireEvent.change(screen.getByLabelText(/Fecha de nacimiento/),{target:{value:'2999-03-12'}});
    expect(screen.getByRole('button',{name:'Verificar correo'})).toBeDisabled();
    expect(api.mock.calls.every(([op])=>op==='availability')).toBe(true);
  });
  it('opens schedules for the first modality with availability without another click',async()=>{
    api.mockResolvedValue({...availability,locations:[{id:'clinic',name:'Consultorio de prueba',address:'Dirección sintética'}],options:[...availability.options,{modality:'in_person',location_id:'clinic'}],slots:[{...availability.slots[0],modality:'in_person',locationId:'clinic'}]});
    mount(); await screen.findByRole('button',{name:'10:00'});
    expect(screen.getByLabelText('Consultorio de prueba')).toBeChecked();
    expect(screen.getByRole('button',{name:'Reservar'})).toBeDisabled();
  });
  it('keeps the embedded panel compact and preserves contact when changing the day',async()=>{
    const nextSlot={...availability.slots[0],start:'2026-09-21T17:00:00Z',end:'2026-09-21T18:00:00Z'};
    api.mockResolvedValue({...availability,slots:[...availability.slots,nextSlot]});
    render(<MemoryRouter initialEntries={["/p/prueba"]}><Routes><Route path="/p/:slug" element={<PublicBookingPanel slug="prueba" compact/>}/><Route path="/p/:slug/agendar/datos" element={<PublicBookingPage/>}/></Routes></MemoryRouter>);
    await screen.findByRole('button',{name:'10:00'});
    expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'11:00'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'10:00'}));
    fireEvent.click(screen.getByRole('button',{name:'Reservar'}));
    await screen.findByRole('heading',{name:'2. Tus datos'});
    fireEvent.change(screen.getByLabelText('Nombre completo'),{target:{value:'Contacto ficticio'}});
    fireEvent.change(screen.getByLabelText('Correo electrónico'),{target:{value:'test@example.invalid'}});
    fireEvent.click(screen.getByRole('button',{name:'Cambiar horario'}));
    expect(screen.getByRole('heading',{name:'1. Elige tu horario'})).toHaveFocus();
    fireEvent.click(screen.getByRole('button',{name:/lunes, 21 de septiembre/}));
    expect(screen.getByRole('button',{name:'Reservar'})).toBeDisabled();
    expect(screen.queryByRole('button',{name:'10:00'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'11:00'}));
    fireEvent.click(screen.getByRole('button',{name:'Reservar'}));
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Contacto ficticio');
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('test@example.invalid');
    fireEvent.click(screen.getByRole('button',{name:'Cambiar horario'}));
    expect(screen.getByRole('button',{name:'11:00'})).toHaveAttribute('aria-pressed','true');
    expect(api.mock.calls.every(([op])=>op==='availability')).toBe(true);
  });
  it('shows only the selected modality and clears its selection when switching',async()=>{
    api.mockResolvedValue({...availability,locations:[{id:'clinic',name:'Consultorio de prueba',address:'Dirección sintética'}],
      options:[...availability.options,{modality:'in_person',location_id:'clinic'}],
      slots:[...availability.slots,{...availability.slots[0],modality:'in_person',locationId:'clinic',start:'2026-09-20T18:00:00Z'}]});
    mount();await screen.findByLabelText('En línea');
    expect(screen.getByRole('button',{name:'10:00'})).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('En línea'));
    fireEvent.click(screen.getByRole('button',{name:'10:00'}));
    fireEvent.click(screen.getByLabelText('Consultorio de prueba'));
    expect(screen.queryByRole('button',{name:'10:00'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'12:00'})).toHaveAttribute('aria-pressed','false');
    expect(screen.getByRole('button',{name:'Reservar'})).toBeDisabled();
  });
  it('distinguishes missing availability from a full week',async()=>{
    api.mockResolvedValue({...availability,hasSchedule:false,slots:[]});
    mount();await screen.findByText('Por el momento no hay horarios disponibles.');
    expect(screen.getByRole('button',{name:'Solicitar otro horario'})).toBeInTheDocument();
    expect(screen.queryByText('Estos días no tienen horarios libres. Prueba otra fecha.')).not.toBeInTheDocument();
  });
  it('does not offer stale slots when Google availability could not be checked',async()=>{
    api.mockResolvedValue({...availability,connectionError:true});
    mount();await screen.findByText(/No pudimos comprobar el calendario/);
    expect(screen.queryByRole('button',{name:'10:00'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Solicitar otro horario'})).toBeInTheDocument();
  });
  it('starts on the professional current date, not the UTC next day',async()=>{
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-09-16T00:30:00Z'));
    mount();await screen.findByText('Agenda una cita con Profesional de prueba');
    await waitFor(()=>expect(screen.getByLabelText('Ver la semana a partir de')).toHaveValue('2026-09-15'));
    expect(api).toHaveBeenCalledWith('availability',{slug:'prueba',from:'2026-09-15'});
    fireEvent.change(screen.getByLabelText('Ver la semana a partir de'),{target:{value:'2026-09-18'}});
    await waitFor(()=>expect(api).toHaveBeenCalledWith('availability',{slug:'prueba',from:'2026-09-18'}));
    expect(screen.getByLabelText('Ver la semana a partir de')).toHaveValue('2026-09-18');
  });
  it('shows the visited professional and requires a slot before email verification',async()=>{
    mount();await screen.findByText('Agenda una cita con Profesional de prueba');
    expect(screen.getByRole('button',{name:'Reservar'})).toBeDisabled();
    expect(screen.queryByRole('button',{name:'Completar reserva'})).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument();
  });
  it('uses verified contact, no patient or professional id supplied by visitor',async()=>{
    await verifyContact();fireEvent.click(screen.getByRole('button',{name:'Completar reserva'}));
    await screen.findByText('Tu reserva se registró correctamente');
    const call=api.mock.calls.find(([op])=>op==='book')![1]!;
    expect(call.slug).toBe('prueba');expect(call.proof).toBe('verified-proof');
    expect(call.payload).toMatchObject({registration:{birthDate:'1990-03-12',countryCode:'+52',phone:'+524920000001',consent:true}});
    expect(screen.getByText('Gracias por agendar tu cita. Tu nutriólogo se pondrá en contacto contigo para confirmar tu reserva.')).toBeInTheDocument();
    expect(call).not.toHaveProperty('patientId');expect(call).not.toHaveProperty('professionalId');
    expect(screen.queryByText(/correo fue recibido/i)).not.toBeInTheDocument();
  });
  it('preserves contact after a race and refreshes availability',async()=>{
    const fallback=api.getMockImplementation()!;
    api.mockImplementation(async(op,...args)=>{if(op==='book')throw new AgendaError('slot_taken');return fallback(op,...args);});
    await verifyContact();fireEvent.click(screen.getByRole('button',{name:'Completar reserva'}));
    await waitFor(()=>expect(api.mock.calls.filter(([op])=>op==='availability').length).toBeGreaterThan(1));
    fireEvent.click(await screen.findByRole('button',{name:'10:00'}));
    fireEvent.click(screen.getByRole('button',{name:'Reservar'}));
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Persona ficticia');
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('synthetic@example.invalid');
  });
  it('reuses the same operation key after a lost response',async()=>{
    const fallback=api.getMockImplementation()!;let attempts=0;
    api.mockImplementation(async(op,...args)=>{if(op==='book'&&attempts++===0)throw new Error('Conexión interrumpida');return fallback(op,...args);});
    await verifyContact();fireEvent.click(screen.getByRole('button',{name:'Completar reserva'}));
    await screen.findByText('Conexión interrumpida');
    fireEvent.click(screen.getByRole('button',{name:'Completar reserva'}));
    await screen.findByText('Tu reserva se registró correctamente');
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
