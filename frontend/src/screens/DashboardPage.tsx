import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MessageCircle,
  RefreshCw,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/src/features/auth/AuthProvider";
import { notificationPath, relativeNotificationDate } from "@/src/features/notifications/model";
import { useNotifications } from "@/src/features/notifications/useNotifications";
import { todayAppointments, unreadMessageCount, upcomingAppointments } from "@/src/features/dashboard/model";
import { loadAgenda, type AgendaEntry, type AgendaRequest } from "@/src/services/agenda";
import { listPatients } from "@/src/services/patients";
import type { Patient } from "@/src/types/domain";

type DashboardData = {
  entries: AgendaEntry[];
  requests: AgendaRequest[];
  patients: Patient[];
};

const timezoneFallback = "America/Mexico_City";

function dateLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function profileCompletion(profile: ReturnType<typeof useAuth>["profile"]) {
  if (!profile) return 0;
  const fields = [profile.biography, profile.avatar_path, profile.public_slug, profile.specialties.length, profile.is_public];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function AppointmentItem({ entry, timezone }: { entry: AgendaEntry; timezone: string }) {
  return (
    <Link to="/app/agenda" className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-[#f4f8f4]">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eaf1e6] text-[#477363]"><Clock3 size={17} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[#24463b]">{entry.contact_name || "Cita sin nombre"}</span>
        <span className="mt-1 block text-xs text-[#75837d]">{dateLabel(entry.starts_at, timezone)} · {entry.modality === "online" ? "En línea" : "En consultorio"}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-[#91a099]" />
    </Link>
  );
}

export function DashboardPage() {
  const { profile } = useAuth();
  const { items: notifications, loading: notificationsLoading } = useNotifications();
  const [data, setData] = useState<DashboardData>({ entries: [], requests: [], patients: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timezone = profile?.timezone || timezoneFallback;

  const refresh = useCallback(async () => {
    try {
      const [agenda, patients] = await Promise.all([
        loadAgenda(),
        listPatients({ status: "active", sort: "activity_desc", pageSize: 5 }),
      ]);
      setData({ entries: agenda.entries, requests: agenda.requests, patients: patients.rows });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos cargar tu actividad de hoy.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const today = useMemo(() => todayAppointments(data.entries, new Date(), timezone), [data.entries, timezone]);
  const upcoming = useMemo(() => upcomingAppointments(data.entries).slice(0, 4), [data.entries]);
  const unreadMessages = unreadMessageCount(notifications);
  const firstName = profile?.full_name?.split(" ")[0] || "profesional";
  const completion = profileCompletion(profile);

  return (
    <div>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="nuth-eyebrow">Centro de trabajo</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em]">Hola, {firstName}</h1>
          <p className="mt-3 text-[#687672]">Esto es lo que necesita tu atención hoy.</p>
        </div>
        <button type="button" className="nuth-button-secondary" disabled={loading} onClick={() => { setLoading(true); void refresh(); }}>
          <RefreshCw size={16} className={loading ? "animate-spin" : undefined} />
          Actualizar
        </button>
      </header>

      {error && <p role="alert" className="mt-5 flex items-center gap-2 rounded-xl bg-[#fff0e9] p-4 text-sm text-[#963f34]"><AlertCircle size={16} />{error}</p>}

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-[28px] bg-[#173d36] p-7 text-white sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-white/60">Tu agenda de hoy</p>
              <h2 className="mt-2 text-3xl font-semibold">{loading ? "…" : today.length} {today.length === 1 ? "cita" : "citas"}</h2>
            </div>
            <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-[#efbd6b]"><CalendarDays size={22} /></span>
          </div>
          {today.length ? <div className="mt-5 divide-y divide-white/10">{today.slice(0, 3).map((entry) => <AppointmentItem key={entry.id} entry={entry} timezone={timezone} />)}</div> : <p className="mt-6 text-sm leading-6 text-white/65">No tienes citas confirmadas para hoy. Puedes revisar solicitudes o abrir un espacio para una nueva consulta.</p>}
          <Link to="/app/agenda" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#f2c47a]">Abrir agenda <ArrowRight size={16} /></Link>
        </div>

        <div className="rounded-[28px] border border-[#dfe5e1] bg-white p-7 sm:p-8">
          <p className="text-sm font-semibold text-[#4b7163]">Por atender</p>
          <div className="mt-5 grid gap-3">
            <Link to="/app/messages" className="flex items-center gap-3 rounded-2xl bg-[#f4f8f4] p-4 hover:bg-[#edf4ef]"><span className="grid size-10 place-items-center rounded-xl bg-white text-[#477363]"><MessageCircle size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#285647]">Mensajes sin leer</span><span className="mt-1 block text-xs text-[#75837d]">Actividad del Super Link</span></span><strong className="text-xl text-[#285647]">{notificationsLoading ? "—" : unreadMessages}</strong></Link>
            <Link to="/app/agenda" className="flex items-center gap-3 rounded-2xl bg-[#fff8eb] p-4 hover:bg-[#fff2d8]"><span className="grid size-10 place-items-center rounded-xl bg-white text-[#a16c31]"><CalendarDays size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#6e512b]">Solicitudes de cita</span><span className="mt-1 block text-xs text-[#8c775a]">Esperando tu respuesta</span></span><strong className="text-xl text-[#8c632e]">{loading ? "—" : data.requests.length}</strong></Link>
          </div>
          <Link to="/app/patients" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#285647]">Nueva consulta <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-[24px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#24463b]">Próximas citas</h2><p className="mt-1 text-xs text-[#7a8982]">Lo siguiente en tu agenda</p></div><Link to="/app/agenda" className="text-xs font-semibold text-[#477363]">Ver agenda</Link></div>
          {upcoming.length ? <div className="mt-4 divide-y divide-[#edf1ed]">{upcoming.map((entry) => <AppointmentItem key={entry.id} entry={entry} timezone={timezone} />)}</div> : <p className="mt-6 rounded-2xl bg-[#f5f7f4] p-4 text-sm text-[#75837d]">No hay citas próximas.</p>}
        </div>

        <div className="rounded-[24px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#24463b]">Actividad reciente</h2><p className="mt-1 text-xs text-[#7a8982]">Mensajes y agenda</p></div><Link to="/app/messages" className="text-xs font-semibold text-[#477363]">Mensajes</Link></div>
          {notifications.length ? <div className="mt-4 divide-y divide-[#edf1ed]">{notifications.slice(0, 4).map((item) => <Link key={item.id} to={notificationPath(item)} className="flex items-start gap-3 px-3 py-3 hover:bg-[#f5f8f5]"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read_at ? "bg-[#d7e2da]" : "bg-[#c56c42]"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#315e4f]">{item.title}</span><span className="mt-1 block text-xs text-[#7b8982]">{relativeNotificationDate(item.created_at)}</span></span></Link>)}</div> : <p className="mt-6 rounded-2xl bg-[#f5f7f4] p-4 text-sm text-[#75837d]">No hay actividad nueva.</p>}
        </div>
      </section>

      <section className="mt-6 rounded-[24px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#24463b]">Pacientes recientes</h2><p className="mt-1 text-xs text-[#7a8982]">Ordenados por su última actividad registrada</p></div><Link to="/app/patients" className="inline-flex items-center gap-1 text-xs font-semibold text-[#477363]">Ver pacientes <ArrowRight size={14} /></Link></div>
        {data.patients.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{data.patients.map((patient) => <Link key={patient.id} to={`/app/patients/${patient.id}`} className="rounded-2xl border border-[#edf1ed] p-4 hover:border-[#bfd3c5] hover:bg-[#f7faf7]"><span className="grid size-9 place-items-center rounded-xl bg-[#eaf1e6] text-[#477363]"><UserRound size={16} /></span><span className="mt-3 block truncate text-sm font-semibold text-[#315e4f]">{patient.full_name}</span><span className="mt-1 block text-xs text-[#7b8982]">Abrir ficha</span></Link>)}</div> : <p className="mt-5 rounded-2xl bg-[#f5f7f4] p-4 text-sm text-[#75837d]">Aún no tienes pacientes activos. Agrega el primero para iniciar una consulta.</p>}
      </section>

      <section className="mt-6 flex flex-col gap-4 rounded-[24px] border border-[#dfe5e1] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#eef4ee] text-[#477363]"><UsersRound size={18} /></span><div><p className="text-sm font-semibold text-[#315e4f]">Tu perfil profesional está {completion}% completo</p><p className="mt-1 text-xs text-[#7b8982]">Completarlo ayuda a que tu página pública represente mejor tu trabajo.</p></div></div>
        <Link to="/app/profile" className="inline-flex items-center gap-2 text-sm font-semibold text-[#477363]">Revisar perfil <CheckCircle2 size={16} /></Link>
      </section>
    </div>
  );
}
