'use client';
import { useEffect } from 'react';
import { api } from './api';
import { TIPO_CAMBIO } from './config';
import { dolares0, soles0 } from './formato';
import { TipoHabitacion, useReserva } from '@/stores/reserva';

/** Carga tarifas reales de la API una sola vez; si la API no responde, quedan las tarifas por defecto. */
let cargando: Promise<void> | null = null;
export function useTipos() {
  const { tipos, setTipos, setApi, apiDisponible, moneda } = useReserva();
  useEffect(() => {
    if (cargando) return;
    cargando = api<TipoHabitacion[]>('/habitaciones/tipos', { timeout: 4000 })
      .then(t => { setTipos(t); setApi(true); })
      .catch(() => setApi(false));
  }, [setTipos, setApi]);
  const precio = (soles: number) => (moneda === 'USD' ? dolares0(soles / TIPO_CAMBIO) : soles0(soles));
  return { tipos, apiDisponible, moneda, precio };
}
