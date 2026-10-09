import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { GroceryPublicationDialog } from './GroceryPublicationDialog';
import type { TextDiet } from '../../../../supabase/functions/_shared/text-diet';
const draft:TextDiet={schema_version:1,requested_count:2,diets:[{id:'one',title:'Dieta 1',text:'• 100 g de pollo cocido'},{id:'two',title:'Dieta 2',text:'• 200 g de pollo cocido'}],meals:[{name:'Comida',time:null}],prescription:{target_calories:2000,macro_distribution:null},reviewed_at:'2026-10-08T10:00:00Z'};
it('publishes without a cart by default',async()=>{const publish=vi.fn();render(<GroceryPublicationDialog draft={draft} onClose={()=>{}} onPublish={publish}/>);fireEvent.click(screen.getByText('Confirmar publicación'));await waitFor(()=>expect(publish).toHaveBeenCalled());expect(publish.mock.calls[0][0].shopping_list).toBeUndefined();expect(publish.mock.calls[0][0].reviewed_at).toBe(draft.reviewed_at);});
it('requires a reviewed valid list, applies the day counts, and retains edits on publication failure',async()=>{
 const publish=vi.fn().mockResolvedValue(false),close=vi.fn();render(<GroceryPublicationDialog draft={draft} onClose={close} onPublish={publish}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:/Incluir carrito/}));fireEvent.change(screen.getByLabelText('Días de Dieta 1'),{target:{value:'3'}});fireEvent.change(screen.getByLabelText('Días de Dieta 2'),{target:{value:'2'}});
 expect(screen.getByLabelText('Cantidad 1')).toHaveValue(700);expect(screen.getByText('Confirmar publicación')).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:/Revisé la lista/}));fireEvent.change(screen.getByLabelText('Cantidad 1'),{target:{value:'750'}});expect(screen.getByText('Confirmar publicación')).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:/Revisé la lista/}));fireEvent.click(screen.getByText('Confirmar publicación'));await screen.findByRole('alert');expect(close).not.toHaveBeenCalled();expect(screen.getByLabelText('Cantidad 1')).toHaveValue(750);expect(publish.mock.calls[0][0].shopping_list.items[0].quantity).toBe(750);
 fireEvent.change(screen.getByLabelText('Días de Dieta 2'),{target:{value:'0'}});expect(screen.getByLabelText('Cantidad 1')).toHaveValue(300);expect(screen.getByText('Confirmar publicación')).toBeDisabled();
});

it('automatically prepares quantities and persists category corrections',async()=>{
 const publish=vi.fn();render(<GroceryPublicationDialog draft={draft} onClose={()=>{}} onPublish={publish}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:/Incluir carrito/}));
 expect(screen.getByLabelText('Cantidad 1')).toHaveValue(300);
 expect(screen.getByRole('region',{name:'Carnes, pescado y huevo'})).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Categoría 1'),{target:{value:'other'}});
 fireEvent.click(screen.getByRole('checkbox',{name:/Revisé la lista/}));
 fireEvent.click(screen.getByText('Confirmar publicación'));
 await waitFor(()=>expect(publish).toHaveBeenCalled());
 expect(publish.mock.calls[0][0].shopping_list.items[0].category).toBe('other');
});

it('enables review with household fractions and preparation descriptors without manual repairs',()=>{
 const portions={...draft,diets:[{...draft.diets[0],text:'• 3/4 de taza de arroz blanco cocido\n• 1/2 taza de zanahoria cocida y machacada'},{...draft.diets[1],text:'• 3/4 de taza de arroz blanco cocido\n• 1/2 pieza de manzana pelada y cocida'}]};
 render(<GroceryPublicationDialog draft={portions} onClose={()=>{}} onPublish={()=>{}}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:/Incluir carrito/}));
 expect(screen.getByLabelText('Cantidad 1')).toHaveValue(1.5);
 expect(screen.getByRole('checkbox',{name:/Revisé la lista/})).toBeEnabled();
 fireEvent.change(screen.getByLabelText('Días de Dieta 1'),{target:{value:'3'}});
 expect(screen.getByLabelText('Cantidad 1')).toHaveValue(3);
 expect(screen.getByRole('status')).toHaveTextContent('Lista actualizada para 4 días');
 fireEvent.click(screen.getByRole('button',{name:'Volver a calcular desde las dietas'}));
 expect(screen.getByRole('button',{name:'Lista recalculada'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('checkbox',{name:/Revisé la lista/}));
 expect(screen.getByRole('button',{name:'Confirmar publicación'})).toBeEnabled();
});
it('explains the remaining incomplete product and highlights its missing fields',()=>{
 const incomplete={...draft,diets:[{...draft.diets[0],text:'• Aceite al gusto'},draft.diets[1]]};
 render(<GroceryPublicationDialog draft={incomplete} onClose={()=>{}} onPublish={()=>{}}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:/Incluir carrito/}));
 expect(screen.getByText(/Faltan datos en 1 producto/)).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Ir al primer producto pendiente'})).toBeInTheDocument();
 expect(screen.getByLabelText('Cantidad 1')).toHaveAttribute('aria-invalid','true');
 expect(screen.getByRole('checkbox',{name:/Revisé la lista/})).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Cantidad 1'),{target:{value:'1'}});
 fireEvent.change(screen.getByLabelText('Unidad 1'),{target:{value:'cucharadita'}});
 expect(screen.getByRole('checkbox',{name:/Revisé la lista/})).toBeEnabled();
 expect(screen.queryByText(/Faltan datos en 1 producto/)).not.toBeInTheDocument();
});
