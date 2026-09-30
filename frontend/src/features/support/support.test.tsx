import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SupportWidget } from './SupportWidget';
import { AdminSupportPage } from './AdminSupportPage';
import { SupportComposer } from './SupportConversation';
import { useSupport } from './SupportProvider';
import { supportRequest, supportSource, supportContentRequest, type SupportThread } from './api';
import { AdminSupportContent, SupportFAQ, supportHours } from './SupportContent';
vi.mock('./api',async original=>({...await original<typeof import('./api')>(),supportRequest:vi.fn(),supportContentRequest:vi.fn()}));
vi.mock('./SupportProvider',()=>({useSupport:vi.fn()}));
vi.mock('@/src/features/admin/AdminPages',()=>({Heading:({title}:{title:string})=><h1>{title}</h1>}));
const thread:SupportThread={id:'thread1',professional_id:'pro1',topic:'agenda',source:'Agenda',status:'waiting',revision:3,last_seq:2,professional_unread:1,admin_unread:0,preview:'Respuesta de soporte',created_at:'2026-09-30T01:00:00Z',updated_at:'2026-09-30T01:05:00Z',first_response_at:'2026-09-30T01:05:00Z',resolved_at:null,professional_name:'Nutrióloga de prueba',email:'example@example.test'};
const refresh=vi.fn(async()=>{});
const state={thread,unread:1,revision:1,loading:false,error:'',refresh};
beforeEach(()=>{
 vi.clearAllMocks();vi.mocked(useSupport).mockReturnValue(state);
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
