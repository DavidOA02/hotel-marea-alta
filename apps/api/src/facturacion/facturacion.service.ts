import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { comprobanteSchema, diasEntre, hoyLima, sumarDias, TIPOS_COMPROBANTE } from '@marea/shared';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { facturadorActivo } from '../config/env';
import { Bitacora } from '../auditoria/bitacora.service';
import { Correos } from '../correo/correos.service';
import { comprobanteEmitido, soles } from '../correo/plantillas';
import { PagosService } from '../pagos/pagos.service';
import { dmy } from '../reservas/reservas.service';
import { DocumentoElectronico, ErrorOse, proveedor } from './proveedores';

type Solicitud = z.output<typeof comprobanteSchema>;
const SERIE = /^[FB][A-Z0-9]{3}$/;
const DIAS_PARA_BAJA = 7;                                     // SUNAT: comunicación de baja hasta 7 días después de emitido
const DOC_SUNAT: Record<string, string> = { DNI: '1', CE: '4', PAS: '7' };   // catálogo 06

const SQL_COMPROBANTE = `SELECT k.*, r.codigo AS codigo_reserva FROM comprobantes k JOIN reservas r ON r.id = k.reserva_id`;
const nombre = (k: { tipo: string; serie: string; numero: number }) => `${TIPOS_COMPROBANTE[k.tipo]} ${k.serie}-${k.numero}`;

