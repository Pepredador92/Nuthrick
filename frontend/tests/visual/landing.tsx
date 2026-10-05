import { createRoot } from 'react-dom/client';
import { ThemeSwitcher } from '../../src/features/theme/ThemeSwitcher';
import { LandingPage } from '../../src/screens/LandingPage';
import '../../app/globals.css';
// Synthetic catalog only for visual checks; the public page loads its own catalog.
const plans = new URLSearchParams(location.search).has('catalog') ? [
  { id: 'demo-essential', name: 'Esencial · demostración', monthly_price: 427, annual_price: 4270, currency: 'MXN', values: { 'patients.limit': 30 } },
  { id: 'demo-professional', name: 'Profesional · demostración', monthly_price: 857, annual_price: 8570, currency: 'MXN', values: { 'patients.limit': 'unlimited' } },
] : [];
createRoot(document.getElementById('root')!).render(<><div className="nuth-public-theme-control"><ThemeSwitcher compact /></div><LandingPage plans={plans} /></>);
