import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { anularPagoSchema, devolucionSchema, hoyLima, redondear, sumarDias } from '@marea/shared';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioSesion } from '../auth/auth.service';
import { Roles, SesionGuard, Usuario } from '../auth/guards';
import { Bitacora } from '../auditoria/bitacora.service';
import { SQL_VIGENTE } from '../facturacion/consultas';
import { Devoluciones } from '../pagos/devoluciones.service';

/** Caja: pagos y devoluciones por rango; anulación y devolución (solo administrador). Fechas en hora de Lima. */
@Controller('gestion/pagos')
@UseGuards(SesionGuard)
export class PagosController {
  constructor(private readonly db: Db, private readonly bitacora: Bitacora, private readonly devoluciones: Devoluciones) {}

  @Get()
  async listar(@Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('metodo') metodo?: string) {
    const d = desde || hoyLima();
    const h = hasta || d;
    if (h < d) throw falla(400, 'La fecha final debe ser posterior a la inicial.', 'hasta');
    const p: unknown[] = [d, sumarDias(h, 1)];
    let extra = '';
    if (metodo) { p.push(metodo); extra = ' AND p.metodo = $3'; }
    const pagos = await this.db.query<any>(`SELECT p.id, r.codigo AS codigo_reserva, p.pasarela, c.nombres || ' ' || c.apellidos AS cliente, p.monto, p.moneda, p.tipo_cambio,
      p.monto_soles, p.metodo, p.referencia, p.estado, p.fecha_pago, p.registrado_por, p.motivo_anulacion, p.turno_id
      FROM pagos p JOIN reservas r ON r.id = p.reserva_id JOIN clientes c ON c.id = r.cliente_id
      WHERE (p.fecha_pago AT TIME ZONE 'America/Lima') >= $1::date AND (p.fecha_pago AT TIME ZONE 'America/Lima') < $2::date ${extra}
      ORDER BY p.fecha_pago DESC`, p);
    const aprob = pagos.filter(x => x.estado === 'Aprobado');
    const porMetodo = Object.values(aprob.reduce((a: any, x) => {
      a[x.metodo] ??= { metodo: x.metodo, monto: 0, cantidad: 0 };
      a[x.metodo].monto = redondear(a[x.metodo].monto + x.montoSoles); a[x.metodo].cantidad++;
      return a;
    }, {})).sort((a: any, b: any) => b.monto - a.monto);
    // Devoluciones del periodo (por fecha en que se completaron o se pidieron)
    const devoluciones = await this.db.query<any>(`SELECT dv.id, dv.pago_id, r.codigo AS codigo_reserva, c.nombres || ' ' || c.apellidos AS cliente, dv.monto, dv.monto_dolares, dv.motivo, dv.medio,
      dv.pasarela, dv.estado, dv.mensaje, dv.reduce_total, dv.registrado_por, dv.fecha, dv.fecha_resultado, p.metodo
      FROM devoluciones dv JOIN pagos p ON p.id = dv.pago_id JOIN reservas r ON r.id = dv.reserva_id JOIN clientes c ON c.id = r.cliente_id
      WHERE (coalesce(dv.fecha_resultado, dv.fecha) AT TIME ZONE 'America/Lima') >= $1::date AND (coalesce(dv.fecha_resultado, dv.fecha) AT TIME ZONE 'America/Lima') < $2::date
      ORDER BY coalesce(dv.fecha_resultado, dv.fecha) DESC`, [d, sumarDias(h, 1)]);
    const total = redondear(aprob.reduce((s, x) => s + x.montoSoles, 0));
    const devuelto = redondear(devoluciones.filter(x => x.estado === 'Completada').reduce((s, x) => s + x.monto, 0));
    return { desde: d, hasta: h, total, devuelto, neto: redondear(total - devuelto), cantidad: aprob.length, porMetodo, pagos, devoluciones };
  }

  @Post(':id/anular') @HttpCode(200) @Roles('Administrador')
  anular(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(anularPagoSchema)) d: { motivo: string }) {
    return this.db.transaccion(async c => {
      const p = await this.db.uno<any>(`SELECT p.estado, p.monto_soles, p.metodo, p.pasarela, p.turno_id, r.codigo, r.estado AS estado_reserva,
        (SELECT t.estado FROM turnos_caja t WHERE t.id = p.turno_id) AS estado_turno,
        EXISTS (SELECT 1 FROM comprobantes k WHERE k.reserva_id = r.id AND ${SQL_VIGENTE}) AS con_comprobante,
        EXISTS (SELECT 1 FROM devoluciones dv WHERE dv.pago_id = p.id AND dv.estado <> 'Fallida') AS con_devoluciones
        FROM pagos p JOIN reservas r ON r.id = p.reserva_id WHERE p.id = $1 FOR UPDATE OF p`, [id], c);
      if (!p) throw falla(404, 'Pago no encontrado.');
      if (p.estado === 'Anulado') throw falla(409, 'El pago ya está anulado.');
      if (p.estadoReserva === 'CheckOut') throw falla(409, 'No se anulan pagos de estadías cerradas (check-out).');
      if (p.conDevoluciones) throw falla(409, 'El pago tiene devoluciones registradas: no se puede anular.');
      await c.query(`UPDATE pagos SET estado = 'Anulado', motivo_anulacion = $2 WHERE id = $1`, [id, `${d.motivo} — ${u.nombre}`]);
      await this.bitacora.registrar({ accion: 'pago.anular', entidad: 'reserva', entidadId: p.codigo,
        descripcion: `Pago de S/ ${p.montoSoles.toFixed(2)} (${p.pasarela ? `en línea, ${p.pasarela}` : p.metodo}) anulado. Motivo: ${d.motivo}`,
        datos: { pagoId: id, montoSoles: p.montoSoles, motivo: d.motivo } }, c);
      const avisos = [p.pasarela ? `Este pago se cobró en línea con ${p.pasarela}: la anulación no devuelve el dinero; haz la devolución desde el panel de la pasarela.` : null,
        p.conComprobante ? 'La reserva tiene un comprobante electrónico: evalúa anularlo o emitir una nota de crédito.' : null,
        p.estadoTurno === 'Cerrado' ? `El pago es del turno de caja N.° ${p.turnoId}, ya cerrado: su arqueo no cambia.` : null].filter(Boolean);
      return { id, mensaje: 'Pago anulado.', advertencia: avisos.length ? avisos.join(' ') : null };
    });
  }

  /** Devuelve por Culqi, Mercado Pago o Niubiz, o registra la devolución manual. */
  @Post(':id/devolver') @HttpCode(200) @Roles('Administrador')
  devolver(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(devolucionSchema)) d: z.output<typeof devolucionSchema>) {
    return this.devoluciones.devolver(id, d, u);
  }

  @Post('devoluciones/:id/reintentar') @HttpCode(200) @Roles('Administrador')
  reintentarDevolucion(@Param('id', ParseIntPipe) id: number) {
    return this.devoluciones.reintentar(id);
  }

  @Post('devoluciones/:id/conciliar-niubiz') @HttpCode(200) @Roles('Administrador')
  conciliarNiubiz(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(z.object({ codigo:z.string().trim().regex(/^\d{1,100}$/) }))) d:{ codigo:string }) {
    return this.devoluciones.conciliarNiubiz(id,d.codigo);
  }
}
