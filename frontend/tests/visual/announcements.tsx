import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AnnouncementsAdminPage } from '../../src/features/announcements/AnnouncementsAdminPage';
import { ThemeSwitcher } from '../../src/features/theme/ThemeSwitcher';
import '../../app/globals.css';
import '../../src/features/admin/admin.css';

createRoot(document.getElementById('root')!).render(<MemoryRouter><div className="admin-shell" style={{ background: 'var(--nuth-surface-soft)', color: 'var(--nuth-ink)', minHeight: '100vh' }}>
  <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--nuth-line)', background: 'var(--nuth-surface)' }}><strong style={{ fontSize: 13 }}>Nuthrick · Anuncios</strong><ThemeSwitcher compact /></header>
  <main style={{ maxWidth: 1200, padding: '28px 20px', margin: 'auto' }}><p style={{ color: 'var(--nuth-muted)', fontSize: 11, marginBottom: 20 }}>Vista local de demostración. Los cambios de esta vista no se publican a usuarios.</p><AnnouncementsAdminPage /></main>
</div></MemoryRouter>);
