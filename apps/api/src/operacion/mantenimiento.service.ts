import { Injectable } from '@nestjs/common';
import { cancelarMantenimientoSchema, ETIQUETAS, hoyLima, mantenimientoSchema, resolverMantenimientoSchema, sumarDias } from '@marea/shared';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { Bitacora, cambios } from '../auditoria/bitacora.service';
import type { UsuarioSesion } from '../auth/auth.service';
import { soles } from '../correo/plantillas';
import { SQL_OCUPA } from '../reservas/consultas';
import { Limpieza } from './limpieza.service';

type Orden = z.output<typeof mantenimientoSchema>;
const ABIERTA = `m.estado IN ('Pendiente','EnProceso')`;
const SQL_ORDEN = `SELECT m.*, h.numero AS habitacion, coalesce('Hab. ' || h.numero, m.area) AS ubicacion,
    coalesce($1::date >= m.bloqueo_desde AND $1::date < m.bloqueo_hasta AND m.bloquea AND ${ABIERTA}, false) AS bloqueada_hoy
  FROM mantenimientos m LEFT JOIN habitaciones h ON h.id = m.habitacion_id`;
const dmy = (iso: string) => iso.split('-').reverse().join('/');

/**
 * Mantenimiento: órdenes por habitación o área común. Una orden abierta puede bloquear la habitación por fechas:
 * no se vende ni se asigna (disponibilidad, reservas del panel y cambio de habitación la excluyen).
 */
@Injectable()
export class Mantenimiento {
  constructor(private readonly db: Db, private readonly bitacora: Bitacora, private readonly limpieza: Limpieza) {}

  /** Abiertas (todas) o cerradas en el periodo (hora de Lima). */
  listar(vista: string, desde: string, hasta: string) {
    if (vista === 'cerradas') return this.db.query(`${SQL_ORDEN} WHERE m.estado IN ('Resuelto','Cancelado')
      AND (m.fecha_cierre AT TIME ZONE 'America/Lima') >= $2::date AND (m.fecha_cierre AT TIME ZONE 'America/Lima') < $3::date ORDER BY m.fecha_cierre DESC`,
      [hoyLima(), desde, sumarDias(hasta, 1)]);
    return this.db.query(`${SQL_ORDEN} WHERE ${ABIERTA}
      ORDER BY array_position(ARRAY['Urgente','Alta','Media','Baja'], m.prioridad::text), m.fecha_reporte`, [hoyLima()]);
  }

  /** Para la campana y los indicadores. */
  async resumen() {
    return (await this.db.uno<any>(`SELECT count(*) FILTER (WHERE ${ABIERTA}) AS abiertas,
        count(*) FILTER (WHERE ${ABIERTA} AND m.prioridad = 'Urgente') AS urgentes,
        count(DISTINCT m.habitacion_id) FILTER (WHERE ${ABIERTA} AND m.bloquea AND $1::date >= m.bloqueo_desde AND $1::date < m.bloqueo_hasta) AS bloqueadas_hoy
      FROM mantenimientos m`, [hoyLima()]))!;
  }

  async detalle(id: number) {
    const m = await this.db.uno<any>(`${SQL_ORDEN} WHERE m.id = $2`, [hoyLima(), id]);
    if (!m) throw falla(404, 'Orden de mantenimiento no encontrada.');
    return m;
  }

  /**
   * Bloquear una habitación: misma fila (advisory lock por tipo) que las reservas y los cambios de habitación, así nadie la asigna
   * mientras se bloquea. No se bloquean noches con reservas: primero se cambian de habitación desde su ficha.
   */
  private async validarBloqueo(c: PoolClient, d: Orden, desdeAnterior: string | null = null) {
    const h = await this.db.uno<any>('SELECT id, numero, tipo_habitacion_id FROM habitaciones WHERE id = $1', [d.habitacionId], c);
    if (!h) throw falla(404, 'Habitación no encontrada.', 'habitacionId');
    if (d.bloqueoDesde! < hoyLima() && d.bloqueoDesde !== desdeAnterior) throw falla(400, 'El bloqueo no puede empezar en una fecha pasada.', 'bloqueoDesde');
    await c.query('SELECT pg_advisory_xact_lock(7731, $1)', [h.tipoHabitacionId]);
    const choques = await this.db.query<{ codigo: string }>(`SELECT r.codigo FROM reservas r WHERE r.habitacion_id = $1 AND r.estado IN ('Confirmada','CheckIn')
      AND ${SQL_OCUPA} && daterange($2::date, $3::date) ORDER BY r.fecha_entrada LIMIT 5`, [h.id, d.bloqueoDesde, d.bloqueoHasta], c);
    if (choques.length) throw falla(409, `La habitación ${h.numero} tiene reservas en esas fechas (${choques.map(x => x.codigo).join(', ')}). `
      + 'Cámbialas de habitación desde su ficha antes de bloquearla.', 'bloqueoDesde');
    return h;
  }

