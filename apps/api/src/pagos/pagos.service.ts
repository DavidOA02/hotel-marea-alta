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
    const { pagado } = (await this.db.uno<{ pagado: number }>(`SELECT coalesce(sum(monto_soles), 0) AS pagado FROM pagos WHERE reserva_id = $1 AND estado = 'Aprobado'`, [r.id], c))!;
    return { ...r, pagado, saldo: redondear(r.total - pagado) };
  }

  /** Inserta el pago y lo deja en la bitácora. Se llama dentro de la transacción que bloqueó la reserva. */
  async registrar(c: PoolClient, r: ReservaBloqueada, p: NuevoPago) {
    const pago = (await this.db.uno<{ id: number }>(`INSERT INTO pagos (reserva_id, monto, moneda, tipo_cambio, monto_soles, metodo, referencia, registrado_por, pasarela)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [r.id, p.monto, p.moneda, p.moneda === 'USD' ? p.tipoCambio : null, p.montoSoles, p.metodo, p.referencia, p.registradoPor, p.pasarela ?? null], c))!;
    const pagado = redondear(r.pagado + p.montoSoles);
    const origen = p.pasarela ? `en línea (${p.pasarela})` : p.metodo;
    await this.bitacora.registrar({ accion: p.pasarela ? 'pago.en_linea' : 'pago.registrar', entidad: 'reserva', entidadId: r.codigo,
      descripcion: `Pago de S/ ${p.montoSoles.toFixed(2)} ${origen}${p.moneda === 'USD' ? ` (US$ ${p.monto.toFixed(2)} × ${p.tipoCambio})` : ''}${p.referencia ? ` · ref. ${p.referencia}` : ''}`,
      datos: { pagoId: pago.id, monto: p.monto, moneda: p.moneda, tipoCambio: p.tipoCambio, montoSoles: p.montoSoles, metodo: p.metodo, referencia: p.referencia, pasarela: p.pasarela ?? null },
      ...(p.pasarela ? { autor: { nombre: `Pasarela ${p.pasarela}` } } : {}) }, c);
    return { pagoId: pago.id, pagado, saldo: redondear(r.total - pagado) };
  }
}
