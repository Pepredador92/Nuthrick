import {useState} from 'react';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {PortalClinicalSharing} from './PortalClinicalSharing';
import {PortalContentView} from './PortalContentView';
import type {PortalContent} from '@/src/services/patientPortal';
import {clinicalFixtureIds,clinicalFixtureSharedGoal as goal,clinicalFixtureSharedStrategy as strategy} from '../../../tests/fixtures/clinical-guidance';
vi.mock('@/src/services/patientPortal',()=>({portalAction:vi.fn(async()=>({consultations:[{id:clinicalFixtureIds.consultation,date:'2026-10-20',revision:2,objectives:[goal],strategies:[strategy]}]}))}));
describe('explicit clinical sharing',()=>{
 it('offers each approved card without selecting it, and previews only the selected detail',async()=>{
  function Harness(){const [content,setContent]=useState<PortalContent>({goal:'',instructions:'',results:[],consultations:[]});return <><PortalClinicalSharing patientId={clinicalFixtureIds.patient} content={content} onChange={setContent}/><div data-testid="preview"><PortalContentView content={content} section="today"/></div></>;}
  render(<Harness/>);
  const goalCheck=await screen.findByRole('checkbox',{name:'Compartir objetivo 1'}),strategyCheck=screen.getByRole('checkbox',{name:'Compartir estrategia 1'}),preview=within(screen.getByTestId('preview'));
  expect(goalCheck).not.toBeChecked();expect(strategyCheck).not.toBeChecked();expect(preview.queryByText(goal.outcome)).not.toBeInTheDocument();
  fireEvent.click(goalCheck);expect(preview.getByText(goal.target)).toBeInTheDocument();expect(preview.getByText(goal.timeframe)).toBeInTheDocument();expect(preview.queryByText(strategy.action)).not.toBeInTheDocument();
  fireEvent.click(strategyCheck);expect(preview.getByText(strategy.action)).toBeInTheDocument();expect(preview.getByText(strategy.frequency)).toBeInTheDocument();
  fireEvent.click(goalCheck);expect(preview.queryByText(goal.outcome)).not.toBeInTheDocument();expect(preview.getByText(strategy.action)).toBeInTheDocument();
 });
});
