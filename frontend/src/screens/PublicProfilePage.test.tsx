import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicProfilePage } from './PublicProfilePage';
import { getPublicProfile } from '@/src/services/profile';
import { trackPublicProfileVisit } from '@/src/services/siteAnalytics';
import type { PublicProfileContent } from '@/src/types/domain';

const demoProfile = vi.hoisted(() => ({
  name:'Nutrióloga de prueba',slug:'prueba',specialties:[],careModalities:['online'],spokenLanguages:[],
  conditions:[],populations:[],education:[],links:[],gallery:[],approximateFee:500,currency:'MXN',
  biography:'Biografía de prueba', contacts:[],
}) satisfies PublicProfileContent);
vi.mock('@/src/services/profile',()=>({getPublicProfile:vi.fn(async()=>demoProfile)}));
vi.mock('@/src/services/siteAnalytics', () => ({ trackPublicProfileVisit: vi.fn() }));
vi.mock('@/src/services/agenda',async original=>({...await original<typeof import('@/src/services/agenda')>(),
  agendaApi:vi.fn(async()=>({name:'Nutrióloga de prueba',slug:'prueba',timezone:'America/Mexico_City',duration:30,
    horizonDays:30,minimumNoticeMinutes:120,hasSchedule:false,requestsEnabled:true,connectionError:false,
    locations:[],options:[{modality:'online',location_id:null}],slots:[]}))}));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
it('embeds a single booking flow even without public contact details or a published weekly schedule',async()=>{
  render(<MemoryRouter initialEntries={['/p/prueba']}><Routes><Route path="/p/:slug" element={<PublicProfilePage/>}/></Routes></MemoryRouter>);
  await screen.findByRole('heading',{name:'Nutrióloga de prueba'});
  expect(trackPublicProfileVisit).toHaveBeenCalledExactlyOnceWith('prueba');
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
it('does not record a visit when the public profile is unavailable', async () => {
  vi.mocked(getPublicProfile).mockResolvedValueOnce(null);
  render(<MemoryRouter initialEntries={['/p/no-publicado']}><Routes><Route path="/p/:slug" element={<PublicProfilePage/>}/></Routes></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Perfil no disponible' })).toBeVisible();
  expect(trackPublicProfileVisit).not.toHaveBeenCalled();
});

it('opens the selected photo and navigates through the gallery using buttons, keyboard and swipe', async () => {
  vi.mocked(getPublicProfile).mockResolvedValueOnce({ ...demoProfile, gallery: [
    { path: 'fachada.jpg', url: '/fachada.jpg', alt: 'Fachada del consultorio' },
    { path: 'interior.webp', url: '/interior.webp', thumbnailUrl: '/miniatura-interior.webp', alt: 'Interior' },
  ] });
  render(<MemoryRouter initialEntries={['/p/prueba']}><Routes><Route path="/p/:slug" element={<PublicProfilePage/>}/></Routes></MemoryRouter>);
  const trigger = await screen.findByRole('button', { name: /Ampliar imagen 2.*Interior/ });
  expect(trigger.querySelector('img')).toHaveAttribute('src', '/miniatura-interior.webp');
  fireEvent.click(trigger);
  const viewer = screen.getByRole('dialog', { name: 'Galería de servicios' });
  const controls = within(viewer);
  expect(controls.getByRole('img', { name: 'Interior' })).toHaveAttribute('src', '/interior.webp');
  expect(controls.getByRole('status')).toHaveTextContent('2 de 2');
  fireEvent.click(controls.getByRole('button', { name: 'Imagen anterior' }));
  const exterior = controls.getByRole('img', { name: 'Fachada del consultorio' });
  expect(exterior).toHaveAttribute('src', '/fachada.jpg');
  fireEvent.touchStart(exterior, { touches: [{ clientX: 220, clientY: 100 }] });
  fireEvent.touchEnd(exterior, { touches: [], changedTouches: [{ clientX: 100, clientY: 104 }] });
  expect(controls.getByRole('img', { name: 'Interior' })).toBeVisible();
  fireEvent.keyDown(viewer, { key: 'ArrowRight' });
  expect(controls.getByRole('status')).toHaveTextContent('1 de 2');
  fireEvent(viewer, new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('shows a single existing photo without carousel arrows', async () => {
  vi.mocked(getPublicProfile).mockResolvedValueOnce({ ...demoProfile, gallery: [{ path: 'fachada.png', url: '/fachada.png' }] });
  render(<MemoryRouter initialEntries={['/p/prueba']}><Routes><Route path="/p/:slug" element={<PublicProfilePage/>}/></Routes></MemoryRouter>);
  const trigger = await screen.findByRole('button', { name: /Ampliar imagen 1/ });
  expect(trigger.querySelector('img')).toHaveAttribute('src', '/fachada.png');
  fireEvent.click(trigger);
  const controls = within(screen.getByRole('dialog', { name: 'Galería de servicios' }));
  expect(controls.getByRole('img', { name: 'Imagen 1 de la galería' })).toBeVisible();
  expect(controls.queryByRole('button', { name: 'Imagen siguiente' })).not.toBeInTheDocument();
  fireEvent.click(controls.getByRole('button', { name: 'Cerrar galería' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
