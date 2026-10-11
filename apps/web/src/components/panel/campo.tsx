'use client';
import { cloneElement, isValidElement, useId } from 'react';

/** Campo de formulario del panel: etiqueta asociada, error anunciado y aria-invalid. */
export function Campo({ etiqueta, error, children, className = '', ayuda }: { etiqueta: string; error?: string; children: React.ReactElement<any>; className?: string; ayuda?: string }) {
  const id = useId();
  const hijo = children as React.ReactElement<any>;
  const control = isValidElement(hijo) ? cloneElement(hijo as React.ReactElement<Record<string, unknown>>, {
    id, 'aria-invalid': !!error || undefined, 'aria-describedby': error ? `${id}-e` : ayuda ? `${id}-a` : undefined,
    className: `h-10 w-full rounded-lg border border-[#D9D6CE] bg-white px-3 text-[0.95rem] outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 aria-[invalid=true]:border-bad ${(hijo.props as any).className ?? ''}`
  }) : children;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{etiqueta}</label>
      {control}
      {ayuda && !error && <p id={`${id}-a`} className="mt-1 text-xs text-muted">{ayuda}</p>}
      {error && <p id={`${id}-e`} role="alert" className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}
export const AlertaForm = ({ texto }: { texto?: string | null }) => texto ? <p role="alert" className="mb-4 rounded-lg bg-bad-bg px-4 py-2.5 text-sm text-bad">{texto}</p> : null;
