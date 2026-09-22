import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {DietWorkshopPage} from '../../src/screens/DietWorkshopPage';
import '../../app/globals.css';
const id=new URLSearchParams(location.search).get('plan');
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[`/app/diet-workshop/${id}`]}><main className="mx-auto max-w-7xl p-4 sm:p-8"><p className="mb-3 text-xs">Prueba local · Backend real · Proveedor simulado · Sin OpenAI</p><Routes><Route path="/app/diet-workshop/:dietPlanId" element={<DietWorkshopPage/>}/></Routes></main></MemoryRouter>);
