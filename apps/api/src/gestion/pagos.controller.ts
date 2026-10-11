import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { anularPagoSchema, hoyLima, redondear, sumarDias } from '@marea/shared';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioSesion } from '../auth/auth.service';
import { Roles, SesionGuard, Usuario } from '../auth/guards';
import { Bitacora } from '../auditoria/bitacora.service';

/** Caja: pagos por rango y anulación (solo administrador). Fechas en hora de Lima. */
@Controller('gestion/pagos')
@UseGuards(SesionGuard)
export class PagosController {
  constructor(private readonly db: Db, private readonly bitacora: Bitacora) {}

  @Get()
  async listar(@Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('metodo') metodo?: string) {
    const d = desde || hoyLima();
    const h = hasta || d;
    if (h < d) throw falla(400, 'La fecha final debe ser posterior a la inicial.', 'hasta');
    const p: unknown[] = [d, sumarDias(h, 1)];
    let extra = '';
    if (metodo) { p.push(metodo); extra = ' AND p.metodo = $3'; }
    const pagos = await this.db.query<any>(`SELECT p.id, r.codigo AS codigo_reserva, p.pasarela, c.nombres || ' ' || c.apellidos AS cliente, p.monto, p.moneda, p.tipo_cambio,
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
  anular(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(anularPagoSchema)) d: { motivo: string }) {
    return this.db.transaccion(async c => {
      const p = await this.db.uno<any>(`SELECT p.estado, p.monto_soles, p.metodo, p.pasarela, r.codigo, r.estado AS estado_reserva,
        EXISTS (SELECT 1 FROM comprobantes k WHERE k.reserva_id = r.id AND k.estado IN ('Aceptado','Observado','Pendiente')) AS con_comprobante
        FROM pagos p JOIN reservas r ON r.id = p.reserva_id WHERE p.id = $1 FOR UPDATE OF p`, [id], c);
      if (!p) throw falla(404, 'Pago no encontrado.');
      if (p.estado === 'Anulado') throw falla(409, 'El pago ya está anulado.');
      if (p.estadoReserva === 'CheckOut') throw falla(409, 'No se anulan pagos de estadías cerradas (check-out).');
      await c.query(`UPDATE pagos SET estado = 'Anulado', motivo_anulacion = $2 WHERE id = $1`, [id, `${d.motivo} — ${u.nombre}`]);
      await this.bitacora.registrar({ accion: 'pago.anular', entidad: 'reserva', entidadId: p.codigo,
        descripcion: `Pago de S/ ${p.montoSoles.toFixed(2)} (${p.pasarela ? `en línea, ${p.pasarela}` : p.metodo}) anulado. Motivo: ${d.motivo}`,
        datos: { pagoId: id, montoSoles: p.montoSoles, motivo: d.motivo } }, c);
      const avisos = [p.pasarela ? `Este pago se cobró en línea con ${p.pasarela}: la anulación no devuelve el dinero; haz la devolución desde el panel de la pasarela.` : null,
        p.conComprobante ? 'La reserva tiene un comprobante electrónico: evalúa anularlo o emitir una nota de crédito.' : null].filter(Boolean);
      return { id, mensaje: 'Pago anulado.', advertencia: avisos.length ? avisos.join(' ') : null };
    });
  }
}
