import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GroceryPublicationDialog } from '../../src/components/diet/GroceryPublicationDialog';
import { PatientGroceries } from '../../src/components/diet/PatientGroceries';
import { ThemeSwitcher } from '../../src/features/theme/ThemeSwitcher';
import { patientGroceries } from '../../../supabase/functions/_shared/groceries';
import type { TextDiet } from '../../../supabase/functions/_shared/text-diet';
import '../../app/globals.css';
const draft:TextDiet={schema_version:1,requested_count:2,meals:[{name:'Comida',time:null}],reviewed_at:'2026-10-08T12:00:00Z',prescription:{target_calories:null,macro_distribution:null},diets:[{id:'one',title:'Dieta 1',text:'Comida\nPollo con arroz\n• 120 g de pollo cocido\n• ½ taza de arroz cocido\n• 1 taza de calabacitas\n• 1 cucharadita de aceite\nPreparación: servir.'},{id:'two',title:'Dieta 2',text:'Comida\nPollo con papa\n• 100 g de pollo cocido\n• 150 g de papa cocida\n• 1 taza de calabacitas\n• 1 cucharadita de aceite\nPreparación: servir.'}]};
function Preview(){const [open,setOpen]=useState(true),[saved,setSaved]=useState<TextDiet|null>(null);return <main className="mx-auto max-w-3xl p-5"><div className="flex items-center justify-between"><p className="text-xs">Demostración · Sin datos reales ni publicación</p><ThemeSwitcher/></div><h1 className="my-6 text-2xl font-semibold">Publicar dietas revisadas</h1><button className="nuth-button" onClick={()=>setOpen(true)}>Publicar versión</button>{saved&&<><p className="mt-4">Vista que recibirá el paciente</p><PatientGroceries value={patientGroceries(saved.shopping_list,saved.diets)}/></>}{open&&<GroceryPublicationDialog draft={saved??draft} onClose={()=>setOpen(false)} onPublish={async value=>{setSaved(value);return true;}}/>}</main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
