import { Injectable, Logger } from '@nestjs/common';
import { cotizar, diasEntre, HORAS_CANCELACION, horasParaLlegada, hoyLima } from '@marea/shared';
import type { PoolClient } from 'pg';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';

export interface DatosCliente {
  nombres: string; apellidos: string; tipoDocumento: string; numeroDocumento: string;
  email: string; codigoPais: string; telefono: string;
}
export interface Solicitud {
  tipoHabitacion: string; habitacionId?: number | null; fechaEntrada: string; fechaSalida: string; huespedes: number;
  residencia: 'PE' | 'EXT'; clienteId?: number | null; cliente?: DatosCliente | null; canal: string;
  horaLlegada?: string | null; notas?: string | null; aceptaPublicidad?: boolean; registradoPor?: string | null; checkInInmediato?: boolean;
}

/** Disponibilidad: habitaciones operativas sin reservas activas que se crucen con el rango. */
export const SQL_LIBRES = `
  SELECT h.id, h.numero FROM habitaciones h
  WHERE h.tipo_habitacion_id = $1 AND h.estado = 'Operativa'
    AND NOT EXISTS (SELECT 1 FROM reservas r WHERE r.habitacion_id = h.id AND r.estado IN ('Confirmada','CheckIn')
                    AND daterange(r.fecha_entrada, r.fecha_salida) && daterange($2::date, $3::date))`;

/** Proyección única de reserva (lista y detalle). */
export const SQL_RESERVA = `
  SELECT r.codigo, r.estado, r.canal, r.cliente_id, c.nombres || ' ' || c.apellidos AS cliente,
         c.tipo_documento || ' ' || c.numero_documento AS documento, c.email, '+' || c.codigo_pais || ' ' || c.telefono AS telefono,
         c.residencia, t.nombre AS tipo_habitacion, t.codigo AS tipo_codigo, h.numero AS habitacion, r.fecha_entrada, r.fecha_salida, r.noches,
         r.huespedes, r.subtotal, r.igv, r.total, coalesce(p.pagado, 0) AS pagado, r.total - coalesce(p.pagado, 0) AS saldo, r.exonerado_igv,
         r.hora_llegada, r.notas, r.fecha_reserva, r.fecha_check_in, r.fecha_check_out, r.registrado_por
  FROM reservas r JOIN clientes c ON c.id = r.cliente_id JOIN habitaciones h ON h.id = r.habitacion_id
  JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id
  LEFT JOIN LATERAL (SELECT sum(monto_soles) AS pagado FROM pagos WHERE reserva_id = r.id AND estado = 'Aprobado') p ON true`;

@Injectable()
export class ReservasService {
  private readonly log = new Logger('Reservas');
  constructor(private readonly db: Db) {}

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
    const libre = await this.db.uno<{ id: number; numero: string }>(
      SQL_LIBRES + (s.habitacionId ? ' AND h.id = $4' : '') + ' ORDER BY h.piso, h.numero LIMIT 1',
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
        INSERT INTO clientes (nombres, apellidos, tipo_documento, numero_documento, email, codigo_pais, telefono, residencia, acepta_publicidad)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (tipo_documento, numero_documento) DO UPDATE SET nombres = EXCLUDED.nombres, apellidos = EXCLUDED.apellidos,
          email = EXCLUDED.email, codigo_pais = EXCLUDED.codigo_pais, telefono = EXCLUDED.telefono, residencia = EXCLUDED.residencia,
          acepta_publicidad = clientes.acepta_publicidad OR EXCLUDED.acepta_publicidad
        RETURNING id`, [d.nombres, d.apellidos, d.tipoDocumento, d.numeroDocumento, d.email, d.codigoPais, d.telefono, s.residencia, !!s.aceptaPublicidad], c);
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

  async consultarPublica(codigo: string, email: string) {
    const r = await this.db.uno<any>(SQL_RESERVA + ' WHERE r.codigo = $1 AND lower(c.email) = lower($2)', [codigo.trim().toUpperCase(), email.trim()]);
    if (!r) throw falla(404, 'No encontramos una reserva con ese código y correo.');
    const p = ReservasService.politicaCancelacion(r.estado, r.fechaEntrada);
    return { codigo: r.codigo, estado: r.estado, titular: r.cliente, tipoHabitacion: r.tipoHabitacion, habitacion: r.habitacion,
      fechaEntrada: r.fechaEntrada, fechaSalida: r.fechaSalida, noches: r.noches, huespedes: r.huespedes, subtotal: r.subtotal, igv: r.igv,
      total: r.total, exoneradoIgv: r.exoneradoIgv, pagado: r.pagado, fechaReserva: r.fechaReserva, puedeCancelar: p.puede, motivoNoCancelable: p.motivo };
  }

  async cancelarPublica(codigo: string, email: string) {
    const r = await this.db.uno<any>(SQL_RESERVA + ' WHERE r.codigo = $1 AND lower(c.email) = lower($2)', [codigo.trim().toUpperCase(), email.trim()]);
    if (!r) throw falla(404, 'No encontramos una reserva con ese código y correo.');
    const p = ReservasService.politicaCancelacion(r.estado, r.fechaEntrada);
    if (!p.puede) throw falla(409, p.motivo!);
    await this.db.query(`UPDATE reservas SET estado = 'Cancelada', fecha_cancelacion = now() WHERE codigo = $1`, [r.codigo]);
    this.log.log(`Reserva ${r.codigo} cancelada por el huésped`);
    return { codigo: r.codigo, estado: 'Cancelada', mensaje: 'Tu reserva fue cancelada sin costo.' };
  }

  static hoy() { return hoyLima(); }
}
