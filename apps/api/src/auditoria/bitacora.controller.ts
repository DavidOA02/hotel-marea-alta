import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { hoyLima, sumarDias } from '@marea/shared';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { fechaFiltro } from '../comun/filtros';
import { Roles, SesionGuard } from '../auth/guards';

/** Consulta de la bitácora de auditoría (solo administrador). Fechas en hora de Lima. */
@Controller('gestion/bitacora')
@UseGuards(SesionGuard)
@Roles('Administrador')
export class BitacoraController {
  constructor(private readonly db: Db) {}

  @Get()
  async listar(@Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('usuarioId') usuarioId?: string,
               @Query('entidad') entidad?: string, @Query('buscar') buscar?: string, @Query('limite') limite = '500') {
    const hoy = hoyLima();
    const d = fechaFiltro(desde, 'desde') || sumarDias(hoy, -6), h = fechaFiltro(hasta, 'hasta') || hoy;
    if (h < d) throw falla(400, 'La fecha final debe ser posterior a la inicial.', 'hasta');
    const p: unknown[] = [d, sumarDias(h, 1)];
    const w = [`(b.fecha AT TIME ZONE 'America/Lima') >= $1::date`, `(b.fecha AT TIME ZONE 'America/Lima') < $2::date`];
    if (usuarioId) { p.push(Number(usuarioId) || 0); w.push(`b.usuario_id = $${p.length}`); }
    if (entidad) { p.push(entidad); w.push(`b.entidad = $${p.length}`); }
    if (buscar?.trim()) { p.push(`%${buscar.trim()}%`); w.push(`(b.descripcion ILIKE $${p.length} OR b.entidad_id ILIKE $${p.length} OR b.accion ILIKE $${p.length} OR b.usuario ILIKE $${p.length})`); }
    p.push(Math.min(Math.max(Number(limite) || 500, 1), 5000));
    return this.db.query(`SELECT b.id, b.fecha, b.usuario_id, b.usuario, b.accion, b.entidad, b.entidad_id, b.descripcion, b.datos, b.ip
      FROM bitacora b WHERE ${w.join(' AND ')} ORDER BY b.fecha DESC, b.id DESC LIMIT $${p.length}`, p);
  }
}
