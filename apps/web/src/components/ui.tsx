'use client';
import Image from 'next/image';
import { CheckCircle2, OctagonAlert, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { useAvisos } from '@/stores/avisos';

/** Foto con degradado de respaldo (si la imagen no carga, se ve un color elegante). */
export function Foto({ id, alt, sizes, prioridad, fondo = 'linear-gradient(160deg,#9fb6b8,#4d6e75)', className = '' }:
  { id: string; alt: string; sizes: string; prioridad?: boolean; fondo?: string; className?: string }) {
  const [rota, setRota] = useState(false);
  // Si el contenedor ya es absoluto (fondos a pantalla completa) no se le agrega «relative» (en Tailwind 4 ganaría y lo dejaría sin altura)
  const posicion = /\b(absolute|fixed)\b/.test(className) ? '' : 'relative';
  return (
    <div className={`${posicion} overflow-hidden ${className}`} style={{ background: fondo }} role={rota && alt ? 'img' : undefined} aria-label={rota && alt ? alt : undefined}>
      {!rota && <Image src={`https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=70`} alt={alt} fill sizes={sizes}
        priority={prioridad} className="object-cover" onError={() => setRota(true)} />}
    </div>
  );
}

/** Contenedor de notificaciones (Zustand). */
export function Avisos() {
  const { avisos, quitar } = useAvisos();
  const icono = { ok: CheckCircle2, error: OctagonAlert, warn: TriangleAlert };
  const color = { ok: 'bg-ocean', error: 'bg-bad', warn: 'bg-[#7A5418]' };
  return (
    <div className="fixed bottom-4 right-4 z-[200] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 print:hidden" aria-live="polite">
      {avisos.map(a => { const I = icono[a.tipo]; return (
        <div key={a.id} role={a.tipo === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-xl ${color[a.tipo]}`}>
          <I className="mt-0.5 size-5 shrink-0" aria-hidden /> <span className="flex-1">{a.texto}</span>
          <button onClick={() => quitar(a.id)} aria-label="Cerrar aviso" className="opacity-80 hover:opacity-100"><X className="size-4" /></button>
        </div>); })}
    </div>
  );
}

export function Insignia({ children, tono = 'muted' }: { children: React.ReactNode; tono?: 'ok' | 'info' | 'warn' | 'bad' | 'muted' | 'gold' }) {
  const t = { ok: 'bg-ok-bg text-ok', info: 'bg-info-bg text-info', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad', muted: 'bg-[#EEEDE8] text-muted', gold: 'bg-gold-soft text-gold-dark' }[tono];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${t}`}><span className="size-1.5 rounded-full bg-current" />{children}</span>;
}
