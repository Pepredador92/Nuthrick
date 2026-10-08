import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { GroceryPublicationDialog } from './GroceryPublicationDialog';
import type { TextDiet } from '../../../../supabase/functions/_shared/text-diet';
const draft:TextDiet={schema_version:1,requested_count:2,diets:[{id:'one',title:'Dieta 1',text:'• 100 g de pollo cocido'},{id:'two',title:'Dieta 2',text:'• 200 g de pollo cocido'}],meals:[{name:'Comida',time:null}],prescription:{target_calories:2000,macro_distribution:null},reviewed_at:'2026-10-08T10:00:00Z'};
it('publishes without a cart by default',async()=>{const publish=vi.fn();render(<GroceryPublicationDialog draft={draft} onClose={()=>{}} onPublish={publish}/>);fireEvent.click(screen.getByText('Confirmar publicación'));await waitFor(()=>expect(publish).toHaveBeenCalled());expect(publish.mock.calls[0][0].shopping_list).toBeUndefined();expect(publish.mock.calls[0][0].reviewed_at).toBe(draft.reviewed_at);});
it('requires a reviewed valid list, applies the day counts, and retains edits on publication failure',async()=>{
 const publish=vi.fn().mockResolvedValue(false),close=vi.fn();render(<GroceryPublicationDialog draft={draft} onClose={close} onPublish={publish}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:/Incluir carrito/}));fireEvent.change(screen.getByLabelText('Días de Dieta 1'),{target:{value:'3'}});fireEvent.change(screen.getByLabelText('Días de Dieta 2'),{target:{value:'2'}});fireEvent.click(screen.getByText('Preparar lista de compras'));
 expect(screen.getByLabelText('Cantidad 1')).toHaveValue(700);expect(screen.getByText('Confirmar publicación')).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:/Revisé la lista/}));fireEvent.change(screen.getByLabelText('Cantidad 1'),{target:{value:'750'}});expect(screen.getByText('Confirmar publicación')).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:/Revisé la lista/}));fireEvent.click(screen.getByText('Confirmar publicación'));await screen.findByRole('alert');expect(close).not.toHaveBeenCalled();expect(screen.getByLabelText('Cantidad 1')).toHaveValue(750);expect(publish.mock.calls[0][0].shopping_list.items[0].quantity).toBe(750);
 fireEvent.change(screen.getByLabelText('Días de Dieta 2'),{target:{value:'0'}});expect(screen.queryByLabelText('Cantidad 1')).not.toBeInTheDocument();expect(screen.getByText('Confirmar publicación')).toBeDisabled();
});
