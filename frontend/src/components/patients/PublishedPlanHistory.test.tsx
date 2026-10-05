import {expect,it,vi} from 'vitest';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {PublishedPlanHistory} from './PublishedPlanHistory';
import {portalAction} from '@/src/services/patientPortal';
const {versions}=vi.hoisted(()=>({versions:[{id:'v2',title:'Plan dos',version_number:2,published_at:'2026-09-21'},{id:'v1',title:'Plan uno',version_number:1,published_at:'2026-09-01'}]}));
vi.mock('@/src/services/patientPortal',()=>({portalAction:vi.fn(async(_a,action,data)=>action==='plan_history'?data?.retireVersionId?{ok:true,removedFromSharedPlan:data.retireVersionId==='v2'}:{versions}:{plan:{title:data?.versionId==='v1'?'Arroz de v1':'Tortillas de v2',versionNumber:data?.versionId==='v1'?1:2,publishedAt:'2026-09-01',days:[]}})}));
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

it('retires an obsolete publication from history after confirmation',async()=>{
 render(<PublishedPlanHistory patientId="p"/>);
 const old=(await screen.findByText('Plan uno')).closest('article')!;
 fireEvent.click(within(old).getByRole('button',{name:'Retirar versión 1 del historial'}));
 expect(screen.getByRole('dialog',{name:'Retirar versión publicada'})).toHaveTextContent('El registro clínico se conserva para auditoría');
 fireEvent.click(screen.getByRole('button',{name:'Retirar versión'}));
 expect(await screen.findByRole('status')).toHaveTextContent('Versión retirada del historial');
 expect(portalAction).toHaveBeenCalledWith({patientId:'p'},'plan_history',{retireVersionId:'v1'});
 expect(screen.queryByText('Plan uno')).not.toBeInTheDocument();
});

it('informs when retiring the version shared in Super Link',async()=>{
 render(<PublishedPlanHistory patientId="p"/>);
 const current=(await screen.findByText('Plan dos')).closest('article')!;
 fireEvent.click(within(current).getByRole('button',{name:'Retirar versión 2 del historial'}));
 fireEvent.click(screen.getByRole('button',{name:'Retirar versión'}));
 expect(await screen.findByRole('status')).toHaveTextContent('También se quitó el plan del Super Link');
});
