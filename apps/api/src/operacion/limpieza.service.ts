import { Injectable } from '@nestjs/common';
import { asignarLimpiezaSchema, ETIQUETAS, hoyLima, sumarDias, tareaLimpiezaSchema, terminarLimpiezaSchema } from '@marea/shared';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { Bitacora } from '../auditoria/bitacora.service';
import type { UsuarioSesion } from '../auth/auth.service';
import { sqlBloqueo } from '../reservas/consultas';

const ABIERTA = `estado IN ('Pendiente','EnCurso')`;
const PRIORIDAD: Record<string, number> = { Alta: 0, Media: 1, Baja: 2 };

/**
 * Limpieza de habitaciones. Cada tarea registra quién limpia y cuánto tarda: al empezar la habitación pasa a «En limpieza»
 * y al terminar a «Limpia». El check-out y el cambio de habitación dejan programada la limpieza de salida.
 */
@Injectable()
export class Limpieza {
  constructor(private readonly db: Db, private readonly bitacora: Bitacora) {}

  /**
   * La habitación queda por limpiar con una tarea pendiente (de salida tras un check-out, profunda tras una reparación).
   * Si ya tenía una pendiente (p. ej. el servicio diario), esa pasa a ser la nueva. Se llama dentro de la transacción de la operación.
   */
  async programar(c: PoolClient, habitacionId: number, tipo: 'Salida' | 'Profunda', reservaId: number | null, por: string) {
    const hoy = hoyLima();
    await c.query(`UPDATE habitaciones SET estado_limpieza = CASE WHEN EXISTS (SELECT 1 FROM limpiezas WHERE habitacion_id = $1 AND estado = 'EnCurso')
      THEN 'EnLimpieza' ELSE 'Sucia' END WHERE id = $1`, [habitacionId]);
    const act = await c.query(`UPDATE limpiezas SET tipo = $2, reserva_id = coalesce($3, reserva_id), fecha = $4 WHERE habitacion_id = $1 AND estado = 'Pendiente'`,
      [habitacionId, tipo, reservaId, hoy]);
    if (!act.rowCount) await c.query(`INSERT INTO limpiezas (habitacion_id, tipo, fecha, reserva_id, creada_por) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (habitacion_id) WHERE ${ABIERTA} DO NOTHING`, [habitacionId, tipo, hoy, reservaId, por]);
  }

  /**
   * Plan del día: qué habitación necesita limpieza, con qué prioridad y quién la tiene asignada.
   * Alta = por limpiar y llega un huésped hoy; Media = por limpiar; Baja = servicio diario de una habitación ocupada.
   */
  async plan() {
    const hoy = hoyLima();
    const habs = await this.db.query<any>(`SELECT h.id, h.numero, h.piso, h.estado, h.estado_limpieza, t.nombre AS tipo,
        l.id AS tarea_id, l.tipo AS tarea_tipo, l.estado AS tarea_estado, l.asignada_a, l.inicio, l.fecha_creacion AS tarea_creada,
        (SELECT max(x.fin) FROM limpiezas x WHERE x.habitacion_id = h.id AND x.estado = 'Terminada') AS ultima_limpieza,
        EXISTS (SELECT 1 FROM limpiezas x WHERE x.habitacion_id = h.id AND x.estado = 'Terminada' AND x.fecha = $1) AS limpiada_hoy,
        EXISTS (${sqlBloqueo('h.id', '$1', '$2')}) AS bloqueada
      FROM habitaciones h JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id
      LEFT JOIN limpiezas l ON l.habitacion_id = h.id AND l.${ABIERTA}
      ORDER BY h.piso, h.numero`, [hoy, sumarDias(hoy, 1)]);
    const res = await this.db.query<any>(`SELECT r.id, r.habitacion_id, r.codigo, r.estado, r.fecha_entrada, r.fecha_salida, r.hora_llegada,
        c.nombres || ' ' || c.apellidos AS huesped
      FROM reservas r JOIN clientes c ON c.id = r.cliente_id
      WHERE r.estado IN ('Confirmada','CheckIn') AND r.fecha_entrada <= $1 AND r.fecha_salida >= $1`, [hoy]);
    const lista = habs.map(h => {
      const enCasa = res.find(r => r.habitacionId === h.id && r.estado === 'CheckIn');
      const llega = res.find(r => r.habitacionId === h.id && r.estado === 'Confirmada' && r.fechaSalida > hoy);
      const situacion = enCasa ? (enCasa.fechaSalida <= hoy ? 'Sale hoy' : 'Ocupada') : llega ? 'Llega hoy'
        : h.estado !== 'Operativa' ? ETIQUETAS[h.estado] : h.bloqueada ? 'Bloqueada' : 'Libre';
      const sucia = h.estadoLimpieza !== 'Limpia';
      const necesita = h.tareaTipo ?? (sucia ? 'Salida' : situacion === 'Ocupada' && !h.limpiadaHoy ? 'Servicio' : null);
      const prioridad = !necesita ? null : necesita === 'Servicio' ? 'Baja' : llega ? 'Alta' : 'Media';
      const r = enCasa ?? llega;
      return { ...h, situacion, necesita, prioridad, huesped: r?.huesped ?? null, codigoReserva: r?.codigo ?? null, horaLlegada: llega?.horaLlegada ?? null };
    }).sort((a, b) => (PRIORIDAD[a.prioridad] ?? 9) - (PRIORIDAD[b.prioridad] ?? 9) || a.piso - b.piso || a.numero.localeCompare(b.numero));
    const personal = (await this.db.query<{ asignadaA: string }>(`SELECT DISTINCT asignada_a FROM limpiezas
      WHERE asignada_a IS NOT NULL AND fecha >= $1 ORDER BY asignada_a LIMIT 30`, [sumarDias(hoy, -30)])).map(x => x.asignadaA);
    const operativas = lista.filter(h => h.estado === 'Operativa');
    return {
      hoy, habitaciones: lista, personal,
      resumen: {
        porLimpiar: operativas.filter(h => h.estadoLimpieza === 'Sucia').length,
        enLimpieza: operativas.filter(h => h.estadoLimpieza === 'EnLimpieza').length,
        servicios: operativas.filter(h => h.necesita === 'Servicio').length,
        llegadasSinLimpiar: operativas.filter(h => h.prioridad === 'Alta').length,
        terminadasHoy: (await this.db.uno<{ n: number }>(`SELECT count(*) AS n FROM limpiezas WHERE estado = 'Terminada' AND fecha = $1`, [hoy]))!.n
      }
    };
  }

