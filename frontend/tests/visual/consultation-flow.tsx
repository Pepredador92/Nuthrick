import { createRoot } from 'react-dom/client';
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom';
import { ConsultationPage } from '../../src/screens/ConsultationPage';
import { ThemeSwitcher } from '../../src/features/theme/ThemeSwitcher';
import '../../app/globals.css';
const router = createMemoryRouter([{
  element: <><nav className="mb-4 flex gap-4 text-sm font-semibold"><Link to="/app/patients/patient">Ficha del paciente</Link><Link to="/app/messages">Mensajes</Link></nav><Outlet /></>,
  children: [
    { path: '/app/patients/:patientId/consultations/new', element: <ConsultationPage /> },
    { path: '/app/patients/:patientId/consultations/:consultationId', element: <ConsultationPage /> },
    { path: '/app/patients/:patientId', element: <section><h1>Ficha del paciente de demostración</h1><Link className="nuth-button mt-5" to="/app/patients/patient/consultations/new">Nueva consulta</Link></section> },
    { path: '/app/messages', element: <section><h1>Mensajes de demostración</h1><Link className="nuth-button mt-5" to="/app/patients/patient">Volver al paciente</Link></section> },
  ],
}], { initialEntries: ['/app/patients/patient', '/app/patients/patient/consultations/demo'] });
createRoot(document.getElementById('root')!).render(<main style={{ padding: '20px clamp(14px, 3vw, 40px)' }}><div className="mb-4 flex justify-between text-xs"><span>Vista previa · Datos de demostración · Sin guardado ni consumo real</span><ThemeSwitcher /></div><RouterProvider router={router} /></main>);
