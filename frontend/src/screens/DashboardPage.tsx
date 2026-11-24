import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Eye,
  MessageCircle,
  Plus,
  RefreshCw,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/src/features/auth/AuthProvider";
import { notificationPath, relativeNotificationDate } from "@/src/features/notifications/model";
import { useNotifications } from "@/src/features/notifications/useNotifications";
import { todayAppointments, unreadMessageCount, upcomingAppointments } from "@/src/features/dashboard/model";
import { loadAgenda, type AgendaEntry, type AgendaRequest } from "@/src/services/agenda";
import { listPatients } from "@/src/services/patients";
import { loadPublicProfileVisitCount } from "@/src/services/profile";
import type { Patient } from "@/src/types/domain";
import { ConsultationSetupReminder } from "@/src/features/onboarding/ConsultationSetup";
import "./DashboardPage.css";

type DashboardData = {
  entries: AgendaEntry[];
  requests: AgendaRequest[];
  patients: Patient[];
};

const timezoneFallback = "America/Mexico_City";

function DashboardCardHeading({ id, title, icon: Icon, children }: {
  id: string;
  title: string;
  icon: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <header className="dashboard-card-heading">
      <span className="dashboard-card-icon"><Icon size={19} aria-hidden="true" /></span>
      <h2 id={id}>{title}</h2>
      {children}
    </header>
  );
}

