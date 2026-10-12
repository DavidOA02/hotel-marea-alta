import { Injectable, Logger } from '@nestjs/common';
import { cotizar, diasEntre, ETIQUETAS, HORAS_CANCELACION, horasParaLlegada, hoyLima, recalcularPorCambio, redondear } from '@marea/shared';
import type { PoolClient } from 'pg';
import { Db, Ejecutor } from '../db/db.service';
import { falla } from '../comun/errores';
import { Bitacora } from '../auditoria/bitacora.service';
import { Correos } from '../correo/correos.service';
import { cancelacionReserva, confirmacionReserva, soles } from '../correo/plantillas';
import { pasarelaActiva } from '../config/env';
import { SQL_VIGENTE } from '../facturacion/consultas';
import { Limpieza } from '../operacion/limpieza.service';
import { SQL_OCUPA, sqlBloqueo } from './consultas';

export interface DatosCliente {
  nombres: string; apellidos: string; tipoDocumento: string; numeroDocumento: string;
  email: string; codigoPais: string; telefono: string; idioma?: 'es' | 'en' | null;
}
export interface Solicitud {
  tipoHabitacion: string; habitacionId?: number | null; fechaEntrada: string; fechaSalida: string; huespedes: number;
  residencia: 'PE' | 'EXT'; clienteId?: number | null; cliente?: DatosCliente | null; canal: string;
  horaLlegada?: string | null; notas?: string | null; aceptaPublicidad?: boolean; registradoPor?: string | null; checkInInmediato?: boolean;
}
export interface CambioHabitacion { habitacionId: number; tarifa: 'Mantener' | 'Recalcular'; motivo: string }

/** Disponibilidad: habitaciones operativas sin reservas activas ni bloqueos de mantenimiento que se crucen con el rango. */
export const SQL_LIBRES = `
  SELECT h.id, h.numero FROM habitaciones h
  WHERE h.tipo_habitacion_id = $1 AND h.estado = 'Operativa'
    AND NOT EXISTS (SELECT 1 FROM reservas r WHERE r.habitacion_id = h.id AND r.estado IN ('Confirmada','CheckIn')
                    AND ${SQL_OCUPA} && daterange($2::date, $3::date))
    AND NOT EXISTS (${sqlBloqueo('h.id', '$2', '$3')})`;

/** Proyección única de reserva (lista y detalle). Pagado = pagos aprobados − devoluciones completadas (función pagado_neto). */
export const SQL_RESERVA = `
  SELECT r.id, r.codigo, r.estado, r.canal, r.cliente_id, c.nombres || ' ' || c.apellidos AS cliente,
         c.tipo_documento || ' ' || c.numero_documento AS documento, c.email, '+' || c.codigo_pais || ' ' || c.telefono AS telefono,
         c.residencia, coalesce(c.idioma, CASE WHEN c.residencia = 'EXT' THEN 'en' ELSE 'es' END) AS idioma,
         t.nombre AS tipo_habitacion, t.codigo AS tipo_codigo, r.habitacion_id, h.numero AS habitacion, r.habitacion_desde,
         r.fecha_entrada, r.fecha_salida, r.noches, r.huespedes, r.subtotal, r.igv, r.total, coalesce(p.pagado, 0) AS pagado,
         r.total - coalesce(p.pagado, 0) AS saldo, r.exonerado_igv, r.hora_llegada, r.notas, r.fecha_reserva, r.fecha_check_in,
         r.fecha_check_out, r.fecha_cancelacion, r.registrado_por,
         coalesce((SELECT sum(a.total) FROM consumos a WHERE a.reserva_id = r.id AND a.estado = 'Activo'),0) AS consumos_total,
         coalesce((SELECT sum(a.igv) FROM consumos a WHERE a.reserva_id = r.id AND a.estado = 'Activo'),0) AS consumos_igv
  FROM reservas r JOIN clientes c ON c.id = r.cliente_id JOIN habitaciones h ON h.id = r.habitacion_id
  JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id
  LEFT JOIN LATERAL (SELECT pagado_neto(r.id) AS pagado) p ON true`;

export const dmy = (iso: string) => iso.split('-').reverse().join('/');

@Injectable()
export class ReservasService {
  private readonly log = new Logger('Reservas');
  constructor(private readonly db: Db, private readonly bitacora: Bitacora, private readonly correos: Correos, private readonly limpieza: Limpieza) {}

