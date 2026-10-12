import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { cambioHabitacionSchema, hoyLima, pagoSchema, redondear, reservaPanelSchema } from '@marea/shared';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioSesion } from '../auth/auth.service';
import { SesionGuard, Usuario } from '../auth/guards';
import { Bitacora } from '../auditoria/bitacora.service';
import { Correos } from '../correo/correos.service';
import type { PoolClient } from 'pg';
import { PagosService, ReservaBloqueada } from '../pagos/pagos.service';
import { TurnosCaja } from '../pagos/turnos.service';
import { dmy, ReservasService, SQL_RESERVA } from '../reservas/reservas.service';
import { SQL_COMPROBANTE } from '../facturacion/consultas';

/** Reservas del panel: recepción, alta (teléfono, WhatsApp, walk-in), check-in/out, cancelación, pagos y cambio de habitación. */
@Controller('gestion')
@UseGuards(SesionGuard)
export class ReservasGestionController {
  constructor(private readonly db: Db, private readonly reservas: ReservasService, private readonly pagos: PagosService,
              private readonly bitacora: Bitacora, private readonly correos: Correos, private readonly turnos: TurnosCaja) {}

  @Get('reservas')
  listar(@Query('estado') estado?: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string,
         @Query('buscar') buscar?: string, @Query('limite') limite = '300') {
    const w: string[] = []; const p: unknown[] = [];
    if (estado) { p.push(estado); w.push(`r.estado = $${p.length}`); }
    if (desde) { p.push(desde); w.push(`r.fecha_entrada >= $${p.length}`); }
    if (hasta) { p.push(hasta); w.push(`r.fecha_entrada <= $${p.length}`); }
    if (buscar?.trim()) {
      p.push(`%${buscar.trim()}%`);
      const i = p.length;
      w.push(`(r.codigo ILIKE $${i} OR c.nombres ILIKE $${i} OR c.apellidos ILIKE $${i} OR c.numero_documento ILIKE $${i} OR c.email ILIKE $${i} OR h.numero = $${i + 1})`);
      p.push(buscar.trim());
    }
    p.push(Math.min(Math.max(Number(limite) || 300, 1), 1000));
    return this.db.query(`${SQL_RESERVA} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY r.fecha_entrada DESC, r.codigo LIMIT $${p.length}`, p);
  }

  @Get('reservas/:codigo')
  async detalle(@Param('codigo') codigo: string) {
    const reserva = await this.db.uno<any>(SQL_RESERVA + ' WHERE r.codigo = $1', [codigo.toUpperCase()]);
    if (!reserva) throw falla(404, 'Reserva no encontrada.');
    const [pagos, devoluciones, cambios, comprobantes, correos, historial, consumos] = await Promise.all([
      this.db.query(`SELECT p.id, p.monto, p.moneda, p.tipo_cambio, p.monto_soles, p.metodo, p.referencia, p.estado, p.fecha_pago, p.registrado_por, p.motivo_anulacion, p.pasarela,
          p.monto_soles - coalesce((SELECT sum(dv.monto) FROM devoluciones dv WHERE dv.pago_id = p.id AND dv.estado <> 'Fallida'), 0) AS disponible_devolucion
        FROM pagos p WHERE p.reserva_id = $1 ORDER BY p.fecha_pago`, [reserva.id]),
      this.db.query(`SELECT id, pago_id, monto, motivo, reduce_total, medio, pasarela, estado, mensaje, registrado_por, fecha, fecha_resultado, solicitud_enviada, referencia_externa
        FROM devoluciones WHERE reserva_id = $1 ORDER BY id`, [reserva.id]),
      this.db.query(`SELECT ch.fecha, ch.desde, ha.numero AS habitacion_anterior, hn.numero AS habitacion_nueva, ch.tarifa, ch.total_anterior, ch.total_nuevo, ch.motivo, ch.registrado_por
        FROM cambios_habitacion ch JOIN habitaciones ha ON ha.id = ch.habitacion_anterior_id JOIN habitaciones hn ON hn.id = ch.habitacion_nueva_id
        WHERE ch.reserva_id = $1 ORDER BY ch.fecha`, [reserva.id]),
      this.db.query(`${SQL_COMPROBANTE} WHERE k.reserva_id = $1 ORDER BY k.id`, [reserva.id]).then(l => l.map(({ items, respuesta, ...k }: any) => k)),
      this.correos.listar({ reservaId: reserva.id }),
      this.db.query(`SELECT fecha, usuario, accion, descripcion FROM bitacora WHERE entidad = 'reserva' AND entidad_id = $1 ORDER BY fecha, id`, [reserva.codigo]),
      this.db.query('SELECT * FROM consumos WHERE reserva_id = $1 ORDER BY id', [reserva.id])
    ]);
    return { reserva, pagos, devoluciones, cambios, comprobantes, correos, historial, consumos };
  }

