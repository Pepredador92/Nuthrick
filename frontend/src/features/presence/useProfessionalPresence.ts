import { useEffect } from "react";
import { supabase } from "@/src/lib/supabase";

export function professionalPresenceTopic(professionalId: string) {
  return `professional-presence:${professionalId}`;
}

/** Track one lightweight presence record for the authenticated professional. */
export function useProfessionalPresence(professionalId: string | undefined) {
  useEffect(() => {
    if (!professionalId) return;
    const channel = supabase.channel(professionalPresenceTopic(professionalId), {
      config: { presence: { key: professionalId } },
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.track({ online: true });
      }
    });
    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [professionalId]);
}