  private async habitacion(c: PoolClient, id: number) {
    const h = await this.db.uno<any>('SELECT id, numero, estado, estado_limpieza FROM habitaciones WHERE id = $1 FOR UPDATE', [id], c);
    if (!h) throw falla(404, 'Habitación no encontrada.', 'habitacionId');
    return h;
  }

  private async tarea(c: PoolClient, id: number) {
    const t = await this.db.uno<any>(`SELECT l.*, h.numero FROM limpiezas l JOIN habitaciones h ON h.id = l.habitacion_id WHERE l.id = $1 FOR UPDATE OF l`, [id], c);
    if (!t) throw falla(404, 'Tarea de limpieza no encontrada.');
    if (!['Pendiente', 'EnCurso'].includes(t.estado)) throw falla(409, `La limpieza de la habitación ${t.numero} ya está ${ETIQUETAS[t.estado].toLowerCase()}.`);
    return t;
  }

  /** Programa una limpieza (y, si se pide, la empieza). Una sola tarea abierta por habitación. */
  async crear(d: z.output<typeof tareaLimpiezaSchema>, u: UsuarioSesion) {
    return this.db.transaccion(async c => {
      const h = await this.habitacion(c, d.habitacionId);
      const reserva = await this.db.uno<{ id: number }>(`SELECT id FROM reservas WHERE habitacion_id = $1 AND estado = 'CheckIn'`, [h.id], c);
      const t = await this.db.uno<any>(`INSERT INTO limpiezas (habitacion_id, tipo, fecha, asignada_a, reserva_id, creada_por, estado, inicio)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8::boolean THEN now() END)
        ON CONFLICT (habitacion_id) WHERE ${ABIERTA} DO NOTHING RETURNING *`,
        [h.id, d.tipo, hoyLima(), d.asignadaA, reserva?.id ?? null, u.nombre, d.iniciar ? 'EnCurso' : 'Pendiente', d.iniciar], c);
      if (!t) throw falla(409, `La habitación ${h.numero} ya tiene una limpieza pendiente o en curso.`, 'habitacionId');
      if (d.iniciar) await c.query(`UPDATE habitaciones SET estado_limpieza = 'EnLimpieza' WHERE id = $1`, [h.id]);
      await this.bitacora.registrar({ accion: 'limpieza.programar', entidad: 'habitacion', entidadId: h.id,
        descripcion: `${ETIQUETAS[d.tipo]} de la habitación ${h.numero}${d.asignadaA ? ` asignada a ${d.asignadaA}` : ''}${d.iniciar ? ' (en curso)' : ''}`, datos: { limpiezaId: t.id } }, c);
      return { ...t, mensaje: `${ETIQUETAS[d.tipo]} de la habitación ${h.numero} ${d.iniciar ? 'en curso' : 'programada'}.` };
    });
  }

  async asignar(id: number, d: z.output<typeof asignarLimpiezaSchema>) {
    return this.db.transaccion(async c => {
      const t = await this.tarea(c, id);
      await c.query('UPDATE limpiezas SET asignada_a = $2 WHERE id = $1', [id, d.asignadaA]);
      await this.bitacora.registrar({ accion: 'limpieza.asignar', entidad: 'habitacion', entidadId: t.habitacionId,
        descripcion: `Limpieza de la habitación ${t.numero} ${d.asignadaA ? `asignada a ${d.asignadaA}` : 'sin asignar'}`, datos: { limpiezaId: id } }, c);
      return { id, mensaje: d.asignadaA ? `Habitación ${t.numero} asignada a ${d.asignadaA}.` : `Habitación ${t.numero} sin asignar.` };
    });
  }

