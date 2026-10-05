import { Brand } from './Brand';
import { Link } from 'react-router-dom';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5 text-[#173d36]" aria-label="Nuthrick, inicio">
      <Brand compact={compact} />
    </Link>
  );
}