  async crear(s: Solicitud) {
    const tipo = await this.db.uno<{ id: number; nombre: string; capacidad: number; precioNoche: number }>(
      'SELECT id, nombre, capacidad, precio_noche FROM tipos_habitacion WHERE codigo = $1 AND activo', [s.tipoHabitacion]);
    if (!tipo) throw falla(400, 'El tipo de habitación no existe.', 'tipoHabitacion');
    if (s.huespedes > tipo.capacidad) throw falla(400, `${tipo.nombre} admite hasta ${tipo.capacidad} huéspedes. Elige otra habitación o reduce el número.`, 'huespedes');

    // Si dos personas reservan la última habitación a la vez, PostgreSQL rechaza a una (23P01) y reintentamos
    for (let intento = 1; ; intento++) {
      try {
        return await this.db.transaccion(c => this.crearEnTx(c, s, tipo));
      } catch (e: any) {
        if ((e?.code === '23P01' || e?.code === '40P01') && intento < 3 && !s.habitacionId) continue;
        throw e;
      }
    }
  }

  private async crearEnTx(c: PoolClient, s: Solicitud, tipo: { id: number; nombre: string; precioNoche: number }) {
    // Las reservas del mismo tipo de habitación hacen fila (milisegundos) para elegir habitación sin carreras ni deadlocks.
    // Tipos distintos siguen en paralelo. La restricción EXCLUDE de la tabla es la red de seguridad final.
    await c.query('SELECT pg_advisory_xact_lock(7731, $1)', [tipo.id]);
    // Con check-in inmediato, además, nadie debe seguir registrado en la habitación (huésped que salía hoy sin check-out)
    const libre = await this.db.uno<{ id: number; numero: string }>(
      SQL_LIBRES + (s.checkInInmediato ? ` AND NOT EXISTS (SELECT 1 FROM reservas o WHERE o.habitacion_id = h.id AND o.estado = 'CheckIn')` : '')
        + (s.habitacionId ? ' AND h.id = $4' : '') + ' ORDER BY h.piso, h.numero LIMIT 1',
      s.habitacionId ? [tipo.id, s.fechaEntrada, s.fechaSalida, s.habitacionId] : [tipo.id, s.fechaEntrada, s.fechaSalida], c);
    if (!libre) throw s.habitacionId
      ? falla(409, 'Esa habitación no está libre para esas fechas o no corresponde al tipo elegido.', 'habitacionId')
      : falla(409, `No quedan habitaciones ${tipo.nombre} para esas fechas. Prueba otras fechas u otro tipo de habitación.`, 'fechaEntrada');

    let clienteId: number;
    if (s.clienteId) {
      const cl = await this.db.uno<{ id: number; tipoDocumento: string }>('SELECT id, tipo_documento FROM clientes WHERE id = $1', [s.clienteId], c);
      if (!cl) throw falla(404, 'Cliente no encontrado.', 'clienteId');
      if (s.residencia === 'EXT' && cl.tipoDocumento !== 'PAS') throw falla(400, 'Para la exoneración de IGV el cliente debe estar registrado con pasaporte.', 'residencia');
      await c.query('UPDATE clientes SET residencia = $2 WHERE id = $1', [cl.id, s.residencia]);
      clienteId = cl.id;
    } else {
      const d = s.cliente!;
      const r = await this.db.uno<{ id: number }>(`
        INSERT INTO clientes (nombres, apellidos, tipo_documento, numero_documento, email, codigo_pais, telefono, residencia, acepta_publicidad, idioma)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (tipo_documento, numero_documento) DO UPDATE SET nombres = EXCLUDED.nombres, apellidos = EXCLUDED.apellidos,
          email = EXCLUDED.email, codigo_pais = EXCLUDED.codigo_pais, telefono = EXCLUDED.telefono, residencia = EXCLUDED.residencia,
          acepta_publicidad = clientes.acepta_publicidad OR EXCLUDED.acepta_publicidad, idioma = coalesce(EXCLUDED.idioma, clientes.idioma)
        RETURNING id`, [d.nombres, d.apellidos, d.tipoDocumento, d.numeroDocumento, d.email, d.codigoPais, d.telefono, s.residencia, !!s.aceptaPublicidad, d.idioma ?? null], c);
      clienteId = r!.id;
    }

    const noches = diasEntre(s.fechaEntrada, s.fechaSalida);
    const q = cotizar(tipo.precioNoche, noches, s.residencia === 'EXT');
    const estado = s.checkInInmediato ? 'CheckIn' : 'Confirmada';
    const res = await this.db.uno<any>(`
      INSERT INTO reservas (codigo, cliente_id, habitacion_id, fecha_entrada, fecha_salida, huespedes, hora_llegada, notas,
                            exonerado_igv, subtotal, igv, total, estado, canal, registrado_por, fecha_check_in)
      VALUES ('TMP' || substr(md5(random()::text), 1, 16), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id`, [clienteId, libre.id, s.fechaEntrada, s.fechaSalida, s.huespedes, s.horaLlegada ?? null, s.notas ?? null,
      q.exoneradoIgv, q.subtotal, q.igv, q.total, estado, s.canal, s.registradoPor ?? null, s.checkInInmediato ? new Date() : null], c);
    const { codigo } = (await this.db.uno<{ codigo: string }>(
      `UPDATE reservas SET codigo = 'MA' || to_char(now(), 'YY') || lpad(id::text, 5, '0') WHERE id = $1 RETURNING codigo`, [res.id], c))!;

    // Bitácora y correo de confirmación en la misma transacción: si la reserva no se guarda, tampoco ellos
    const datos = (await this.db.uno<any>(SQL_RESERVA + ' WHERE r.id = $1', [res.id], c))!;
    await this.bitacora.registrar({ accion: 'reserva.crear', entidad: 'reserva', entidadId: codigo,
      descripcion: `Reserva ${codigo} (${ETIQUETAS[s.canal] ?? s.canal}) para ${datos.cliente}: ${tipo.nombre} ${libre.numero} del ${dmy(s.fechaEntrada)} al ${dmy(s.fechaSalida)} · ${soles(q.total)}${s.checkInInmediato ? ' · con check-in inmediato' : ''}`,
      datos: { clienteId, habitacion: libre.numero, fechaEntrada: s.fechaEntrada, fechaSalida: s.fechaSalida, huespedes: s.huespedes, total: q.total, canal: s.canal } }, c);
    await this.correos.encolar({ tipo: 'confirmacion', para: datos.email, reservaId: res.id, ...confirmacionReserva(datos, !!pasarelaActiva()) }, c);

    this.log.log(`Reserva ${codigo} (${s.canal}) ${tipo.nombre} ${libre.numero} del ${s.fechaEntrada} al ${s.fechaSalida}`);
    return { codigo, estado, tipoHabitacion: tipo.nombre, habitacion: libre.numero, fechaEntrada: s.fechaEntrada, fechaSalida: s.fechaSalida,
      huespedes: s.huespedes, ...q };
  }