  async crear(d: Orden, u: UsuarioSesion) {
    return this.db.transaccion(async c => {
      let numero: string | null = null;
      if (d.habitacionId) {
        const h = d.bloquea ? await this.validarBloqueo(c, d) : await this.db.uno<any>('SELECT numero FROM habitaciones WHERE id = $1', [d.habitacionId], c);
        if (!h) throw falla(404, 'Habitación no encontrada.', 'habitacionId');
        numero = h.numero;
      }
      const m = (await this.db.uno<any>(`INSERT INTO mantenimientos (habitacion_id, area, categoria, descripcion, prioridad, asignado_a, bloquea, bloqueo_desde, bloqueo_hasta, reportado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [d.habitacionId, d.habitacionId ? null : d.area, d.categoria, d.descripcion, d.prioridad, d.asignadoA, d.bloquea,
          d.bloquea ? d.bloqueoDesde : null, d.bloquea ? d.bloqueoHasta : null, u.nombre], c))!;
      const donde = numero ? `habitación ${numero}` : d.area;
      await this.bitacora.registrar({ accion: 'mantenimiento.crear', entidad: 'mantenimiento', entidadId: m.id,
        descripcion: `Orden ${ETIQUETAS[d.prioridad].toLowerCase()} en ${donde} (${ETIQUETAS[d.categoria]}): ${d.descripcion}${d.bloquea ? `. Bloqueada del ${dmy(d.bloqueoDesde!)} al ${dmy(d.bloqueoHasta!)}` : ''}`,
        datos: { habitacionId: d.habitacionId, prioridad: d.prioridad, bloquea: d.bloquea, desde: d.bloqueoDesde, hasta: d.bloqueoHasta } }, c);
      return { ...m, mensaje: `Orden de mantenimiento N.° ${m.id} registrada${d.bloquea ? `: la habitación ${numero} no se vende del ${dmy(d.bloqueoDesde!)} al ${dmy(d.bloqueoHasta!)}` : ''}.` };
    });
  }

  private async abierta(c: PoolClient, id: number) {
    const m = await this.db.uno<any>(`SELECT m.*, h.numero FROM mantenimientos m LEFT JOIN habitaciones h ON h.id = m.habitacion_id WHERE m.id = $1 FOR UPDATE OF m`, [id], c);
    if (!m) throw falla(404, 'Orden de mantenimiento no encontrada.');
    if (!['Pendiente', 'EnProceso'].includes(m.estado)) throw falla(409, `La orden N.° ${id} ya está ${ETIQUETAS[m.estado].toLowerCase()}.`);
    return m;
  }

  /** Edita una orden abierta (la ubicación no cambia). Ampliar o mover el bloqueo vuelve a verificar las reservas. */
  async editar(id: number, d: Orden) {
    return this.db.transaccion(async c => {
      const m = await this.abierta(c, id);
      const datos = { ...d, habitacionId: m.habitacionId, area: m.area };
      if (datos.bloquea && !m.habitacionId) throw falla(400, 'Solo se bloquean habitaciones.', 'bloquea');
      if (datos.bloquea && (!m.bloquea || datos.bloqueoDesde !== m.bloqueoDesde || datos.bloqueoHasta !== m.bloqueoHasta))
        await this.validarBloqueo(c, datos, m.bloquea ? m.bloqueoDesde : null);
      await c.query(`UPDATE mantenimientos SET categoria = $2, descripcion = $3, prioridad = $4, asignado_a = $5, bloquea = $6, bloqueo_desde = $7, bloqueo_hasta = $8 WHERE id = $1`,
        [id, d.categoria, d.descripcion, d.prioridad, d.asignadoA, d.bloquea, d.bloquea ? d.bloqueoDesde : null, d.bloquea ? d.bloqueoHasta : null]);
      const dif = cambios(m, { ...d, bloqueoDesde: d.bloquea ? d.bloqueoDesde : null, bloqueoHasta: d.bloquea ? d.bloqueoHasta : null },
        ['categoria', 'descripcion', 'prioridad', 'asignadoA', 'bloquea', 'bloqueoDesde', 'bloqueoHasta']);
      if (Object.keys(dif).length) await this.bitacora.registrar({ accion: 'mantenimiento.editar', entidad: 'mantenimiento', entidadId: id,
        descripcion: `Orden N.° ${id} actualizada: ${Object.keys(dif).join(', ')}`, datos: dif }, c);
      return { id, mensaje: `Orden N.° ${id} actualizada.` };
    });
  }

  async iniciar(id: number, _u: UsuarioSesion) {
    return this.db.transaccion(async c => {
      const m = await this.abierta(c, id);
      if (m.estado === 'EnProceso') throw falla(409, `La orden N.° ${id} ya está en proceso.`);
      await c.query(`UPDATE mantenimientos SET estado = 'EnProceso', fecha_inicio = now() WHERE id = $1`, [id]);
      await this.bitacora.registrar({ accion: 'mantenimiento.iniciar', entidad: 'mantenimiento', entidadId: id,
        descripcion: `Orden N.° ${id} en proceso${m.asignadoA ? ` (${m.asignadoA})` : ''}` }, c);
      return { id, mensaje: `Orden N.° ${id} en proceso.` };
    });
  }

  /** Cierra la orden. El bloqueo termina ese día (la habitación vuelve a venderse) y, si se pide, queda pendiente una limpieza profunda. */
  private async cerrar(c: PoolClient, m: any, estado: 'Resuelto' | 'Cancelado', solucion: string, costo: number | null, u: UsuarioSesion) {
    const hoy = hoyLima();
    await c.query(`UPDATE mantenimientos SET estado = $2, fecha_cierre = now(), cerrado_por = $3, solucion = $4, costo = $5,
      bloqueo_hasta = CASE WHEN bloquea THEN LEAST(bloqueo_hasta, GREATEST(bloqueo_desde, $6::date)) END WHERE id = $1`, [m.id, estado, u.nombre, solucion, costo, hoy]);
  }

  async resolver(id: number, d: z.output<typeof resolverMantenimientoSchema>, u: UsuarioSesion) {
    return this.db.transaccion(async c => {
      const m = await this.abierta(c, id);
      await this.cerrar(c, m, 'Resuelto', d.solucion, d.costo, u);
      const limpiar = d.limpiar && m.habitacionId;
      if (limpiar) await this.limpieza.programar(c, m.habitacionId, 'Profunda', null, u.nombre);
      await this.bitacora.registrar({ accion: 'mantenimiento.resolver', entidad: 'mantenimiento', entidadId: id,
        descripcion: `Orden N.° ${id} resuelta: ${d.solucion}${d.costo ? ` (costo ${soles(d.costo)})` : ''}`.slice(0, 500), datos: { costo: d.costo, limpieza: !!limpiar } }, c);
      return { id, mensaje: `Orden N.° ${id} resuelta.${limpiar ? ` La habitación ${m.numero} quedó por limpiar.` : ''}` };
    });
  }

  async cancelar(id: number, d: z.output<typeof cancelarMantenimientoSchema>, u: UsuarioSesion) {
    return this.db.transaccion(async c => {
      const m = await this.abierta(c, id);
      await this.cerrar(c, m, 'Cancelado', d.motivo, null, u);
      await this.bitacora.registrar({ accion: 'mantenimiento.cancelar', entidad: 'mantenimiento', entidadId: id, descripcion: `Orden N.° ${id} cancelada: ${d.motivo}` }, c);
      return { id, mensaje: `Orden N.° ${id} cancelada.` };
    });
  }
}
