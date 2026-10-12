import { redondear } from './tarifas';

/** Billetes y monedas de soles en circulación (las de 1 y 5 céntimos ya no circulan). */
export const DENOMINACIONES_SOLES = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1] as const;

/** Total de un conteo por billete y moneda, en céntimos para no arrastrar errores de coma flotante: { '200': 1, '0.5': 3 } → 201.5. */
export function sumarDenominaciones(conteo: Record<string, number | string | null | undefined>): number {
  const centimos = DENOMINACIONES_SOLES.reduce((s, d) => s + Math.round(d * 100) * (Number(conteo[String(d)]) || 0), 0);
  return redondear(centimos / 100);
}

export interface MovimientosTurno {
  fondoInicial: number;
  /** Pagos aprobados del turno (monto en la moneda del pago). */
  cobros: { metodo: string; moneda: string; monto: number }[];
  /** Devoluciones completadas del turno, en soles, con el método del pago original. */
  devoluciones: { metodo: string; monto: number }[];
  /** Ingresos y retiros de efectivo. */
  movimientos: { tipo: string; moneda: string; monto: number }[];
}

/**
 * Efectivo que debe haber en la caja: fondo inicial + cobros en efectivo − devoluciones en efectivo + ingresos − retiros.
 * Los dólares se cuentan aparte (no se convierten); las devoluciones en efectivo se entregan en soles.
 */
export function efectivoEsperado(t: MovimientosTurno): { soles: number; dolares: number } {
  let soles = t.fondoInicial, dolares = 0;
  for (const c of t.cobros) if (c.metodo === 'Efectivo') { if (c.moneda === 'USD') dolares += c.monto; else soles += c.monto; }
  for (const d of t.devoluciones) if (d.metodo === 'Efectivo') soles -= d.monto;
  for (const m of t.movimientos) {
    const monto = m.tipo === 'Retiro' ? -m.monto : m.monto;
    if (m.moneda === 'USD') dolares += monto; else soles += monto;
  }
  return { soles: redondear(soles), dolares: redondear(dolares) };
}
