import {expect,it,vi} from 'vitest';
import {act,fireEvent,render,screen} from '@testing-library/react';
import {PlanExport} from './PlanExport';
import {downloadPublishedPlan} from '@/src/services/planDocuments';
vi.mock('@/src/services/planDocuments',()=>({downloadPublishedPlan:vi.fn()}));
it('patient gets PDF only, cannot choose version, and repeated clicks share one request',async()=>{
 let complete!:()=>void;
 vi.mocked(downloadPublishedPlan).mockImplementation(async()=>await new Promise<void>(r=>{complete=r;}));
 render(<PlanExport access={{session:'s'}}/>);
 const button=screen.getByRole('button',{name:'Descargar PDF'});fireEvent.click(button);fireEvent.click(button);
 expect(downloadPublishedPlan).toHaveBeenCalledOnce();expect(downloadPublishedPlan).toHaveBeenCalledWith({session:'s'},'pdf',undefined);
 expect(screen.queryByText(/LaTeX/)).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Preparando PDF…'})).toBeDisabled();
 await act(async()=>complete());
 expect(screen.getByRole('button',{name:'Descargar PDF'})).toBeEnabled();
});
it('hides internal errors when the server rejects an export',async()=>{
 vi.mocked(downloadPublishedPlan).mockRejectedValue(new Error('SQL private path and stack'));
 render(<PlanExport access={{session:'s'}}/>);fireEvent.click(screen.getByRole('button',{name:'Descargar PDF'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos generar el archivo. Intenta nuevamente.');expect(screen.queryByText(/SQL/)).not.toBeInTheDocument();
});
