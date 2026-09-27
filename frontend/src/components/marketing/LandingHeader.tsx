/* eslint-disable @next/next/no-html-link-for-pages -- Full document links cross the SSR marketing / React Router product boundary without prefetching private application code. */
"use client";

import { useState } from 'react';
import { Leaf, Menu, X } from 'lucide-react';

const navigation = [
  ['Cómo funciona', '#como-funciona'],
  ['Funciones', '#funciones'],
  ['Quién lo creó', '#creador'],
  ['Precios', '#precios'],
] as const;

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  return <header className="sticky top-0 z-50 border-b border-[#dfe7e1] bg-[#f7f8f4]/95 backdrop-blur-lg">
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
      <a href="/" className="inline-flex items-center gap-2.5 font-bold tracking-tight" aria-label="Nuthrick, inicio"><span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#173d36] text-white"><Leaf size={19} aria-hidden="true" /></span><span className="text-lg">Nuthrick</span></a>
      <nav className="hidden items-center gap-6 text-sm font-semibold lg:flex" aria-label="Navegación principal">{navigation.map(([label, href]) => <a key={href} href={href} className="py-3 hover:underline">{label}</a>)}</nav>
      <div className="hidden items-center gap-3 sm:flex"><a href="/login" className="px-3 py-3 text-sm font-semibold">Iniciar sesión</a><a href="/register" className="nuth-button">Registrarme</a></div>
      <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#c9d8ce] lg:hidden" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open} aria-controls="landing-menu" onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
    </div>
    <nav id="landing-menu" hidden={!open} className="border-t border-[#dfe7e1] px-5 pb-5 lg:hidden" aria-label="Navegación móvil">
      {navigation.map(([label, href]) => <a key={href} href={href} className="block py-3 font-semibold" onClick={() => setOpen(false)}>{label}</a>)}
      <a href="/login" className="block py-3 font-semibold sm:hidden">Iniciar sesión</a><a href="/register" className="nuth-button justify-center sm:hidden">Registrarme</a>
    </nav>
  </header>;
}
