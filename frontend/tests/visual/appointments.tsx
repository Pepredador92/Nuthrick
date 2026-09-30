import React from 'react';
import { createRoot } from 'react-dom/client';
import { ScheduleAppointmentButton } from '@/src/components/agenda/ScheduleAppointmentButton';
import { SiteVisitStats } from '@/src/features/admin/SiteVisitStats';
import { AppointmentConfirmationPage } from '@/src/screens/AppointmentConfirmationPage';
import '../../app/globals.css';
import '../../src/features/admin/admin.css';
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).get('view')==='patient'?<AppointmentConfirmationPage/>:<main className="mx-auto max-w-3xl space-y-6 p-5 text-[#173d36]"><header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5"><div><p className="text-xs">AGENDA · DATOS SINTÉTICOS</p><h1 className="mt-2 text-2xl font-semibold">Agendar un paciente</h1></div><ScheduleAppointmentButton/></header><SiteVisitStats/></main>);
