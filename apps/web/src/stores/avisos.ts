'use client';
import { create } from 'zustand';

export interface Aviso { id: number; texto: string; tipo: 'ok' | 'error' | 'warn' }
interface EstadoAvisos { avisos: Aviso[]; avisar: (texto: string, tipo?: Aviso['tipo']) => void; quitar: (id: number) => void }

let seq = 0;
/** Notificaciones (toasts) globales con Zustand. */
export const useAvisos = create<EstadoAvisos>((set, get) => ({
  avisos: [],
  avisar: (texto, tipo = 'ok') => {
    const id = ++seq;
    set(s => ({ avisos: [...s.avisos, { id, texto, tipo }] }));
    setTimeout(() => get().quitar(id), tipo === 'error' ? 7000 : 4500);
  },
  quitar: id => set(s => ({ avisos: s.avisos.filter(a => a.id !== id) }))
}));
export const avisar = (texto: string, tipo?: Aviso['tipo']) => useAvisos.getState().avisar(texto, tipo);
