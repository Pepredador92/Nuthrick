import { ShoppingBasket } from 'lucide-react';
import type { PatientGroceries as Groceries } from '../../../../supabase/functions/_shared/groceries';
export function PatientGroceries({value}:{value?:Groceries}) {
 if(!value)return null;
 const days=value.schedule.reduce((sum,row)=>sum+row.days,0);
 return <section aria-label="Carrito del súper" className="mt-6 rounded-2xl border border-[#bddbd5] bg-[#edf5f0] p-4 sm:p-5">
  <h3 className="flex items-center gap-2 text-lg font-semibold"><ShoppingBasket size={21}/>Tu carrito del súper</h3>
  <p className="mt-2 text-sm">Para una persona · {days} {days===1?'día':'días'}</p>
  <p className="mt-1 text-xs">{value.schedule.filter(row=>row.days>0).map(row=>`${row.title}: ${row.days} ${row.days===1?'día':'días'}`).join(' · ')}</p>
  <p className="mt-3 text-sm leading-6">Revisa lo que ya tienes en casa. Las cantidades corresponden a las porciones del plan y conservan el estado indicado, crudo o cocido.</p>
  <ul className="mt-4 grid gap-2 sm:grid-cols-2">{value.items.map((item,index)=><li key={index} className="flex items-start justify-between gap-4 rounded-xl bg-white p-3 text-sm"><span className="break-words">{item.name}</span><strong className="shrink-0">{new Intl.NumberFormat('es-MX',{maximumFractionDigits:3}).format(item.quantity)} {item.unit}</strong></li>)}</ul>
 </section>;
}
