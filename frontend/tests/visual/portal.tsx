import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PatientPortalPage } from '@/src/screens/PatientPortalPage';
import { PatientPortalOwnerPage } from '@/src/screens/PatientPortalOwnerPage';
import '../../app/globals.css';
const owner = new URLSearchParams(location.search).has('owner');
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[owner ? '/owner/p1' : `/mi-espacio#${'x'.repeat(43)}`]}><Routes><Route path="/mi-espacio" element={<PatientPortalPage />} /><Route path="/owner/:patientId" element={<div className="mx-auto max-w-6xl p-6"><PatientPortalOwnerPage /></div>} /></Routes></MemoryRouter>);
