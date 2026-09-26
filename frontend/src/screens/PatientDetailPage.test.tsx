import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {PatientDetailPage} from './PatientDetailPage';
import {deleteConsultationRecord} from '@/src/services/consultations';
import {updatePatient} from '@/src/services/patients';
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
vi.mock('@/src/services/consultations',()=>({deleteConsultationRecord:vi.fn(),getSnapshot:vi.fn(),listAnswers:vi.fn()}));
vi.mock('@/src/services/patients',()=>({
 getPatient:async()=>({id:'patient',full_name:'Paciente de prueba',status:'active',birth_date:null,email:null,phone:null,gender:null,timezone:'America/Mexico_City'}),
 listConsultations:async()=>[{id:'completed',patient_id:'patient',professional_id:'owner',consultation_date:'2026-09-15T10:00:00Z',consultation_type:'initial',sequence_number:1,status:'completed',summary:null}],
 listPatientNotes:async()=>[],listNutritionPlans:async()=>[],listProgressPhotos:async()=>[],
 archivePatient:vi.fn(),createPatientNote:vi.fn(),deletePatientNote:vi.fn(),deletePatient:vi.fn(),registerProgressPhoto:vi.fn(),restorePatient:vi.fn(),updatePatient:vi.fn(),updatePatientNote:vi.fn(),
}));
beforeEach(()=>vi.clearAllMocks());
async function openDelete() {
 render(<MemoryRouter initialEntries={['/patients/patient']}><Routes><Route path="/patients/:patientId" element={<PatientDetailPage/>}/></Routes></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Historial'}));
 fireEvent.click(within(screen.getByRole('dialog',{name:'Historial del paciente'})).getByRole('button',{name:'Eliminar'}));
 fireEvent.click(screen.getByRole('button',{name:'Eliminar consulta'}));
}
describe('consultation removal feedback',()=>{
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
