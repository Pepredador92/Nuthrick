import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {ClinicalStepNotice} from './ClinicalStepNotice';
it('announces completed work and waits for an explicit action before navigating',()=>{
 const next=vi.fn(),close=vi.fn();
 const view=render(<ClinicalStepNotice completion={null} onClose={close} onContinue={next}/>);
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
 view.rerender(<ClinicalStepNotice completion={{id:1,message:'Objetivos acordados aprobados. Paso completado.',nextStage:3}} onClose={close} onContinue={next}/>);
 expect(screen.getByRole('status')).toHaveTextContent('Objetivos acordados aprobados. Paso completado.');
 expect(next).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Continuar al siguiente paso'}));expect(next).toHaveBeenCalledWith(3);
 fireEvent.click(screen.getByRole('button',{name:'Cerrar aviso de avance'}));expect(close).toHaveBeenCalledOnce();
});
