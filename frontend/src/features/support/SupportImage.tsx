import { useEffect, useState } from 'react';
import { supportFiles, type SupportAttachment } from './api';
export function SupportImage({attachment}:{attachment:SupportAttachment}){
 const [url,setUrl]=useState(''),[error,setError]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{let live=true,objectUrl='';const controller=new AbortController();
  void supportFiles().download(attachment.path,{}, {signal:controller.signal,cache:'no-store'}).then(({data,error})=>{
   if(!live)return;if(error||!data){setError(true);return;}objectUrl=URL.createObjectURL(data);setUrl(objectUrl);setError(false);
  }).catch(()=>{if(live)setError(true);});
  return()=>{live=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[attachment.path,reload]);
 return <div className="mt-3">{url?<a href={url} target="_blank" rel="noopener noreferrer" className="block text-xs underline"><img src={url} alt={`Captura adjunta: ${attachment.file_name}`} className="max-h-52 max-w-full rounded-lg object-contain"/><span className="mt-1 block break-all">Ampliar {attachment.file_name}</span></a>:error?<button className="text-xs underline" onClick={()=>setReload(n=>n+1)}>Reintentar carga de la captura</button>:<p role="status" className="text-xs">Cargando captura…</p>}</div>;
}
