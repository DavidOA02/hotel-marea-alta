import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { comprobanteSchema, desglosar, diasEntre, hoyLima, MOTIVOS_NC_TOTALES, MOTIVOS_NOTA_CREDITO, MOTIVOS_NOTA_DEBITO, notaCreditoSchema, notaDebitoSchema, redondear, sumarDias, TIPOS_COMPROBANTE } from '@marea/shared';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { facturadorActivo } from '../config/env';
import { Bitacora } from '../auditoria/bitacora.service';
import { Correos } from '../correo/correos.service';
import { comprobanteEmitido, soles } from '../correo/plantillas';
import { PagosService } from '../pagos/pagos.service';
import { dmy } from '../reservas/reservas.service';
import { SQL_COMPROBANTE, SQL_VIGENTE } from './consultas';
import { DocumentoElectronico, ErrorOse, proveedor } from './proveedores';

type Solicitud = z.output<typeof comprobanteSchema>;
type SolicitudNota = z.output<typeof notaCreditoSchema>;
const SERIE = /^[FB][A-Z0-9]{3}$/;
const DIAS_PARA_BAJA = 7;                                     // SUNAT: comunicación de baja hasta 7 días después de emitido
const DOC_SUNAT: Record<string, string> = { DNI: '1', CE: '4', PAS: '7' };   // catálogo 06

const nombre = (k: { tipo: string; serie: string; numero: number }) => `${TIPOS_COMPROBANTE[k.tipo]} ${k.serie}-${k.numero}`;
const TEXTOS: Record<string, string> = { Aceptado: 'aceptada por SUNAT', Observado: 'aceptada con observaciones', Pendiente: 'registrada; SUNAT aún no responde', Rechazado: 'rechazada' };

