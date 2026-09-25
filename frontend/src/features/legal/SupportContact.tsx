import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
export function SupportContact() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void supabase.from("operational_contact_public").select("support_email").eq("id", true).maybeSingle().then(({data}) => { if (active) setEmail(data?.support_email ?? null); });
    return () => { active = false; };
  }, []);
  return email ? <a href={`mailto:${email}`}>Contacto</a> : <span>Contacto en preparación</span>;
}
