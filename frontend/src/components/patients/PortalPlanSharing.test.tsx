import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {expect,it,vi} from 'vitest';
import {PortalPlanSharing} from './PortalPlanSharing';
import {portalAction} from '@/src/services/patientPortal';
vi.mock('@/src/services/patientPortal',()=>({portalAction:vi.fn()}));
it('requires selection, patient preview and acknowledgement before sharing a plan ID only',async()=>{
  vi.mocked(portalAction).mockImplementation(async(_access,action)=>action==='plan_options'?{plans:[{id:'published',title:'Publicado',version_number:1,published_at:'2026-09-21'}],selectedPlanId:null}:action==='plan_preview'?{plan:{title:'Publicado',versionNumber:1,publishedAt:'2026-09-21',days:[]}}:{ok:true});
  render(<MemoryRouter><PortalPlanSharing patientId="patient"/></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('Plan visible en Mi plan'),{target:{value:'published'}});
  await screen.findByRole('region',{name:'Plan alimenticio publicado'});
  expect(screen.getByRole('button',{name:'Compartir plan'})).toBeDisabled();
  expect(vi.mocked(portalAction).mock.calls.some(c=>c[1]==='share_plan')).toBe(false);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Compartir plan'}));
  await waitFor(()=>expect(portalAction).toHaveBeenCalledWith({patientId:'patient'},'share_plan',{planId:'published'}));
  await screen.findByText('Plan compartido. El paciente verá su última versión publicada.');
});
