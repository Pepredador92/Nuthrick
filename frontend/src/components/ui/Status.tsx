import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return <div role="status" className="flex min-h-48 items-center justify-center gap-3 text-sm text-[#697873]"><LoaderCircle className="animate-spin" size={20} />{label}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-[#f1cbc1] bg-[#fff8f5] p-5 text-sm text-[#8b4334]">
      <div className="flex gap-3"><AlertCircle size={19} className="shrink-0" /><div><p className="font-semibold">Algo no salió bien</p><p className="mt-1">{message}</p></div></div>
      {onRetry && <button type="button" className="mt-4 font-semibold underline" onClick={onRetry}>Intentar de nuevo</button>}
    </div>
  );
}

export function SuccessNote({ children }: { children: React.ReactNode }) {
  return <div role="status" className="flex items-center gap-2 rounded-xl bg-[#edf5f0] px-3 py-2 text-sm text-[#356353]"><CheckCircle2 size={17} />{children}</div>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cad6ce] bg-[#fbfcfa] p-8 text-center">
      <p className="font-semibold text-[#315e4f]">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#74817d]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
