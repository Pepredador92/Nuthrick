import { Leaf } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5 text-[#173d36]" aria-label="Nuthrick, inicio">
      <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#173d36] text-white shadow-sm">
        <Leaf size={19} strokeWidth={2.2} aria-hidden="true" />
      </span>
      {!compact && <span className="text-lg font-bold tracking-[-0.03em]">Nuthrick</span>}
    </Link>
  );
}