  @Post('reservas')
  async crear(@Usuario() u: UsuarioSesion, @Body(new ZodPipe(reservaPanelSchema)) d: z.output<typeof reservaPanelSchema>) {
    const r = await this.reservas.crear({ ...d, cliente: d.cliente ? { ...d.cliente } : null, registradoPor: u.nombre });
    return { ...r, mensaje: r.estado === 'CheckIn' ? `Reserva ${r.codigo} creada y check-in registrado en la habitación ${r.habitacion}.` : `Reserva ${r.codigo} creada. Habitación asignada: ${r.habitacion}.` };
  }

  @Get('recepcion')
  async recepcion() {
    const hoy = hoyLima();
    const llegadas = await this.db.query(`${SQL_RESERVA} WHERE r.estado = 'Confirmada' AND r.fecha_entrada <= $1 AND r.fecha_salida > $1 ORDER BY r.hora_llegada NULLS LAST, h.numero`, [hoy]);
    const enCasa = await this.db.query<any>(`${SQL_RESERVA} WHERE r.estado = 'CheckIn' ORDER BY r.fecha_salida, h.numero`);
    const limpieza = await this.db.query(`SELECT h.id, h.numero, t.nombre AS tipo FROM habitaciones h JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id
      WHERE h.estado_limpieza = 'Sucia' AND h.estado = 'Operativa' ORDER BY h.numero`);
    return { hoy, llegadas, salidas: enCasa.filter(r => r.fechaSalida <= hoy), enCasa: enCasa.filter(r => r.fechaSalida > hoy), limpieza };
  }

  /** Ejecuta un cambio de estado dentro de una transacción con la reserva bloqueada y lo registra en la bitácora. */
  private transicion<T>(codigo: string, fn: (r: ReservaBloqueada, c: PoolClient) => Promise<T>) {
    return this.db.transaccion(async c => fn(await this.pagos.reservaBloqueada(c, { codigo }), c));
  }

  @Post('reservas/:codigo/checkin') @HttpCode(200)
  checkIn(@Param('codigo') codigo: string) {
    return this.transicion(codigo, async (r, c) => {
      const hoy = hoyLima();
      if (r.estado !== 'Confirmada') throw falla(409, `La reserva está «${r.estado}»; solo se hace check-in a reservas confirmadas.`);
      if (r.fechaEntrada > hoy) throw falla(409, `La llegada está programada para el ${dmy(r.fechaEntrada)}.`);
      if (r.fechaSalida <= hoy) throw falla(409, 'La fecha de salida ya pasó; marca la reserva como No show.');
      await c.query(`UPDATE reservas SET estado = 'CheckIn', fecha_check_in = now() WHERE id = $1`, [r.id]);
      await this.bitacora.registrar({ accion: 'reserva.checkin', entidad: 'reserva', entidadId: r.codigo, descripcion: `Check-in en la habitación ${r.habitacion}` }, c);
      return { codigo: r.codigo, estado: 'CheckIn', mensaje: `Check-in registrado: habitación ${r.habitacion}.`,
        advertencia: r.estadoLimpieza === 'Sucia' ? `La habitación ${r.habitacion} figura como por limpiar.` : null };
    });
  }

  @Post('reservas/:codigo/checkout') @HttpCode(200)
  checkOut(@Param('codigo') codigo: string, @Usuario() u: UsuarioSesion, @Body() body: { forzarConSaldo?: boolean }) {
    return this.transicion(codigo, async (r, c) => {
      if (r.estado !== 'CheckIn') throw falla(409, 'Solo se hace check-out a huéspedes que están en el hotel.');
      const forzado = r.saldo > 0.009;
      if (forzado && !(u.rol === 'Administrador' && body?.forzarConSaldo))
        throw falla(409, `Hay un saldo pendiente de S/ ${r.saldo.toFixed(2)}. Registra el pago antes del check-out.`, 'saldo');
      await c.query(`UPDATE reservas SET estado = 'CheckOut', fecha_check_out = now() WHERE id = $1`, [r.id]);
      await c.query(`UPDATE habitaciones SET estado_limpieza = 'Sucia' WHERE id = $1`, [r.habitacionId]);
      await this.bitacora.registrar({ accion: forzado ? 'reserva.checkout_con_saldo' : 'reserva.checkout', entidad: 'reserva', entidadId: r.codigo,
        descripcion: forzado ? `Check-out autorizado con saldo pendiente de S/ ${r.saldo.toFixed(2)}` : `Check-out de la habitación ${r.habitacion}`,
        datos: forzado ? { saldo: r.saldo } : undefined }, c);
      return { codigo: r.codigo, estado: 'CheckOut', mensaje: `Check-out registrado. La habitación ${r.habitacion} pasó a limpieza.` };
    });
  }