  /** Disponibilidad y cotización (residentes) por tipo de habitación. */
  async disponibilidad(entrada: string, salida: string, huespedes: number) {
    const noches = diasEntre(entrada, salida);
    const tipos = await this.db.query<{ id: number; codigo: string; nombre: string; capacidad: number; precioNoche: number }>(
      'SELECT id, codigo, nombre, capacidad, precio_noche FROM tipos_habitacion WHERE activo ORDER BY precio_noche');
    return Promise.all(tipos.map(async t => {
      const libres = t.capacidad >= huespedes ? (await this.db.query(SQL_LIBRES, [t.id, entrada, salida])).length : 0;
      return { codigo: t.codigo, nombre: t.nombre, capacidad: t.capacidad, precioNoche: t.precioNoche, disponibles: libres, ...cotizar(t.precioNoche, noches, false) };
    }));
  }

  static politicaCancelacion(estado: string, fechaEntrada: string): { puede: boolean; motivo: string | null } {
    if (estado !== 'Confirmada') return { puede: false, motivo: `La reserva está en estado «${estado}» y ya no puede cancelarse en línea.` };
    if (horasParaLlegada(fechaEntrada) < HORAS_CANCELACION) return { puede: false, motivo: 'Faltan menos de 72 horas para tu llegada. Escríbenos por WhatsApp y te ayudamos.' };
    return { puede: true, motivo: null };
  }

