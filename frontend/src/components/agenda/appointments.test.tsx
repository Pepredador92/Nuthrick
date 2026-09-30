import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ScheduleAppointmentButton } from './ScheduleAppointmentButton';
import { AppointmentActions, AppointmentStatus } from './AppointmentCard';
import { AppointmentConfirmationPage } from '@/src/screens/AppointmentConfirmationPage';
import { agendaApi } from '@/src/services/agenda';
import { appointmentIcs, googleCalendarUrl, whatsappAppointmentUrl, type Appointment } from '@/src/services/appointments';
vi.mock('@/src/services/agenda',async original=>({...await original<typeof import('@/src/services/agenda')>(),agendaApi:vi.fn()}));
vi.mock('@/src/services/patients',()=>({listPatients:vi.fn(async()=>({rows:[{id:'p1',full_name:'Paciente prueba'}]}))}));
const appointment:Appointment={id:'a1',starts_at:'2099-10-01T16:00:00Z',ends_at:'2099-10-01T17:00:00Z',timezone:'America/Mexico_City',professional_name:'Nutrióloga prueba',modality:'online',location_snapshot:null,status:'confirmed',patient_confirmed_at:null,professional_confirmed_at:null};
beforeEach(()=>{vi.clearAllMocks();HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true;});HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.open=false;});vi.mocked(agendaApi).mockImplementation(async(op)=>op==='appointment_options'?{timezone:'America/Mexico_City',duration:60,minimumNoticeMinutes:0,horizonDays:365,options:[{modality:'online',location_id:null,label:'En línea'}]}:op==='appointment_availability'?{day:'2099-10-01',today:'2099-10-01',lastDay:'2099-12-31',timezone:'America/Mexico_City',weekdays:[0,1,2,3,4,5,6],slots:[{start:appointment.starts_at,end:appointment.ends_at}],connectionError:false}:op==='resolve_time_private'?{instants:[appointment.starts_at]}:op==='appointment_link'?{url:'https://nuthrick.com/agenda/confirmar#secret',phone:'+524920000000'}:appointment);});
it.each([true,false])('agendas from a preselected patient (%s) through the shared form',async preselected=>{
 const saved=vi.fn();render(<ScheduleAppointmentButton patient={preselected?{id:'p1',full_name:'Paciente prueba'}:undefined} onSaved={saved}/>);
 fireEvent.click(screen.getByRole('button',{name:'Agendar cita'}));
 await screen.findByText(/Duración: 60 min/);
 if(!preselected){fireEvent.focus(screen.getByRole('combobox',{name:'Paciente'}));fireEvent.click(await screen.findByRole('option',{name:'Paciente prueba'}));}
 fireEvent.click(await screen.findByRole('button',{name:/10:00/}));
 fireEvent.click(screen.getAllByRole('button',{name:'Agendar cita'}).at(-1)!);
 await screen.findByText('Cita agendada');
 expect(agendaApi).toHaveBeenCalledWith('appointment_create',expect.objectContaining({patientId:'p1',start:appointment.starts_at,modality:'online',allowOutsideSchedule:false,operationKey:expect.any(String)}),true);expect(saved).toHaveBeenCalledOnce();
});
it('keeps entered data and the operation key on a failed creation retry',async()=>{
 let failures=0;const base=vi.mocked(agendaApi).getMockImplementation()!;
 vi.mocked(agendaApi).mockImplementation(async(...args)=>{if(args[0]==='appointment_create'&&failures++===0)throw new Error('Sin conexión');return base(...args);});
 render(<ScheduleAppointmentButton patient={{id:'p1',full_name:'Paciente prueba'}}/>);fireEvent.click(screen.getByRole('button',{name:'Agendar cita'}));fireEvent.click(await screen.findByRole('button',{name:/10:00/}));fireEvent.click(screen.getAllByRole('button',{name:'Agendar cita'}).at(-1)!);await screen.findByText('Sin conexión');fireEvent.click(screen.getAllByRole('button',{name:'Agendar cita'}).at(-1)!);await screen.findByText('Cita agendada');const calls=vi.mocked(agendaApi).mock.calls.filter(c=>c[0]==='appointment_create');expect(calls[0][1]).toEqual(calls[1][1]);
});
it('distinguishes professional-only confirmation from both',()=>{const r=render(<AppointmentStatus appointment={{professional_confirmed_at:'date'}}/>);expect(screen.getByText('Falta confirmación del paciente')).toBeVisible();r.rerender(<AppointmentStatus appointment={{professional_confirmed_at:'date',patient_confirmed_at:'date'}}/>);expect(screen.getByText('Ambos confirmaron')).toBeVisible();r.rerender(<AppointmentStatus appointment={{professional_confirmed_at:'date',patient_confirmed_at:null,registration_consented_at:'old-consent'}}/>);expect(screen.getByText('Falta confirmación del paciente')).toBeVisible();});
it('preserves explicit scheduling exceptions and server timezone resolution',async()=>{
 render(<ScheduleAppointmentButton patient={{id:'p1',full_name:'Paciente prueba'}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Agendar cita'}));
 fireEvent.click(await screen.findByRole('checkbox',{name:/Autorizar fuera/}));
 fireEvent.change(screen.getByLabelText('Fecha y hora fuera del horario habitual'),{target:{value:'2099-10-01T10:00'}});
 fireEvent.click(screen.getAllByRole('button',{name:'Agendar cita'}).at(-1)!);
 await screen.findByText('Cita agendada');
 expect(agendaApi).toHaveBeenCalledWith('resolve_time_private',{localTime:'2099-10-01T10:00'},true);
 expect(agendaApi).toHaveBeenCalledWith('appointment_create',expect.objectContaining({allowOutsideSchedule:true}),true);
});
it('offers WhatsApp only after generating the scoped confirmation link',async()=>{
 render(<AppointmentActions appointment={appointment} onChanged={()=>{}}/>);expect(screen.queryByRole('link',{name:/WhatsApp/})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Compartir confirmación'}));const link=await screen.findByRole('link',{name:/WhatsApp/});expect(link).toHaveAttribute('href',whatsappAppointmentUrl('+524920000000','https://nuthrick.com/agenda/confirmar#secret'));expect(whatsappAppointmentUrl('123','url')).toBeNull();
});
it('opening the invitation does not confirm; the patient explicitly confirms and receives calendar actions',async()=>{
 window.history.replaceState(null,'','/agenda/confirmar#token');vi.mocked(agendaApi).mockImplementation(async(op)=>op==='appointment_confirm'?{...appointment,patient_confirmed_at:'2099-09-01'}:appointment);
 render(<MemoryRouter><AppointmentConfirmationPage/></MemoryRouter>);await screen.findByText('Con Nutrióloga prueba');expect(agendaApi).not.toHaveBeenCalledWith('appointment_confirm',expect.anything());fireEvent.click(screen.getByRole('button',{name:'Confirmar mi asistencia'}));await screen.findByText('Tu asistencia está confirmada.');expect(screen.getByRole('link',{name:'Añadir a Google Calendar'})).toBeVisible();expect(window.location.hash).toBe('');
});
it('keeps dates in UTC and escapes calendar text without leaking the confirmation token',()=>{const a={...appointment,professional_name:'Nombre\ntexto;extra'};expect(appointmentIcs(a)).toContain('DTSTART:20991001T160000Z');expect(appointmentIcs(a)).toContain('Nombre\\ntexto\\;extra');expect(googleCalendarUrl(a)).not.toContain('token');});
it('can confirm directly from the notification/ficha card',async()=>{const changed=vi.fn();render(<AppointmentActions appointment={appointment} onChanged={changed}/>);fireEvent.click(screen.getByRole('button',{name:'Confirmar mi parte'}));await waitFor(()=>expect(changed).toHaveBeenCalledOnce());expect(agendaApi).toHaveBeenCalledWith('manage',expect.objectContaining({payload:{action:'confirm_reservation',id:'a1'}}),true);});