  async iniciar(id: number) {
    return this.db.transaccion(async c => {
      const t = await this.tarea(c, id);
      if (t.estado === 'EnCurso') throw falla(409, `La limpieza de la habitación ${t.numero} ya está en curso.`);
      await c.query(`UPDATE limpiezas SET estado = 'EnCurso', inicio = now() WHERE id = $1`, [id]);
      await c.query(`UPDATE habitaciones SET estado_limpieza = 'EnLimpieza' WHERE id = $1`, [t.habitacionId]);
      await this.bitacora.registrar({ accion: 'limpieza.iniciar', entidad: 'habitacion', entidadId: t.habitacionId,
        descripcion: `Empezó la ${ETIQUETAS[t.tipo].toLowerCase()} de la habitación ${t.numero}${t.asignadaA ? ` (${t.asignadaA})` : ''}`, datos: { limpiezaId: id } }, c);
      return { id, mensaje: `Limpieza de la habitación ${t.numero} en curso.` };
    });
  }

  /** La habitación queda limpia. Un desperfecto encontrado se convierte en una orden de mantenimiento. */
  async terminar(id: number, d: z.output<typeof terminarLimpiezaSchema>, u: UsuarioSesion) {
    return this.db.transaccion(async c => {
      const t = await this.tarea(c, id);
      await c.query(`UPDATE limpiezas SET estado = 'Terminada', inicio = coalesce(inicio, now()), fin = now(), terminada_por = $2, observaciones = $3 WHERE id = $1`,
        [id, u.nombre, d.observaciones]);
      await c.query(`UPDATE habitaciones SET estado_limpieza = 'Limpia' WHERE id = $1`, [t.habitacionId]);
      const orden = d.desperfecto ? (await this.db.uno<{ id: number }>(`INSERT INTO mantenimientos (habitacion_id, categoria, descripcion, prioridad, reportado_por, limpieza_id)
        VALUES ($1, 'Otro', $2, 'Media', $3, $4) RETURNING id`, [t.habitacionId, d.desperfecto, u.nombre, id], c))!.id : null;
      await this.bitacora.registrar({ accion: 'limpieza.terminar', entidad: 'habitacion', entidadId: t.habitacionId,
        descripcion: `Habitación ${t.numero} limpia (${ETIQUETAS[t.tipo].toLowerCase()}${t.asignadaA ? `, ${t.asignadaA}` : ''})${d.observaciones ? `. ${d.observaciones}` : ''}`,
        datos: { limpiezaId: id, ordenMantenimiento: orden } }, c);
      if (orden) await this.bitacora.registrar({ accion: 'mantenimiento.crear', entidad: 'mantenimiento', entidadId: orden,
        descripcion: `Desperfecto en la habitación ${t.numero} reportado al limpiar: ${d.desperfecto}` }, c);
      return { id, ordenMantenimiento: orden,
        mensaje: `Habitación ${t.numero} lista.${orden ? ` Se abrió la orden de mantenimiento N.° ${orden}.` : ''}` };
    });
  }

  async anular(id: number) {
    return this.db.transaccion(async c => {
      const t = await this.tarea(c, id);
      await c.query(`UPDATE limpiezas SET estado = 'Anulada', fin = now() WHERE id = $1`, [id]);
      if (t.estado === 'EnCurso') await c.query(`UPDATE habitaciones SET estado_limpieza = 'Sucia' WHERE id = $1 AND estado_limpieza = 'EnLimpieza'`, [t.habitacionId]);
      await this.bitacora.registrar({ accion: 'limpieza.anular', entidad: 'habitacion', entidadId: t.habitacionId,
        descripcion: `${ETIQUETAS[t.tipo]} de la habitación ${t.numero} anulada`, datos: { limpiezaId: id } }, c);
      return { id, mensaje: `Limpieza de la habitación ${t.numero} anulada.` };
    });
  }

  /** Marcado rápido (tablero de habitaciones y recepción): «Limpia» da por terminada la tarea abierta; «Sucia» deja la habitación por limpiar. */
  async marcar(habitacionId: number, estado: 'Limpia' | 'Sucia', u: UsuarioSesion) {
    return this.db.transaccion(async c => {
      const h = await this.habitacion(c, habitacionId);
      if (estado === 'Limpia') await c.query(`UPDATE limpiezas SET estado = 'Terminada', inicio = coalesce(inicio, now()), fin = now(), terminada_por = $2
        WHERE habitacion_id = $1 AND ${ABIERTA}`, [h.id, u.nombre]);
      await c.query('UPDATE habitaciones SET estado_limpieza = $2 WHERE id = $1', [h.id, estado]);
      await this.bitacora.registrar({ accion: 'habitacion.limpieza', entidad: 'habitacion', entidadId: h.id, descripcion: `Habitación ${h.numero} marcada como ${ETIQUETAS[estado].toLowerCase()}` }, c);
      return { id: h.id, numero: h.numero, estadoLimpieza: estado };
    });
  }
}
