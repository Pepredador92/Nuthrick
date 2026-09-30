import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SupportProvider } from '@/src/features/support/SupportProvider';
import { SupportWidget } from '@/src/features/support/SupportWidget';
import { AdminSupportPage } from '@/src/features/support/AdminSupportPage';
import '../../app/globals.css';
import '../../src/features/admin/admin.css';
const admin=new URLSearchParams(location.search).get('view')==='admin';
createRoot(document.getElementById('root')!).render(<BrowserRouter><SupportProvider admin={admin}><main className={`mx-auto max-w-6xl p-5 text-[#173d36] ${admin?'admin-shell':''}`}>{admin?<AdminSupportPage/>:<><h1 className="text-2xl font-semibold">Espacio profesional</h1><p>Prueba visual con datos sintéticos</p><SupportWidget/></>}</main></SupportProvider></BrowserRouter>);
