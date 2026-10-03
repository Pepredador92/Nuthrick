import {useEffect,useRef,useState} from 'react';
import {Plus,Search,Trash2,X,Pencil,Leaf,ExternalLink} from 'lucide-react';
import {archiveCustomSupplement,listSupplements,saveCustomSupplement,type SupplementInput} from '@/src/services/supplements';
import {isSupplementList,splitSupplementTargets,supplementTotals,type SupplementCatalogItem,type SupplementItem,type SupplementNutrition} from '../../../../supabase/functions/_shared/supplements';
const format=(v:number)=>v.toLocaleString('es-MX',{maximumFractionDigits:2});
const number=(v:string)=>v.trim() && /^\d+(?:[.,]\d+)?$/.test(v.trim()) ? Number(v.replace(',','.')) : NaN;
const match=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const safeLink=(v:string|null)=>v?.startsWith('https://') ? v : undefined;

function Quantity({item,onChange}:{item:SupplementItem;onChange:(n:number)=>void}) {
 const [value,setValue]=useState(String(item.quantity));
 const [error,setError]=useState(false);
 return <label className="text-xs font-semibold">Cantidad diaria
  <input className="nuth-input mt-1 !py-2" aria-label={`Cantidad diaria de ${item.product.name}`} inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} onBlur={()=>{const n=number(value);if(Number.isFinite(n)&&n>0&&n<=100000){setError(false);onChange(n);}else{setError(true);setValue(String(item.quantity));}}}/>
  {error&&<span role="alert" className="block text-xs text-[#a54335]">Usa un número mayor que cero. Se conservó la cantidad anterior.</span>}
 </label>;
}
function Nutrition({value}:{value:SupplementNutrition}) {
 return <p className="text-xs leading-5 text-[#547064]">{format(value.energy_kcal)} kcal · {format(value.protein_g)} g proteína · {format(value.carbohydrate_g)} g carbohidratos · {format(value.fat_g)} g grasas</p>;
}
export function SupplementEditor({items,daily,onChange}:{items:SupplementItem[];daily:SupplementNutrition;onChange:(items:SupplementItem[])=>void}) {
 const [open,setOpen]=useState(false);
 const [validation,setValidation]=useState('');
 const split=splitSupplementTargets(daily,items);
 const update=(id:string,patch:Partial<SupplementItem>)=>{const next=items.map(i=>i.id===id?{...i,...patch}:i);if(!isSupplementList(next)){setValidation('La conversión excede el límite de captura. Conserva la unidad anterior o ajusta la cantidad.');return;}setValidation('');onChange(next);};
 return <section className="mt-5 rounded-2xl border border-[#b9d8c6] bg-[#edf6ee] p-4 sm:p-5" aria-label="Suplementación del día">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold text-[#245641]"><Leaf size={19}/> Suplementación</h2><p className="mt-1 text-xs leading-5 text-[#547064]">Registra el total diario. Su aporte se descuenta de lo que cubrirán los alimentos.</p></div><button type="button" className="nuth-button-secondary" onClick={()=>setOpen(true)}><Plus size={16}/> Agregar suplemento</button></div>
  {validation&&<p role="alert" className="mt-3 text-sm text-[#a54335]">{validation}</p>}
  {items.length===0 ? <p className="mt-4 text-sm text-[#547064]">Sin suplementos. La meta se cubre con alimentos.</p>:<div className="mt-4 space-y-3">{items.map(item=><article key={item.id} className="rounded-xl border border-[#d1e4d7] bg-white p-4">
   <div className="flex justify-between gap-3"><div><h3 className="font-semibold text-[#245641]">{item.product.name}</h3><p className="text-xs text-[#547064]">{[item.product.brand,item.product.presentation].filter(Boolean).join(' · ')}</p><p className="mt-1 text-xs text-[#547064]">Porción de etiqueta: {item.product.serving_label}</p></div><button type="button" aria-label={`Quitar ${item.product.name}`} className="self-start rounded-lg p-2 text-[#8c5142]" onClick={()=>onChange(items.filter(i=>i.id!==item.id))}><Trash2 size={16}/></button></div>
   <div className="mt-3 grid gap-3 sm:grid-cols-2"><Quantity key={`${item.id}:${item.unit}`} item={item} onChange={quantity=>update(item.id,{quantity})}/><label className="text-xs font-semibold">Unidad<select aria-label={`Unidad de ${item.product.name}`} className="nuth-input mt-1 !py-2" value={item.unit} onChange={e=>{
    const unit=e.target.value as SupplementItem['unit'];
    // Preserve the prescribed servings when changing the display unit.
    const factor=item.unit==='g'?item.quantity/item.product.serving_grams!:item.unit==='scoop'?item.quantity/item.product.scoops_per_serving!:item.quantity;
    update(item.id,{unit,quantity:factor*(unit==='g'?item.product.serving_grams!:unit==='scoop'?item.product.scoops_per_serving!:1)});
   }}><option value="serving">Porciones</option>{item.product.scoops_per_serving&&<option value="scoop">Medidas del producto (scoops)</option>}{item.product.serving_grams&&<option value="g">Gramos</option>}</select></label></div>
   <div className="mt-3"><Nutrition value={supplementTotals([item])}/></div>
   <label className="mt-3 block text-xs font-semibold">Indicaciones para el paciente<textarea aria-label={`Indicaciones de ${item.product.name}`} className="nuth-input mt-1 min-h-20 !py-2" maxLength={1500} placeholder="Escribe cómo y cuándo tomarlo, según lo acordado." value={item.instructions} onChange={e=>update(item.id,{instructions:e.target.value})}/></label>
  </article>)}</div>}
  {items.length>0&&<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[380px] text-right text-xs"><caption className="mb-2 text-left font-semibold text-[#245641]">Distribución de la meta diaria</caption><thead><tr><th className="p-2 text-left">Aporte</th><th>kcal</th><th>Carbohidratos</th><th>Proteína</th><th>Grasas</th></tr></thead><tbody>{([['Meta diaria',split.daily],['Suplementos',split.supplements],['Para alimentos',split.food]] as const).map(([label,n])=><tr key={label} className="border-t border-[#d1e4d7]"><th className="p-2 text-left">{label}</th><td>{format(n.energy_kcal)}</td><td>{format(n.carbohydrate_g)} g</td><td>{format(n.protein_g)} g</td><td>{format(n.fat_g)} g</td></tr>)}</tbody></table></div>}
  {Object.values(split.excess).some(n=>n>0)&&<p role="status" className="mt-3 rounded-lg bg-[#fff3d8] p-3 text-xs text-[#755525]">Los suplementos superan alguna meta diaria. Puedes continuar; revisa la cantidad o ajusta tu meta. Los alimentos no tendrán objetivos negativos.</p>}
  {open&&<SupplementLibrary onClose={()=>setOpen(false)} onAdd={product=>{if(items.length>=30)return;onChange([...items,{id:crypto.randomUUID(),product:structuredClone(product),quantity:1,unit:'serving',instructions:''}]);setOpen(false);}} limitReached={items.length>=30}/>}
 </section>;
}

function SupplementLibrary({onClose,onAdd,limitReached}:{onClose:()=>void;onAdd:(p:SupplementCatalogItem)=>void;limitReached:boolean}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const [products,setProducts]=useState<SupplementCatalogItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[tab,setTab]=useState<'catalog'|'mine'>('catalog');
 const [editing,setEditing]=useState<SupplementCatalogItem|null|undefined>(undefined);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{let active=true;listSupplements().then(p=>{if(active)setProducts(p);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[retry]);
 const filtered=products.filter(p=>(tab==='mine'?p.owner_id!==null:p.owner_id===null)&&match(`${p.name} ${p.brand} ${p.presentation}`).includes(match(query)));
 return <dialog ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="supplement-library-title" className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-3xl border-0 bg-white p-5 text-[#24463b] shadow-xl backdrop:bg-[#102d27]/55 sm:p-7">
  <header className="flex items-start justify-between gap-3"><div><p className="nuth-eyebrow">Taller de dietas</p><h2 id="supplement-library-title" className="mt-2 text-xl font-semibold">Biblioteca de suplementos</h2></div><button type="button" onClick={onClose} aria-label="Cerrar biblioteca" className="rounded-lg p-2"><X/></button></header>
  {editing!==undefined?<ManualSupplement key={editing?.id??'new'} product={editing} onCancel={()=>setEditing(undefined)} onSaved={product=>{setProducts(all=>[product,...all.filter(p=>p.id!==product.id)]);setEditing(undefined);setTab('mine');}}/>:<>
   <div className="mt-5 flex flex-wrap gap-2"><button type="button" aria-pressed={tab==='catalog'} className={tab==='catalog'?'nuth-button':'nuth-button-secondary'} onClick={()=>setTab('catalog')}>Catálogo GNC México</button><button type="button" aria-pressed={tab==='mine'} className={tab==='mine'?'nuth-button':'nuth-button-secondary'} onClick={()=>setTab('mine')}>Mi biblioteca</button><button type="button" className="nuth-button-secondary" onClick={()=>setEditing(null)}><Plus size={15}/> Crear suplemento</button></div>
   <label className="mt-4 flex items-center gap-2 rounded-xl border border-[#dfe6e1] px-3"><Search size={17}/><input autoFocus aria-label="Buscar suplemento" placeholder="Busca por nombre o marca" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <p className="mt-2 text-xs leading-5 text-[#718078]">Verifica sabor, presentación y etiqueta del envase. Puedes crear tu propia ficha si difieren. La cantidad inicial es editable y no constituye una recomendación.</p>
   {limitReached&&<p role="alert">El plan ya contiene 30 suplementos.</p>}
   {loading&&<p role="status" className="py-6">Cargando biblioteca…</p>}
   {error&&<div role="alert" className="py-4">{error}<button type="button" className="nuth-button-secondary ml-2" onClick={()=>{setError('');setLoading(true);setRetry(v=>v+1);}}>Reintentar</button></div>}
   {!loading&&!error&&!filtered.length&&<p className="py-6 text-sm">No hay suplementos que coincidan. Puedes crear uno manualmente.</p>}
   <div className="mt-4 space-y-3">{filtered.map(product=><article key={product.id} className="rounded-xl border border-[#dfe6e1] p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{product.name}</h3><p className="text-xs text-[#718078]">{product.brand} · {product.presentation}</p></div><button type="button" disabled={limitReached} className="nuth-button" aria-label={`Agregar ${product.name}`} onClick={()=>onAdd(product)}><Plus size={14}/> Agregar</button></div><p className="mt-2 text-xs">Porción: {product.serving_label}</p><Nutrition value={product}/><div className="mt-3 flex flex-wrap gap-3 text-xs">{safeLink(product.label_url)&&<a href={product.label_url!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline"><ExternalLink size={12}/> Ver etiqueta</a>}{product.verified_at&&<span className="text-[#718078]">Revisada: {product.verified_at}</span>}{product.owner_id&&<><button type="button" className="inline-flex items-center gap-1" onClick={()=>setEditing(product)}><Pencil size={12}/> Editar ficha</button><button type="button" className="text-[#8c5142]" onClick={async()=>{try{await archiveCustomSupplement(product.id);setProducts(all=>all.filter(p=>p.id!==product.id));}catch(e){setError((e as Error).message);}}}>Quitar de mi biblioteca</button></>}</div></article>)}</div>
  </>}
 </dialog>;
}

function ManualSupplement({product,onCancel,onSaved}:{product:SupplementCatalogItem|null;onCancel:()=>void;onSaved:(p:SupplementCatalogItem)=>void}) {
 const [error,setError]=useState(''),[saving,setSaving]=useState(false);
 const fields=[['name','Nombre',true],['brand','Marca',false],['presentation','Presentación / sabor',false],['serving_label','Descripción de una porción',true],['serving_grams','Gramos por porción (opcional)',false],['scoops_per_serving','Scoops por porción (opcional)',false],['energy_kcal','Energía por porción (kcal)',true],['protein_g','Proteína por porción (g)',true],['carbohydrate_g','Carbohidratos por porción (g)',true],['fat_g','Grasas por porción (g)',true]] as const;
 return <form className="mt-5" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);const payload=Object.fromEntries(fields.map(([key])=>{const v=String(data.get(key)??'').trim();return [key,['name','brand','presentation','serving_label'].includes(key)?v:v===''?null:number(v)];})) as SupplementInput;setSaving(true);setError('');try{onSaved(await saveCustomSupplement(payload,product?.id));}catch(e){setError((e as Error).message);}finally{setSaving(false);}}}>
  <h3 className="font-semibold">{product?'Editar ficha':'Nuevo suplemento'}</h3><p className="mt-1 text-xs leading-5 text-[#718078]">Transcribe la etiqueta por porción. Escribe 0 sólo si ese nutriente es cero. Los cambios de biblioteca no modifican planes anteriores.</p>
  <div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map(([key,label,required])=><label key={key} className="text-xs font-semibold">{label}<input name={key} className="nuth-input mt-1" required={required} inputMode={['name','brand','presentation','serving_label'].includes(key)?'text':'decimal'} defaultValue={product?.[key]??''} maxLength={key==='name'||key==='serving_label'?180:120}/></label>)}</div>
  {error&&<p role="alert" className="mt-3 text-sm text-[#a54335]">{error}</p>}
  <div className="mt-5 flex gap-2"><button type="submit" disabled={saving} className="nuth-button">{saving?'Guardando…':'Guardar en mi biblioteca'}</button><button type="button" disabled={saving} className="nuth-button-secondary" onClick={onCancel}>Cancelar</button></div>
 </form>;
}
