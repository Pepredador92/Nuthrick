import { CalendarDays, ChevronDown, LayoutDashboard, LogOut, Menu, PanelLeftClose, UserRound, UsersRound, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Logo } from '@/src/components/ui/Logo';
import { useAuth } from '@/src/features/auth/AuthProvider';

const nav = [
  { label: 'Dashboard', href: '/app', icon: LayoutDashboard, end: true },
  { label: 'Perfil', href: '/app/profile', icon: UserRound },
  { label: 'Pacientes', href: '/app/patients', icon: UsersRound },
];

export function PrivateLayout() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const logout = async () => { await signOut(); navigate('/'); };
  const initials = (profile?.full_name || user?.email || 'N').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  const sidebar = <><div className="flex h-20 items-center justify-between px-5"><Logo /><button type="button" className="p-2 text-[#80908a] lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú"><X size={20} /></button></div><nav className="px-3 py-5" aria-label="Aplicación">{nav.map(({ label, href, icon: Icon, end }) => <NavLink key={href} to={href} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `mb-1.5 flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${isActive ? 'bg-[#e9f1ec] text-[#285647]' : 'text-[#61706b] hover:bg-[#f2f5f1]'}`}><Icon size={19} />{label}</NavLink>)}<div className="mt-7 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#9aa6a1]">Próximamente</div><span className="mt-2 flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm text-[#9da8a4]"><CalendarDays size={19} />Agenda</span></nav><div className="mt-auto border-t border-[#e6ebe7] p-4"><div className="rounded-2xl bg-[#173d36] p-4 text-white"><p className="text-xs text-white/55">Tu página pública</p><p className="mt-2 truncate text-sm font-semibold">/p/{profile?.public_slug || 'tu-slug'}</p>{profile?.public_slug && <Link to={`/p/${profile.public_slug}`} target="_blank" className="mt-3 inline-block text-xs font-semibold text-[#efbd6b]">Ver página →</Link>}</div></div></>;

  return (
    <div className="min-h-screen bg-[#f6f7f3] text-[#17312c]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col border-r border-[#e1e7e2] bg-white lg:flex">{sidebar}</aside>
      {mobileOpen && <div className="fixed inset-0 z-40 lg:hidden"><button type="button" className="absolute inset-0 bg-[#102d27]/45" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} /><aside className="relative flex h-full w-[280px] flex-col bg-white shadow-2xl">{sidebar}</aside></div>}
      <div className="lg:pl-[250px]"><header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#e1e7e2] bg-[#f6f7f3]/90 px-5 backdrop-blur sm:px-8"><button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce3de] bg-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menú"><Menu size={19} /></button><div className="hidden items-center gap-2 text-sm text-[#7a8782] lg:flex"><PanelLeftClose size={18} /><span>Espacio profesional</span></div><div className="relative"><button type="button" className="flex items-center gap-3 rounded-2xl border border-[#dce3de] bg-white p-1.5 pr-3 text-left shadow-sm" onClick={() => setAccountOpen((value) => !value)} aria-expanded={accountOpen}><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e4b374] text-xs font-bold">{initials}</span><span className="hidden sm:block"><span className="block max-w-40 truncate text-xs font-semibold">{profile?.full_name || 'Mi cuenta'}</span><span className="block max-w-40 truncate text-[10px] text-[#87938e]">{user?.email}</span></span><ChevronDown size={15} className="text-[#84908b]" /></button>{accountOpen && <div className="absolute right-0 top-14 w-56 rounded-2xl border border-[#dfe5e1] bg-white p-2 shadow-xl"><Link to="/app/profile" onClick={() => setAccountOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-[#f3f5f2]"><UserRound size={16} />Editar perfil</Link><button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[#963f34] hover:bg-[#fff1ed]"><LogOut size={16} />Cerrar sesión</button></div>}</div></header><main className="mx-auto max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10"><Outlet /></main></div>
    </div>
  );
}
