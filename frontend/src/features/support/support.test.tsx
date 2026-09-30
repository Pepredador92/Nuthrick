import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SupportWidget } from './SupportWidget';
import { AdminSupportPage } from './AdminSupportPage';
import { SupportComposer } from './SupportConversation';
import { useSupport } from './SupportProvider';
import { supportRequest, supportSource, supportContentRequest, supportFiles, validateSupportFile, supportUploadAlreadyExists, type SupportThread } from './api';
import { AdminSupportContent, SupportFAQ, supportHours } from './SupportContent';
import { elapsedSupportTime, SupportStats } from './SupportStats';
vi.mock('./api',async original=>({...await original<typeof import('./api')>(),supportRequest:vi.fn(),supportContentRequest:vi.fn(),cleanupPendingSupportFiles:vi.fn(async()=>{}),supportFiles:vi.fn()}));
vi.mock('./SupportProvider',()=>({useSupport:vi.fn()}));
vi.mock('@/src/features/admin/AdminPages',()=>({Heading:({title}:{title:string})=><h1>{title}</h1>}));
const thread:SupportThread={id:'thread1',professional_id:'pro1',topic:'agenda',source:'Agenda',status:'waiting',revision:3,last_seq:2,professional_unread:1,admin_unread:0,preview:'Respuesta de soporte',created_at:'2026-09-30T01:00:00Z',updated_at:'2026-09-30T01:05:00Z',first_response_at:'2026-09-30T01:05:00Z',resolved_at:null,professional_name:'Nutrióloga de prueba',email:'example@example.test'};
const refresh=vi.fn(async()=>{});
const state={thread,unread:1,revision:1,loading:false,error:'',refresh};
beforeEach(()=>{
 vi.clearAllMocks();vi.mocked(useSupport).mockReturnValue(state);
 vi.mocked(supportFiles).mockReturnValue({upload:vi.fn(async()=>({error:null})),remove:vi.fn(async()=>({error:null}))} as unknown as ReturnType<typeof supportFiles>);
 vi.mocked(supportContentRequest).mockResolvedValue({settings:{starts_at:'09:00',ends_at:'17:00',timezone:'America/Mexico_City',revision:1},answers:[]});
 HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.open=true;});HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.open=false;});
 vi.mocked(supportRequest).mockImplementation(async action=>action==='thread'?{thread,messages:[{seq:2,sender:'admin',body:'Respuesta de soporte',created_at:thread.updated_at}]}:action==='inbox'?{items:[thread]}:{});
});
it('resets the professional bubble when administration resolves the case and starts with a blank composer',async()=>{
 const view=render(<MemoryRouter><SupportWidget/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'Soporte, 1 mensajes sin leer'}));
 await screen.findByText('Respuesta de soporte');
 expect(screen.queryByRole('button',{name:'Resolver y reiniciar'})).not.toBeInTheDocument();
 vi.mocked(useSupport).mockReturnValue({...state,thread:null,unread:0,revision:2});
 view.rerender(<MemoryRouter><SupportWidget/></MemoryRouter>);
 expect(screen.getByText('¿En qué podemos ayudarte?')).toBeVisible();
 expect(screen.queryByText('Respuesta de soporte')).not.toBeInTheDocument();
 expect(screen.getByRole('textbox',{name:'Mensaje para soporte'})).toHaveValue('');
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Mi nueva duda'}});fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
 await waitFor(()=>expect(supportRequest).toHaveBeenCalledWith('send',expect.objectContaining({body:'Mi nueva duda',topic:'other',clientKey:expect.any(String)}),false));
 const sent=vi.mocked(supportRequest).mock.calls.find(c=>c[0]==='send')!;expect(sent[1]).not.toHaveProperty('threadId');
});
it('preserves the message and its idempotency key after a network failure',async()=>{
 vi.mocked(supportRequest).mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValue({});
 render(<SupportComposer onSent={refresh}/>);fireEvent.change(screen.getByRole('textbox'),{target:{value:'Duda pendiente'}});fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
 await screen.findByText('Sin conexión');expect(screen.getByRole('textbox')).toHaveValue('Duda pendiente');
 fireEvent.click(screen.getByRole('button',{name:'Enviar'}));await waitFor(()=>expect(refresh).toHaveBeenCalled());
 expect(vi.mocked(supportRequest).mock.calls[0]).toEqual(vi.mocked(supportRequest).mock.calls[1]);
});
it('only gives administration the resolve operation, including the current revision',async()=>{
 vi.mocked(supportRequest).mockImplementation(async action=>action==='inbox'?{items:[thread]}:action==='thread'?{thread,messages:[]}:action==='status'?{...thread,status:'resolved',revision:4}:{});
 render(<AdminSupportPage/>);fireEvent.click(await screen.findByRole('button',{name:/Nutrióloga de prueba/}));
 fireEvent.click(screen.getByRole('button',{name:'Resolver y reiniciar'}));
 await waitFor(()=>expect(supportRequest).toHaveBeenCalledWith('status',{threadId:'thread1',revision:3,status:'resolved'},true));
 await screen.findByText(/El historial queda conservado/);
});
it('records only a module label, never a patient id or portal token',()=>{
 expect(supportSource('/app/patients/private-id/consultations/secret-id')).toBe('Consulta');
 expect(supportSource('/app/patients/private-id/portal')).toBe('Super Link');
});
const answer={id:'faq1',kind:'faq' as const,topic:'agenda' as const,title:'¿Dónde agendo?',body:'En Agenda, pulsa Agendar cita.',active:true,position:0,revision:1};
it('answers a common question without creating or resolving a human support case',()=>{
 const contact=vi.fn();render(<SupportFAQ answers={[answer]} topic="agenda" onContact={contact}/>);
 fireEvent.click(screen.getByRole('button',{name:'¿Dónde agendo?'}));expect(screen.getByText(answer.body)).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Hablar con el equipo'}));expect(contact).toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Resolvió mi duda'}));expect(screen.getByRole('status')).toHaveTextContent('pudimos ayudarte');
 expect(supportRequest).not.toHaveBeenCalled();
});
it('inserts a saved response as an editable draft without sending it',async()=>{
 vi.mocked(supportContentRequest).mockResolvedValue({settings:{revision:1},answers:[{...answer,kind:'macro'}]});
 render(<SupportComposer admin threadId="thread1" onSent={refresh}/>);
 fireEvent.change(await screen.findByLabelText('Respuesta guardada'),{target:{value:'faq1'}});
 expect(screen.getByRole('textbox')).toHaveValue(answer.body);expect(supportRequest).not.toHaveBeenCalled();
 fireEvent.change(screen.getByRole('textbox'),{target:{value:`${answer.body} Te ayudo.`}});fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
 await waitFor(()=>expect(supportRequest).toHaveBeenCalledWith('send',expect.objectContaining({body:`${answer.body} Te ayudo.`}),true));
});
it('allows administrators to configure the requested support hours',async()=>{
 render(<AdminSupportContent/>);expect(await screen.findByLabelText('Desde')).toHaveValue('09:00');expect(screen.getByLabelText('Hasta')).toHaveValue('17:00');
 fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:'16:00'}});fireEvent.click(screen.getByRole('button',{name:'Guardar horario'}));
 await waitFor(()=>expect(supportContentRequest).toHaveBeenCalledWith('save_settings',{starts_at:'09:00',ends_at:'16:00',timezone:'America/Mexico_City',revision:1},true));
 expect(supportHours({starts_at:'09:00',ends_at:'17:00',timezone:'America/Mexico_City',revision:1})).toBe('9:00 a. m. a 5:00 p. m. · Ciudad de México');
});
it('validates screenshot type and size before making any upload',()=>{
 expect(()=>validateSupportFile(new File(['svg'],'capture.svg',{type:'image/svg+xml'}))).toThrow('hasta 5 MB');
 const large=new File(['png'],'large.png',{type:'image/png'});Object.defineProperty(large,'size',{value:5242881});expect(()=>validateSupportFile(large)).toThrow('hasta 5 MB');
 render(<SupportComposer onSent={refresh}/>);fireEvent.change(screen.getByLabelText('Seleccionar captura'),{target:{files:[large]}});
 expect(screen.getByRole('alert')).toHaveTextContent('hasta 5 MB');expect(supportRequest).not.toHaveBeenCalled();
 expect(supportUploadAlreadyExists({statusCode:'400',message:'The resource already exists'})).toBe(true);
 expect(supportUploadAlreadyExists({statusCode:409})).toBe(true);
 expect(supportUploadAlreadyExists({statusCode:400,message:'Invalid file'})).toBe(false);
});
it('uploads a private screenshot once and retries the same message without duplicating it',async()=>{
 let sendCount=0;
 vi.mocked(supportRequest).mockImplementation(async action=>{
  if(action==='prepare_asset')return {id:'asset1',path:'user/capture.png',file_name:'capture.png'};
  if(action==='send'&&++sendCount===1)throw new Error('Sin conexión');return {};
 });
 render(<SupportComposer onSent={refresh}/>);fireEvent.change(screen.getByLabelText('Seleccionar captura'),{target:{files:[new File(['png'],'capture.png',{type:'image/png'})]}});
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Este es el error'}});fireEvent.click(screen.getByRole('button',{name:'Enviar'}));await screen.findByText('Sin conexión');
 fireEvent.click(screen.getByRole('button',{name:'Enviar'}));await waitFor(()=>expect(refresh).toHaveBeenCalled());
 const sends=vi.mocked(supportRequest).mock.calls.filter(c=>c[0]==='send');expect(sends[0]).toEqual(sends[1]);expect(sends[0][1]).toMatchObject({assetId:'asset1'});
 expect(supportFiles().upload).toHaveBeenCalledTimes(1);
});
it('shows no invented response average when no cases have been answered',async()=>{
 vi.mocked(supportRequest).mockResolvedValue({new:0,in_progress:0,waiting:0,without_reply:0,opened_30d:0,resolved_30d:0,response_minutes:null,response_sample:0,resolution_minutes:null,as_of:thread.created_at});
 render(<SupportStats/>);expect(await screen.findAllByText('Sin datos')).toHaveLength(2);
 expect(supportRequest).toHaveBeenCalledWith('stats',{},true);expect(elapsedSupportTime(120)).toBe('2 h');
});
