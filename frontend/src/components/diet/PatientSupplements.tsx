import {Leaf} from 'lucide-react';
import type {PatientSupplement} from '../../../../supabase/functions/_shared/supplements';
export function PatientSupplements({items=[]}:{items?:PatientSupplement[]}) {
 if(!items.length)return null;
 return <section aria-label="Tu suplementación" className="portal-supplements mt-5 min-w-0 rounded-2xl border border-[#b5d6bd] bg-[#edf6ee] p-4 sm:p-5">
  <p className="flex items-center gap-2 text-sm font-semibold text-[#285f40]"><Leaf size={18} aria-hidden="true"/> Tu suplementación</p>
  <p className="mt-1 text-xs leading-5 text-[#54705c]">Cantidades diarias indicadas por tu nutriólogo.</p>
  <div className="mt-4 space-y-3">{items.map((item,index)=><article key={index} className="min-w-0 break-words rounded-xl border border-[#d3e4d6] bg-white/80 p-4">
   <h3 className="font-semibold text-[#24563a]">{item.name}</h3><p className="mt-1 text-xs text-[#63796d]">{[item.brand,item.presentation].filter(Boolean).join(' · ')}</p>
   <p className="mt-2 text-sm font-medium text-[#285f40]">{item.quantity}</p>
   {item.instructions&&<p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#385b44]">{item.instructions}</p>}
  </article>)}</div>
 </section>;
}
