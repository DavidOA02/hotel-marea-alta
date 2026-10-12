import { Injectable } from '@nestjs/common';
import { redondear } from '@marea/shared';
import type { PoolClient } from 'pg';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { Bitacora } from '../auditoria/bitacora.service';

export interface ReservaBloqueada {
  id: number; codigo: string; estado: string; total: number; pagado: number; saldo: number; fechaEntrada: string; fechaSalida: string;
  habitacionId: number; habitacion: string; estadoLimpieza: string; email: string;
}
export interface NuevoPago {
  monto: number; moneda: 'PEN' | 'USD'; tipoCambio: number | null; montoSoles: number; metodo: string;
  referencia: string | null; registradoPor: string | null; pasarela?: string | null;
  /** Turno de caja de quien cobra en el panel (los pagos de la pasarela no tienen turno). */
  turnoId?: number | null;
}

/** Cobros: la reserva se bloquea mientras se registra un pago, así dos cobros simultáneos no superan el saldo. */
@Injectable()
export class PagosService {
  constructor(private readonly db: Db, private readonly bitacora: Bitacora) {}

  async reservaBloqueada(c: PoolClient, por: { codigo: string } | { id: number }): Promise<ReservaBloqueada> {
    const [col, val] = 'id' in por ? ['r.id', por.id] : ['r.codigo', por.codigo.toUpperCase()];
    const r = await this.db.uno<any>(`SELECT r.id, r.codigo, r.estado, r.total, r.fecha_entrada, r.fecha_salida, r.habitacion_id, h.numero AS habitacion,
      h.estado_limpieza, cl.email FROM reservas r JOIN habitaciones h ON h.id = r.habitacion_id JOIN clientes cl ON cl.id = r.cliente_id
      WHERE ${col} = $1 FOR UPDATE OF r`, [val], c);
    if (!r) throw falla(404, 'Reserva no encontrada.');
    // Consulta aparte (después de obtener el bloqueo) para ver los pagos que otra transacción acaba de confirmar
    const { pagado } = (await this.db.uno<{ pagado: number }>('SELECT pagado_neto($1) AS pagado', [r.id], c))!;
    return { ...r, pagado, saldo: redondear(r.total - pagado) };
  }

  /**
   * Sube o baja el total de una reserva (descuento, noches no usadas, nota de crédito parcial) y recalcula
   * valor de venta e IGV. Es el único lugar que cambia el importe de una reserva ya creada fuera del cambio de habitación.
   */
  async ajustarTotal(c: PoolClient, reservaId: number, delta: number, deltaIgv?: number) {
    const r = (await this.db.uno<{ codigo: string; total: number; igv: number; noches: number; exoneradoIgv: boolean }>(
      'SELECT codigo, total, igv, noches, exonerado_igv FROM reservas WHERE id = $1 FOR UPDATE', [reservaId], c))!;
    const nuevo = redondear(r.total + delta);
    if (nuevo < 0) throw falla(409, `El descuento (S/ ${(-delta).toFixed(2)}) supera el total de la reserva (S/ ${r.total.toFixed(2)}).`, 'monto');
    // Descuentos sin comprobante afectan al hospedaje, conservando los consumos gravados.
    let ajusteIgv = deltaIgv;
    if (ajusteIgv === undefined) {
      const a = (await this.db.uno<{total:number; igv:number}>(`SELECT coalesce(sum(total),0) AS total, coalesce(sum(igv),0) AS igv
        FROM consumos WHERE reserva_id = $1 AND estado = 'Activo'`, [reservaId], c))!;
      const hospedaje = redondear(r.total - a.total);
      if (delta < 0 && -delta > hospedaje + 0.001) throw falla(409, 'El descuento supera el hospedaje: anula primero los consumos no documentados que correspondan.', 'monto');
      ajusteIgv = hospedaje > 0 ? delta * (r.igv - a.igv) / hospedaje : 0;
    }
    const igv = redondear(r.igv + ajusteIgv);
    if (igv < 0 || igv > nuevo) throw falla(409, 'El ajuste no conserva los importes de IGV de la cuenta.');
    const q = { total: nuevo, igv, subtotal: redondear(nuevo - igv) };
    await c.query('UPDATE reservas SET subtotal = $2, igv = $3, total = $4 WHERE id = $1', [reservaId, q.subtotal, q.igv, q.total]);
    return { codigo: r.codigo, anterior: r.total, total: q.total };
  }

  /** Inserta el pago y lo deja en la bitácora. Se llama dentro de la transacción que bloqueó la reserva. */
  async registrar(c: PoolClient, r: ReservaBloqueada, p: NuevoPago) {
    const pago = (await this.db.uno<{ id: number }>(`INSERT INTO pagos (reserva_id, monto, moneda, tipo_cambio, monto_soles, metodo, referencia, registrado_por, pasarela, turno_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [r.id, p.monto, p.moneda, p.moneda === 'USD' ? p.tipoCambio : null, p.montoSoles, p.metodo, p.referencia, p.registradoPor, p.pasarela ?? null, p.turnoId ?? null], c))!;
    const pagado = redondear(r.pagado + p.montoSoles);
    const origen = p.pasarela ? `en línea (${p.pasarela})` : p.metodo;
    await this.bitacora.registrar({ accion: p.pasarela ? 'pago.en_linea' : 'pago.registrar', entidad: 'reserva', entidadId: r.codigo,
      descripcion: `Pago de S/ ${p.montoSoles.toFixed(2)} ${origen}${p.moneda === 'USD' ? ` (US$ ${p.monto.toFixed(2)} × ${p.tipoCambio})` : ''}${p.referencia ? ` · ref. ${p.referencia}` : ''}`,
      datos: { pagoId: pago.id, monto: p.monto, moneda: p.moneda, tipoCambio: p.tipoCambio, montoSoles: p.montoSoles, metodo: p.metodo, referencia: p.referencia, pasarela: p.pasarela ?? null, turnoId: p.turnoId ?? null },
      ...(p.pasarela ? { autor: { nombre: `Pasarela ${p.pasarela}` } } : {}) }, c);
    return { pagoId: pago.id, pagado, saldo: redondear(r.total - pagado) };
  }
}
