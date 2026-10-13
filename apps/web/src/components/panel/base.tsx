'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Inbox, X } from 'lucide-react';
import { ETIQUETAS } from '@marea/shared';
import { apiPanel, useRefresco } from '@/stores/sesion';

/* ---------------- Datos ---------------- */
/** Carga datos de la API y se recarga sola cuando cambia el refresco global. */
export function useDatos<T>(ruta: string | null) {
  const n = useRefresco(s => s.n);
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const ultima = useRef(0);
  const cargar = useCallback(async () => {
    if (!ruta) return;
    // Solo cuenta la última petición: una respuesta lenta de un filtro anterior no pisa la actual
    const yo = ++ultima.current;
    setCargando(true);
    try { const x = await apiPanel<T>(ruta); if (yo === ultima.current) { setDatos(x); setError(null); } }
    catch (e: any) { if (yo === ultima.current) setError(e.message); }
    finally { if (yo === ultima.current) setCargando(false); }
  }, [ruta]);
  useEffect(() => { cargar(); }, [cargar, n]);
  return { datos, error, cargando, recargar: cargar };
}

/* ---------------- Presentación ---------------- */
const TONOS: Record<string, string> = {
  Confirmada: 'info', CheckIn: 'ok', CheckOut: 'muted', Cancelada: 'bad', NoShow: 'bad', Aprobado: 'ok', Anulado: 'bad', Pendiente: 'warn', Respondido: 'ok',
  Operativa: 'ok', Mantenimiento: 'warn', FueraDeServicio: 'bad', Limpia: 'ok', Sucia: 'warn', Administrador: 'gold', Recepcionista: 'info',
  Aceptado: 'ok', Observado: 'warn', Rechazado: 'bad', Enviado: 'ok', Simulado: 'info', Fallido: 'bad', Abierto: 'info', Cerrado: 'muted', Revisado: 'ok',
  EnLimpieza: 'info', EnCurso: 'info', Terminada: 'ok', Anulada: 'muted', EnProceso: 'info', Resuelto: 'ok', Cancelado: 'muted', Urgente: 'bad', Alta: 'warn', Media: 'gold', Baja: 'muted'
};
const CLASES: Record<string, string> = { ok: 'bg-ok-bg text-ok', info: 'bg-info-bg text-info', warn: 'bg-warn-bg text-warn', bad: 'bg-bad-bg text-bad', muted: 'bg-[#EEEDE8] text-muted', gold: 'bg-gold-soft text-gold-dark' };
export function Estado({ valor }: { valor: string }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASES[TONOS[valor] ?? 'muted']}`}>
    <span className="size-1.5 rounded-full bg-current" aria-hidden />{ETIQUETAS[valor] ?? valor}</span>;
}

export function Cabecera({ titulo, sub, children }: { titulo: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="font-serif text-3xl font-medium leading-tight text-ocean md:text-4xl">{titulo}</h1>{sub && <p className="mt-1 text-muted">{sub}</p>}</div>
      {children && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{children}</div>}
    </div>
  );
}

export function Kpi({ icono: I, tono = 'gold', etiqueta, valor, sub, barra }: { icono: React.ElementType; tono?: string; etiqueta: string; valor: React.ReactNode; sub?: React.ReactNode; barra?: number }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:p-5">
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl sm:size-11 ${CLASES[tono]}`}><I className="size-5" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted sm:text-sm">{etiqueta}</p>
        <p className="text-xl font-medium text-ocean tabular-nums sm:text-2xl">{valor}</p>
        {sub && <p className="text-xs text-muted">{sub}</p>}
        {barra !== undefined && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ECEAE4]"><div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, barra * 100)}%` }} /></div>}
      </div>
    </div>
  );
}

export function Tarjeta({ titulo, icono: I, accion, children, className = '', sinPadding = false }:
  { titulo?: string; icono?: React.ElementType; accion?: React.ReactNode; children: React.ReactNode; className?: string; sinPadding?: boolean }) {
  return (
    <section className={`rounded-2xl border border-line bg-white ${sinPadding ? 'overflow-hidden' : 'p-5'} ${className}`} aria-label={titulo}>
      {titulo && <div className={`mb-3 flex items-center justify-between gap-3 ${sinPadding ? 'px-5 pt-4' : ''}`}>
        <h2 className="flex items-center gap-2 font-medium">{I && <I className="size-4 text-gold-dark" aria-hidden />}{titulo}</h2>{accion}</div>}
      {children}
    </section>
  );
}

