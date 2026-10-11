import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { anularPagoSchema, hoyLima, redondear, sumarDias } from '@marea/shared';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioSesion } from '../auth/auth.service';
import { Roles, SesionGuard, Usuario } from '../auth/guards';

/** Caja: pagos por rango y anulación (solo administrador). Fechas en hora de Lima. */
@Controller('gestion/pagos')
@UseGuards(SesionGuard)
export class PagosController {
  constructor(private readonly db: Db) {}

  @Get()
  async listar(@Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('metodo') metodo?: string) {
    const d = desde || hoyLima();
    const h = hasta || d;
    if (h < d) throw falla(400, 'La fecha final debe ser posterior a la inicial.', 'hasta');
    const p: unknown[] = [d, sumarDias(h, 1)];
    let extra = '';
    if (metodo) { p.push(metodo); extra = ' AND p.metodo = $3'; }
    const pagos = await this.db.query<any>(`SELECT p.id, r.codigo AS codigo_reserva, c.nombres || ' ' || c.apellidos AS cliente, p.monto, p.moneda, p.tipo_cambio,
      p.monto_soles, p.metodo, p.referencia, p.estado, p.fecha_pago, p.registrado_por, p.motivo_anulacion
      FROM pagos p JOIN reservas r ON r.id = p.reserva_id JOIN clientes c ON c.id = r.cliente_id
      WHERE (p.fecha_pago AT TIME ZONE 'America/Lima') >= $1::date AND (p.fecha_pago AT TIME ZONE 'America/Lima') < $2::date ${extra}
      ORDER BY p.fecha_pago DESC`, p);
    const aprob = pagos.filter(x => x.estado === 'Aprobado');
    const porMetodo = Object.values(aprob.reduce((a: any, x) => {
      a[x.metodo] ??= { metodo: x.metodo, monto: 0, cantidad: 0 };
      a[x.metodo].monto = redondear(a[x.metodo].monto + x.montoSoles); a[x.metodo].cantidad++;
      return a;
    }, {})).sort((a: any, b: any) => b.monto - a.monto);
    return { desde: d, hasta: h, total: redondear(aprob.reduce((s, x) => s + x.montoSoles, 0)), cantidad: aprob.length, porMetodo, pagos };
  }

  @Post(':id/anular') @HttpCode(200) @Roles('Administrador')
  async anular(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(anularPagoSchema)) d: { motivo: string }) {
    const p = await this.db.uno<any>('SELECT p.estado, r.estado AS estado_reserva FROM pagos p JOIN reservas r ON r.id = p.reserva_id WHERE p.id = $1', [id]);
    if (!p) throw falla(404, 'Pago no encontrado.');
    if (p.estado === 'Anulado') throw falla(409, 'El pago ya está anulado.');
    if (p.estadoReserva === 'CheckOut') throw falla(409, 'No se anulan pagos de estadías cerradas (check-out).');
    await this.db.query(`UPDATE pagos SET estado = 'Anulado', motivo_anulacion = $2 WHERE id = $1`, [id, `${d.motivo} — ${u.nombre}`]);
    return { id, mensaje: 'Pago anulado.' };
  }
}
