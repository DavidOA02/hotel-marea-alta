import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { cancelarSchema, DIAS_HABILES_RECLAMO, rangoFechasSchema, reclamacionSchema, reservaWebSchema, suscripcionSchema, sumarDiasHabiles, hoyLima, primerError } from '@marea/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { Limite } from '../comun/limite.guard';
import { ZodPipe } from '../comun/zod.pipe';
import { ReservasService } from '../reservas/reservas.service';
import { Bitacora } from '../auditoria/bitacora.service';
import { Correos } from '../correo/correos.service';
import { constanciaReclamo } from '../correo/plantillas';

/** Endpoints públicos: web del hotel, Mi reserva, Libro de Reclamaciones y boletín. */
@Controller()
export class PublicoController {
  constructor(private readonly db: Db, private readonly reservas: ReservasService, private readonly bitacora: Bitacora, private readonly correos: Correos) {}

  @Get('salud')
  async salud(@Res() res: Response) {
    const ok = await this.db.disponible();
    res.status(ok ? 200 : 503).json({ estado: ok ? 'ok' : 'sin-base-de-datos', hora: new Date().toISOString() });
  }

  @Get('habitaciones/tipos')
  tipos() {
    return this.db.query(`SELECT t.codigo, t.nombre, t.descripcion, t.capacidad, t.metros_cuadrados, t.precio_noche,
      (SELECT count(*) FROM habitaciones h WHERE h.tipo_habitacion_id = t.id AND h.estado = 'Operativa') AS total_habitaciones
      FROM tipos_habitacion t WHERE t.activo ORDER BY t.precio_noche`);
  }

  @Get('disponibilidad')
  disponibilidad(@Query('entrada') entrada: string, @Query('salida') salida: string, @Query('huespedes') huespedes = '1') {
    const r = rangoFechasSchema.safeParse({ fechaEntrada: entrada, fechaSalida: salida });
    if (!r.success) throw falla(400, primerError(r.error).mensaje, primerError(r.error).campo);
    return this.reservas.disponibilidad(entrada, salida, Number(huespedes) || 1);
  }

  @Post('reservas') @Limite(10)
  async crear(@Body(new ZodPipe(reservaWebSchema)) d: z.output<typeof reservaWebSchema>) {
    const r = await this.reservas.crear({ ...d, cliente: d, canal: 'Web', clienteId: null, habitacionId: null, webPublica: true });
    // Si el documento ya tenía otro correo, el pago en línea y «Mi reserva» piden ese correo: no se ofrece pagar desde aquí
    return { ...r, puedePagarEnLinea: !r.correoRegistrado && ReservasService.puedePagarEnLinea({ estado: r.estado, saldo: r.total }),
      mensaje: r.correoRegistrado
        ? 'Reserva confirmada. Tu documento ya estaba registrado con otro correo: te enviamos los detalles a ese correo y no cambiamos tus datos.'
        : 'Reserva confirmada. Te enviamos los detalles a tu correo.' };
  }

  @Get('reservas/:codigo') @Limite(20)
  consultar(@Param('codigo') codigo: string, @Query('email') email?: string) {
    if (!email) throw falla(400, 'Escribe el correo con el que hiciste la reserva.', 'email');
    return this.reservas.consultarPublica(codigo, email);
  }

  @Post('reservas/:codigo/cancelar') @HttpCode(200) @Limite(10)
  cancelar(@Param('codigo') codigo: string, @Body(new ZodPipe(cancelarSchema)) d: { email: string }) {
    return this.reservas.cancelarPublica(codigo, d.email);
  }

  /** Libro de Reclamaciones (Ley N.° 29571): número correlativo anual y plazo de 15 días hábiles. */
  @Post('reclamaciones') @Limite(10)
  async reclamacion(@Body(new ZodPipe(reclamacionSchema)) d: z.output<typeof reclamacionSchema>) {
    const hoy = hoyLima();
    const anio = Number(hoy.slice(0, 4));
    const limite = sumarDiasHabiles(hoy, DIAS_HABILES_RECLAMO);
    const r = await this.db.transaccion(async c => {
      await c.query('LOCK TABLE reclamaciones IN SHARE ROW EXCLUSIVE MODE');   // correlativo sin huecos ni duplicados
      const { rows } = await c.query('SELECT coalesce(max(correlativo), 0) + 1 AS n FROM reclamaciones WHERE anio = $1', [anio]);
      const n = rows[0].n as number;
      const numero = `${String(n).padStart(5, '0')}-${anio}`;
      const ins = await this.db.uno<any>(`
        INSERT INTO reclamaciones (numero, anio, correlativo, tipo, nombre_completo, tipo_documento, numero_documento, domicilio, telefono, email,
          es_menor, apoderado, bien_tipo, monto_reclamado, codigo_reserva, descripcion_bien, detalle, pedido, fecha_limite_respuesta)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [numero, anio, n, d.tipo, d.nombreCompleto, d.tipoDocumento, d.numeroDocumento, d.domicilio, d.telefono, d.email, d.esMenor,
          d.esMenor ? d.apoderado : null, d.bienTipo, d.montoReclamado, d.codigoReserva?.toUpperCase() ?? null, d.descripcionBien, d.detalle, d.pedido, limite], c);
      await c.query('UPDATE reclamaciones SET idioma = $2 WHERE id = $1', [ins.id,d.idioma]);
      ins.idioma = d.idioma;
      // Constancia al correo del consumidor (Reglamento del Libro de Reclamaciones) y registro en la bitácora, en la misma transacción
      await this.correos.encolar({ tipo: 'reclamo_constancia', para: ins.email, reclamacionId: ins.id, ...constanciaReclamo(ins) }, c);
      await this.bitacora.registrar({ accion: 'reclamo.registrar', entidad: 'reclamo', entidadId: numero,
        descripcion: `${d.tipo} N.° ${numero} registrado por ${d.nombreCompleto} (plazo de respuesta: ${limite.split('-').reverse().join('/')})`,
        autor: { nombre: `Consumidor: ${d.nombreCompleto}` } }, c);
      return ins;
    });
    const [y, m, dd] = r.fechaLimiteRespuesta.split('-');
    return { numero: r.numero, fecha: r.fecha, fechaLimiteRespuesta: r.fechaLimiteRespuesta, tipo: r.tipo,
      mensaje: `Registramos tu ${r.tipo.toLowerCase()}. Te enviamos la constancia a ${r.email}. Responderemos a más tardar el ${dd}/${m}/${y}.` };
  }

  @Post('suscriptores') @HttpCode(200) @Limite(10)
  async suscribir(@Body(new ZodPipe(suscripcionSchema)) d: { email: string }) {
    await this.db.query(`INSERT INTO suscriptores (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET activo = true`, [d.email]);
    return { mensaje: '¡Gracias! Te enviaremos nuestras ofertas exclusivas.' };
  }
}
