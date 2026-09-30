import { useEffect, useId, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { listPatients } from '@/src/services/patients';

export type PatientOption = { id: string; full_name: string; email?: string | null };

export function PatientCombobox({ value, onChange, disabled }: {
  value: PatientOption | null;
  onChange: (patient: PatientOption | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ query: string; rows: PatientOption[]; error?: string } | null>(null);
  const current = result?.query === query ? result : null;
  const rows = current?.rows ?? [];

  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, id, open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const timer = setTimeout(() => {
      void listPatients({ search: query, status: 'active', pageSize: 30, sort: 'name_asc' })
        .then(data => { if (live) setResult({ query, rows: data.rows }); })
        .catch(() => { if (live) setResult({ query, rows: [], error: 'No pudimos buscar pacientes. Vuelve a abrir el buscador para reintentar.' }); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [open, query]);

  function select(patient: PatientOption) {
    onChange(patient);
    setQuery('');
    setActive(-1);
    setOpen(false);
  }

  return <div className="relative" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={id} className="block text-sm font-semibold">Paciente</label>
    <div className="relative mt-2">
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open}
        aria-controls={`${id}-list`} aria-activedescendant={open && rows[active] ? `${id}-${active}` : undefined}
        autoComplete="off" className="nuth-input pr-10" placeholder="Busca o selecciona un paciente"
        value={value?.full_name ?? query} disabled={disabled} required
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onChange={event => { onChange(null); setQuery(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive(index => !rows.length ? -1 : index < 0 ? (event.key === 'ArrowDown' ? 0 : rows.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length);
          } else if (event.key === 'Enter' && open) {
            event.preventDefault(); if (rows[active]) select(rows[active]);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault(); event.stopPropagation(); setOpen(false);
          }
        }}/>
      <ChevronDown aria-hidden="true" size={16} className="pointer-events-none absolute right-3 top-3"/>
    </div>
    {open && <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-[#dbe5df] bg-white p-1 shadow-lg">
      <ul id={`${id}-list`} role="listbox" aria-label="Pacientes" aria-busy={!current}>
        {rows.map((patient, index) => <li key={patient.id} id={`${id}-${index}`} role="option"
          aria-selected={value?.id === patient.id} className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-3 text-sm ${active === index ? 'bg-[#e8f1ec]' : 'hover:bg-[#f2f6f2]'}`}
          onPointerDown={event => event.preventDefault()} onClick={() => select(patient)}>
          <span><span className="block font-semibold">{patient.full_name}</span>{patient.email && <span className="break-all text-xs text-[#63796d]">{patient.email}</span>}</span>
          {value?.id === patient.id && <Check size={16} aria-hidden="true"/>}
        </li>)}
      </ul>
      {!rows.length && <p role="status" className="px-3 py-3 text-sm text-[#63796d]">{!current ? 'Buscando pacientes…' : current.error || 'No encontramos pacientes con ese nombre.'}</p>}
      {rows.length === 30 && <p className="px-3 py-2 text-xs text-[#63796d]">Escribe más caracteres para afinar la búsqueda.</p>}
    </div>}
  </div>;
}
