import {expect,it,vi} from 'vitest';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {PublishedPlanHistory} from './PublishedPlanHistory';
import {portalAction} from '@/src/services/patientPortal';
vi.mock('@/src/services/patientPortal',()=>({portalAction:vi.fn(async(_a,action,data)=>action==='plan_history'?{versions:[{id:'v2',title:'Plan dos',version_number:2,published_at:'2026-09-21'},{id:'v1',title:'Plan uno',version_number:1,published_at:'2026-09-01'}]}:{plan:{title:data?.versionId==='v1'?'Arroz de v1':'Tortillas de v2',versionNumber:data?.versionId==='v1'?1:2,publishedAt:'2026-09-01',days:[]}})}));
it('lists published versions separately and opens the selected immutable version without editing',async()=>{
 render(<PublishedPlanHistory patientId="p"/>);
 const old=(await screen.findByText('Plan uno')).closest('article')!;
 expect(screen.getByText('Plan dos')).toBeVisible();
 fireEvent.click(within(old).getByRole('button',{name:'Ver'}));
 expect(await screen.findByRole('dialog',{name:'Plan publicado v1'})).toHaveTextContent('Arroz de v1');
 expect(portalAction).toHaveBeenCalledWith({patientId:'p'},'plan_version',{versionId:'v1'});
 fireEvent.click(screen.getByRole('button',{name:'Cerrar plan'}));
 fireEvent.click(within(old).getByRole('button',{name:'Exportar ▾'}));
 expect(within(old).getByRole('button',{name:'PDF'})).toBeVisible();expect(within(old).getByRole('button',{name:'LaTeX (.tex)'})).toBeVisible();
});
