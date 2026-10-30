import { BadgeCheck, CreditCard, CalendarDays, ChevronDown, CircleHelp, ExternalLink, GraduationCap, LayoutDashboard, LogOut, Menu, MessageCircle, PanelLeftClose, PanelLeftOpen, Salad, Settings, ShieldCheck, UserRound, UsersRound, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '@/src/components/ui/Logo';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useAccess, routeEntitlement } from '@/src/features/admin/AccessProvider';
import { canReadFeature } from '@/src/features/admin/api';
import { AIUsageIndicator } from '@/src/components/ai/AIControls';
import { NotificationCenter } from '@/src/components/notifications/NotificationCenter';
import { EntryAnnouncements } from '@/src/features/announcements/EntryAnnouncements';
import { NotificationsProvider } from '@/src/features/notifications/useNotifications';
import { useProfessionalPresence } from '@/src/features/presence/useProfessionalPresence';
import { SupportProvider } from '@/src/features/support/SupportProvider';
import { SupportWidget } from '@/src/features/support/SupportWidget';
import { AIProcessingConsent, openAIProcessingConsent } from '@/src/features/ai/AIProcessingConsent';
import { BeginnerOnboarding, openBeginnerOnboarding } from '@/src/features/onboarding/BeginnerOnboarding';
import { ThemeSwitcher } from '@/src/features/theme/ThemeSwitcher';
import { ConsultationSetupProvider, useConsultationSetup } from '@/src/features/onboarding/ConsultationSetup';

const nav = [
  { label: 'Dashboard', href: '/app', icon: LayoutDashboard, end: true },
  { label: 'Perfil', href: '/app/profile', icon: UserRound },
  { label: 'Pacientes', href: '/app/patients', icon: UsersRound },
  { label: 'Taller de dietas', href: '/app/diet-workshop', icon: Salad },
  { label: 'Agenda', href: '/app/agenda', icon: CalendarDays },
  { label: 'Mensajes', href: '/app/messages', icon: MessageCircle },
  { label: 'Capacitación Nuthrick', href: '/app/academy', icon: GraduationCap },
  { label: 'Créditos IA', href: '/app/credits', icon: CreditCard },
  { label: 'Mi plan', href: '/app/my-plan', icon: BadgeCheck },
];

const SIDEBAR_STORAGE_KEY = 'nuthrick.sidebar-collapsed';

export function PrivateLayout() {
  const { user } = useAuth();
  return <ConsultationSetupProvider key={user?.id}><PrivateWorkspace /></ConsultationSetupProvider>;
}

