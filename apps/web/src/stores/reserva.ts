'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Moneda = 'PEN' | 'USD';
export interface TipoHabitacion { codigo: string; nombre: string; capacidad: number; precioNoche: number; metrosCuadrados: number; descripcion?: string; totalHabitaciones?: number }

/** Tarifas por defecto (se reemplazan con las de la API al cargar). */
export const TIPOS_POR_DEFECTO: TipoHabitacion[] = [
  { codigo: 'duna', nombre: 'Habitación Duna', capacidad: 2, precioNoche: 450, metrosCuadrados: 28 },
  { codigo: 'horizonte', nombre: 'Habitación Horizonte', capacidad: 3, precioNoche: 650, metrosCuadrados: 34 },
  { codigo: 'pleamar', nombre: 'Suite Pleamar', capacidad: 4, precioNoche: 1090, metrosCuadrados: 58 }
];

interface EstadoReserva {
  moneda: Moneda;
  tipos: TipoHabitacion[];
  apiDisponible: boolean | null;
  /** Borrador compartido entre la barra de la portada y el formulario. */
  borrador: { fechaEntrada: string; fechaSalida: string; huespedes: number; tipoHabitacion: string };
  setMoneda: (m: Moneda) => void;
  setTipos: (t: TipoHabitacion[]) => void;
  setApi: (ok: boolean) => void;
  setBorrador: (b: Partial<EstadoReserva['borrador']>) => void;
}

/** Store de Zustand de la web pública (la moneda elegida se recuerda entre visitas). */
export const useReserva = create<EstadoReserva>()(persist((set) => ({
  moneda: 'PEN',
  tipos: TIPOS_POR_DEFECTO,
  apiDisponible: null,
  borrador: { fechaEntrada: '', fechaSalida: '', huespedes: 2, tipoHabitacion: 'horizonte' },
  setMoneda: moneda => set({ moneda }),
  setTipos: tipos => set({ tipos }),
  setApi: apiDisponible => set({ apiDisponible }),
  setBorrador: b => set(s => ({ borrador: { ...s.borrador, ...b } }))
}), { name: 'marea-web', partialize: s => ({ moneda: s.moneda }) }));