function profileCompletion(profile: ReturnType<typeof useAuth>["profile"]) {
  if (!profile) return 0;
  const fields = [profile.biography, profile.avatar_path, profile.public_slug, profile.specialties.length, profile.is_public];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function AppointmentItem({ entry, timezone, showDate = false }: { entry: AgendaEntry; timezone: string; showDate?: boolean }) {
  const start = new Date(entry.starts_at);
  const time = new Intl.DateTimeFormat("es-MX", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start);
  const date = showDate ? new Intl.DateTimeFormat("es-MX", { timeZone: timezone, day: "numeric", month: "short", weekday: "short" }).format(start) : null;
  const modality = entry.modality === "online" ? "En línea" : "En consultorio";
  return (
    <Link to="/app/agenda" className="dashboard-list-row">
      <time className="dashboard-time" dateTime={entry.starts_at}>{time}</time>
      <span className="dashboard-row-copy">
        <strong>{entry.contact_name || "Cita sin nombre"}</strong>
        <small>{date ? `${date} · ${modality}` : modality}</small>
      </span>
      <ChevronRight size={16} className="dashboard-row-chevron" aria-hidden="true" />
    </Link>
  );
}

export function DashboardPage() {
  const { profile } = useAuth();
  const { items: notifications, loading: notificationsLoading } = useNotifications();
  const [data, setData] = useState<DashboardData>({ entries: [], requests: [], patients: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visitRequest, setVisitRequest] = useState(0);
  const [profileVisits, setProfileVisits] = useState<{ owner: string; total: number | null }>();
  const owner = profile?.id;
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

  useEffect(() => {
    if (!owner) return;
    let active = true;
    void loadPublicProfileVisitCount().then(total => {
      if (active) setProfileVisits({ owner, total });
    }).catch(() => {
      if (active) setProfileVisits({ owner, total: null });
    });
    return () => { active = false; };
  }, [owner, visitRequest]);

  const { today, todayPreview, upcoming } = useMemo(() => {
    const now = new Date();
    const today = todayAppointments(data.entries, now, timezone);
    const todayPreview = today.slice(0, 3);
    const upcoming = upcomingAppointments(data.entries, now.getTime())
      .filter(entry => !todayPreview.some(current => current.id === entry.id))
      .slice(0, 4);
    return { today, todayPreview, upcoming };
  }, [data.entries, timezone]);
  const unreadMessages = unreadMessageCount(notifications);
  const firstName = profile?.full_name?.split(" ")[0] || "profesional";
  const completion = profileCompletion(profile);
  const visitTotal = profileVisits?.owner === owner ? profileVisits?.total : undefined;
  const dateLabel = new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeZone: timezone }).format(new Date());

  return (
    <div className="dashboard-workspace">
      <header className="dashboard-heading">
        <div className="dashboard-heading-copy">
          <p className="dashboard-date"><CalendarDays size={16} aria-hidden="true" /><span>{dateLabel}</span></p>
          <h1>Hola, {firstName}</h1>
        </div>
        <div className="dashboard-heading-actions">
          <Link to="/app/patients" className="dashboard-action dashboard-action-primary"><Plus size={18} aria-hidden="true" />Nueva consulta</Link>
          <button type="button" className="dashboard-action dashboard-refresh" disabled={loading} onClick={() => { setLoading(true); setVisitRequest(request => request + 1); void refresh(); }}>
            <RefreshCw size={16} aria-hidden="true" className={loading ? "animate-spin" : undefined} />Actualizar
          </button>
        </div>
      </header>

      <ConsultationSetupReminder />

      {error && <p role="alert" className="dashboard-error"><AlertCircle size={18} aria-hidden="true" />{error}</p>}

      <div className="dashboard-grid">
        <section className="dashboard-card dashboard-card-agenda" aria-labelledby="dashboard-today-title" aria-busy={loading}>
          <DashboardCardHeading id="dashboard-today-title" title="Agenda de hoy" icon={CalendarDays}>
            <span className="dashboard-today-count">{loading ? "…" : error && !today.length ? "—" : `${today.length} ${today.length === 1 ? "cita" : "citas"}`}</span>
          </DashboardCardHeading>
          {today.length ? (
            <ul className="dashboard-list">{todayPreview.map(entry => <li key={entry.id}><AppointmentItem entry={entry} timezone={timezone} /></li>)}</ul>
          ) : (
            <p className="dashboard-empty">{loading ? "Cargando citas de hoy…" : error ? "Las citas de hoy no están disponibles." : "No tienes citas confirmadas para hoy."}</p>
          )}
          <Link to="/app/agenda" className="dashboard-card-link">Abrir agenda <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>

        <section className="dashboard-card dashboard-card-attention" aria-labelledby="dashboard-attention-title">
          <DashboardCardHeading id="dashboard-attention-title" title="Pendientes" icon={Bell} />
          <div className="dashboard-attention-list">
            <Link to="/app/messages" className="dashboard-attention-item" aria-busy={notificationsLoading}>
              <span className="dashboard-mini-icon"><MessageCircle size={17} aria-hidden="true" /></span>
              <span className="dashboard-row-copy"><strong>Mensajes sin leer</strong><small>Super Link</small></span>
              <strong className="dashboard-count" data-has-items={!notificationsLoading && unreadMessages > 0}>{notificationsLoading ? "—" : unreadMessages}</strong>
              <ChevronRight size={16} className="dashboard-row-chevron" aria-hidden="true" />
            </Link>
            <Link to="/app/agenda" className="dashboard-attention-item" aria-busy={loading}>
              <span className="dashboard-mini-icon"><CalendarDays size={17} aria-hidden="true" /></span>
              <span className="dashboard-row-copy"><strong>Solicitudes de cita</strong><small>Esperando tu respuesta</small></span>
              <strong className="dashboard-count" data-has-items={!loading && data.requests.length > 0}>{loading || (error && !data.requests.length) ? "—" : data.requests.length}</strong>
              <ChevronRight size={16} className="dashboard-row-chevron" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card dashboard-card-upcoming" aria-labelledby="dashboard-upcoming-title" aria-busy={loading}>
          <DashboardCardHeading id="dashboard-upcoming-title" title="Próximas citas" icon={CalendarDays} />
          {upcoming.length ? (
            <ul className="dashboard-list">{upcoming.map(entry => <li key={entry.id}><AppointmentItem entry={entry} timezone={timezone} showDate /></li>)}</ul>
          ) : (
            <p className="dashboard-empty">{loading ? "Cargando próximas citas…" : error ? "Las próximas citas no están disponibles." : "No hay citas próximas."}</p>
          )}
          <Link to="/app/agenda" className="dashboard-card-link">Ver agenda <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
        <section className="dashboard-card dashboard-card-activity" aria-labelledby="dashboard-activity-title" aria-busy={notificationsLoading}>
          <DashboardCardHeading id="dashboard-activity-title" title="Actividad reciente" icon={MessageCircle} />
          {notifications.length ? (
            <ul className="dashboard-list">
              {notifications.slice(0, 4).map(item => (
                <li key={item.id}>
                  <Link to={notificationPath(item)} className="dashboard-list-row dashboard-notification" data-unread={!item.read_at}>
                    <span className="dashboard-notification-dot" aria-hidden="true" />
                    <span className="dashboard-row-copy"><strong>{item.title}</strong><small>{!item.read_at && <span className="sr-only">Sin leer · </span>}{relativeNotificationDate(item.created_at)}</small></span>
                    <ChevronRight size={16} className="dashboard-row-chevron" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-empty">{notificationsLoading ? "Cargando actividad…" : "No hay actividad reciente."}</p>
          )}
          <Link to="/app/messages" className="dashboard-card-link">Ir a mensajes <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      </div>

      <section className="dashboard-card dashboard-card-patients" aria-labelledby="dashboard-patients-title" aria-busy={loading}>
        <DashboardCardHeading id="dashboard-patients-title" title="Pacientes recientes" icon={UsersRound} />
        {data.patients.length ? (
          <ul className="dashboard-patient-list">
            {data.patients.map(patient => (
              <li key={patient.id}>
                <Link to={`/app/patients/${patient.id}`} className="dashboard-patient">
                  <span className="dashboard-mini-icon"><UserRound size={17} aria-hidden="true" /></span>
                  <span className="dashboard-row-copy"><strong>{patient.full_name}</strong><small>Abrir ficha</small></span>
                  <ChevronRight size={15} className="dashboard-row-chevron" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dashboard-empty">{loading ? "Cargando pacientes…" : error ? "Los pacientes recientes no están disponibles." : "Aún no tienes pacientes activos. Agrega el primero para iniciar una consulta."}</p>
        )}
        <Link to="/app/patients" className="dashboard-card-link">Ver pacientes <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>

      <section className="dashboard-card dashboard-card-profile" aria-labelledby="dashboard-profile-title">
        <DashboardCardHeading id="dashboard-profile-title" title="Perfil profesional" icon={UserRound} />
        <div className="dashboard-profile-grid">
          <div className="dashboard-profile-metric">
            <div className="dashboard-profile-label"><span>Perfil completado</span><strong>{completion}%</strong></div>
            <progress className="dashboard-profile-progress" aria-label="Perfil completado" value={completion} max={100} />
          </div>
          <div className="dashboard-profile-metric" role="group" aria-label="Visitas al perfil público">
            <div className="dashboard-profile-label"><span><Eye size={16} aria-hidden="true" />Visitas al perfil público</span><strong aria-live="polite">{visitTotal === undefined ? "…" : visitTotal === null ? "—" : visitTotal.toLocaleString("es-MX")}</strong></div>
            <p>{visitTotal === null ? "No pudimos cargar el total. Usa Actualizar para reintentar." : "Una por sesión del navegador al día."}</p>
          </div>
        </div>
        <Link to="/app/profile" className="dashboard-card-link">Revisar perfil <CheckCircle2 size={16} aria-hidden="true" /></Link>
      </section>
    </div>
  );
}