/** Facturación electrónica SUNAT: boleta, factura y notas de crédito por reserva, enviadas a través de un OSE/PSE. */
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

  /** Series configuradas. Las notas de crédito llevan su propia serie (empieza con F si modifica facturas y con B si modifica boletas). */
  static series() {
    const s = (v: string | undefined, def: string) => (v || def).toUpperCase();
    const r = { factura: s(process.env.SERIE_FACTURA, 'F001'), boleta: s(process.env.SERIE_BOLETA, 'B001'),
      notaFactura: s(process.env.SERIE_NC_FACTURA, 'FC01'), notaBoleta: s(process.env.SERIE_NC_BOLETA, 'BC01'),
      debitoFactura: s(process.env.SERIE_ND_FACTURA, 'FD01'), debitoBoleta: s(process.env.SERIE_ND_BOLETA, 'BD01') };
    const ok = (x: string, l: string) => SERIE.test(x) && x.startsWith(l);
    if (!ok(r.factura, 'F') || !ok(r.boleta, 'B') || !ok(r.notaFactura, 'F') || !ok(r.notaBoleta, 'B') || !ok(r.debitoFactura, 'F') || !ok(r.debitoBoleta, 'B'))
      throw falla(500, 'Las series deben tener 4 caracteres y comenzar con F para facturas y sus notas, o con B para boletas y sus notas.');
    if (new Set(Object.values(r)).size !== 6) throw falla(500, 'Cada tipo de comprobante necesita una serie distinta.');
    return r;
  }

  estado() {
    const p = facturadorActivo();
    let series: ReturnType<typeof Facturacion.series> | null = null;
    try { series = Facturacion.series(); } catch { /* se informa al emitir */ }
    return { proveedor: p, habilitada: !!p, series };
  }

  /** Siguiente número de la serie. La fila queda bloqueada hasta el COMMIT: emisiones simultáneas nunca repiten número ni dejan huecos. */
  private async siguienteNumero(c: PoolClient, serie: string, tipo: string) {
    await c.query('INSERT INTO series_comprobante (serie, tipo) VALUES ($1, $2) ON CONFLICT (serie) DO NOTHING', [serie, tipo]);
    const s = await this.db.uno<{ ultimo: number }>('UPDATE series_comprobante SET ultimo = ultimo + 1 WHERE serie = $1 AND tipo = $2 RETURNING ultimo', [serie, tipo], c);
    if (!s) throw falla(500, `La serie ${serie} está registrada para otro tipo de comprobante.`);
    return s.ultimo;
  }

  private proveedorActivo() {
    const prov = facturadorActivo();
    if (!prov) throw falla(503, 'La facturación electrónica no está configurada (FACTURACION y credenciales del OSE en apps/api/.env).');
    return prov;
  }

  async emitir(codigo: string, d: Solicitud, registradoPor: string) {
    const prov = this.proveedorActivo();
    const series = Facturacion.series();
    const k = await this.db.transaccion(async c => {
      const r = await this.pagos.reservaBloqueada(c, { codigo });
      if (['Cancelada', 'NoShow'].includes(r.estado)) throw falla(409, `No se emiten comprobantes de reservas «${r.estado}».`);
      if (r.pagado <= 0.009 || r.saldo > 0.009) throw falla(409, `El comprobante se emite cuando la reserva está pagada por completo (saldo: ${soles(r.saldo)}).`);
      const vigente = await this.db.uno<{ serie: string; numero: number; tipo: string }>(`SELECT tipo, serie, numero FROM comprobantes k WHERE k.reserva_id = $1 AND ${SQL_VIGENTE}`, [r.id], c);
      if (vigente) throw falla(409, `La reserva ya tiene la ${nombre(vigente)}. Anúlala o emite una nota de crédito antes de emitir otra.`);
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
      const numero = await this.siguienteNumero(c, serie, tipo);

      const exportacion = tipoOperacion === '0202';
      const consumos = await this.db.query<any>(`SELECT * FROM consumos WHERE reserva_id = $1 AND estado = 'Activo' AND comprobante_id IS NULL ORDER BY id`, [r.id], c);
      const adicionales = redondear(consumos.reduce((s, a) => s + a.total, 0));
      const igvAdicional = redondear(consumos.reduce((s, a) => s + a.igv, 0));
      const hospedaje = redondear(x.total - adicionales), igvHospedaje = redondear(x.igv - igvAdicional);
      if (hospedaje < 0 || igvHospedaje < 0) throw falla(409, 'Revisa los ajustes de la cuenta antes de emitir el comprobante.');
      const base = redondear(hospedaje - igvHospedaje);
      const item = { codigo: x.codigo, unidad: 'ZZ', cantidad: 1, valorUnitario: base, precioUnitario: hospedaje, afectacion: exportacion ? '40' : '10', igv: igvHospedaje, total: hospedaje,
        descripcion: `Servicio de hospedaje: ${x.tipoHabitacion} N.° ${x.habitacion}, ${x.noches} noche(s) del ${dmy(x.fechaEntrada)} al ${dmy(x.fechaSalida)} (reserva ${x.codigo})` };
      const items = [...(hospedaje > 0 ? [item] : []), ...consumos.map(a => ({ codigo: `CON-${a.id}`, descripcion: `${a.categoria}: ${a.descripcion}`, unidad: 'NIU', cantidad: a.cantidad,
        valorUnitario: a.subtotal / a.cantidad, precioUnitario: a.precioUnitario, afectacion: '10', igv: a.igv, total: a.total }))];
      const importeExportacion = exportacion ? hospedaje : 0;
      const k = (await this.db.uno<any>(`INSERT INTO comprobantes (reserva_id, tipo, serie, numero, fecha_emision, tipo_operacion, cliente_tipo_doc, cliente_num_doc,
          cliente_nombre, cliente_direccion, cliente_email, gravada, exportacion, igv, total, items, proveedor, registrado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [r.id, tipo, serie, numero, hoyLima(), tipoOperacion, cli.tipoDoc, cli.numDoc, cli.nombre, cli.direccion, x.email,
          redondear(x.subtotal - importeExportacion), importeExportacion, x.igv, x.total, JSON.stringify(items), prov, registradoPor], c))!;
      await c.query(`UPDATE consumos SET comprobante_id = $2 WHERE reserva_id = $1 AND estado = 'Activo' AND comprobante_id IS NULL`, [r.id, k.id]);
      await this.bitacora.registrar({ accion: 'comprobante.emitir', entidad: 'reserva', entidadId: x.codigo,
        descripcion: `${nombre(k)}${exportacion ? ' (exportación de servicios)' : ''} por ${soles(x.total)} a nombre de ${cli.nombre} (${cli.numDoc})`,
        datos: { comprobanteId: k.id, tipo, serie, numero: k.numero, total: x.total, proveedor: prov } }, c);
      return k;
    });
    return this.enviarYResponder(k.id);
  }

  /**
   * Nota de crédito sobre una boleta o factura aceptada (una nota modifica un solo comprobante).
   * · 01 anulación de la operación, 02 error en el RUC, 06 devolución total → por todo lo que queda; al aceptarse, el comprobante queda neutralizado.
   * · 09 disminución en el valor → por un monto; baja también el total de la reserva (se revierte si SUNAT la rechaza).
   */
  async emitirNota(comprobanteId: number, d: SolicitudNota, registradoPor: string) {
    const nota = await this.db.transaccion(c => this.registrarNota(c, comprobanteId, d, registradoPor));
    return this.enviarYResponder(nota.id);
  }

  /** Registra la nota de crédito dentro de la transacción del llamador (p. ej. una devolución); luego hay que llamar a enviarNota(). */
  async registrarNota(c: PoolClient, comprobanteId: number, d: SolicitudNota, registradoPor: string) {
    const prov = this.proveedorActivo();
    const series = Facturacion.series();
    const ref = await this.db.uno<any>('SELECT reserva_id FROM comprobantes WHERE id = $1', [comprobanteId], c);
    if (!ref) throw falla(404, 'Comprobante no encontrado.');
    await this.pagos.reservaBloqueada(c, { id:ref.reservaId });
    const k = await this.db.uno<any>(`${SQL_COMPROBANTE} WHERE k.id = $1 FOR UPDATE OF k`, [comprobanteId], c);
    if (!k) throw falla(404, 'Comprobante no encontrado.');
    if (!['01', '03'].includes(k.tipo)) throw falla(409, 'La nota de crédito debe modificar una boleta o factura.');
    if (!['Aceptado', 'Observado'].includes(k.estado) || k.anuladoConNotaId) throw falla(409, `Solo se emiten notas de crédito de comprobantes aceptados y vigentes (${nombre(k)}: «${k.anuladoConNotaId ? 'neutralizado con nota de crédito' : k.estado}»).`);
    if (d.motivo === '02' && k.tipo !== '01') throw falla(400, 'La anulación por error en el RUC solo aplica a facturas.', 'motivo');
    const disponible = redondear(k.disponibleNota);
    if (disponible <= 0.009) throw falla(409, `La ${nombre(k)} ya fue rebajada por completo con notas de crédito.`);
    const total = MOTIVOS_NC_TOTALES.includes(d.motivo) ? disponible : redondear(d.monto!);
    if (MOTIVOS_NC_TOTALES.includes(d.motivo) && k.tieneDebito) throw falla(409, 'El comprobante tiene notas de débito: no se puede neutralizar desde este flujo.');
    if (d.motivo === '09') {
      if (total > disponible + 0.001) throw falla(409, `El monto supera lo que queda por rebajar de la ${nombre(k)} (${soles(disponible)}).`, 'monto');
      if (Math.abs(total - disponible) < 0.005) throw falla(409, 'Para rebajar todo usa «Devolución total» o «Anulación de la operación».', 'monto');
    }
    // Importes: si es por todo lo del comprobante se copian tal cual (sin diferencias de redondeo)
    const completo = Math.abs(total - k.total) < 0.005;
    const gravada = completo ? k.gravada : redondear(total * k.gravada / k.total), igv = completo ? k.igv : redondear(total * k.igv / k.total);
    const exportado = redondear(total - gravada - igv);
    const serie = k.tipo === '01' ? series.notaFactura : series.notaBoleta;
    const numero = await this.siguienteNumero(c, serie, '07');
    const descripcion = `${MOTIVOS_NOTA_CREDITO[d.motivo]} de la ${nombre(k)}: ${d.sustento}`;
    const items = [
      ...(gravada + igv > 0 ? [{ codigo:k.codigoReserva, unidad:'ZZ', cantidad:1, valorUnitario:gravada, precioUnitario:redondear(gravada+igv), afectacion:'10', igv, total:redondear(gravada+igv), descripcion }] : []),
      ...(exportado > 0 ? [{ codigo:k.codigoReserva+'-EXP', unidad:'ZZ', cantidad:1, valorUnitario:exportado, precioUnitario:exportado, afectacion:'40', igv:0, total:exportado, descripcion }] : [])
    ];
    const n = (await this.db.uno<any>(`INSERT INTO comprobantes (reserva_id, tipo, serie, numero, fecha_emision, tipo_operacion, cliente_tipo_doc, cliente_num_doc,
        cliente_nombre, cliente_direccion, cliente_email, gravada, exportacion, igv, total, items, proveedor, registrado_por, referencia_id, motivo_nota, sustento)
      VALUES ($1,'07',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [k.reservaId, serie, numero, hoyLima(), k.tipoOperacion, k.clienteTipoDoc, k.clienteNumDoc, k.clienteNombre, k.clienteDireccion, k.clienteEmail,
        gravada, exportado, igv, total, JSON.stringify(items), prov, registradoPor, k.id, d.motivo, d.sustento], c))!;
    let ajuste = '';
    if (d.motivo === '09') {
      const a = await this.pagos.ajustarTotal(c, k.reservaId, -total, -igv);
      ajuste = ` El total de la reserva pasó de ${soles(a.anterior)} a ${soles(a.total)}.`;
    }
    await this.bitacora.registrar({ accion: 'comprobante.nota_credito', entidad: 'reserva', entidadId: k.codigoReserva,
      descripcion: `${nombre(n)} (${MOTIVOS_NOTA_CREDITO[d.motivo]}) por ${soles(total)} sobre la ${nombre(k)}. Sustento: ${d.sustento}.${ajuste}`.slice(0, 500),
      datos: { notaId: n.id, comprobanteId: k.id, motivo: d.motivo, total } }, c);
    return n;
  }

  /** Envía al OSE un comprobante ya registrado y devuelve su estado con un mensaje para el panel. */
  enviarNota(id: number) { return this.enviarYResponder(id); }

  async emitirDebito(id: number, d: z.output<typeof notaDebitoSchema>, autor: string) {
    const n = await this.db.transaccion(async c => {
      const ref = await this.db.uno<any>('SELECT reserva_id FROM comprobantes WHERE id = $1', [id], c);
      if (!ref) throw falla(404, 'Comprobante no encontrado.');
      await this.pagos.reservaBloqueada(c, { id: ref.reservaId });
      return this.registrarDebito(c, id, d, autor);
    });
    return this.enviarYResponder(n.id);
  }

  /** Los cargos adicionales llevan IGV, incluso cuando el hospedaje es exportación. */
  async registrarDebito(c: PoolClient, id: number, d: z.output<typeof notaDebitoSchema>, autor: string) {
    const prov = this.proveedorActivo(), series = Facturacion.series();
    const k = await this.db.uno<any>(`${SQL_COMPROBANTE} WHERE k.id = $1 FOR UPDATE OF k`, [id], c);
    if (!k || !['01','03'].includes(k.tipo) || !['Aceptado','Observado'].includes(k.estado) || k.anuladoConNotaId)
      throw falla(409, 'La nota de débito requiere una boleta o factura aceptada y vigente.');
    const q = desglosar(d.monto, 1, false);
    const serie = k.tipo === '01' ? series.debitoFactura : series.debitoBoleta;
    const numero = await this.siguienteNumero(c, serie, '08');
    const items = [{ codigo: k.codigoReserva, descripcion: `${MOTIVOS_NOTA_DEBITO[d.motivo]}: ${d.sustento}`, unidad: 'ZZ', cantidad: 1,
      valorUnitario: q.subtotal, precioUnitario: q.total, afectacion: '10', igv: q.igv, total: q.total }];
    const n = (await this.db.uno<any>(`INSERT INTO comprobantes (reserva_id,tipo,serie,numero,fecha_emision,tipo_operacion,
      cliente_tipo_doc,cliente_num_doc,cliente_nombre,cliente_direccion,cliente_email,gravada,exportacion,igv,total,items,proveedor,registrado_por,referencia_id,motivo_nota,sustento)
      VALUES ($1,'08',$2,$3,$4,'0101',$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [k.reservaId,serie,numero,hoyLima(),k.clienteTipoDoc,k.clienteNumDoc,k.clienteNombre,k.clienteDireccion,k.clienteEmail,
        q.subtotal,q.igv,q.total,JSON.stringify(items),prov,autor,k.id,d.motivo,d.sustento], c))!;
    await this.pagos.ajustarTotal(c, k.reservaId, q.total, q.igv);
    await this.bitacora.registrar({ accion: 'comprobante.nota_debito', entidad: 'reserva', entidadId: k.codigoReserva,
      descripcion: `${nombre(n)} por ${soles(q.total)} sobre ${nombre(k)}: ${d.sustento}`.slice(0,500), datos: { notaId:n.id, comprobanteId:k.id, total:q.total } }, c);
    return n;
  }

  private async enviarYResponder(id: number) {
    await this.enviar(id);
    const final = (await this.ver(id))!;
    return { ...final, mensaje: `${nombre(final)} ${TEXTOS[final.estado] ?? final.estado}.`, advertencia: final.estado === 'Rechazado' || final.estado === 'Pendiente' ? final.mensaje : null };
  }

  private documento(k: any): DocumentoElectronico {
    return { tipo: k.tipo, serie: k.serie, numero: k.numero, fechaEmision: k.fechaEmision, tipoOperacion: k.tipoOperacion, clienteTipoDoc: k.clienteTipoDoc,
      clienteNumDoc: k.clienteNumDoc, clienteNombre: k.clienteNombre, clienteDireccion: k.clienteDireccion, clienteEmail: k.clienteEmail,
      gravada: k.gravada, exportacion: k.exportacion, igv: k.igv, total: k.total, items: k.items,
      nota: ['07','08'].includes(k.tipo) ? { tipo: k.refTipo, serie: k.refSerie, numero: k.refNumero, motivo: k.motivoNota, sustento: k.sustento } : undefined };
  }

  /** Envía (o consulta) un comprobante pendiente y guarda la respuesta del OSE. */
  private async enviar(id: number, consultarPrimero = false) {
    const marcado = await this.db.uno(`UPDATE comprobantes SET intentos = intentos + 1, fecha_envio = now() WHERE id = $1 AND estado = 'Pendiente' RETURNING id`, [id]);
    if (!marcado) return;
    const k = (await this.ver(id))!;
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
      await this.pagos.reservaBloqueada(c, { id:k.reservaId });
      const act = await this.db.uno<any>(`${SQL_COMPROBANTE} WHERE k.id = $1 FOR UPDATE OF k`, [id], c);
      if (act.estado !== 'Pendiente') return;
      await c.query(`UPDATE comprobantes SET estado = $2, mensaje = $3, hash = coalesce($4, hash), cadena_qr = coalesce($5, cadena_qr), enlace_pdf = coalesce($6, enlace_pdf),
        enlace_xml = coalesce($7, enlace_xml), enlace_cdr = coalesce($8, enlace_cdr), respuesta = $9 WHERE id = $1`,
        [id, res.estado, res.mensaje.slice(0, 500), res.hash ?? null, res.cadenaQr ?? null, res.enlacePdf ?? null, res.enlaceXml ?? null, res.enlaceCdr ?? null,
          res.respuesta === undefined ? null : JSON.stringify(res.respuesta)]);
      if (res.estado === 'Pendiente') return;
      const aceptado = res.estado === 'Aceptado' || res.estado === 'Observado';
      if (act.tipo === '07') {
        // Nota total aceptada: el comprobante modificado queda neutralizado (y se puede emitir uno nuevo)
        if (aceptado && MOTIVOS_NC_TOTALES.includes(act.motivoNota))
          await c.query('UPDATE comprobantes SET anulado_con_nota_id = $2 WHERE id = $1 AND anulado_con_nota_id IS NULL', [act.referenciaId, id]);
        // Nota parcial rechazada: se devuelve a la reserva el importe que se había rebajado
        if (res.estado === 'Rechazado' && act.motivoNota === '09') await this.pagos.ajustarTotal(c, act.reservaId, act.total, act.igv);
      }
      if (act.tipo === '08' && res.estado === 'Rechazado') {
        await this.pagos.ajustarTotal(c, act.reservaId, -act.total, -act.igv);
        await c.query(`UPDATE consumos SET estado = 'Anulado', motivo_anulacion = 'Nota de débito rechazada por el OSE' WHERE comprobante_id = $1`, [id]);
      }
      if (['01','03'].includes(act.tipo) && res.estado === 'Rechazado')
        await c.query('UPDATE consumos SET comprobante_id = NULL WHERE comprobante_id = $1', [id]);
      if (act.tipo === '07' && aceptado && MOTIVOS_NC_TOTALES.includes(act.motivoNota))
        await c.query('UPDATE consumos SET comprobante_id = NULL WHERE comprobante_id = $1', [act.referenciaId]);
      await this.bitacora.registrar({ accion: `comprobante.${res.estado.toLowerCase()}`, entidad: 'reserva', entidadId: act.codigoReserva,
        descripcion: `${nombre(act)}: ${res.mensaje}`.slice(0, 500), autor: { nombre: `OSE ${k.proveedor}` } }, c);
      if (aceptado && act.clienteEmail)
        await this.correos.encolar({ tipo: 'comprobante', para: act.clienteEmail, reservaId: act.reservaId,
          ...comprobanteEmitido({ ...act, enlacePdf: res.enlacePdf ?? act.enlacePdf, enlaceXml: res.enlaceXml ?? act.enlaceXml,
            modifica: ['07','08'].includes(act.tipo) ? `${TIPOS_COMPROBANTE[act.refTipo]} ${act.refSerie}-${act.refNumero}` : null,
            motivoNota: act.motivoNota ? (act.tipo === '08' ? MOTIVOS_NOTA_DEBITO : MOTIVOS_NOTA_CREDITO)[act.motivoNota] : null }) }, c);
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

  /** Comunicación de baja (hasta 7 días). Después de ese plazo, o si ya tiene notas de crédito, corresponde una nota de crédito. */
  async anular(id: number, motivo: string) {
    return this.db.transaccion(async c => {
    const k = await this.ver(id);
    if (!k) throw falla(404, 'Comprobante no encontrado.');
    await this.pagos.reservaBloqueada(c, {id:k.reservaId});
    const actual = await this.db.uno<any>(`${SQL_COMPROBANTE} WHERE k.id = $1 FOR UPDATE OF k`, [id], c);
    Object.assign(k, actual);
    if (['07','08'].includes(k.tipo)) throw falla(409, 'Las notas no se dan de baja desde el sistema.');
    if (!['Aceptado', 'Observado'].includes(k.estado) || k.anuladoConNotaId) throw falla(409, `Solo se anulan comprobantes aceptados y vigentes (estado actual: «${k.estado}»).`);
    if (k.disponibleNota < k.total - 0.005) throw falla(409, 'El comprobante ya tiene notas de crédito: emite otra nota de crédito en lugar de darlo de baja.');
    if (k.tieneDebito) throw falla(409, 'El comprobante tiene notas de débito y no se puede dar de baja desde este flujo.');
    if (diasEntre(k.fechaEmision, hoyLima()) > DIAS_PARA_BAJA) throw falla(409, `Pasaron más de ${DIAS_PARA_BAJA} días desde la emisión: corresponde emitir una nota de crédito.`);
    const prov = proveedor(k.proveedor);
    if (!prov) throw falla(503, `El proveedor ${k.proveedor} no está disponible en este entorno.`);
    let r;
    try { r = await prov.anular(this.documento(k), motivo); }
    catch (e: any) { throw falla(502, e instanceof ErrorOse ? e.message : 'No se pudo comunicar la baja al OSE.'); }
      const x = await c.query(`UPDATE comprobantes SET estado = 'Anulado', motivo_anulacion = $2, fecha_anulacion = now() WHERE id = $1 AND estado IN ('Aceptado','Observado')`, [id, motivo]);
      if (!x.rowCount) throw falla(409, 'El comprobante cambió de estado mientras tanto.');
      await c.query('UPDATE consumos SET comprobante_id = NULL WHERE comprobante_id = $1', [id]);
      await this.bitacora.registrar({ accion: 'comprobante.anular', entidad: 'reserva', entidadId: k.codigoReserva,
        descripcion: `${nombre(k)} anulada. Motivo: ${motivo}`, datos: { comprobanteId: id, respuesta: r.mensaje } }, c);
    return { id, mensaje: `${nombre(k)} anulada. ${r.mensaje}` };
    });
  }

  ver(id: number) {
    return this.db.uno<any>(`${SQL_COMPROBANTE} WHERE k.id = $1`, [id]);
  }

  /** Comprobante vigente (boleta o factura) de una reserva, si lo hay. */
  vigenteDeReserva(reservaId: number, c?: PoolClient) {
    return this.db.uno<any>(`${SQL_COMPROBANTE} WHERE k.reserva_id = $1 AND ${SQL_VIGENTE}`, [reservaId], c);
  }

  /** Registro de ventas: las notas de crédito aceptadas restan. */
  async listar(desde?: string, hasta?: string, estado?: string) {
    const h = hasta || hoyLima(), d = desde || sumarDias(h, -29);
    if (h < d) throw falla(400, 'La fecha final debe ser posterior a la inicial.', 'hasta');
    const p: unknown[] = [d, h];
    if (estado) p.push(estado);
    const lista = await this.db.query<any>(`${SQL_COMPROBANTE}
      WHERE k.fecha_emision BETWEEN $1 AND $2 ${estado ? 'AND k.estado = $3' : ''} ORDER BY k.fecha_emision DESC, k.id DESC`, p);
    const validos = lista.filter(k => k.estado === 'Aceptado' || k.estado === 'Observado');
    const suma = (f: (k: any) => number) => redondear(validos.reduce((s, k) => s + (k.tipo === '07' ? -1 : 1) * f(k), 0));
    return { desde: d, hasta: h, ...this.estado(), comprobantes: lista.map(({ items, respuesta, cadenaQr, hash, ...k }) => k),
      totales: { cantidad: validos.filter(k => ['01','03'].includes(k.tipo)).length, notas: validos.filter(k => k.tipo === '07').length, debitos: validos.filter(k => k.tipo === '08').length,
        gravada: suma(k => k.gravada), exportacion: suma(k => k.exportacion), igv: suma(k => k.igv), total: suma(k => k.total),
        pendientes: lista.filter(k => k.estado === 'Pendiente').length, rechazados: lista.filter(k => k.estado === 'Rechazado').length } };
  }
}
