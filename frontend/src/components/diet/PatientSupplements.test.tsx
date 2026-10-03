import {render,screen} from '@testing-library/react';
import {it,expect} from 'vitest';
import {PortalPlanContent} from '../patients/PortalPlan';
import {PatientPlanPreview} from './PatientPlanPreview';
import {patientSupplements} from '../../../../supabase/functions/_shared/supplements';
import {supplementItem} from '../../../tests/fixtures/supplements';
it('shows the same dosage and instructions in the patient portal and professional preview',()=>{
 const supplements=patientSupplements([supplementItem]);
 const v=render(<PortalPlanContent plan={{title:'Plan',versionNumber:1,publishedAt:'2026-10-03',days:[],supplements}}/>);
 expect(screen.getByRole('region',{name:'Tu suplementación'})).toHaveTextContent('1 porción al día');
 expect(screen.getByText('Con tu desayuno.')).toBeInTheDocument();v.unmount();
 render(<PatientPlanPreview value={{title:'Plan',patientName:'Paciente de prueba',days:[],supplements}}/>);
 expect(screen.getByRole('region',{name:'Tu suplementación'})).toHaveTextContent('1 porción al día');
});
