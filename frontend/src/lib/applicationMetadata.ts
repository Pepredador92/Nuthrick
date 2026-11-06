import type { Metadata } from 'next';
import { APPOINTMENT_PATIENT_PATHS } from '../../../supabase/functions/_shared/appointment-links';
import { productMetadata } from './productMetadata';
import { publicUrl } from './site';

export function applicationMetadata(pathname:string):Metadata {
  if(APPOINTMENT_PATIENT_PATHS.some(path=>path===pathname)) {
    const title='Tu cita está agendada | Nuthrick';
    const description='Un paso para cuidar de ti. Revisa la fecha, la hora y los detalles de tu consulta, guárdala en tu calendario y confirma tu asistencia cuando se acerque.';
    const image=publicUrl('/og/appointment-v1.png');
    return {
      title,description,alternates:{canonical:publicUrl(pathname)},robots:{index:false,follow:false},
      openGraph:{title,description,url:publicUrl(pathname),siteName:'Nuthrick',locale:'es_MX',type:'website',
        images:[{url:image,width:1200,height:630,alt:'Tu cita está agendada. Un paso para cuidar de ti. Nuthrick.'}]},
      twitter:{card:'summary_large_image',title,description,images:[image]},
    };
  }
  const publicTitles:Record<string,string>={'/terms':'Términos de uso | Nuthrick','/privacy':'Aviso de privacidad | Nuthrick','/refunds':'Política de reembolsos | Nuthrick'};
  const isPublic=pathname in publicTitles;
  return {
    ...(isPublic?{title:publicTitles[pathname]}:{}),
    alternates:{canonical:publicUrl(pathname)},
    openGraph:{...productMetadata.openGraph,url:publicUrl(pathname)},
    ...(isPublic?{}:{robots:{index:false,follow:false}}),
  };
}
