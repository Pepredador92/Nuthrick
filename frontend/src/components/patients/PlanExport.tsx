import {useRef,useState} from 'react';
import {useAccess} from '@/src/features/admin/AccessProvider';
import {canReadFeature} from '@/src/features/admin/api';
import {downloadPublishedPlan} from '@/src/services/planDocuments';
import type {PortalAccess} from '@/src/services/patientPortal';
import {PdfExportDialog} from '@/src/components/documents/PdfExportDialog';
import type {PdfDesign} from '@/src/components/documents/PdfDesignSelector';
export function PlanExport({access,versionId}:{access:PortalAccess;versionId?:string}){
 const {data:accessData}=useAccess();
 const texAllowed=!accessData || canReadFeature(accessData.access,'exports.tex');
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[open,setOpen]=useState(false),[pdfOpen,setPdfOpen]=useState(false),lock=useRef(false);
 async function download(format:'pdf'|'tex',design:PdfDesign='current'){
  if(lock.current)return;lock.current=true;setBusy(format);setError('');setOpen(false);
  try{await downloadPublishedPlan(access,format,versionId,design);}catch{if(format==='pdf')throw new Error('No pudimos generar el archivo. Intenta nuevamente.');setError('No pudimos generar el archivo. Intenta nuevamente.');}finally{lock.current=false;setBusy('');}
 }
 function choosePdf(){setOpen(false);setPdfOpen(true);setError('');}
 const owner='patientId' in access;
 return <div className="relative text-sm">
  {owner?<><button type="button" className="nuth-button-secondary !px-3 !py-2 !text-xs" aria-expanded={open} disabled={Boolean(busy)} onClick={()=>setOpen(!open)}>{busy?`Preparando ${busy==='pdf'?'PDF':'LaTeX'}…`:'Exportar ▾'}</button>{open&&<div className="absolute right-0 z-10 min-w-40 rounded-xl border bg-white p-1 shadow-lg" aria-label="Formato de exportación"><button className="block w-full rounded-lg p-2 text-left hover:bg-[#edf3ee]" onClick={choosePdf}>PDF</button><button disabled={!texAllowed} title={texAllowed?undefined:'Disponible en Profesional'} className="block w-full rounded-lg p-2 text-left hover:bg-[#edf3ee] disabled:opacity-50" onClick={()=>void download('tex')}>LaTeX (.tex){!texAllowed&&' · Profesional'}</button></div>}</>:
   <button type="button" className="nuth-button-secondary !px-3 !py-2 !text-xs" disabled={Boolean(busy)} onClick={choosePdf}>{busy?'Preparando PDF…':'Descargar PDF'}</button>}
  {pdfOpen&&<PdfExportDialog title="Exportar plan de alimentación" description="Elige cómo presentar el plan y sus indicaciones. Incluye los datos del nutriólogo asociado al documento." onClose={()=>setPdfOpen(false)} onDownload={design=>download('pdf',design)}/>}
  {error&&<p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
 </div>;
}
