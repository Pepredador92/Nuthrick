import {expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {PortalGoal} from './PortalGoal';
vi.mock('@/src/services/patientPortal',()=>({portalAction:vi.fn(async()=>({goals:[{consultationId:'new',revision:2,questionKey:'next_objectives',date:'2026-09-21',content:'Nuevo acuerdo'}]}))}));
it('offers the latest completed goal but requires approval and preserves the previous published text',async()=>{
 const onChange=vi.fn(),content={goal:'Objetivo anterior',goalSource:{consultationId:'old',revision:1,questionKey:'objectives'},instructions:'',results:[],consultations:[]};
 render(<PortalGoal patientId="p" content={content} onChange={onChange}/>);
 const newer=await screen.findByRole('button',{name:/Usar objetivo más reciente/});expect(screen.getByText('Objetivo anterior')).toBeVisible();expect(onChange).not.toHaveBeenCalled();
 fireEvent.click(newer);expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({goal:'Nuevo acuerdo',goalSource:{consultationId:'new',revision:2,questionKey:'next_objectives'}}));
 fireEvent.click(screen.getByRole('checkbox',{name:'Compartir objetivo'}));expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({goal:'',goalSource:null}));
});
