'use client';

import { useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

const views = [
  { id: 'planes', label: 'Planes de alimentación', title: 'Del plan a la mesa.', description: 'Organiza opciones por tiempo de comida y distribúyelas en los días de tu plan.', image: 'nuthrick-planes.png', alt: 'Pantalla real de Nuthrick a la Mesa: organización de un menú por días con datos de demostración' },
  { id: 'mediciones', label: 'Cálculos y mediciones', title: 'El dato y su contexto.', description: 'Consulta resultados y métodos para interpretar tu evaluación con criterio profesional.', image: 'nuthrick-calculos.png', alt: 'Pantalla real de resultados de Nuthrick con índices y composición corporal de demostración' },
  { id: 'expedientes', label: 'Tus pacientes', title: 'Cada historia, en su lugar.', description: 'Encuentra a tus pacientes y accede a su expediente para continuar donde te quedaste.', image: 'nuthrick-pacientes.png', alt: 'Pantalla real de pacientes de Nuthrick con expedientes ficticios para demostración' },
] as const;

export function LandingProductTour() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className="landing-tour">
    <div className="landing-tour-tabs" role="tablist" aria-label="Explorar pantallas de Nuthrick">
      {views.map((item, index) => <button key={item.id} ref={node => { tabs.current[index] = node; }} type="button" role="tab" id={`tour-tab-${item.id}`} aria-selected={active === index} aria-controls={`tour-panel-${item.id}`} tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % views.length : event.key === 'ArrowLeft' ? (index + views.length - 1) % views.length : event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : null;
        if (next !== null) { event.preventDefault(); setActive(next); tabs.current[next]?.focus(); }
      }}>{item.label}<ArrowUpRight size={16} aria-hidden="true" /></button>)}
    </div>
    {views.map((item, index) => <div key={item.id} role="tabpanel" id={`tour-panel-${item.id}`} aria-labelledby={`tour-tab-${item.id}`} hidden={active !== index} tabIndex={0}>
      {active === index && <>
        <div className="landing-tour-description"><h3>{item.title}</h3><p>{item.description}</p></div>
        <figure><div className="landing-screen-frame"><div className="landing-screen-bar"><span aria-hidden="true">● ● ●</span><span>Nuthrick / {item.label}</span><span>Vista del sistema</span></div><img src={`/images/landing/${item.image}`} width="1280" height="900" loading="lazy" decoding="async" alt={item.alt} /></div><figcaption><span>Pantalla real del sistema · datos de demostración</span><a href={`/images/landing/${item.image}`} target="_blank" rel="noreferrer" aria-label={`Ampliar ${item.label} (abre en otra pestaña)`}>Ampliar pantalla <ArrowUpRight size={14} aria-hidden="true" /></a></figcaption></figure>
      </>}
    </div>)}
  </div>;
}