/** Facturación electrónica SUNAT: boleta o factura por reserva pagada, enviada a través de un OSE/PSE. */
@Injectable()
export class Facturacion implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Facturación');
  private reloj?: NodeJS.Timeout;
  private enCurso: Promise<void> | null = null;
  private cerrado = false;
  constructor(private readonly db: Db, private readonly pagos: PagosService, private readonly bitacora: Bitacora, private readonly correos: Correos) {}

  onModuleInit() {
    // Reintenta los comprobantes pendientes (boletas que esperan el resumen diario, cortes de red…)
    if (process.env.PROCESOS_EN_SEGUNDO_PLANO !== 'false') { this.reloj = setInterval(() => this.sincronizarPendientes(), 5 * 60_000); this.reloj.unref(); }
  }
  async onModuleDestroy() { this.cerrado = true; clearInterval(this.reloj); await this.enCurso?.catch(() => undefined); }

  static series() {
    const f = (process.env.SERIE_FACTURA || 'F001').toUpperCase(), b = (process.env.SERIE_BOLETA || 'B001').toUpperCase();
    if (!SERIE.test(f) || !f.startsWith('F') || !SERIE.test(b) || !b.startsWith('B')) throw falla(500, 'SERIE_FACTURA debe ser como F001 y SERIE_BOLETA como B001.');
    return { factura: f, boleta: b };
  }

  estado() {
    const p = facturadorActivo();
    let series: { factura: string; boleta: string } | null = null;
    try { series = Facturacion.series(); } catch { /* se informa al emitir */ }
    return { proveedor: p, habilitada: !!p, series };
  }

  async emitir(codigo: string, d: Solicitud, registradoPor: string) {
    const prov = facturadorActivo();
    if (!prov) throw falla(503, 'La facturación electrónica no está configurada (FACTURACION y credenciales del OSE en apps/api/.env).');
    const series = Facturacion.series();
    const k = await this.db.transaccion(async c => {
      const r = await this.pagos.reservaBloqueada(c, { codigo });
      if (['Cancelada', 'NoShow'].includes(r.estado)) throw falla(409, `No se emiten comprobantes de reservas «${r.estado}».`);
      if (r.pagado <= 0.009 || r.saldo > 0.009) throw falla(409, `El comprobante se emite cuando la reserva está pagada por completo (saldo: ${soles(r.saldo)}).`);
      const vigente = await this.db.uno<{ serie: string; numero: number; tipo: string }>(`SELECT tipo, serie, numero FROM comprobantes WHERE reserva_id = $1 AND estado NOT IN ('Rechazado','Anulado')`, [r.id], c);
      if (vigente) throw falla(409, `La reserva ya tiene la ${nombre(vigente)}. Anúlala antes de emitir otra.`);
      const x = (await this.db.uno<any>(`SELECT r.codigo, r.fecha_entrada, r.fecha_salida, r.noches, r.subtotal, r.igv, r.total, r.exonerado_igv,
          c.nombres, c.apellidos, c.tipo_documento, c.numero_documento, c.email, h.numero AS habitacion, t.nombre AS tipo_habitacion
        FROM reservas r JOIN clientes c ON c.id = r.cliente_id JOIN habitaciones h ON h.id = r.habitacion_id JOIN tipos_habitacion t ON t.id = h.tipo_habitacion_id
        WHERE r.id = $1`, [r.id], c))!;
      const huesped = `${x.nombres} ${x.apellidos}`.toUpperCase();

      // Tipo de comprobante y adquirente según la operación
      let tipo: '01' | '03', tipoOperacion = '0101', cli: { tipoDoc: string; numDoc: string; nombre: string; direccion: string | null };
      if (x.exoneradoIgv) {
        // Hospedaje a extranjero no domiciliado = exportación de servicios: factura identificando al huésped con su pasaporte
        if (x.tipoDocumento !== 'PAS') throw falla(409, 'La exportación de hospedaje requiere que el huésped esté registrado con pasaporte.');
        tipo = '01'; tipoOperacion = '0202'; cli = { tipoDoc: '7', numDoc: x.numeroDocumento, nombre: huesped, direccion: null };
      } else if (d.exportacion) {
        throw falla(400, 'Solo las estadías de extranjeros no domiciliados (exoneradas de IGV) se facturan como exportación.', 'exportacion');
      } else if (d.tipo === 'Factura') {
        tipo = '01'; cli = { tipoDoc: '6', numDoc: d.ruc!, nombre: d.razonSocial!.toUpperCase(), direccion: d.direccion };
      } else {
        tipo = '03'; cli = { tipoDoc: DOC_SUNAT[x.tipoDocumento], numDoc: x.numeroDocumento, nombre: huesped, direccion: null };
      }
      const serie = tipo === '01' ? series.factura : series.boleta;
      await c.query('INSERT INTO series_comprobante (serie, tipo) VALUES ($1, $2) ON CONFLICT (serie) DO NOTHING', [serie, tipo]);
      // La fila de la serie queda bloqueada hasta el COMMIT: dos emisiones simultáneas nunca repiten número ni dejan huecos
      const s = await this.db.uno<{ ultimo: number }>('UPDATE series_comprobante SET ultimo = ultimo + 1 WHERE serie = $1 AND tipo = $2 RETURNING ultimo', [serie, tipo], c);
      if (!s) throw falla(500, `La serie ${serie} está registrada para otro tipo de comprobante.`);

      const exportacion = tipoOperacion === '0202';
      const base = exportacion ? x.total : x.subtotal;
      const item = { codigo: x.codigo, unidad: 'ZZ', cantidad: 1, valorUnitario: base, precioUnitario: x.total, afectacion: exportacion ? '40' : '10', igv: exportacion ? 0 : x.igv, total: x.total,
        descripcion: `Servicio de hospedaje: ${x.tipoHabitacion} N.° ${x.habitacion}, ${x.noches} noche(s) del ${dmy(x.fechaEntrada)} al ${dmy(x.fechaSalida)} (reserva ${x.codigo})` };
      const k = (await this.db.uno<any>(`INSERT INTO comprobantes (reserva_id, tipo, serie, numero, fecha_emision, tipo_operacion, cliente_tipo_doc, cliente_num_doc,
          cliente_nombre, cliente_direccion, cliente_email, gravada, exportacion, igv, total, items, proveedor, registrado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [r.id, tipo, serie, s.ultimo, hoyLima(), tipoOperacion, cli.tipoDoc, cli.numDoc, cli.nombre, cli.direccion, x.email,
          exportacion ? 0 : x.subtotal, exportacion ? x.total : 0, exportacion ? 0 : x.igv, x.total, JSON.stringify([item]), prov, registradoPor], c))!;
      await this.bitacora.registrar({ accion: 'comprobante.emitir', entidad: 'reserva', entidadId: x.codigo,
        descripcion: `${nombre(k)}${exportacion ? ' (exportación de servicios)' : ''} por ${soles(x.total)} a nombre de ${cli.nombre} (${cli.numDoc})`,
        datos: { comprobanteId: k.id, tipo, serie, numero: k.numero, total: x.total, proveedor: prov } }, c);
      return k;
    });
    await this.enviar(k.id);
    const final = (await this.ver(k.id))!;
    const textos: Record<string, string> = { Aceptado: 'aceptada por SUNAT', Observado: 'aceptada con observaciones', Pendiente: 'registrada; SUNAT aún no responde', Rechazado: 'rechazada' };
    return { ...final, mensaje: `${nombre(final)} ${textos[final.estado] ?? final.estado}.`, advertencia: final.estado === 'Rechazado' || final.estado === 'Pendiente' ? final.mensaje : null };
  }

  private documento(k: any): DocumentoElectronico {
    return { tipo: k.tipo, serie: k.serie, numero: k.numero, fechaEmision: k.fechaEmision, tipoOperacion: k.tipoOperacion, clienteTipoDoc: k.clienteTipoDoc,
      clienteNumDoc: k.clienteNumDoc, clienteNombre: k.clienteNombre, clienteDireccion: k.clienteDireccion, clienteEmail: k.clienteEmail,
      gravada: k.gravada, exportacion: k.exportacion, igv: k.igv, total: k.total, items: k.items };
  }

  /** Envía (o consulta) un comprobante pendiente y guarda la respuesta del OSE. */
  private async enviar(id: number, consultarPrimero = false) {
    const k = await this.db.uno<any>(`UPDATE comprobantes SET intentos = intentos + 1, fecha_envio = now() WHERE id = $1 AND estado = 'Pendiente' RETURNING *`, [id]);
    if (!k) return;
    const prov = proveedor(k.proveedor);
    if (!prov) { await this.db.query('UPDATE comprobantes SET mensaje = $2 WHERE id = $1', [id, `El proveedor ${k.proveedor} no está disponible en este entorno.`]); return; }
    const doc = this.documento(k);
    let res;
    try {
      res = (consultarPrimero ? await prov.consultar(doc) : null) ?? await prov.emitir(doc);
    } catch (e: any) {
      if (e instanceof ErrorOse && e.transitorio) {
        this.log.warn(`${nombre(k)}: ${e.message} (se reintentará)`);
        await this.db.query('UPDATE comprobantes SET mensaje = $2 WHERE id = $1', [id, `No se pudo contactar al OSE: ${e.message}`.slice(0, 500)]);
        return;
      }
      res = { estado: 'Rechazado' as const, mensaje: String(e?.message ?? e) };
    }
    await this.db.transaccion(async c => {
      const act = await this.db.uno<any>(`${SQL_COMPROBANTE} WHERE k.id = $1 FOR UPDATE OF k`, [id], c);
      if (act.estado !== 'Pendiente') return;
      await c.query(`UPDATE comprobantes SET estado = $2, mensaje = $3, hash = coalesce($4, hash), cadena_qr = coalesce($5, cadena_qr), enlace_pdf = coalesce($6, enlace_pdf),
        enlace_xml = coalesce($7, enlace_xml), enlace_cdr = coalesce($8, enlace_cdr), respuesta = $9 WHERE id = $1`,
        [id, res.estado, res.mensaje.slice(0, 500), res.hash ?? null, res.cadenaQr ?? null, res.enlacePdf ?? null, res.enlaceXml ?? null, res.enlaceCdr ?? null,
          res.respuesta === undefined ? null : JSON.stringify(res.respuesta)]);
      if (res.estado === 'Pendiente') return;
      await this.bitacora.registrar({ accion: `comprobante.${res.estado.toLowerCase()}`, entidad: 'reserva', entidadId: act.codigoReserva,
        descripcion: `${nombre(act)}: ${res.mensaje}`.slice(0, 500), autor: { nombre: `OSE ${k.proveedor}` } }, c);
      if ((res.estado === 'Aceptado' || res.estado === 'Observado') && act.clienteEmail)
        await this.correos.encolar({ tipo: 'comprobante', para: act.clienteEmail, reservaId: act.reservaId, ...comprobanteEmitido({ ...act, enlacePdf: res.enlacePdf ?? act.enlacePdf, enlaceXml: res.enlaceXml ?? act.enlaceXml }) }, c);
    });
  }

  /** «Actualizar estado» del panel: consulta al OSE y, si no lo conoce, lo vuelve a enviar. */
  async sincronizar(id: number) {
    const k = await this.ver(id);
    if (!k) throw falla(404, 'Comprobante no encontrado.');
    if (k.estado !== 'Pendiente') return { ...k, mensaje: `${nombre(k)} ya está «${k.estado}».` };
    await this.enviar(id, true);
    const act = (await this.ver(id))!;
    return { ...act, mensaje: `${nombre(act)}: ${act.estado === 'Pendiente' ? 'SUNAT aún no responde' : act.estado.toLowerCase()}.` };
  }

  private sincronizarPendientes() {
    if (this.cerrado || this.enCurso) return;
    this.enCurso = (async () => {
      const ids = await this.db.query<{ id: number }>(`SELECT id FROM comprobantes WHERE estado = 'Pendiente' AND intentos < 30
        AND coalesce(fecha_envio, fecha_registro) < now() - interval '2 minutes' ORDER BY id LIMIT 20`);
      for (const { id } of ids) if (!this.cerrado) await this.enviar(id, true);
    })().catch(e => { if (!this.cerrado) this.log.error(e.message); }).finally(() => { this.enCurso = null; });
  }

  async anular(id: number, motivo: string) {
    const k = await this.ver(id);
    if (!k) throw falla(404, 'Comprobante no encontrado.');
    if (!['Aceptado', 'Observado'].includes(k.estado)) throw falla(409, `Solo se anulan comprobantes aceptados (estado actual: «${k.estado}»).`);
    if (diasEntre(k.fechaEmision, hoyLima()) > DIAS_PARA_BAJA) throw falla(409, `Pasaron más de ${DIAS_PARA_BAJA} días desde la emisión: corresponde emitir una nota de crédito.`);
    const prov = proveedor(k.proveedor);
    if (!prov) throw falla(503, `El proveedor ${k.proveedor} no está disponible en este entorno.`);
    let r;
    try { r = await prov.anular(this.documento(k), motivo); }
    catch (e: any) { throw falla(502, e instanceof ErrorOse ? e.message : 'No se pudo comunicar la baja al OSE.'); }
    await this.db.transaccion(async c => {
      const x = await c.query(`UPDATE comprobantes SET estado = 'Anulado', motivo_anulacion = $2, fecha_anulacion = now() WHERE id = $1 AND estado IN ('Aceptado','Observado')`, [id, motivo]);
      if (!x.rowCount) throw falla(409, 'El comprobante cambió de estado mientras tanto.');
      await this.bitacora.registrar({ accion: 'comprobante.anular', entidad: 'reserva', entidadId: k.codigoReserva,
        descripcion: `${nombre(k)} anulada. Motivo: ${motivo}`, datos: { comprobanteId: id, respuesta: r.mensaje } }, c);
    });
    return { id, mensaje: `${nombre(k)} anulada. ${r.mensaje}` };
  }

  ver(id: number) {
    return this.db.uno<any>(`${SQL_COMPROBANTE} WHERE k.id = $1`, [id]);
  }

  async listar(desde?: string, hasta?: string, estado?: string) {
    const h = hasta || hoyLima(), d = desde || sumarDias(h, -29);
    if (h < d) throw falla(400, 'La fecha final debe ser posterior a la inicial.', 'hasta');
    const p: unknown[] = [d, h];
    if (estado) p.push(estado);
    const lista = await this.db.query<any>(`SELECT k.id, k.tipo, k.serie, k.numero, k.fecha_emision, k.cliente_tipo_doc, k.cliente_num_doc, k.cliente_nombre,
        k.gravada, k.exportacion, k.igv, k.total, k.estado, k.mensaje, k.proveedor, k.enlace_pdf, k.enlace_xml, k.registrado_por, k.fecha_registro, r.codigo AS codigo_reserva
      FROM comprobantes k JOIN reservas r ON r.id = k.reserva_id
      WHERE k.fecha_emision BETWEEN $1 AND $2 ${estado ? 'AND k.estado = $3' : ''} ORDER BY k.fecha_emision DESC, k.id DESC`, p);
    const validos = lista.filter(k => k.estado === 'Aceptado' || k.estado === 'Observado');
    const suma = (f: (k: any) => number) => Math.round(validos.reduce((s, k) => s + f(k), 0) * 100) / 100;
    return { desde: d, hasta: h, ...this.estado(), comprobantes: lista,
      totales: { cantidad: validos.length, gravada: suma(k => k.gravada), exportacion: suma(k => k.exportacion), igv: suma(k => k.igv), total: suma(k => k.total),
        pendientes: lista.filter(k => k.estado === 'Pendiente').length, rechazados: lista.filter(k => k.estado === 'Rechazado').length } };
  }
}
