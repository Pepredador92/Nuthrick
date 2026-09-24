import {useRef,useState} from 'react';
import {useAccess} from '@/src/features/admin/AccessProvider';
import {canReadFeature} from '@/src/features/admin/api';
import {downloadPublishedPlan} from '@/src/services/planDocuments';
import type {PortalAccess} from '@/src/services/patientPortal';
export function PlanExport({access,versionId}:{access:PortalAccess;versionId?:string}){
 const {data:accessData}=useAccess();
 const texAllowed=!accessData || canReadFeature(accessData.access,'exports.tex');
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[open,setOpen]=useState(false),lock=useRef(false);
 async function download(format:'pdf'|'tex'){
  if(lock.current)return;lock.current=true;setBusy(format);setError('');setOpen(false);
  try{await downloadPublishedPlan(access,format,versionId);}catch{setError('No pudimos generar el archivo. Intenta nuevamente.');}finally{lock.current=false;setBusy('');}
 }
 const owner='patientId' in access;
 return <div className="relative text-sm">
  {owner?<><button type="button" className="nuth-button-secondary !px-3 !py-2 !text-xs" aria-expanded={open} disabled={Boolean(busy)} onClick={()=>setOpen(!open)}>{busy?`Preparando ${busy==='pdf'?'PDF':'LaTeX'}…`:'Exportar ▾'}</button>{open&&<div className="absolute right-0 z-10 min-w-40 rounded-xl border bg-white p-1 shadow-lg" aria-label="Formato de exportación"><button className="block w-full rounded-lg p-2 text-left hover:bg-[#edf3ee]" onClick={()=>void download('pdf')}>PDF</button><button disabled={!texAllowed} title={texAllowed?undefined:'Disponible en Profesional'} className="block w-full rounded-lg p-2 text-left hover:bg-[#edf3ee] disabled:opacity-50" onClick={()=>void download('tex')}>LaTeX (.tex){!texAllowed&&' · Profesional'}</button></div>}</>:
   <button type="button" className="nuth-button-secondary !px-3 !py-2 !text-xs" disabled={Boolean(busy)} onClick={()=>void download('pdf')}>{busy?'Preparando PDF…':'Descargar PDF'}</button>}
  {error&&<p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
 </div>;
}