function PrivateWorkspace() {
  const { profile, user } = useAuth();
  const { welcomePending } = useConsultationSetup();
  useProfessionalPresence(user?.id);
  const navigate = useNavigate();
  const { data: accessData } = useAccess();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!accountOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) setAccountOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountOpen]);
  const logout = () => { setAccountOpen(false); navigate('/logout'); };
  const initials = (profile?.full_name || user?.email || 'N').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  const toggleSidebar = () => {
    const collapsed = !sidebarCollapsed;
    setSidebarCollapsed(collapsed);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch { /* The menu still works when browser storage is unavailable. */ }
  };

  const renderSidebar = (compact = false) => <>
    <div className={`flex h-20 shrink-0 items-center ${compact ? 'justify-center px-3' : 'justify-between px-5'}`}>
      <Logo compact={compact} />
      <button type="button" className="p-2 text-[#80908a] lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú"><X size={20} /></button>
    </div>
    <nav className="px-3 py-5" aria-label="Aplicación">
      {nav.filter(item => !routeEntitlement(item.href) || canReadFeature(accessData?.access, routeEntitlement(item.href)!)).map(({ label, href, icon: Icon, end }) => <NavLink
        key={href}
        to={href}
        end={end}
        title={compact ? label : undefined}
        onClick={() => setMobileOpen(false)}
        className={({ isActive }) => `mb-1.5 flex min-h-11 items-center rounded-xl py-3 text-sm font-semibold transition ${compact ? 'justify-center px-0' : 'gap-3 px-3.5'} ${isActive ? 'bg-[#e9f1ec] text-[#285647]' : 'text-[#61706b] hover:bg-[#f2f5f1]'}`}
      >
        <Icon size={19} className="shrink-0" aria-hidden="true" />
        <span className={compact ? 'sr-only' : undefined}>{label}</span>
      </NavLink>)}
    </nav>
    {accessData?.is_admin && <Link
      to="/admin"
      title={compact ? 'Administración de Nuthrick' : undefined}
      className={`mb-5 rounded-xl border border-[#ccd8ce] py-3 text-sm font-semibold text-[#285647] ${compact ? 'mx-3 flex min-h-11 items-center justify-center' : 'mx-4 px-4'}`}
    >
      {compact && <ShieldCheck size={19} aria-hidden="true" />}
      <span className={compact ? 'sr-only' : undefined}>Administración de Nuthrick →</span>
    </Link>}
    <div className={compact ? 'hidden' : 'mx-4 mb-3'}><AIUsageIndicator key={user?.id} /></div>
    <div className={`mt-auto border-t border-[#e6ebe7] ${compact ? 'p-3' : 'p-4'}`}>
      {compact ? profile?.public_slug && <Link to={`/p/${profile.public_slug}`} target="_blank" title="Ver página pública" className="flex min-h-11 items-center justify-center rounded-xl bg-[#173d36] text-white">
        <ExternalLink size={19} aria-hidden="true" /><span className="sr-only">Ver página pública</span>
      </Link> : <div className="rounded-2xl bg-[#173d36] p-4 text-white"><p className="text-xs text-white/55">Tu página pública</p><p className="mt-2 truncate text-sm font-semibold">/p/{profile?.public_slug || 'tu-slug'}</p>{profile?.public_slug && <Link to={`/p/${profile.public_slug}`} target="_blank" className="mt-3 inline-block text-xs font-semibold text-[#efbd6b]">Ver página →</Link>}</div>}
    </div>
  </>;

  return (
    <SupportProvider><NotificationsProvider>
    {!welcomePending && <EntryAnnouncements />}
    <div className="professional-shell min-h-screen bg-[#f6f7f3] text-[#17312c]">
      <aside id="professional-sidebar" className={`professional-sidebar fixed inset-y-0 left-0 z-30 hidden flex-col overflow-y-auto border-r border-[#e1e7e2] bg-white motion-safe:transition-[width] motion-safe:duration-200 lg:flex ${sidebarCollapsed ? 'w-[76px]' : 'w-[250px]'}`}>{renderSidebar(sidebarCollapsed)}</aside>
      {mobileOpen && <div className="fixed inset-0 z-40 lg:hidden"><button type="button" className="absolute inset-0 bg-[#102d27]/45" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} /><aside className="professional-sidebar relative flex h-full w-[280px] flex-col overflow-y-auto bg-white shadow-2xl">{renderSidebar()}</aside></div>}
      <div className={`motion-safe:transition-[padding-left] motion-safe:duration-200 ${sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[250px]'}`}><header className="professional-header sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#e1e7e2] bg-[#f6f7f3]/90 px-5 backdrop-blur sm:px-8"><button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce3de] bg-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menú"><Menu size={19} /></button><button
        type="button"
        onClick={toggleSidebar}
        aria-controls="professional-sidebar"
        aria-expanded={!sidebarCollapsed}
        title={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
        className="hidden min-h-11 items-center gap-2 rounded-xl border border-[#dce3de] bg-white px-3 text-sm font-semibold text-[#61706b] hover:bg-[#f2f5f1] lg:flex"
      >{sidebarCollapsed ? <PanelLeftOpen size={19} aria-hidden="true" /> : <PanelLeftClose size={19} aria-hidden="true" />}<span>{sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}</span></button><div className="flex items-center gap-2"><ThemeSwitcher compact /><NotificationCenter /><div className="relative" ref={accountRef}><button ref={accountButtonRef} aria-label="Menú de cuenta" aria-controls="account-menu" type="button" className="flex items-center gap-3 rounded-2xl border border-[#dce3de] bg-white p-1.5 pr-3 text-left shadow-sm" onClick={() => setAccountOpen((value) => !value)} aria-expanded={accountOpen}><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e4b374] text-xs font-bold">{initials}</span><span className="hidden sm:block"><span className="block max-w-40 truncate text-xs font-semibold">{profile?.full_name || 'Mi cuenta'}</span><span className="block max-w-40 truncate text-[10px] text-[#87938e]">{user?.email}</span></span><ChevronDown size={15} className="text-[#84908b]" /></button>{accountOpen && <div id="account-menu" className="absolute right-0 top-14 w-56 rounded-2xl border border-[#dfe5e1] bg-white p-2 shadow-xl"><Link to="/app/profile" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-[#f3f5f2]"><UserRound size={16} />Editar perfil</Link><Link to="/app/settings" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-[#f3f5f2]"><Settings size={16} />Configuración</Link><Link to="/app/my-plan" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-[#f3f5f2]"><CreditCard size={16} />Mi plan</Link><button type="button" onClick={() => { setAccountOpen(false); openBeginnerOnboarding(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-[#f3f5f2]"><CircleHelp size={16} />Guía para principiantes</button><button type="button" onClick={() => { setAccountOpen(false); openAIProcessingConsent(); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-[#f3f5f2]"><ShieldCheck size={16} />Privacidad de IA</button><button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[#963f34] hover:bg-[#fff1ed]"><LogOut size={16} />Cerrar sesión</button></div>}</div></div></header><main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">{accessData?.access.status === 'grace' && <p role="status" className="mb-5 rounded-xl border border-[#ddc99e] bg-[#fff7e5] p-4 text-sm">Tu renovación está pendiente. Puedes continuar trabajando durante el período de gracia. <Link className="font-semibold underline" to="/app/my-plan">Revisar mi pago</Link></p>}<Outlet /></main></div>
    </div>
    <BeginnerOnboarding includeAI={[
      accessData?.access.values['ai.recall_24h'],
      accessData?.access.values['ai.pes'],
      accessData?.access.values['ai.diet_draft'],
    ].some((value) => value === true)} />
    {!welcomePending && <AIProcessingConsent />}
    <SupportWidget/>
    </NotificationsProvider></SupportProvider>
  );
}
