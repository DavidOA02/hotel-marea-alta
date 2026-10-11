import { Injectable, Logger } from '@nestjs/common';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { NombrePasarela, pasarelaActiva } from '../config/env';
import { Bitacora } from '../auditoria/bitacora.service';
import { Correos } from '../correo/correos.service';
import { pagoRecibido } from '../correo/plantillas';
import { PagosService } from '../pagos/pagos.service';
import { ReservasService, SQL_RESERVA } from '../reservas/reservas.service';
import { ErrorPasarela, Orden, preparar, Resultado } from './pasarelas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OrdenBd extends Orden { estado: string; pasarela: NombrePasarela; reservaId: number; datosCheckout: Record<string, unknown> | null; mensaje: string | null }

/** Pagos en línea: crea la orden (monto = saldo de la reserva), prepara el checkout y registra el resultado una sola vez. */
@Injectable()
export class PagosEnLinea {
  private readonly log = new Logger('Pagos en línea');
  constructor(private readonly db: Db, private readonly reservas: ReservasService, private readonly pagos: PagosService,
              private readonly bitacora: Bitacora, private readonly correos: Correos) {}

  async crearOrden(codigo: string, email: string, ip: string | null) {
    const pasarela = pasarelaActiva();
    if (!pasarela) throw falla(503, 'Los pagos en línea no están disponibles por ahora. Puedes pagar al llegar.');
    const r = await this.reservas.buscarPublica(codigo, email);
    if (!['Confirmada', 'CheckIn'].includes(r.estado)) throw falla(409, 'Solo se pagan en línea reservas confirmadas o en curso.');
    if (r.saldo <= 0.009) throw falla(409, 'Tu reserva no tiene saldo pendiente.');
    const o = (await this.db.uno<OrdenBd>(`INSERT INTO ordenes_pago (reserva_id, pasarela, monto, email) VALUES ($1,$2,$3,$4)
      RETURNING id, numero, monto, email, expira`, [r.id, pasarela, r.saldo, r.email]))!;
    try {
      const datos = await preparar(pasarela, { ...o, codigoReserva: r.codigo, titular: r.cliente }, { ip });
      await this.db.query('UPDATE ordenes_pago SET datos_checkout = $2 WHERE id = $1', [o.id, JSON.stringify(datos)]);
    } catch (e: any) {
      await this.db.query(`UPDATE ordenes_pago SET estado = 'Rechazado', mensaje = $2, fecha_resultado = now() WHERE id = $1`, [o.id, String(e.message).slice(0, 300)]);
      this.log.error(`No se pudo preparar el pago de ${r.codigo} con ${pasarela}: ${e.message}`);
      throw falla(502, 'No pudimos conectar con la pasarela de pago. Inténtalo en unos minutos o paga al llegar.');
    }
    this.log.log(`Orden ${o.numero} (${pasarela}) por S/ ${o.monto.toFixed(2)} para ${r.codigo}`);
    return { id: o.id, pasarela, monto: o.monto };
  }

  private async cargar(id: string) {
    if (!UUID.test(id)) throw falla(404, 'No encontramos ese pago.');
    const o = await this.db.uno<OrdenBd & { codigoReserva: string; titular: string; fechaResultado: string | null }>(`
      SELECT o.id, o.numero, o.reserva_id, o.pasarela, o.monto, o.email, o.estado, o.datos_checkout, o.mensaje, o.expira, o.fecha_resultado,
             r.codigo AS codigo_reserva, c.nombres || ' ' || c.apellidos AS titular
      FROM ordenes_pago o JOIN reservas r ON r.id = o.reserva_id JOIN clientes c ON c.id = r.cliente_id WHERE o.id = $1`, [id]);
    if (!o) throw falla(404, 'No encontramos ese pago.');
    return o;
  }

  /** Estado de la orden para la página de pago (el id es un UUID imposible de adivinar). */
  async ver(id: string) {
    const o = await this.cargar(id);
    const vencida = o.estado === 'Pendiente' && new Date(o.expira) < new Date();
    return { id: o.id, numero: o.numero, estado: o.estado, vencida, pasarela: o.pasarela, monto: o.monto, moneda: 'PEN', codigoReserva: o.codigoReserva,
      titular: o.titular, email: o.email, mensaje: o.mensaje, expira: o.expira, datosCheckout: o.estado === 'Pendiente' && !vencida ? o.datosCheckout : null };
  }

