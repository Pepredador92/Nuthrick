/* eslint-disable @next/next/no-html-link-for-pages -- Full document links cross the SSR marketing / React Router product boundary. */
"use client";
import { useState } from 'react';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { Brand } from '@/src/components/ui/Brand';
const navigation = [['Descubrir Nuthrick', '#como-funciona'], ['Quién lo creó', '#creador']] as const;
export function LandingHeader() {
  const [open, setOpen] = useState(false);
  return <header className="landing-header">
    <div className="landing-shell landing-header-inner">
      <a href="/" aria-label="Nuthrick, inicio"><Brand /></a>
      <nav className="landing-desktop-nav" aria-label="Navegación principal">{navigation.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</nav>
      <div className="landing-header-actions"><a href="/login" className="landing-login">Iniciar sesión</a><a href="/planes" className="landing-header-plans">Ver planes <ArrowUpRight size={16} aria-hidden="true" /></a><button type="button" className="landing-menu-toggle" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open} aria-controls="landing-menu" onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button></div>
    </div>
    <nav id="landing-menu" hidden={!open} className="landing-mobile-nav landing-shell" aria-label="Navegación móvil">{navigation.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}<a href="/login">Iniciar sesión</a><a href="/register">Crear mi cuenta</a></nav>
  </header>;
}
