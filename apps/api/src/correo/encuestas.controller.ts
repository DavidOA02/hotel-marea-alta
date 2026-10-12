import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { dividir, encuestaSchema, hoyLima, sumarDias } from '@marea/shared';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { Limite } from '../comun/limite.guard';
import { ZodPipe } from '../comun/zod.pipe';
import { Roles, SesionGuard } from '../auth/guards';
import { Bitacora } from '../auditoria/bitacora.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Encuesta de satisfacción: el huésped responde con el enlace del correo; el administrador ve los resultados. */
@Controller()
export class EncuestasController {
  constructor(private readonly db: Db, private readonly bitacora: Bitacora) {}

  private async cargar(token: string) {
    if (!UUID.test(token)) throw falla(404, 'No encontramos esa encuesta.');
    const e = await this.db.uno<any>(`SELECT e.id, e.reserva_id, e.fecha_respuesta, r.codigo, c.nombres, t.nombre AS tipo_habitacion, r.fecha_entrada, r.fecha_salida
      FROM encuestas e JOIN reservas r ON r.id = e.reserva_id JOIN clientes c ON c.id = r.cliente_id
      JOIN habitaciones h ON h.id = r.habitacion_id JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id WHERE e.token = $1`, [token]);
    if (!e) throw falla(404, 'No encontramos esa encuesta.');
    return e;
  }

  @Get('encuestas/:token') @Limite(30)
  async ver(@Param('token') token: string) {
    const e = await this.cargar(token);
    return { nombre: String(e.nombres).split(' ')[0], tipoHabitacion: e.tipoHabitacion, fechaEntrada: e.fechaEntrada, fechaSalida: e.fechaSalida, respondida: !!e.fechaRespuesta };
  }

  @Post('encuestas/:token') @HttpCode(200) @Limite(10)
  async responder(@Param('token') token: string, @Body(new ZodPipe(encuestaSchema)) d: z.output<typeof encuestaSchema>) {
    const e = await this.cargar(token);
    return this.db.transaccion(async c => {
      const x = await c.query(`UPDATE encuestas SET calificacion = $2, recomendacion = $3, comentario = $4, fecha_respuesta = now() WHERE id = $1 AND fecha_respuesta IS NULL`,
        [e.id, d.calificacion, d.recomendacion, d.comentario]);
      if (!x.rowCount) throw falla(409, 'Ya respondiste esta encuesta. ¡Gracias!');
      await this.bitacora.registrar({ accion: 'encuesta.responder', entidad: 'reserva', entidadId: e.codigo,
        descripcion: `Encuesta respondida: ${d.calificacion}/5 y recomendación ${d.recomendacion}/10`, autor: { nombre: 'Huésped (encuesta)' } }, c);
      return { mensaje: '¡Gracias por tu opinión! Nos ayuda a mejorar.' };
    });
  }

  /** Resultados del periodo: calificación promedio, NPS (promotores 9–10 menos detractores 0–6) y comentarios. */
  @Get('gestion/encuestas') @UseGuards(SesionGuard) @Roles('Administrador')
  async resultados(@Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const h = hasta || hoyLima(), d = desde || sumarDias(h, -89);
    if (h < d) throw falla(400, 'La fecha final debe ser posterior a la inicial.', 'hasta');
    const filas = await this.db.query<any>(`SELECT e.fecha_envio, e.fecha_respuesta, e.calificacion, e.recomendacion, e.comentario, r.codigo, c.nombres || ' ' || c.apellidos AS cliente
      FROM encuestas e JOIN reservas r ON r.id = e.reserva_id JOIN clientes c ON c.id = r.cliente_id
      WHERE (e.fecha_envio AT TIME ZONE 'America/Lima')::date BETWEEN $1 AND $2 ORDER BY e.fecha_respuesta DESC NULLS LAST, e.fecha_envio DESC`, [d, h]);
    const resp = filas.filter(f => f.fechaRespuesta);
    const n = resp.length;
    const promotores = resp.filter(f => f.recomendacion >= 9).length, detractores = resp.filter(f => f.recomendacion <= 6).length;
    return {
      desde: d, hasta: h, enviadas: filas.length, respondidas: n, tasaRespuesta: dividir(n, filas.length),
      calificacion: n ? Number((resp.reduce((s, f) => s + f.calificacion, 0) / n).toFixed(2)) : null,
      nps: n ? Math.round(((promotores - detractores) / n) * 100) : null, promotores, detractores, pasivos: n - promotores - detractores,
      distribucion: [1, 2, 3, 4, 5].map(e => ({ estrellas: e, cantidad: resp.filter(f => f.calificacion === e).length })),
      comentarios: resp.filter(f => f.comentario).slice(0, 30).map(f => ({ fecha: f.fechaRespuesta, cliente: f.cliente, codigo: f.codigo, calificacion: f.calificacion, recomendacion: f.recomendacion, comentario: f.comentario }))
    };
  }
}
