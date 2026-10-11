import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { hoyLima, pagoSchema, redondear, reservaPanelSchema } from '@marea/shared';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioSesion } from '../auth/auth.service';
import { SesionGuard, Usuario } from '../auth/guards';
import { ReservasService, SQL_RESERVA } from '../reservas/reservas.service';

/** Reservas del panel: recepción, alta (teléfono, WhatsApp, walk-in), check-in/out, cancelación y pagos. */
@Controller('gestion')
@UseGuards(SesionGuard)
export class ReservasGestionController {
  constructor(private readonly db: Db, private readonly reservas: ReservasService) {}

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
    const reserva = await this.db.uno(SQL_RESERVA + ' WHERE r.codigo = $1', [codigo.toUpperCase()]);
    if (!reserva) throw falla(404, 'Reserva no encontrada.');
    const pagos = await this.db.query(`SELECT p.id, p.monto, p.moneda, p.tipo_cambio, p.monto_soles, p.metodo, p.referencia, p.estado, p.fecha_pago,
      p.registrado_por, p.motivo_anulacion FROM pagos p JOIN reservas r ON r.id = p.reserva_id WHERE r.codigo = $1 ORDER BY p.fecha_pago`, [codigo.toUpperCase()]);
    return { reserva, pagos };
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

  private async buscar(codigo: string) {
    const r = await this.db.uno<any>(`SELECT r.id, r.codigo, r.estado, r.fecha_entrada, r.fecha_salida, r.total, r.habitacion_id, h.numero AS habitacion, h.estado_limpieza,
      coalesce((SELECT sum(monto_soles) FROM pagos WHERE reserva_id = r.id AND estado = 'Aprobado'), 0) AS pagado
      FROM reservas r JOIN habitaciones h ON h.id = r.habitacion_id WHERE r.codigo = $1`, [codigo.toUpperCase()]);
    if (!r) throw falla(404, 'Reserva no encontrada.');
    return r;
  }

  @Post('reservas/:codigo/checkin') @HttpCode(200)
  async checkIn(@Param('codigo') codigo: string) {
    const r = await this.buscar(codigo);
    const hoy = hoyLima();
    if (r.estado !== 'Confirmada') throw falla(409, `La reserva está «${r.estado}»; solo se hace check-in a reservas confirmadas.`);
    if (r.fechaEntrada > hoy) throw falla(409, `La llegada está programada para el ${r.fechaEntrada.split('-').reverse().join('/')}.`);
    if (r.fechaSalida <= hoy) throw falla(409, 'La fecha de salida ya pasó; marca la reserva como No show.');
    await this.db.query(`UPDATE reservas SET estado = 'CheckIn', fecha_check_in = now() WHERE id = $1`, [r.id]);
    return { codigo: r.codigo, estado: 'CheckIn', mensaje: `Check-in registrado: habitación ${r.habitacion}.`,
      advertencia: r.estadoLimpieza === 'Sucia' ? `La habitación ${r.habitacion} figura como por limpiar.` : null };
  }

  @Post('reservas/:codigo/checkout') @HttpCode(200)
  async checkOut(@Param('codigo') codigo: string, @Usuario() u: UsuarioSesion, @Body() body: { forzarConSaldo?: boolean }) {
    const r = await this.buscar(codigo);
    if (r.estado !== 'CheckIn') throw falla(409, 'Solo se hace check-out a huéspedes que están en el hotel.');
    const saldo = redondear(r.total - r.pagado);
    if (saldo > 0.009 && !(u.rol === 'Administrador' && body?.forzarConSaldo))
      throw falla(409, `Hay un saldo pendiente de S/ ${saldo.toFixed(2)}. Registra el pago antes del check-out.`, 'saldo');
    await this.db.transaccion(async c => {
      await c.query(`UPDATE reservas SET estado = 'CheckOut', fecha_check_out = now() WHERE id = $1`, [r.id]);
      await c.query(`UPDATE habitaciones SET estado_limpieza = 'Sucia' WHERE id = $1`, [r.habitacionId]);
    });
    return { codigo: r.codigo, estado: 'CheckOut', mensaje: `Check-out registrado. La habitación ${r.habitacion} pasó a limpieza.` };
  }

  @Post('reservas/:codigo/cancelar') @HttpCode(200)
  async cancelar(@Param('codigo') codigo: string) {
    const r = await this.buscar(codigo);
    if (r.estado !== 'Confirmada') throw falla(409, `Solo se cancelan reservas confirmadas (estado actual: «${r.estado}»).`);
    await this.db.query(`UPDATE reservas SET estado = 'Cancelada', fecha_cancelacion = now() WHERE id = $1`, [r.id]);
    return { codigo: r.codigo, estado: 'Cancelada', mensaje: `Reserva ${r.codigo} cancelada.` };
  }

  @Post('reservas/:codigo/noshow') @HttpCode(200)
  async noShow(@Param('codigo') codigo: string) {
    const r = await this.buscar(codigo);
    if (r.estado !== 'Confirmada') throw falla(409, 'Solo se marca No show en reservas confirmadas.');
    if (r.fechaEntrada > hoyLima()) throw falla(409, 'Solo se puede marcar No show desde el día de llegada.');
    await this.db.query(`UPDATE reservas SET estado = 'NoShow' WHERE id = $1`, [r.id]);
    return { codigo: r.codigo, estado: 'NoShow', mensaje: `Reserva ${r.codigo} marcada como No show.` };
  }

  @Post('reservas/:codigo/pagos') @HttpCode(200)
  async pagar(@Param('codigo') codigo: string, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(pagoSchema)) d: z.output<typeof pagoSchema>) {
    const r = await this.buscar(codigo);
    if (['Cancelada', 'NoShow'].includes(r.estado)) throw falla(409, `No se registran pagos en reservas «${r.estado}».`);
    const montoSoles = d.moneda === 'USD' ? redondear(d.monto * d.tipoCambio!) : redondear(d.monto);
    const saldo = redondear(r.total - r.pagado);
    if (montoSoles > saldo + 0.01) throw falla(409, `El pago (S/ ${montoSoles.toFixed(2)}) supera el saldo pendiente (S/ ${saldo.toFixed(2)}).`, 'monto');
    await this.db.query(`INSERT INTO pagos (reserva_id, monto, moneda, tipo_cambio, monto_soles, metodo, referencia, registrado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [r.id, d.monto, d.moneda, d.moneda === 'USD' ? d.tipoCambio : null, montoSoles, d.metodo, d.referencia, u.nombre]);
    const pagado = redondear(r.pagado + montoSoles);
    return { codigo: r.codigo, pagado, saldo: redondear(r.total - pagado), mensaje: `Pago de S/ ${montoSoles.toFixed(2)} registrado.` };
  }
}
