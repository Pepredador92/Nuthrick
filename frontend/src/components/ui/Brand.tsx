import { brandArcs, brandPerson, brandHead } from '../../../../supabase/functions/_shared/brand-mark';

/** Decorative mark: the surrounding wordmark/link supplies the accessible name. */
export function BrandMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="-1 -2 102 104" fill="none" aria-hidden="true" className={className}>
    {brandArcs.map(d => <path key={d} d={d} stroke="currentColor" strokeWidth="7" strokeLinecap="round" />)}
    <circle {...brandHead} fill="currentColor" /><path d={brandPerson} fill="currentColor" />
  </svg>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="nuth-brand"><BrandMark size={38} />{!compact && <span className="nuth-brand-name">Nuthrick</span>}</span>;
}
