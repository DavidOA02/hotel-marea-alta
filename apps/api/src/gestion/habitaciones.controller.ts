import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ETIQUETAS, habitacionSchema, hoyLima, limpiezaSchema, sumarDias, tipoSchema } from '@marea/shared';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { ZodPipe } from '../comun/zod.pipe';
import { Roles, SesionGuard, Usuario } from '../auth/guards';
import { UsuarioSesion } from '../auth/auth.service';
import { Limpieza } from '../operacion/limpieza.service';
import { sqlBloqueo } from '../reservas/consultas';
import { Bitacora, cambios } from '../auditoria/bitacora.service';

/** Habitaciones (tablero, CRUD, limpieza) y tipos con tarifas. */
@Controller('gestion')
@UseGuards(SesionGuard)
export class HabitacionesController {
  constructor(private readonly db: Db, private readonly bitacora: Bitacora, private readonly limpieza: Limpieza) {}

  @Get('habitaciones')
  async listar() {
    const hoy = hoyLima();
    const habs = await this.db.query<any>(`SELECT h.id, h.numero, h.piso, h.tipo_habitacion_id AS tipo_id, t.codigo AS tipo_codigo, t.nombre AS tipo,
      t.capacidad, t.precio_noche, h.estado, h.estado_limpieza, h.notas, (SELECT count(*) FROM reservas r WHERE r.habitacion_id = h.id) AS total_reservas,
      l.id AS tarea_id, l.tipo AS tarea_tipo, l.estado AS tarea_estado, l.asignada_a,
      (SELECT count(*) FROM mantenimientos m WHERE m.habitacion_id = h.id AND m.estado IN ('Pendiente','EnProceso')) AS mantenimientos_abiertos,
      EXISTS (${sqlBloqueo('h.id', '$1', '$2')}) AS bloqueada
      FROM habitaciones h JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id
      LEFT JOIN limpiezas l ON l.habitacion_id = h.id AND l.estado IN ('Pendiente','EnCurso')
      ORDER BY h.piso, h.numero`, [hoy, sumarDias(hoy, 1)]);
    const res = await this.db.query<any>(`SELECT r.habitacion_id, r.codigo, r.estado, r.fecha_entrada, r.fecha_salida, c.nombres || ' ' || c.apellidos AS huesped
      FROM reservas r JOIN clientes c ON c.id = r.cliente_id WHERE r.estado IN ('Confirmada','CheckIn') AND r.fecha_salida >= $1 ORDER BY r.fecha_entrada`, [hoy]);
    return habs.map(h => {
      const propias = res.filter(r => r.habitacionId === h.id);
      const enCasa = propias.find(r => r.estado === 'CheckIn');
      const llega = propias.find(r => r.estado === 'Confirmada' && r.fechaEntrada <= hoy && r.fechaSalida > hoy);
      const prox = propias.find(r => r.estado === 'Confirmada' && r.fechaEntrada > hoy);
      const situacion = enCasa ? (enCasa.fechaSalida <= hoy ? 'Salida hoy' : 'Ocupada') : llega ? 'Llegada hoy'
        : h.estado === 'Mantenimiento' || h.bloqueada ? 'Mantenimiento' : h.estado === 'FueraDeServicio' ? 'Fuera de servicio' : 'Libre';
      const actual = enCasa ?? llega;
      return { ...h, situacion, huesped: actual?.huesped ?? null, codigoReserva: actual?.codigo ?? null, salidaPrevista: actual?.fechaSalida ?? null, proximaLlegada: prox?.fechaEntrada ?? null };
    });
  }

  private async tipoId(codigo: string) {
    const t = await this.db.uno<{ id: number }>('SELECT id FROM tipos_habitacion WHERE codigo = $1', [codigo]);
    if (!t) throw falla(400, 'El tipo de habitación no existe.', 'tipoHabitacion');
    return t.id;
  }

