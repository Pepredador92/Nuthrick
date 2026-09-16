import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicBookingPage } from '@/src/screens/PublicBookingPage';
import '../../app/globals.css';
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/p/prueba/agendar']}><Routes><Route path="/p/:slug/agendar" element={<PublicBookingPage/>}/></Routes></MemoryRouter>);