  @Post('reservas/:codigo/cancelar') @HttpCode(200)
  async cancelar(@Param('codigo') codigo: string) {
    const r = await this.db.uno<any>(SQL_RESERVA + ' WHERE r.codigo = $1', [codigo.toUpperCase()]);
    if (!r) throw falla(404, 'Reserva no encontrada.');
    if (r.estado !== 'Confirmada') throw falla(409, `Solo se cancelan reservas confirmadas (estado actual: «${r.estado}»).`);
    await this.reservas.cancelar(r, `Reserva ${r.codigo} cancelada desde el panel`);
    return { codigo: r.codigo, estado: 'Cancelada', mensaje: `Reserva ${r.codigo} cancelada. Se avisó al huésped por correo.`,
      advertencia: r.pagado > 0.009 ? `La reserva tenía pagos por S/ ${r.pagado.toFixed(2)}: coordina la devolución.` : null };
  }

  @Post('reservas/:codigo/noshow') @HttpCode(200)
  noShow(@Param('codigo') codigo: string) {
    return this.transicion(codigo, async (r, c) => {
      if (r.estado !== 'Confirmada') throw falla(409, 'Solo se marca No show en reservas confirmadas.');
      if (r.fechaEntrada > hoyLima()) throw falla(409, 'Solo se puede marcar No show desde el día de llegada.');
      await c.query(`UPDATE reservas SET estado = 'NoShow' WHERE id = $1`, [r.id]);
      await this.bitacora.registrar({ accion: 'reserva.noshow', entidad: 'reserva', entidadId: r.codigo, descripcion: 'El huésped no se presentó (No show)' }, c);
      return { codigo: r.codigo, estado: 'NoShow', mensaje: `Reserva ${r.codigo} marcada como No show.` };
    });
  }

  @Post('reservas/:codigo/pagos') @HttpCode(200)
  pagar(@Param('codigo') codigo: string, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(pagoSchema)) d: z.output<typeof pagoSchema>) {
    const montoSoles = d.moneda === 'USD' ? redondear(d.monto * d.tipoCambio!) : redondear(d.monto);
    return this.transicion(codigo, async (r, c) => {
      if (['Cancelada', 'NoShow'].includes(r.estado)) throw falla(409, `No se registran pagos en reservas «${r.estado}».`);
      if (montoSoles > r.saldo + 0.01) throw falla(409, `El pago (S/ ${montoSoles.toFixed(2)}) supera el saldo pendiente (S/ ${r.saldo.toFixed(2)}).`, 'monto');
      // El efectivo entra a la caja de quien cobra: exige su turno abierto. Los demás medios quedan en el turno si lo hay.
      const turno = await this.turnos.delUsuario(c, u.id, d.metodo === 'Efectivo' ? 'cobrar en efectivo' : null);
      const x = await this.pagos.registrar(c, r, { monto: d.monto, moneda: d.moneda, tipoCambio: d.tipoCambio ?? null, montoSoles, metodo: d.metodo,
        referencia: d.referencia, registradoPor: u.nombre, turnoId: turno?.id ?? null });
      return { codigo: r.codigo, pagado: x.pagado, saldo: x.saldo, turnoId: turno?.id ?? null, mensaje: `Pago de S/ ${montoSoles.toFixed(2)} registrado${turno ? ` en el turno N.° ${turno.id}` : ''}.` };
    });
  }

  /* ---------------- Cambio de habitación ---------------- */
  @Get('reservas/:codigo/cambio-habitacion')
  opcionesCambio(@Param('codigo') codigo: string) {
    return this.reservas.opcionesCambio(codigo);
  }

  @Post('reservas/:codigo/cambiar-habitacion') @HttpCode(200)
  cambiarHabitacion(@Param('codigo') codigo: string, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(cambioHabitacionSchema)) d: z.output<typeof cambioHabitacionSchema>) {
    return this.reservas.cambiarHabitacion(codigo, d, u.nombre);
  }

  /* ---------------- Correos ---------------- */
  @Post('reservas/:codigo/reenviar-confirmacion') @HttpCode(200)
  reenviar(@Param('codigo') codigo: string) {
    return this.reservas.reenviarConfirmacion(codigo);
  }
}