export const Vacio = ({ texto, icono: I = Inbox }: { texto: string; icono?: React.ElementType }) =>
  <div className="py-10 text-center text-muted"><I className="mx-auto mb-2 size-8 text-[#C9C5BA]" aria-hidden />{texto}</div>;
export const Cargando = () => <div className="grid min-h-60 place-items-center" role="status"><span className="size-8 animate-spin rounded-full border-2 border-line border-t-ocean" /><span className="sr-only">Cargando…</span></div>;
export const BotonP = ({ variante = 'primario', className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'oro' | 'claro' | 'peligro' | 'ok' }) => {
  const v = { primario: 'bg-ocean text-white hover:bg-ocean-2', oro: 'bg-gold-dark text-white hover:bg-[#5f4727]', claro: 'border border-line bg-white text-ink hover:bg-sand',
    peligro: 'bg-bad text-white hover:bg-[#86281a]', ok: 'bg-ok text-white hover:bg-[#17633a]' }[variante];
  return <button type="button" {...p} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-60 ${v} ${className}`} />;
};

/* ---------------- Modal y panel lateral (<dialog> nativo: foco atrapado y Escape) ---------------- */
export function Modal({ abierto, alCerrar, titulo, children, pie, ancho = 'max-w-xl' }:
  { abierto: boolean; alCerrar: () => void; titulo: string; children: React.ReactNode; pie?: React.ReactNode; ancho?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (abierto && !d.open) d.showModal(); if (!abierto && d.open) d.close(); }, [abierto]);
  return (
    <dialog ref={ref} onClose={alCerrar} aria-labelledby="modal-titulo" className={`m-auto w-[calc(100%-1.5rem)] ${ancho} rounded-2xl p-0 backdrop:bg-ocean-3/60`}>
      {abierto && <>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id="modal-titulo" className="font-serif text-2xl font-medium text-ocean">{titulo}</h2>
          <button onClick={alCerrar} aria-label="Cerrar" className="grid size-9 place-items-center rounded-lg hover:bg-sand"><X className="size-5" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5" tabIndex={0} role="group" aria-label="Contenido">{children}</div>
        {pie && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{pie}</div>}
      </>}
    </dialog>
  );
}

export function PanelLateral({ abierto, alCerrar, titulo, children }: { abierto: boolean; alCerrar: () => void; titulo: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (abierto && !d.open) d.showModal(); if (!abierto && d.open) d.close(); }, [abierto]);
  return (
    <dialog ref={ref} onClose={alCerrar} aria-labelledby="lateral-titulo"
      className="ml-auto mr-0 h-dvh max-h-dvh w-full max-w-[560px] p-0 backdrop:bg-ocean-3/50">
      {abierto && <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id="lateral-titulo" className="font-serif text-2xl font-medium text-ocean">{titulo}</h2>
          <button onClick={alCerrar} aria-label="Cerrar" className="grid size-9 place-items-center rounded-lg hover:bg-sand"><X className="size-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>}
    </dialog>
  );
}

/* ---------------- Confirmación (Zustand + promesa) ---------------- */
interface Pregunta { titulo: string; texto: string; boton: string; peligro?: boolean; resolver: (ok: boolean) => void }
const useConfirmacion = create<{ p: Pregunta | null; set: (p: Pregunta | null) => void }>(set => ({ p: null, set: p => set({ p }) }));
export const confirmar = (titulo: string, texto: string, boton = 'Confirmar', peligro = false) =>
  new Promise<boolean>(resolver => useConfirmacion.getState().set({ titulo, texto, boton, peligro, resolver }));
export function DialogoConfirmacion() {
  const { p, set } = useConfirmacion();
  const cerrar = (ok: boolean) => { p?.resolver(ok); set(null); };
  return (
    <Modal abierto={!!p} alCerrar={() => cerrar(false)} titulo={p?.titulo ?? ''}
      pie={<><BotonP variante="claro" onClick={() => cerrar(false)}>Volver</BotonP><BotonP variante={p?.peligro ? 'peligro' : 'primario'} onClick={() => cerrar(true)}>{p?.boton}</BotonP></>}>
      <p>{p?.texto}</p>
    </Modal>
  );
}

export function descargarCsv(nombre: string, filas: (string | number | null | undefined)[][]) {
  const txt = filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + txt], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
