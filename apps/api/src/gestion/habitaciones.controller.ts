import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { habitacionSchema, hoyLima, limpiezaSchema, tipoSchema } from '@marea/shared';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { ZodPipe } from '../comun/zod.pipe';
import { Roles, SesionGuard } from '../auth/guards';

/** Habitaciones (tablero, CRUD, limpieza) y tipos con tarifas. */
@Controller('gestion')
@UseGuards(SesionGuard)
export class HabitacionesController {
  constructor(private readonly db: Db) {}

  @Get('habitaciones')
  async listar() {
    const hoy = hoyLima();
    const habs = await this.db.query<any>(`SELECT h.id, h.numero, h.piso, h.tipo_habitacion_id AS tipo_id, t.codigo AS tipo_codigo, t.nombre AS tipo,
      t.capacidad, t.precio_noche, h.estado, h.estado_limpieza, h.notas, (SELECT count(*) FROM reservas r WHERE r.habitacion_id = h.id) AS total_reservas
      FROM habitaciones h JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id ORDER BY h.piso, h.numero`);
    const res = await this.db.query<any>(`SELECT r.habitacion_id, r.codigo, r.estado, r.fecha_entrada, r.fecha_salida, c.nombres || ' ' || c.apellidos AS huesped
      FROM reservas r JOIN clientes c ON c.id = r.cliente_id WHERE r.estado IN ('Confirmada','CheckIn') AND r.fecha_salida >= $1 ORDER BY r.fecha_entrada`, [hoy]);
    return habs.map(h => {
      const propias = res.filter(r => r.habitacionId === h.id);
      const enCasa = propias.find(r => r.estado === 'CheckIn');
      const llega = propias.find(r => r.estado === 'Confirmada' && r.fechaEntrada <= hoy && r.fechaSalida > hoy);
      const prox = propias.find(r => r.estado === 'Confirmada' && r.fechaEntrada > hoy);
      const situacion = enCasa ? (enCasa.fechaSalida <= hoy ? 'Salida hoy' : 'Ocupada') : llega ? 'Llegada hoy'
        : h.estado === 'Mantenimiento' ? 'Mantenimiento' : h.estado === 'FueraDeServicio' ? 'Fuera de servicio' : 'Libre';
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
    const h = await this.db.uno<any>(`INSERT INTO habitaciones (numero, piso, tipo_habitacion_id, estado, notas) VALUES ($1,$2,$3,$4,$5) RETURNING id, numero`,
      [d.numero, d.piso, tid, d.estado, d.notas]);
    return { ...h, mensaje: `Habitación ${h.numero} creada.` };
  }

  @Put('habitaciones/:id') @Roles('Administrador')
  async editar(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(habitacionSchema)) d: z.output<typeof habitacionSchema>) {
    const actual = await this.db.uno<any>('SELECT * FROM habitaciones WHERE id = $1', [id]);
    if (!actual) throw falla(404, 'Habitación no encontrada.');
    const tid = await this.tipoId(d.tipoHabitacion);
    if (await this.db.uno('SELECT 1 FROM habitaciones WHERE numero = $1 AND id <> $2', [d.numero, id])) throw falla(409, `Ya existe la habitación ${d.numero}.`, 'numero');
    const { n } = (await this.db.uno<{ n: number }>(`SELECT count(*) AS n FROM reservas WHERE habitacion_id = $1 AND estado IN ('Confirmada','CheckIn') AND fecha_salida > $2`, [id, hoyLima()]))!;
    if (tid !== actual.tipoHabitacionId && n > 0) throw falla(409, 'No se puede cambiar el tipo: la habitación tiene reservas vigentes o futuras.', 'tipoHabitacion');
    await this.db.query('UPDATE habitaciones SET numero = $2, piso = $3, tipo_habitacion_id = $4, estado = $5, notas = $6 WHERE id = $1', [id, d.numero, d.piso, tid, d.estado, d.notas]);
    return { id, numero: d.numero, mensaje: `Habitación ${d.numero} actualizada.`,
      advertencia: d.estado !== 'Operativa' && n > 0 ? `Atención: la habitación tiene ${n} reserva(s) vigentes o futuras. Reasígnalas si no estará disponible.` : null };
  }

  @Delete('habitaciones/:id') @Roles('Administrador')
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    const h = await this.db.uno<any>('SELECT numero FROM habitaciones WHERE id = $1', [id]);
    if (!h) throw falla(404, 'Habitación no encontrada.');
    if (await this.db.uno('SELECT 1 FROM reservas WHERE habitacion_id = $1 LIMIT 1', [id]))
      throw falla(409, 'La habitación tiene historial de reservas. Cámbiala a «Fuera de servicio» en lugar de eliminarla.');
    await this.db.query('DELETE FROM habitaciones WHERE id = $1', [id]);
    return { mensaje: `Habitación ${h.numero} eliminada.` };
  }

  @Patch('habitaciones/:id/limpieza')
  async limpieza(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(limpiezaSchema)) d: { estadoLimpieza: string }) {
    const h = await this.db.uno('UPDATE habitaciones SET estado_limpieza = $2 WHERE id = $1 RETURNING id, numero, estado_limpieza', [id, d.estadoLimpieza]);
    if (!h) throw falla(404, 'Habitación no encontrada.');
    return h;
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
    const t = await this.db.uno<any>(`INSERT INTO tipos_habitacion (codigo, nombre, descripcion, capacidad, metros_cuadrados, precio_noche, activo)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, codigo`, [d.codigo, d.nombre, d.descripcion, d.capacidad, d.metrosCuadrados, d.precioNoche, d.activo]);
    return { ...t, mensaje: `Tipo «${d.nombre}» creado.` };
  }

  @Put('tipos/:id') @Roles('Administrador')
  async editarTipo(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(tipoSchema)) d: z.output<typeof tipoSchema>) {
    if (await this.db.uno('SELECT 1 FROM tipos_habitacion WHERE codigo = $1 AND id <> $2', [d.codigo, id])) throw falla(409, 'Ya existe un tipo con ese código.', 'codigo');
    const t = await this.db.uno(`UPDATE tipos_habitacion SET codigo = $2, nombre = $3, descripcion = $4, capacidad = $5, metros_cuadrados = $6, precio_noche = $7, activo = $8
      WHERE id = $1 RETURNING id`, [id, d.codigo, d.nombre, d.descripcion, d.capacidad, d.metrosCuadrados, d.precioNoche, d.activo]);
    if (!t) throw falla(404, 'Tipo no encontrado.');
    return { id, mensaje: `Tipo «${d.nombre}» actualizado. La nueva tarifa se aplica a las reservas que se hagan desde ahora.` };
  }
}