  /** Reserva vista por el huésped: se identifica con el código y el correo del titular. */
  async buscarPublica(codigo: string, email: string) {
    const r = await this.db.uno<any>(SQL_RESERVA + ' WHERE r.codigo = $1 AND lower(c.email) = lower($2)', [codigo.trim().toUpperCase(), email.trim()]);
    if (!r) throw falla(404, 'No encontramos una reserva con ese código y correo.');
    return r;
  }

  static puedePagarEnLinea(r: { estado: string; saldo: number }) {
    return !!pasarelaActiva() && ['Confirmada', 'CheckIn'].includes(r.estado) && r.saldo > 0.009;
  }

  async consultarPublica(codigo: string, email: string) {
    const r = await this.buscarPublica(codigo, email);
    const p = ReservasService.politicaCancelacion(r.estado, r.fechaEntrada);
    return { codigo: r.codigo, estado: r.estado, titular: r.cliente, tipoHabitacion: r.tipoHabitacion, habitacion: r.habitacion,
      fechaEntrada: r.fechaEntrada, fechaSalida: r.fechaSalida, noches: r.noches, huespedes: r.huespedes, subtotal: r.subtotal, igv: r.igv,
      total: r.total, exoneradoIgv: r.exoneradoIgv, pagado: r.pagado, saldo: r.saldo, fechaReserva: r.fechaReserva, puedeCancelar: p.puede, motivoNoCancelable: p.motivo,
      puedePagarEnLinea: ReservasService.puedePagarEnLinea(r) };
  }

  async cancelarPublica(codigo: string, email: string) {
    const r = await this.buscarPublica(codigo, email);
    const p = ReservasService.politicaCancelacion(r.estado, r.fechaEntrada);
    if (!p.puede) throw falla(409, p.motivo!);
    await this.cancelar(r, `Reserva ${r.codigo} cancelada por el huésped desde «Mi reserva»`);
    this.log.log(`Reserva ${r.codigo} cancelada por el huésped`);
    return { codigo: r.codigo, estado: 'Cancelada', mensaje: 'Tu reserva fue cancelada sin costo. Te enviamos la confirmación por correo.' };
  }

  /** Cancela una reserva confirmada, la registra en la bitácora y avisa al huésped por correo. */
  async cancelar(r: any, descripcion: string) {
    await this.db.transaccion(async c => {
      const x = await c.query(`UPDATE reservas SET estado = 'Cancelada', fecha_cancelacion = now() WHERE id = $1 AND estado = 'Confirmada'`, [r.id]);
      if (!x.rowCount) throw falla(409, 'La reserva cambió de estado mientras tanto. Vuelve a abrirla.');
      await this.bitacora.registrar({ accion: 'reserva.cancelar', entidad: 'reserva', entidadId: r.codigo, descripcion }, c);
      await this.correos.encolar({ tipo: 'cancelacion', para: r.email, reservaId: r.id, ...cancelacionReserva(r) }, c);
    });
  }

  async reenviarConfirmacion(codigo: string) {
    const r = await this.db.uno<any>(SQL_RESERVA + ' WHERE r.codigo = $1', [codigo.toUpperCase()]);
    if (!r) throw falla(404, 'Reserva no encontrada.');
    if (!['Confirmada', 'CheckIn'].includes(r.estado)) throw falla(409, 'Solo se reenvía la confirmación de reservas vigentes.');
    await this.db.transaccion(async c => {
      await this.correos.encolar({ tipo: 'confirmacion', para: r.email, reservaId: r.id, ...confirmacionReserva(r, !!pasarelaActiva()) }, c);
      await this.bitacora.registrar({ accion: 'correo.reenviar', entidad: 'reserva', entidadId: r.codigo, descripcion: `Confirmación de ${r.codigo} reenviada a ${r.email}` }, c);
    });
    return { codigo: r.codigo, mensaje: `Confirmación enviada a ${r.email}.` };
  }

  /* ---------------- Cambio de habitación ---------------- */

