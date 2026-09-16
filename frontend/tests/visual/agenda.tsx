import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicBookingPage } from '@/src/screens/PublicBookingPage';
import { PublicProfilePage } from '@/src/screens/PublicProfilePage';
import '../../app/globals.css';
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[window.location.search.includes('profile')?'/p/prueba':'/p/prueba/agendar']}><Routes><Route path="/p/:slug" element={<PublicProfilePage/>}/><Route path="/p/:slug/agendar" element={<PublicBookingPage/>}/></Routes></MemoryRouter>);