  /** Orden lista para cobrar con la pasarela indicada (pendiente y vigente). */
  async paraCobrar(id: string, pasarela: NombrePasarela) {
    const o = await this.cargar(id);
    if (o.pasarela !== pasarela) throw falla(400, 'Esta orden se paga con otra pasarela.');
    if (o.estado !== 'Pendiente') throw falla(409, o.estado === 'Aprobado' ? 'Este pago ya fue aprobado.' : 'Este intento de pago ya terminó. Genera uno nuevo desde «Mi reserva».');
    if (new Date(o.expira) < new Date()) throw falla(409, 'El tiempo para pagar venció. Genera un nuevo pago desde «Mi reserva».');
    return o;
  }

  /**
   * Aplica el resultado de la pasarela. Es idempotente: si la pasarela avisa dos veces (retorno + webhook),
   * el pago se registra una sola vez. Un pago aprobado siempre se registra, aunque la orden hubiera vencido.
   */
  async finalizar(id: string, res: Resultado) {
    return this.db.transaccion(async c => {
      const o = await this.db.uno<OrdenBd>('SELECT id, numero, reserva_id, pasarela, monto, email, estado FROM ordenes_pago WHERE id = $1 FOR UPDATE', [id], c);
      if (!o) throw falla(404, 'No encontramos ese pago.');
      if (o.estado === 'Aprobado') return;
      if (!res.aprobado) {
        if (o.estado === 'Pendiente') await c.query(`UPDATE ordenes_pago SET estado = 'Rechazado', mensaje = $2, respuesta = $3, referencia_externa = $4, fecha_resultado = now() WHERE id = $1`,
          [o.id, res.mensaje.slice(0, 300), JSON.stringify(res.respuesta), res.referencia]);
        this.log.warn(`Orden ${o.numero} (${o.pasarela}) rechazada: ${res.mensaje}`);
        return;
      }
      const r = await this.pagos.reservaBloqueada(c, { id: o.reservaId });
      const x = await this.pagos.registrar(c, r, { monto: o.monto, moneda: 'PEN', tipoCambio: null, montoSoles: o.monto, metodo: res.metodo,
        referencia: res.referencia, registradoPor: `Web · ${o.pasarela}`, pasarela: o.pasarela });
      const aviso = x.saldo < -0.009 ? ` Atención: el pago dejó un saldo a favor de S/ ${(-x.saldo).toFixed(2)} (se cobró algo que ya estaba pagado).` : '';
      await c.query(`UPDATE ordenes_pago SET estado = 'Aprobado', pago_id = $2, referencia_externa = $3, respuesta = $4, mensaje = $5, fecha_resultado = now() WHERE id = $1`,
        [o.id, x.pagoId, res.referencia, JSON.stringify(res.respuesta), (res.mensaje + aviso).slice(0, 300)]);
      const datos = (await this.db.uno<any>(SQL_RESERVA + ' WHERE r.id = $1', [o.reservaId], c))!;
      await this.correos.encolar({ tipo: 'pago', para: datos.email, reservaId: o.reservaId, ...pagoRecibido(datos, { monto: o.monto, pasarela: o.pasarela, referencia: res.referencia }) }, c);
      if (aviso || !['Confirmada', 'CheckIn'].includes(r.estado)) await this.bitacora.registrar({ accion: 'pago.revisar', entidad: 'reserva', entidadId: r.codigo,
        descripcion: `Revisar: pago en línea aprobado con la reserva en estado «${r.estado}».${aviso}`, autor: { nombre: `Pasarela ${o.pasarela}` } }, c);
      this.log.log(`Orden ${o.numero} (${o.pasarela}) aprobada: S/ ${o.monto.toFixed(2)} para ${r.codigo}`);
    });
  }

  /** Para errores de comunicación: la orden sigue pendiente (no se sabe si hubo cargo) y se guarda el motivo. */
  async anotar(id: string, e: unknown) {
    const m = e instanceof ErrorPasarela ? e.message : String((e as any)?.message ?? e);
    this.log.error(`Orden ${id}: ${m}`);
    await this.db.query(`UPDATE ordenes_pago SET mensaje = $2 WHERE id = $1 AND estado = 'Pendiente'`, [id, m.slice(0, 300)]).catch(() => undefined);
  }
}
