import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
type Contacts = {support_email: string | null; privacy_email: string | null};
function useOperationalContacts() {
  const [contacts, setContacts] = useState<Contacts | null>(null);
  useEffect(() => {
    let active = true;
    void supabase.from("operational_contact_public").select("support_email,privacy_email").eq("id", true).maybeSingle().then(({data}) => { if (active) setContacts(data ?? null); });
    return () => { active = false; };
  }, []);
  return contacts;
}
export function SupportContact() {
  const contacts = useOperationalContacts();
  return contacts?.support_email ? <a href={`mailto:${contacts.support_email}`}>Contacto</a> : <span>Contacto en preparación</span>;
}
export function OperationalContacts() {
  const contacts = useOperationalContacts();
  if (!contacts?.support_email || !contacts.privacy_email) return null;
  return <aside aria-label="Contactos vigentes" className="mt-8 rounded-2xl border border-[#dfe5e1] bg-[#f7f8f4] p-5 text-sm leading-7">
    <p className="font-semibold">Contactos vigentes de Nuthrick</p>
    <p>Soporte: <a className="underline" href={`mailto:${contacts.support_email}`}>{contacts.support_email}</a></p>
    <p>Privacidad y solicitudes sobre tus datos: <a className="underline" href={`mailto:${contacts.privacy_email}`}>{contacts.privacy_email}</a></p>
    <p>Utiliza estos contactos para las nuevas solicitudes. Las versiones anteriores de los documentos conservan los datos que tenían al publicarse.</p>
  </aside>;
}
