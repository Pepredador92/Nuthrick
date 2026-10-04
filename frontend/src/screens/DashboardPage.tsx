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
import "./DashboardPage.css";

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

function AppointmentItem({ entry, timezone, inverse = false }: { entry: AgendaEntry; timezone: string; inverse?: boolean }) {
  return (
    <Link to="/app/agenda" className={`dashboard-appointment${inverse ? " is-primary" : ""}`}>
      <span className="dashboard-appointment-icon"><Clock3 size={17} /></span>
      <span className="min-w-0 flex-1">
        <span className="dashboard-appointment-name">{entry.contact_name || "Cita sin nombre"}</span>
        <span className="dashboard-appointment-meta">{dateLabel(entry.starts_at, timezone)} · {entry.modality === "online" ? "En línea" : "En consultorio"}</span>
      </span>
      <ChevronRight size={16} className="shrink-0" aria-hidden="true" />
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
    <div className="dashboard-workspace">
      <header className="dashboard-heading">
        <div>
          <p className="nuth-eyebrow">Centro de trabajo</p>
          <h1>Hola, {firstName}</h1>
          <p>Tu consulta de hoy, en orden.</p>
        </div>
        <button type="button" className="dashboard-refresh" disabled={loading} onClick={() => { setLoading(true); void refresh(); }}>
          <RefreshCw size={16} className={loading ? "animate-spin" : undefined} />
          Actualizar
        </button>
      </header>

      {error && <p role="alert" className="dashboard-error"><AlertCircle size={16} />{error}</p>}

      <div className="dashboard-grid dashboard-grid-top">
        <section className="dashboard-card dashboard-card-agenda" aria-labelledby="dashboard-today-title">
          <div className="dashboard-card-header"><span className="dashboard-card-icon"><CalendarDays size={21} /></span><span className="dashboard-step">01 · Agenda de hoy</span></div>
          <h2 id="dashboard-today-title">{loading ? "…" : today.length} {today.length === 1 ? "cita" : "citas"}</h2>
          <p className="dashboard-card-description">Tu punto de partida para la jornada.</p>
          {today.length ? <div className="dashboard-list">{today.slice(0, 3).map((entry) => <AppointmentItem key={entry.id} entry={entry} timezone={timezone} inverse />)}</div> : <p className="dashboard-empty dashboard-empty-primary">No tienes citas confirmadas para hoy. Revisa solicitudes o abre una nueva consulta.</p>}
          <Link to="/app/agenda" className="dashboard-action dashboard-action-primary">Abrir agenda <ArrowRight size={16} /></Link>
        </section>

        <section className="dashboard-card dashboard-card-attention" aria-labelledby="dashboard-attention-title">
          <div className="dashboard-card-header"><span className="dashboard-card-icon"><MessageCircle size={20} /></span><span className="dashboard-step">02 · Por atender</span></div>
          <h2 id="dashboard-attention-title">Pendientes</h2>
          <p className="dashboard-card-description">Mensajes y solicitudes que esperan respuesta.</p>
          <div className="dashboard-attention-list">
            <Link to="/app/messages" className="dashboard-attention-item"><span className="dashboard-mini-icon"><MessageCircle size={18} /></span><span className="dashboard-attention-copy"><strong>Mensajes sin leer</strong><small>Actividad del Super Link</small></span><strong className="dashboard-count">{notificationsLoading ? "—" : unreadMessages}</strong></Link>
            <Link to="/app/agenda" className="dashboard-attention-item"><span className="dashboard-mini-icon"><CalendarDays size={18} /></span><span className="dashboard-attention-copy"><strong>Solicitudes de cita</strong><small>Esperando tu respuesta</small></span><strong className="dashboard-count">{loading ? "—" : data.requests.length}</strong></Link>
          </div>
          <Link to="/app/patients" className="dashboard-action">Nueva consulta <ArrowRight size={16} /></Link>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-middle">
        <section className="dashboard-card" aria-labelledby="dashboard-upcoming-title">
          <div className="dashboard-section-head"><div><span className="dashboard-step">03 · Planifica</span><h2 id="dashboard-upcoming-title">Próximas citas</h2><p>Lo siguiente en tu agenda</p></div><Link to="/app/agenda">Ver agenda <ArrowRight size={15} /></Link></div>
          {upcoming.length ? <div className="dashboard-list">{upcoming.map((entry) => <AppointmentItem key={entry.id} entry={entry} timezone={timezone} />)}</div> : <p className="dashboard-empty">No hay citas próximas.</p>}
        </section>
        <section className="dashboard-card dashboard-card-activity" aria-labelledby="dashboard-activity-title">
          <div className="dashboard-section-head"><div><span className="dashboard-step">04 · Mantente al día</span><h2 id="dashboard-activity-title">Actividad reciente</h2><p>Mensajes y agenda</p></div><Link to="/app/messages">Mensajes <ArrowRight size={15} /></Link></div>
          {notifications.length ? <div className="dashboard-list">{notifications.slice(0, 4).map((item) => <Link key={item.id} to={notificationPath(item)} className="dashboard-notification"><span className={`dashboard-notification-dot${item.read_at ? " is-read" : ""}`} /><span><strong>{item.title}</strong><small>{relativeNotificationDate(item.created_at)}</small></span><ChevronRight size={16} /></Link>)}</div> : <p className="dashboard-empty">No hay actividad nueva.</p>}
        </section>
      </div>

      <section className="dashboard-card dashboard-card-patients" aria-labelledby="dashboard-patients-title">
        <div className="dashboard-section-head"><div><span className="dashboard-step">05 · Continúa la atención</span><h2 id="dashboard-patients-title">Pacientes recientes</h2><p>Ordenados por su última actividad registrada</p></div><Link to="/app/patients">Ver pacientes <ArrowRight size={15} /></Link></div>
        {data.patients.length ? <div className="dashboard-patient-list">{data.patients.map((patient) => <Link key={patient.id} to={`/app/patients/${patient.id}`} className="dashboard-patient"><span className="dashboard-mini-icon"><UserRound size={17} /></span><span><strong>{patient.full_name}</strong><small>Abrir ficha</small></span><ChevronRight size={15} /></Link>)}</div> : <p className="dashboard-empty">Aún no tienes pacientes activos. Agrega el primero para iniciar una consulta.</p>}
      </section>

      <section className="dashboard-card dashboard-card-profile" aria-label="Estado de tu perfil profesional">
        <div className="dashboard-profile-copy"><span className="dashboard-card-icon"><UsersRound size={19} /></span><div><span className="dashboard-step">Tu presencia pública</span><h2>Tu perfil profesional está {completion}% completo</h2><p>Completarlo ayuda a que tu página pública represente mejor tu trabajo.</p></div></div>
        <Link to="/app/profile" className="dashboard-action">Revisar perfil <CheckCircle2 size={16} /></Link>
      </section>
    </div>
  );
}
