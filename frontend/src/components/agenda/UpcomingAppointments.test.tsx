import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UpcomingAppointments } from './UpcomingAppointments';
import { agendaApi } from '@/src/services/agenda';
vi.mock('@/src/services/agenda',async original=>({...await original<typeof import('@/src/services/agenda')>(),agendaApi:vi.fn()}));
const base={timezone:'America/Mexico_City',professional_name:'Profesional prueba',modality:'online',location_snapshot:null,status:'confirmed',patient_attendance_at:null,professional_attendance_at:null,requires_confirmation:false};
const near={...base,id:'near',contact_name:'Paciente próximo',starts_at:'2099-10-01T16:00:00Z',ends_at:'2099-10-01T17:00:00Z'};
const far={...base,id:'far',contact_name:'Paciente posterior',starts_at:'2099-10-20T16:00:00Z',ends_at:'2099-10-20T17:00:00Z'};
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2099-09-30T16:00:00Z'));vi.mocked(agendaApi).mockResolvedValue({appointments:[near,far]});});
afterEach(()=>vi.useRealTimers());
it('shows the 48h reminder with direct attendance and WhatsApp actions',async()=>{
 render(<UpcomingAppointments remindersOnly/>);
 await screen.findByText('Paciente próximo');
 expect(screen.queryByText('Paciente posterior')).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Confirmar mi parte'})).toBeVisible();
 expect(screen.getByRole('button',{name:'Solicitar confirmación por WhatsApp'})).toBeVisible();
});
it('keeps future patient appointments and calendar actions available in Super Link',async()=>{
 render(<UpcomingAppointments session="synthetic"/>);
 await screen.findByText('Paciente posterior');
 expect(screen.getAllByRole('link',{name:'Añadir a Google Calendar'})).toHaveLength(2);
 expect(screen.getAllByRole('button',{name:'Confirmar mi asistencia'})).toHaveLength(1);
 expect(agendaApi).toHaveBeenCalledWith('portal_appointments',{session:'synthetic'});
});
