import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AcademyPage } from '../../src/features/training/AcademyPage';
import { TrainingAdminPage } from '../../src/features/training/TrainingAdminPage';
import { ThemeSwitcher } from '../../src/features/theme/ThemeSwitcher';
import '../../app/globals.css';
import '../../src/features/admin/admin.css';

function Preview() {
  const [admin, setAdmin] = useState(false);
  return <div style={{ minHeight: '100vh', background: 'var(--nuth-surface-soft)', color: 'var(--nuth-ink)' }}>
    <header style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--nuth-line)', background: 'var(--nuth-surface)' }}>
      <strong style={{ marginRight: 'auto', fontSize: 13 }}>Vista local · Academia Nuthrick</strong>
      <button className="nuth-button-secondary" aria-pressed={!admin} onClick={() => setAdmin(false)}>Espacio profesional</button>
      <button className="nuth-button-secondary" aria-pressed={admin} onClick={() => setAdmin(true)}>Administración</button>
      <ThemeSwitcher compact />
    </header>
    <main style={{ maxWidth: 1240, margin: 'auto', padding: '24px 20px' }}>
      <p style={{ color: 'var(--nuth-muted)', fontSize: 12, marginBottom: 16 }}>Los cambios de esta vista son de demostración. Los videos se reproducen desde YouTube.</p>
      {admin ? <TrainingAdminPage /> : <AcademyPage />}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
