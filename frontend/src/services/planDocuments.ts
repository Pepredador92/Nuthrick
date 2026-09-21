import {portalAction,type PortalAccess} from '@/src/services/patientPortal';
export type PublishedPlanSummary={id:string;title:string;version_number:number;published_at:string};
export async function downloadPublishedPlan(access:PortalAccess,format:'pdf'|'tex',versionId?:string){
 const result=await portalAction<{filename:string;mime:string;base64:string}>(access,'export_plan',{format,...(versionId?{versionId}:{})});
 const binary=atob(result.base64),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 const url=URL.createObjectURL(new Blob([bytes],{type:result.mime})),a=document.createElement('a');
 a.href=url;a.download=result.filename;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
