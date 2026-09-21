import {beforeEach,expect,it,vi} from 'vitest';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {PortalChat} from './PortalChat';
import {portalAction} from '@/src/services/patientPortal';
vi.mock('@/src/services/patientPortal',()=>({portalAction:vi.fn()}));
beforeEach(()=>{vi.clearAllMocks();vi.mocked(portalAction).mockImplementation(async()=>({messages:[],before:null}));});
for(const access of [{patientId:'professional-patient'},{session:'patient-session'}]){
 it(`Enter sends, button remains, whitespace and IME do not send (${Object.keys(access)[0]})`,async()=>{
  render(<PortalChat access={access} counterpart="Prueba"/>);
  await screen.findByText('La conversación empieza contigo.');
  const input=screen.getByRole('textbox',{name:'Escribe un mensaje'});
  fireEvent.keyDown(input,{key:'Enter'});
  fireEvent.change(input,{target:{value:'   '}});fireEvent.keyDown(input,{key:'Enter'});
  expect(vi.mocked(portalAction).mock.calls.filter(c=>c[1]==='message')).toHaveLength(0);
  fireEvent.change(input,{target:{value:'Hola'}});fireEvent.compositionStart(input);fireEvent.keyDown(input,{key:'Enter',isComposing:true});fireEvent.compositionEnd(input);
  fireEvent.keyDown(input,{key:'Enter',keyCode:229});
  expect(vi.mocked(portalAction).mock.calls.filter(c=>c[1]==='message')).toHaveLength(0);
  expect(fireEvent.keyDown(input,{key:'Enter',shiftKey:true})).toBe(true);
  expect(vi.mocked(portalAction).mock.calls.filter(c=>c[1]==='message')).toHaveLength(0);
  fireEvent.change(input,{target:{value:'Línea uno\nLínea dos'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar mensaje'}));
  await waitFor(()=>expect(portalAction).toHaveBeenCalledWith(access,'message',expect.objectContaining({body:'Línea uno\nLínea dos',clientId:expect.any(String)})));
  await waitFor(()=>expect(input).toBeEnabled());
  fireEvent.change(input,{target:{value:' Hola '}});fireEvent.keyDown(input,{key:'Enter'});
  await waitFor(()=>expect(portalAction).toHaveBeenCalledWith(access,'message',expect.objectContaining({body:'Hola'})));
 });
}
it('blocks double Enter in the same event loop and reuses the clientId after a network failure',async()=>{
 let reject!:(reason:Error)=>void;
 vi.mocked(portalAction).mockImplementation(async(_a,action)=>action==='message'?await new Promise((_resolve,no)=>{reject=no;}):{messages:[],before:null});
 render(<PortalChat access={{session:'s'}} counterpart="Prueba"/>);
 await screen.findByText('La conversación empieza contigo.');
 const input=screen.getByRole('textbox');fireEvent.change(input,{target:{value:'Hola'}});
 act(()=>{fireEvent.keyDown(input,{key:'Enter'});fireEvent.keyDown(input,{key:'Enter'});});
 let calls=vi.mocked(portalAction).mock.calls.filter(c=>c[1]==='message');expect(calls).toHaveLength(1);const id=calls[0][2]?.clientId;
 await act(async()=>reject(new Error('Red interrumpida')));
 fireEvent.keyDown(input,{key:'Enter'});calls=vi.mocked(portalAction).mock.calls.filter(c=>c[1]==='message');expect(calls).toHaveLength(2);expect(calls[1][2]?.clientId).toBe(id);
 await act(async()=>reject(new Error('Red interrumpida')));
});
