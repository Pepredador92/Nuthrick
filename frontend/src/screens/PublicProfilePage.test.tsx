import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicProfilePage } from './PublicProfilePage';

vi.mock('@/src/services/profile',()=>({getPublicProfile:vi.fn(async()=>({
  name:'Nutrióloga de prueba',slug:'prueba',specialties:[],careModalities:['online'],spokenLanguages:[],
  conditions:[],populations:[],education:[],links:[],gallery:[],approximateFee:500,currency:'MXN',
  biography:'Biografía de prueba', contacts:[],
}))}));
vi.mock('@/src/services/agenda',async original=>({...await original<typeof import('@/src/services/agenda')>(),
  agendaApi:vi.fn(async()=>({name:'Nutrióloga de prueba',slug:'prueba',timezone:'America/Mexico_City',duration:30,
    horizonDays:30,minimumNoticeMinutes:120,hasSchedule:false,requestsEnabled:true,connectionError:false,
    locations:[],options:[{modality:'online',location_id:null}],slots:[]}))}));
afterEach(cleanup);
it('embeds a single booking flow even without public contact details or a published weekly schedule',async()=>{
  render(<MemoryRouter initialEntries={['/p/prueba']}><Routes><Route path="/p/:slug" element={<PublicProfilePage/>}/></Routes></MemoryRouter>);
  await screen.findByRole('heading',{name:'Nutrióloga de prueba'});
  expect(screen.queryByRole('link',{name:'Agendar cita'})).not.toBeInTheDocument();
  expect(screen.getAllByRole('complementary',{name:'Reservar una cita'})).toHaveLength(1);
  await screen.findByText('Por el momento no hay horarios disponibles.');
  expect(screen.getByRole('button',{name:'Solicitar otro horario'})).toBeInTheDocument();
  expect(screen.getAllByText('$500.00')).toHaveLength(1);
  expect(screen.getByText('Biografía de prueba')).toBeInTheDocument();
  expect(screen.getByRole('navigation',{name:'Secciones del perfil'})).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Sobre mí'})).toHaveAttribute('href','#sobre-mi');
  expect(screen.getByRole('link',{name:'Reservar una cita'})).toHaveAttribute('href','#agendar');
  expect(screen.queryByText('Suscripción')).not.toBeInTheDocument();
});
