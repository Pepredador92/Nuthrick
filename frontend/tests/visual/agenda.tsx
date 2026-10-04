import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicBookingPage } from '@/src/screens/PublicBookingPage';
import { PublicProfilePage } from '@/src/screens/PublicProfilePage';
import { ThemeSwitcher } from '@/src/features/theme/ThemeSwitcher';
import '../../app/globals.css';
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[window.location.search.includes('profile')?'/p/prueba':'/p/prueba/agendar']}><div className="nuth-public-theme-control"><ThemeSwitcher compact /></div><Routes><Route path="/p/:slug" element={<PublicProfilePage/>}/><Route path="/p/:slug/agendar" element={<PublicBookingPage/>}/><Route path="/p/:slug/agendar/datos" element={<PublicBookingPage/>}/></Routes></MemoryRouter>);
