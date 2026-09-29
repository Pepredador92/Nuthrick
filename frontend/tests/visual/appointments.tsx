import React from 'react';
import { createRoot } from 'react-dom/client';
import { ScheduleAppointmentButton } from '@/src/components/agenda/ScheduleAppointmentButton';
import { SiteVisitStats } from '@/src/features/admin/SiteVisitStats';
import '../../app/globals.css';
import '../../src/features/admin/admin.css';
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-3xl space-y-6 p-5 text-[#173d36]"><header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5"><div><p className="text-xs">FICHA · DATOS SINTÉTICOS</p><h1 className="mt-2 text-2xl font-semibold">Paciente de demostración</h1></div><ScheduleAppointmentButton patient={{id:'10000000-0000-0000-0000-000000000001',full_name:'Paciente de demostración'}}/></header><SiteVisitStats/></main>);
