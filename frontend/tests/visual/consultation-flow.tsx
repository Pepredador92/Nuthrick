import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ConsultationPage } from '../../src/screens/ConsultationPage';
import { ThemeSwitcher } from '../../src/features/theme/ThemeSwitcher';
import '../../app/globals.css';
createRoot(document.getElementById('root')!).render(<main style={{ padding: '20px clamp(14px, 3vw, 40px)' }}><div className="mb-4 flex justify-between text-xs"><span>Vista previa · Datos de demostración · Sin guardado ni consumo real</span><ThemeSwitcher /></div><MemoryRouter initialEntries={['/app/patients/patient/consultations/demo']}><Routes><Route path="/app/patients/:patientId/consultations/:consultationId" element={<ConsultationPage />} /></Routes></MemoryRouter></main>);