  /** Reserva lista para cambiar de habitación. «desde» es hoy si la estadía ya empezó; si no, el día de llegada. */
  private async paraCambio(codigo: string, c?: Ejecutor) {
    const r = await this.db.uno<any>(`
      SELECT r.id, r.codigo, r.estado, r.fecha_entrada, r.fecha_salida, r.noches, r.huespedes, r.subtotal, r.igv, r.total, r.exonerado_igv,
             r.habitacion_id, h.numero AS habitacion, h.tipo_habitacion_id AS tipo_id, t.nombre AS tipo_habitacion,
             coalesce((SELECT sum(a.total) FROM consumos a WHERE a.reserva_id = r.id AND a.estado = 'Activo'),0) AS consumos_total,
             coalesce((SELECT sum(a.igv) FROM consumos a WHERE a.reserva_id = r.id AND a.estado = 'Activo'),0) AS consumos_igv,
             EXISTS (SELECT 1 FROM comprobantes k WHERE k.reserva_id = r.id AND ${SQL_VIGENTE}) AS tiene_comprobante
      FROM reservas r JOIN habitaciones h ON h.id = r.habitacion_id JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id
      WHERE r.codigo = $1 ${c ? 'FOR UPDATE OF r' : ''}`, [codigo.toUpperCase()], c);
    if (!r) throw falla(404, 'Reserva no encontrada.');
    if (!['Confirmada', 'CheckIn'].includes(r.estado)) throw falla(409, 'Solo se cambia de habitación en reservas confirmadas o con el huésped en el hotel.');
    const hoy = hoyLima();
    const desde: string = r.fechaEntrada > hoy ? r.fechaEntrada : hoy;
    if (desde >= r.fechaSalida) throw falla(409, 'La estadía termina hoy: no quedan noches por cambiar.');
    return { ...r, desde, nochesRestantes: diasEntre(desde, r.fechaSalida) };
  }

  /** Habitaciones a las que se puede pasar (libres desde «desde» hasta la salida), con el total si se recalcula la tarifa. */
  async opcionesCambio(codigo: string) {
    const r = await this.paraCambio(codigo);
    const libres = await this.db.query<any>(`
      SELECT h.id, h.numero, h.piso, h.estado_limpieza, t.codigo AS tipo_codigo, t.nombre AS tipo, t.capacidad, t.precio_noche
      FROM habitaciones h JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id
      WHERE h.estado = 'Operativa' AND h.id <> $1 AND t.capacidad >= $2
        AND NOT EXISTS (SELECT 1 FROM reservas r WHERE r.habitacion_id = h.id AND r.id <> $3 AND r.estado IN ('Confirmada','CheckIn')
                        AND ${SQL_OCUPA} && daterange($4::date, $5::date))
        AND NOT EXISTS (${sqlBloqueo('h.id', '$4', '$5')})
      ORDER BY (h.tipo_habitacion_id = $6) DESC, t.precio_noche, h.piso, h.numero`,
      [r.habitacionId, r.huespedes, r.id, r.desde, r.fechaSalida, r.tipoId]);
    return {
      codigo: r.codigo, estado: r.estado, habitacion: r.habitacion, tipoHabitacion: r.tipoHabitacion, desde: r.desde, nochesRestantes: r.nochesRestantes,
      total: r.total, tieneComprobante: r.tieneComprobante,
      opciones: libres.map(h => ({ ...h, totalRecalculado: redondear(recalcularPorCambio(r.total - r.consumosTotal, r.noches, r.nochesRestantes, h.precioNoche, r.exoneradoIgv).total + r.consumosTotal) }))
    };
  }

