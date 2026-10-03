import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom';
import {PatientDetailPage} from './PatientDetailPage';
import {deleteConsultationRecord,renameConsultation} from '@/src/services/consultations';
import {listConsultations,updatePatient} from '@/src/services/patients';
import {EvolutionExportDialog} from '@/src/components/patients/EvolutionExportDialog';
import {loadProfessionalDocumentProfile} from '@/src/services/profile';
import {getSignedMediaUrl} from '@/src/services/media';
vi.mock('@/src/lib/supabase',()=>({supabase:{}}));
vi.mock('@/src/features/auth/AuthProvider',()=>({useAuth:()=>({user:{id:'owner'}})}));
vi.mock('@/src/components/patients/EvolutionCharts',()=>({PatientEvolutionCharts:()=>null}));
vi.mock('@/src/components/patients/PatientEvolutionTable',()=>({PatientEvolutionTable:()=>null}));
vi.mock('@/src/components/patients/EvolutionExportDialog',()=>({EvolutionExportDialog:vi.fn(()=>null)}));
vi.mock('@/src/services/profile',()=>({loadProfessionalDocumentProfile:vi.fn()}));
vi.mock('@/src/services/media',()=>({getSignedMediaUrl:vi.fn(),getSignedPatientPhotoUrl:vi.fn(),uploadPatientProgressPhoto:vi.fn()}));
vi.mock('@/src/components/consultations/SnapshotHistory',()=>({SnapshotHistory:()=>null}));
vi.mock('@/src/services/consultations',()=>({deleteConsultationRecord:vi.fn(),renameConsultation:vi.fn(),getSnapshot:vi.fn(),listAnswers:vi.fn()}));
vi.mock('@/src/services/patients',()=>({
 getPatient:async()=>({id:'patient',full_name:'Paciente de prueba',status:'active',birth_date:null,email:null,phone:null,gender:null,timezone:'America/Mexico_City'}),
 listConsultations:vi.fn(async()=>[{id:'completed',patient_id:'patient',professional_id:'owner',consultation_date:'2026-09-15T10:00:00Z',consultation_type:'initial',sequence_number:1,status:'completed',summary:null}]),
 listPatientNotes:async()=>[],listNutritionPlans:async()=>[],listProgressPhotos:async()=>[],
 archivePatient:vi.fn(),createPatientNote:vi.fn(),deletePatientNote:vi.fn(),deletePatient:vi.fn(),registerProgressPhoto:vi.fn(),restorePatient:vi.fn(),updatePatient:vi.fn(),updatePatientNote:vi.fn(),
}));
beforeEach(()=>{
 vi.clearAllMocks();
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 HTMLDialogElement.prototype.close=function(){this.open=false;};
});
function CurrentLocation() { const location=useLocation(); return <output aria-label="Ruta actual">{location.pathname}{location.search}</output>; }
async function openDelete() {
 render(<MemoryRouter initialEntries={['/patients/patient']}><Routes><Route path="/patients/:patientId" element={<PatientDetailPage/>}/></Routes></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Historial'}));
 fireEvent.click(within(screen.getByRole('dialog',{name:'Historial del paciente'})).getByRole('button',{name:'Eliminar'}));
 fireEvent.click(screen.getByRole('button',{name:'Eliminar consulta'}));
}
describe('consultation removal feedback',()=>{
 it('renames a closed visit from recent consultations without entering the clinical editor',async()=>{
  vi.mocked(renameConsultation).mockImplementation(async(c,name)=>({...c,display_name:name}));
  render(<MemoryRouter initialEntries={['/patients/patient']}><CurrentLocation/><Routes><Route path="/patients/:patientId" element={<PatientDetailPage/>}/></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Cambiar nombre de Consulta de inicio'}));
  const dialog=within(screen.getByRole('dialog',{name:'Cambiar nombre de consulta'}));
  fireEvent.change(dialog.getByLabelText('Nombre de la consulta'),{target:{value:'Primera valoración'}});
  fireEvent.click(dialog.getByRole('button',{name:'Guardar nombre'}));
  expect(await screen.findByRole('button',{name:'Cambiar nombre de Primera valoración'})).toBeVisible();
  expect(renameConsultation).toHaveBeenCalledWith(expect.objectContaining({id:'completed',status:'completed'}),'Primera valoración');
  expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/patients/patient');
  fireEvent.click(screen.getByRole('button',{name:'Historial'}));
  const history=within(screen.getByRole('dialog',{name:'Historial del paciente'}));
  expect(history.getByRole('button',{name:'Cambiar nombre de Primera valoración'})).toBeVisible();
  expect(history.getAllByText('Consulta cerrada').length).toBeGreaterThan(0);
 });
 it('keeps the entered name and shows a save failure inside the name dialog',async()=>{
  vi.mocked(renameConsultation).mockRejectedValue(new Error('No pudimos cambiar el nombre.'));
  render(<MemoryRouter initialEntries={['/patients/patient']}><Routes><Route path="/patients/:patientId" element={<PatientDetailPage/>}/></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Cambiar nombre de Consulta de inicio'}));
  const dialog=within(screen.getByRole('dialog',{name:'Cambiar nombre de consulta'}));
  fireEvent.change(dialog.getByLabelText('Nombre de la consulta'),{target:{value:'Nuevo nombre'}});
  fireEvent.click(dialog.getByRole('button',{name:'Guardar nombre'}));
  expect(await dialog.findByRole('alert')).toHaveTextContent('No pudimos cambiar el nombre.');
  expect(dialog.getByLabelText('Nombre de la consulta')).toHaveValue('Nuevo nombre');
  expect(screen.getByRole('button',{name:'Cambiar nombre de Consulta de inicio'})).toBeInTheDocument();
 });
 it('allows saving portal access without email for the manual-code flow',async()=>{
  vi.mocked(updatePatient).mockResolvedValue({id:'patient',full_name:'Paciente de prueba',status:'active',email:null,portal_access_enabled:true} as Awaited<ReturnType<typeof updatePatient>>);
  render(<MemoryRouter initialEntries={['/patients/patient']}><Routes><Route path="/patients/:patientId" element={<PatientDetailPage/>}/></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Editar datos'}));
  fireEvent.click(screen.getByRole('checkbox',{name:/Permitir acceso al portal/}));
  fireEvent.submit(screen.getByRole('button',{name:'Guardar'}).closest('form')!);
  await waitFor(()=>expect(updatePatient).toHaveBeenCalledWith('patient',expect.objectContaining({email:null,portal_access_enabled:true})));
 });
 it('removes the consultation from both history and recent list after success',async()=>{
  vi.mocked(deleteConsultationRecord).mockResolvedValue(undefined);
  await openDelete();
  await waitFor(()=>expect(deleteConsultationRecord).toHaveBeenCalledWith('completed'));
  await waitFor(()=>expect(screen.queryAllByText('Consulta de inicio')).toHaveLength(0));
  expect(within(screen.getByRole('dialog',{name:'Historial del paciente'})).getByRole('status')).toHaveTextContent('Consulta retirada');
 });
 it('keeps the consultation and exposes a failed removal inside the open modal',async()=>{
  vi.mocked(deleteConsultationRecord).mockRejectedValue(new Error('No pudimos eliminar la consulta.'));
  await openDelete();
  const history=within(screen.getByRole('dialog',{name:'Historial del paciente'}));
  expect(await history.findByRole('alert')).toHaveTextContent('No pudimos eliminar la consulta.');
  expect(history.getByRole('button',{name:'Eliminar'})).toBeVisible();
 });
});

describe('progress report professional identity',()=>{
 it.each([true,false])('loads the configured logo and rejects an unavailable signed URL (available: %s)',async available=>{
  vi.mocked(loadProfessionalDocumentProfile).mockResolvedValue({profile:{full_name:'Nutrióloga de prueba'},business:{logo_path:'owner/logo.png'},contacts:[],locations:[]} as never);
  vi.mocked(getSignedMediaUrl).mockResolvedValue(available?'https://example.com/signed-logo.png':null);
  render(<MemoryRouter initialEntries={['/patients/patient']}><Routes><Route path="/patients/:patientId" element={<PatientDetailPage/>}/></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Ver evolución'}));
  fireEvent.click(screen.getByRole('button',{name:'Exportar'}));
  const getInfo=vi.mocked(EvolutionExportDialog).mock.calls.at(-1)![0].getProfessionalInfo;
  if (available) await expect(getInfo()).resolves.toMatchObject({fullName:'Nutrióloga de prueba',logoUrl:'https://example.com/signed-logo.png'});
  else await expect(getInfo()).rejects.toThrow('No pudimos cargar el logo del nutriólogo');
  expect(loadProfessionalDocumentProfile).toHaveBeenCalledWith('owner');
  expect(getSignedMediaUrl).toHaveBeenCalledWith('owner/logo.png');
 });
});

describe('consultation status and history navigation',()=>{
 it('opens history from the Superlink URL and keeps other parameters when closed',async()=>{
  render(<MemoryRouter initialEntries={['/app/patients/patient?view=history&from=portal']}><CurrentLocation/><Routes><Route path="/app/patients/:patientId" element={<PatientDetailPage/>}/></Routes></MemoryRouter>);
  const history=within(await screen.findByRole('dialog',{name:'Historial del paciente'}));
  expect(history.getByRole('button',{name:'Editar'})).toBeVisible();
  expect(history.getByRole('link',{name:'Configurar gráficas en Superlink'})).toHaveAttribute('href','/app/patients/patient/portal');
  fireEvent.click(history.getByRole('button',{name:'Cerrar historial'}));
  expect(screen.queryByRole('dialog',{name:'Historial del paciente'})).not.toBeInTheDocument();
  expect(screen.getByLabelText('Ruta actual')).toHaveTextContent('/app/patients/patient?from=portal');
  fireEvent.click(screen.getByRole('button',{name:'Historial'}));
  expect(screen.getByRole('dialog',{name:'Historial del paciente'})).toBeVisible();
 });
 it('distinguishes pending, closed and cancelled consultations in desktop and mobile history',async()=>{
  vi.mocked(listConsultations).mockResolvedValueOnce(['draft','completed','cancelled'].map((status,index)=>({id:status,patient_id:'patient',professional_id:'owner',consultation_date:'2026-09-15T12:00:00Z',consultation_type:'follow_up',sequence_number:index+1,status,summary:null})) as never);
  render(<MemoryRouter initialEntries={['/app/patients/patient?view=history']}><Routes><Route path="/app/patients/:patientId" element={<PatientDetailPage/>}/><Route path="/app/patients/:patientId/consultations/:id" element={<p>Editor de consulta</p>}/></Routes></MemoryRouter>);
  const history=within(await screen.findByRole('dialog',{name:'Historial del paciente'}));
  const overview=()=>within(history.getByRole('button',{name:/^(Editar|Reabrir consulta)$/}).closest('article')!);
  expect(overview().getByText('Pendiente de cerrar')).toHaveClass('bg-amber-50');
  expect(overview().getByText(/entra en Editar y usa Revisar cierre de consulta/)).toBeVisible();
  expect(history.getByRole('option',{name:/Pendiente de cerrar/})).toBeInTheDocument();
  expect(history.getByRole('option',{name:/Consulta cerrada/})).toBeInTheDocument();
  expect(history.getByRole('option',{name:/Consulta cancelada/})).toBeInTheDocument();
  fireEvent.click(history.getByRole('button',{name:/Seguimiento.*Consulta cerrada/}));
  expect(overview().getByText('Consulta cerrada')).toHaveClass('bg-emerald-50');
  expect(overview().getByText(/selecciona los resultados en Superlink y pulsa Publicar/)).toBeVisible();
  fireEvent.change(history.getByLabelText('Seleccionar consulta'),{target:{value:'cancelled'}});
  expect(overview().getByText('Consulta cancelada')).toHaveClass('bg-slate-100');
  expect(history.getByRole('button',{name:'Reabrir consulta'})).toBeVisible();
  expect(overview().queryByText('Pendiente de cerrar')).not.toBeInTheDocument();
  fireEvent.change(history.getByLabelText('Seleccionar consulta'),{target:{value:'draft'}});
  fireEvent.click(history.getByRole('button',{name:'Editar'}));
  expect(await screen.findByText('Editor de consulta')).toBeVisible();
 });
});
