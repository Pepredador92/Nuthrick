import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DietWorkshopPage } from '../../src/screens/DietWorkshopPage';
import '../../app/globals.css';
createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 8px' }}>
    <p style={{ padding: '0 8px 12px', fontSize: 11, color: '#536675' }}>VISTA LOCAL · Datos ficticios · Los cambios de esta vista no se guardan en pacientes</p>
    <MemoryRouter initialEntries={['/app/diet-workshop/energy-demo']}>
      <Routes><Route path="/app/diet-workshop/:dietPlanId" element={<DietWorkshopPage />} /><Route path="/app/patients/:id" element={<p>Saliste del borrador de demostración. Recarga para volver a Energía.</p>} /></Routes>
    </MemoryRouter>
  </main>,
);
