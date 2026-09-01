import { Link } from 'react-router-dom';
import { Logo } from '@/src/components/ui/Logo';

export function LegalPage({ type }: { type: 'privacy' | 'terms' }) {
  const privacy = type === 'privacy';
  return <main className="min-h-screen bg-[#f7f8f4] px-5 py-6 sm:px-8"><div className="mx-auto max-w-4xl"><div className="flex items-center justify-between"><Logo /><Link to="/" className="text-sm font-semibold">Volver</Link></div><article className="mt-16 rounded-[30px] border border-[#dfe5e1] bg-white p-8 sm:p-12"><p className="nuth-eyebrow">Documento preliminar</p><h1 className="mt-4 text-4xl font-semibold tracking-[-.04em]">{privacy ? 'Aviso de privacidad' : 'Términos de uso'}</h1><p className="mt-6 leading-8 text-[#687672]">Este texto es un marcador de estructura para la primera versión de Nuthrick y deberá revisarse legalmente antes de un lanzamiento público comercial.</p><h2 className="mt-10 text-xl font-semibold">Principios de esta versión</h2><ul className="mt-4 list-disc space-y-3 pl-6 text-[#687672]"><li>Las cuentas se autentican mediante Supabase Auth.</li><li>La información privada se separa por profesional mediante RLS.</li><li>La página pública sólo consume una proyección de datos aprobados.</li><li>No se procesan pagos ni información clínica en esta etapa.</li></ul></article></div></main>;
}
