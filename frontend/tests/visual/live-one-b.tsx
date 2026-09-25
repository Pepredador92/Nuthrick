import {createRoot} from 'react-dom/client';import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {AdminLayout} from '../../src/features/admin/AdminLayout';import {LegalAdminPage} from '../../src/features/legal/LegalAdminPage';import {EmailOperationsPanel} from '../../src/features/billing/EmailOperationsPanel';import '../../app/globals.css';
const view=new URLSearchParams(location.search).get('view')??'/admin/legal/terms';
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[view]}><Routes><Route path="/admin" element={<AdminLayout/>}><Route path="legal/:key" element={<LegalAdminPage/>}/><Route path="email" element={<EmailOperationsPanel/>}/></Route></Routes></MemoryRouter>);
