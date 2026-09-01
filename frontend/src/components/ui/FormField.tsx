import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label: string;
  name: string;
  hint?: string;
  children?: ReactNode;
}

export function Field({ label, name, hint, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block text-sm font-semibold text-[#29423b]">{label}</label>
      {children}
      {hint && <p className="text-xs leading-5 text-[#74817d]">{hint}</p>}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`nuth-input ${props.className ?? ''}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`nuth-input min-h-28 resize-y ${props.className ?? ''}`} />;
}