  @Post('habitaciones') @Roles('Administrador')
  async crear(@Body(new ZodPipe(habitacionSchema)) d: z.output<typeof habitacionSchema>) {
    const tid = await this.tipoId(d.tipoHabitacion);
    if (await this.db.uno('SELECT 1 FROM habitaciones WHERE numero = $1', [d.numero])) throw falla(409, `Ya existe la habitación ${d.numero}.`, 'numero');
    return this.db.transaccion(async c => {
      const h = (await this.db.uno<any>(`INSERT INTO habitaciones (numero, piso, tipo_habitacion_id, estado, notas) VALUES ($1,$2,$3,$4,$5) RETURNING id, numero`,
        [d.numero, d.piso, tid, d.estado, d.notas], c))!;
      await this.bitacora.registrar({ accion: 'habitacion.crear', entidad: 'habitacion', entidadId: h.id,
        descripcion: `Habitación ${h.numero} creada (piso ${d.piso}, ${d.tipoHabitacion}, ${ETIQUETAS[d.estado]})` }, c);
      return { ...h, mensaje: `Habitación ${h.numero} creada.` };
    });
  }

  @Put('habitaciones/:id') @Roles('Administrador')
  async editar(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(habitacionSchema)) d: z.output<typeof habitacionSchema>) {
    const actual = await this.db.uno<any>(`SELECT h.*, t.codigo AS tipo_habitacion FROM habitaciones h JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id WHERE h.id = $1`, [id]);
    if (!actual) throw falla(404, 'Habitación no encontrada.');
    const tid = await this.tipoId(d.tipoHabitacion);
    if (await this.db.uno('SELECT 1 FROM habitaciones WHERE numero = $1 AND id <> $2', [d.numero, id])) throw falla(409, `Ya existe la habitación ${d.numero}.`, 'numero');
    const { n } = (await this.db.uno<{ n: number }>(`SELECT count(*) AS n FROM reservas WHERE habitacion_id = $1 AND estado IN ('Confirmada','CheckIn') AND fecha_salida > $2`, [id, hoyLima()]))!;
    if (tid !== actual.tipoHabitacionId && n > 0) throw falla(409, 'No se puede cambiar el tipo: la habitación tiene reservas vigentes o futuras.', 'tipoHabitacion');
    await this.db.transaccion(async c => {
      await c.query('UPDATE habitaciones SET numero = $2, piso = $3, tipo_habitacion_id = $4, estado = $5, notas = $6 WHERE id = $1', [id, d.numero, d.piso, tid, d.estado, d.notas]);
      const dif = cambios(actual, d, ['numero', 'piso', 'tipoHabitacion', 'estado', 'notas']);
      if (Object.keys(dif).length) await this.bitacora.registrar({ accion: 'habitacion.editar', entidad: 'habitacion', entidadId: id,
        descripcion: `Habitación ${d.numero} actualizada: ${Object.keys(dif).join(', ')}`, datos: dif }, c);
    });
    return { id, numero: d.numero, mensaje: `Habitación ${d.numero} actualizada.`,
      advertencia: d.estado !== 'Operativa' && n > 0 ? `Atención: la habitación tiene ${n} reserva(s) vigentes o futuras. Muévelas con «Cambiar habitación» en la ficha de cada reserva.` : null };
  }

  @Delete('habitaciones/:id') @Roles('Administrador')
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    const h = await this.db.uno<any>('SELECT numero FROM habitaciones WHERE id = $1', [id]);
    if (!h) throw falla(404, 'Habitación no encontrada.');
    if (await this.db.uno('SELECT 1 FROM reservas WHERE habitacion_id = $1 UNION ALL SELECT 1 FROM cambios_habitacion WHERE $1 IN (habitacion_anterior_id, habitacion_nueva_id) LIMIT 1', [id]))
      throw falla(409, 'La habitación tiene historial de reservas. Cámbiala a «Fuera de servicio» en lugar de eliminarla.');
    await this.db.transaccion(async c => {
      await c.query('DELETE FROM habitaciones WHERE id = $1', [id]);
      await this.bitacora.registrar({ accion: 'habitacion.eliminar', entidad: 'habitacion', entidadId: id, descripcion: `Habitación ${h.numero} eliminada` }, c);
    });
    return { mensaje: `Habitación ${h.numero} eliminada.` };
  }

  /** Marcado rápido: «Limpia» da por terminada la limpieza abierta de la habitación. */
  @Patch('habitaciones/:id/limpieza')
  limpiezaRapida(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(limpiezaSchema)) d: { estadoLimpieza: 'Limpia' | 'Sucia' }) {
    return this.limpieza.marcar(id, d.estadoLimpieza, u);
  }

  @Get('tipos')
  tipos() {
    return this.db.query(`SELECT t.*, (SELECT count(*) FROM habitaciones h WHERE h.tipo_habitacion_id = t.id) AS habitaciones,
      (SELECT count(*) FROM habitaciones h WHERE h.tipo_habitacion_id = t.id AND h.estado = 'Operativa') AS operativas
      FROM tipos_habitacion t ORDER BY t.precio_noche`);
  }

  @Post('tipos') @Roles('Administrador')
  async crearTipo(@Body(new ZodPipe(tipoSchema)) d: z.output<typeof tipoSchema>) {
    if (await this.db.uno('SELECT 1 FROM tipos_habitacion WHERE codigo = $1', [d.codigo])) throw falla(409, 'Ya existe un tipo con ese código.', 'codigo');
    return this.db.transaccion(async c => {
      const t = (await this.db.uno<any>(`INSERT INTO tipos_habitacion (codigo, nombre, descripcion, capacidad, metros_cuadrados, precio_noche, activo)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, codigo`, [d.codigo, d.nombre, d.descripcion, d.capacidad, d.metrosCuadrados, d.precioNoche, d.activo], c))!;
      await this.bitacora.registrar({ accion: 'tipo.crear', entidad: 'tipo', entidadId: t.id, descripcion: `Tipo «${d.nombre}» creado con tarifa S/ ${d.precioNoche.toFixed(2)}`, datos: d }, c);
      return { ...t, mensaje: `Tipo «${d.nombre}» creado.` };
    });
  }

  @Put('tipos/:id') @Roles('Administrador')
  async editarTipo(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(tipoSchema)) d: z.output<typeof tipoSchema>) {
    if (await this.db.uno('SELECT 1 FROM tipos_habitacion WHERE codigo = $1 AND id <> $2', [d.codigo, id])) throw falla(409, 'Ya existe un tipo con ese código.', 'codigo');
    return this.db.transaccion(async c => {
      const antes = await this.db.uno<any>('SELECT * FROM tipos_habitacion WHERE id = $1 FOR UPDATE', [id], c);
      if (!antes) throw falla(404, 'Tipo no encontrado.');
      await c.query(`UPDATE tipos_habitacion SET codigo = $2, nombre = $3, descripcion = $4, capacidad = $5, metros_cuadrados = $6, precio_noche = $7, activo = $8
        WHERE id = $1`, [id, d.codigo, d.nombre, d.descripcion, d.capacidad, d.metrosCuadrados, d.precioNoche, d.activo]);
      const dif = cambios(antes, d, ['codigo', 'nombre', 'descripcion', 'capacidad', 'metrosCuadrados', 'precioNoche', 'activo']);
      if (Object.keys(dif).length) await this.bitacora.registrar({ accion: 'tipo.editar', entidad: 'tipo', entidadId: id,
        descripcion: dif.precioNoche ? `Tarifa de «${d.nombre}»: S/ ${Number(antes.precioNoche).toFixed(2)} → S/ ${d.precioNoche.toFixed(2)}` : `Tipo «${d.nombre}» actualizado: ${Object.keys(dif).join(', ')}`,
        datos: dif }, c);
      return { id, mensaje: `Tipo «${d.nombre}» actualizado. La nueva tarifa se aplica a las reservas que se hagan desde ahora.` };
    });
  }
}