  async cambiarHabitacion(codigo: string, d: CambioHabitacion, registradoPor: string) {
    return this.db.transaccion(async c => {
      const r = await this.paraCambio(codigo, c);
      const nueva = await this.db.uno<any>(`SELECT h.id, h.numero, h.estado, h.tipo_habitacion_id AS tipo_id, t.nombre AS tipo, t.capacidad, t.precio_noche
        FROM habitaciones h JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id WHERE h.id = $1`, [d.habitacionId], c);
      if (!nueva) throw falla(404, 'La habitación elegida no existe.', 'habitacionId');
      if (nueva.id === r.habitacionId) throw falla(409, 'Elige una habitación distinta de la actual.', 'habitacionId');
      if (nueva.estado !== 'Operativa') throw falla(409, `La habitación ${nueva.numero} no está operativa.`, 'habitacionId');
      if (r.huespedes > nueva.capacidad) throw falla(409, `${nueva.tipo} admite hasta ${nueva.capacidad} huéspedes.`, 'habitacionId');
      // Misma fila que las reservas nuevas de ese tipo: nadie puede tomar la habitación mientras se hace el cambio
      await c.query('SELECT pg_advisory_xact_lock(7731, $1)', [nueva.tipoId]);
      const choque = await this.db.uno<{ codigo: string }>(`SELECT r.codigo FROM reservas r WHERE r.habitacion_id = $1 AND r.id <> $2
        AND r.estado IN ('Confirmada','CheckIn') AND ${SQL_OCUPA} && daterange($3::date, $4::date) LIMIT 1`, [nueva.id, r.id, r.desde, r.fechaSalida], c);
      if (choque) throw falla(409, `La habitación ${nueva.numero} no está libre del ${dmy(r.desde)} al ${dmy(r.fechaSalida)}.`, 'habitacionId');
      if (await this.db.uno(sqlBloqueo('$1', '$2', '$3'), [nueva.id, r.desde, r.fechaSalida], c))
        throw falla(409, `La habitación ${nueva.numero} está bloqueada por mantenimiento en esas fechas.`, 'habitacionId');

      let importe = { subtotal: r.subtotal, igv: r.igv, total: r.total };
      if (d.tarifa === 'Recalcular') {
        if (r.tieneComprobante) throw falla(409, 'La reserva ya tiene comprobante electrónico: cambia de habitación manteniendo la tarifa.', 'tarifa');
        const hospedaje = recalcularPorCambio(r.total - r.consumosTotal, r.noches, r.nochesRestantes, nueva.precioNoche, r.exoneradoIgv);
        importe = { total:redondear(hospedaje.total + r.consumosTotal), igv:redondear(hospedaje.igv + r.consumosIgv), subtotal:redondear(hospedaje.subtotal + r.consumosTotal - r.consumosIgv) };
      }
      await c.query(`UPDATE reservas SET habitacion_id = $2, habitacion_desde = $3, subtotal = $4, igv = $5, total = $6 WHERE id = $1`,
        [r.id, nueva.id, r.desde > r.fechaEntrada ? r.desde : null, importe.subtotal, importe.igv, importe.total]);
      await c.query(`INSERT INTO cambios_habitacion (reserva_id, habitacion_anterior_id, habitacion_nueva_id, desde, tarifa, total_anterior, total_nuevo, motivo, registrado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [r.id, r.habitacionId, nueva.id, r.desde, d.tarifa, r.total, importe.total, d.motivo, registradoPor]);
      if (r.estado === 'CheckIn') await this.limpieza.programar(c, r.habitacionId, 'Salida', r.id, registradoPor);

      const tarifa = d.tarifa === 'Recalcular' ? `tarifa recalculada ${soles(r.total)} → ${soles(importe.total)}` : 'misma tarifa';
      await this.bitacora.registrar({ accion: 'reserva.cambiar_habitacion', entidad: 'reserva', entidadId: r.codigo,
        descripcion: `Cambio de habitación ${r.habitacion} → ${nueva.numero} desde el ${dmy(r.desde)} (${tarifa}). Motivo: ${d.motivo}`,
        datos: { de: r.habitacion, a: nueva.numero, desde: r.desde, tarifa: d.tarifa, totalAnterior: r.total, totalNuevo: importe.total, motivo: d.motivo } }, c);

      const { pagado } = (await this.db.uno<{ pagado: number }>('SELECT pagado_neto($1) AS pagado', [r.id], c))!;
      const saldo = redondear(importe.total - pagado);
      const avisos = [r.estado === 'CheckIn' ? `La habitación ${r.habitacion} pasó a «Por limpiar».` : null,
        saldo < -0.009 ? `El huésped tiene un saldo a favor de ${soles(-saldo)}.` : null].filter(Boolean);
      this.log.log(`Reserva ${r.codigo}: habitación ${r.habitacion} → ${nueva.numero} (${d.tarifa})`);
      return { codigo: r.codigo, habitacionAnterior: r.habitacion, habitacion: nueva.numero, tipoHabitacion: nueva.tipo, desde: r.desde,
        totalAnterior: r.total, total: importe.total, saldo,
        mensaje: `Huésped pasado a la habitación ${nueva.numero}${d.tarifa === 'Recalcular' ? `. Nuevo total: ${soles(importe.total)}` : ''}.`,
        advertencia: avisos.length ? avisos.join(' ') : null };
    });
  }

  static hoy() { return hoyLima(); }
}
