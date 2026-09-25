import { supabase } from "@/src/lib/supabase";
import type { ProfessionalNotification } from "@/src/features/notifications/model";

const columns = "id,professional_id,type,actor_name,resource_id,resource_type,title,metadata,created_at,read_at";

export async function listProfessionalNotifications(limit = 50) {
  const { data, error } = await supabase
    .from("professional_notifications")
    .select(columns)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ProfessionalNotification[];
}

export async function markProfessionalNotificationRead(id: string) {
  const { error } = await supabase
    .from("professional_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export function subscribeProfessionalNotifications(
  professionalId: string,
  onInsert: (notification: ProfessionalNotification) => void,
) {
  const channel = supabase
    .channel(`professional-notifications:${professionalId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "professional_notifications",
        filter: `professional_id=eq.${professionalId}`,
      },
      (payload) => onInsert(payload.new as ProfessionalNotification),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
