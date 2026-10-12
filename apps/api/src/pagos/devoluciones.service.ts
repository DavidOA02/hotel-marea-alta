import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { redondear } from '@marea/shared';
import { Db } from '../db/db.service';
import { falla } from '../comun/errores';
import { facturadorActivo } from '../config/env';
import { Bitacora } from '../auditoria/bitacora.service';
import { Correos } from '../correo/correos.service';
import { devolucionRealizada, soles } from '../correo/plantillas';
import { Facturacion } from '../facturacion/facturacion.service';
import { Culqi, ErrorDevolucionNoEnviada, ErrorPasarela, MercadoPago, Niubiz, ResultadoDevolucion, Simulada } from '../pagos-en-linea/pasarelas';
import { SQL_RESERVA } from '../reservas/reservas.service';
import { PagosService } from './pagos.service';

/** Pasarelas que devuelven por API; con efectivo o transferencia el hotel devuelve y lo registra aquí. */
const AUTOMATICAS = ['Culqi', 'MercadoPago', 'Niubiz', 'Simulada'];

/**
 * Devoluciones de dinero. Cuentan contra lo pagado de la reserva (pagado_neto) cuando están «Completada».
 * Con «reducirTotal» (descuento o noches no usadas) el total de la reserva baja; si ya hay boleta o factura aceptada,
 * la rebaja se documenta con una nota de crédito en la misma transacción.
 */
@Injectable()
export class Devoluciones implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Devoluciones');
  private reloj?: NodeJS.Timeout;
  private enCurso: Promise<void> | null = null;
  private cerrado = false;
  private cursorPendientes = 0;
  constructor(private readonly db: Db, private readonly pagos: PagosService, private readonly facturacion: Facturacion,
              private readonly bitacora: Bitacora, private readonly correos: Correos) {}

  onModuleInit() {
    if (process.env.PROCESOS_EN_SEGUNDO_PLANO !== 'false') {
      this.reloj = setInterval(() => this.consultarPendientes(), 5 * 60_000); this.reloj.unref();
    }
  }
  async onModuleDestroy() { this.cerrado = true; clearInterval(this.reloj); await this.enCurso?.catch(() => undefined); }
  private consultarPendientes() {
    if (this.cerrado || this.enCurso) return;
    this.enCurso = (async () => {
      const sql = `SELECT id FROM devoluciones WHERE estado = 'Pendiente' AND pasarela = 'Niubiz' AND medio = 'Pasarela' AND referencia_externa IS NOT NULL AND id > $1 ORDER BY id LIMIT 50`;
      let lista = await this.db.query<{id:number}>(sql, [this.cursorPendientes]);
      if (!lista.length && this.cursorPendientes) {
        this.cursorPendientes = 0;
        lista = await this.db.query<{id:number}>(sql, [this.cursorPendientes]);
      }
      for (const d of lista) {
        if (this.cerrado) break;
        this.cursorPendientes = d.id;
        await this.ejecutar(d.id);
      }
    })().catch(e=>this.log.error(e.message)).finally(()=>{this.enCurso=null;});
  }

  async devolver(pagoId: number, d: { monto: number; motivo: string; reducirTotal: boolean }, registradoPor: string) {
    const monto = redondear(d.monto);
    const { dev, nota, pago } = await this.db.transaccion(async c => {
      const p = await this.db.uno<any>(`SELECT p.id, p.reserva_id, p.monto_soles, p.metodo, p.referencia, p.pasarela, p.estado, r.codigo
        FROM pagos p JOIN reservas r ON r.id = p.reserva_id WHERE p.id = $1 FOR UPDATE OF p`, [pagoId], c);
      if (!p) throw falla(404, 'Pago no encontrado.');
      if (p.estado !== 'Aprobado') throw falla(409, 'Solo se devuelven pagos aprobados.');
      const { devuelto } = (await this.db.uno<{ devuelto: number }>(`SELECT coalesce(sum(monto), 0) AS devuelto FROM devoluciones WHERE pago_id = $1 AND estado <> 'Fallida'`, [pagoId], c))!;
      const disponible = redondear(p.montoSoles - devuelto);
      if (monto > disponible + 0.001) throw falla(409, `Del pago solo quedan ${soles(disponible)} por devolver.`, 'monto');

      // Descuento: con comprobante aceptado lo documenta una nota de crédito; sin comprobante se rebaja el total aquí
      let nota: any = null;
      if (d.reducirTotal) {
        const k = await this.facturacion.vigenteDeReserva(p.reservaId, c);
        if (k && !['Aceptado', 'Observado'].includes(k.estado)) throw falla(409, `La ${k.tipo === '01' ? 'factura' : 'boleta'} ${k.serie}-${k.numero} aún no fue aceptada por SUNAT: espera su respuesta para registrar el descuento.`);
        if (k) {
          if (!facturadorActivo()) throw falla(503, 'Hay un comprobante emitido y la facturación electrónica no está configurada para emitir la nota de crédito.');
          const total = monto >= redondear(k.disponibleNota) - 0.005;
          nota = await this.facturacion.registrarNota(c, k.id, { motivo: total ? '06' : '09', monto: total ? null : monto, sustento: d.motivo }, registradoPor);
          if (total) await this.pagos.ajustarTotal(c, p.reservaId, -monto);   // la nota 06 no rebaja la reserva por sí sola
        } else await this.pagos.ajustarTotal(c, p.reservaId, -monto);
      }

      const automatica = AUTOMATICAS.includes(p.pasarela);
      const dev = (await this.db.uno<any>(`INSERT INTO devoluciones (pago_id, reserva_id, monto, motivo, reduce_total, medio, pasarela, estado, mensaje, registrado_por, fecha_resultado)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [p.id, p.reservaId, monto, d.motivo, d.reducirTotal, automatica ? 'Pasarela' : 'Manual', p.pasarela, automatica ? 'Pendiente' : 'Completada',
          null, registradoPor, automatica ? null : new Date()], c))!;
      const origen = p.pasarela ? `en línea, ${p.pasarela}` : p.metodo;
      await this.bitacora.registrar({ accion: 'pago.devolver', entidad: 'reserva', entidadId: p.codigo,
        descripcion: `Devolución de ${soles(monto)} del pago de ${soles(p.montoSoles)} (${origen}) ${automatica ? `solicitada a ${p.pasarela}` : 'registrada'}${d.reducirTotal ? ' como descuento sobre el total' : ''}. Motivo: ${d.motivo}`.slice(0, 500),
        datos: { devolucionId: dev.id, pagoId: p.id, monto, reducirTotal: d.reducirTotal, notaCreditoId: nota?.id ?? null } }, c);
      if (!automatica) await this.avisar(c, dev, p);
      return { dev, nota, pago: p };
    });

    if (dev.medio === 'Pasarela') await this.ejecutar(dev.id);
    const notaFinal = nota ? await this.facturacion.enviarNota(nota.id) : null;
    const final = (await this.ver(dev.id))!;
    const textos: Record<string, string> = { Completada: 'completada', Pendiente: 'en proceso', Fallida: 'rechazada por la pasarela' };
    const avisos = [final.estado !== 'Completada' ? final.mensaje : null, notaFinal ? `${notaFinal.mensaje}${notaFinal.advertencia ? ' ' + notaFinal.advertencia : ''}` : null].filter(Boolean);
    return { ...final, notaCredito: notaFinal, mensaje: `Devolución de ${soles(monto)} ${final.medio === 'Manual' ? 'registrada' : textos[final.estado]}.`,
      advertencia: avisos.length ? avisos.join(' ') : null };
  }

  /** Pide la devolución a la pasarela. Sin respuesta, queda «Pendiente» para reintentar (Mercado Pago no duplica gracias a la clave de idempotencia). */
  private async ejecutar(id: number) {
    const d = await this.db.uno<any>(`SELECT d.*, p.referencia FROM devoluciones d JOIN pagos p ON p.id = d.pago_id WHERE d.id = $1`, [id]);
    if (!d || d.estado !== 'Pendiente' || d.medio !== 'Pasarela') return;
    let r: ResultadoDevolucion;
    try {
      if (d.pasarela === 'Niubiz') {
        if (d.referenciaExterna) {
          r = await Niubiz.consultarDevolucion(d.referenciaExterna);
          if (String(r.respuesta.transaccion) !== d.referencia || Math.abs(Number(r.respuesta.monto) - d.monto) > 0.001 || !Number.isFinite(r.respuesta.monto))
            throw new ErrorPasarela('La consulta Niubiz no coincide con la transacción y el monto de la devolución.');
        }
        else {
          // externalReferenceId identifica la solicitud, pero Niubiz no documenta idempotencia.
          // La marca se confirma ANTES del HTTP. Una respuesta perdida nunca provoca otro POST.
          const envio = await this.db.uno(`UPDATE devoluciones SET solicitud_enviada = true WHERE id = $1 AND solicitud_enviada = false AND estado = 'Pendiente' RETURNING id`, [id]);
          if (!envio) {
            await this.db.query(`UPDATE devoluciones SET mensaje = 'Solicitud ya enviada sin código confirmado. Verifica con Niubiz antes de registrar otra devolución.' WHERE id = $1 AND estado = 'Pendiente' AND referencia_externa IS NULL`, [id]);
            return;
          }
          r = await Niubiz.devolver(d.referencia, d.monto, `MA-DEV-${d.id}`, d.motivo);
        }
      } else r = d.pasarela === 'Culqi' ? await Culqi.devolver(d.referencia, d.monto)
        : d.pasarela === 'MercadoPago' ? await MercadoPago.devolver(d.referencia, d.monto, `marea-devolucion-${d.id}`)
        : await Simulada.devolver(d.id);
    } catch (e: any) {
      const m = e instanceof ErrorPasarela ? e.message : String(e?.message ?? e);
      this.log.error(`Devolución ${id}: ${m}`);
      if (d.pasarela === 'Niubiz' && e instanceof ErrorDevolucionNoEnviada) {
        // Solo se libera cuando sabemos que el POST de devolución nunca empezó.
        await this.db.query(`UPDATE devoluciones SET solicitud_enviada = false, mensaje = $2
          WHERE id = $1 AND estado = 'Pendiente' AND referencia_externa IS NULL`, [id, `Solicitud no enviada (${m}). Corrige la configuración o reintenta.`.slice(0,300)]);
        return;
      }
      await this.db.query(`UPDATE devoluciones SET mensaje = $2 WHERE id = $1 AND estado = 'Pendiente'`, [id, `Sin respuesta de la pasarela (${m}). Verifica en su panel antes de reintentar.`.slice(0, 300)]);
      return;
    }
    await this.db.transaccion(async c => {
      const x = await this.db.uno<any>(`UPDATE devoluciones SET estado = $2, referencia_externa = coalesce($3, referencia_externa), respuesta = $4, mensaje = $5,
        fecha_resultado = CASE WHEN $6 THEN now() END WHERE id = $1 AND estado = 'Pendiente' RETURNING *`,
        [id, r.estado, r.referencia, JSON.stringify(r.respuesta), r.mensaje.slice(0, 300), r.estado !== 'Pendiente'], c);
      if (!x || r.estado === 'Pendiente') return;
      const { codigo } = (await this.db.uno<{ codigo: string }>('SELECT codigo FROM reservas WHERE id = $1', [x.reservaId], c))!;
      await this.bitacora.registrar({ accion: r.estado === 'Completada' ? 'pago.devolucion_completada' : 'pago.devolucion_fallida', entidad: 'reserva', entidadId: codigo,
        descripcion: `Devolución de ${soles(x.monto)} ${r.estado === 'Completada' ? 'completada' : 'rechazada'} por ${d.pasarela}: ${r.mensaje}`.slice(0, 500), autor: { nombre: `Pasarela ${d.pasarela}` } }, c);
      if (r.estado === 'Completada') await this.avisar(c, x, { metodo: 'Tarjeta', pasarela: d.pasarela });
    });
  }

  private async avisar(c: any, dev: any, p: { metodo: string; pasarela: string | null }) {
    const r = (await this.db.uno<any>(SQL_RESERVA + ' WHERE r.id = $1', [dev.reservaId], c))!;
    await this.correos.encolar({ tipo: 'devolucion', para: r.email, reservaId: r.id,
      ...devolucionRealizada(r, { monto: dev.monto, medio: dev.medio, pasarela: p.pasarela, metodo: p.metodo, motivo: dev.motivo }) }, c);
  }

  async reintentar(id: number) {
    const d = await this.ver(id);
    if (!d) throw falla(404, 'Devolución no encontrada.');
    if (d.estado !== 'Pendiente' || d.medio !== 'Pasarela') throw falla(409, 'Solo se reintentan devoluciones pendientes de la pasarela.');
    await this.ejecutar(id);
    const act = (await this.ver(id))!;
    return { ...act, mensaje: act.estado === 'Completada' ? 'Devolución completada.' : act.estado === 'Fallida' ? 'La pasarela rechazó la devolución.' : 'La pasarela aún no confirma la devolución.',
      advertencia: act.estado !== 'Completada' ? act.mensaje : null };
  }

  /** Recupera el código confirmado en Niubiz cuando se perdió la respuesta del registro. */
  async conciliarNiubiz(id: number, codigo: string) {
    const d = await this.db.uno<any>(`SELECT d.*, p.referencia FROM devoluciones d JOIN pagos p ON p.id = d.pago_id WHERE d.id = $1`, [id]);
    if (!d || d.pasarela !== 'Niubiz' || d.medio !== 'Pasarela' || d.estado !== 'Pendiente' || !d.solicitudEnviada || d.referenciaExterna)
      throw falla(409, 'Solo se concilian solicitudes Niubiz pendientes sin código confirmado.');
    const r = await Niubiz.consultarDevolucion(codigo);
    if (String(r.respuesta.transaccion) !== d.referencia || Number(r.respuesta.monto) !== d.monto)
      throw falla(409, 'El código no corresponde a la transacción y al monto de esta devolución.');
    await this.db.transaccion(async c => {
      const act = await c.query(`UPDATE devoluciones SET referencia_externa = $2 WHERE id = $1 AND estado = 'Pendiente' AND referencia_externa IS NULL RETURNING reserva_id`, [id,codigo]);
      if (!act.rowCount) throw falla(409, 'La devolución cambió mientras se consultaba.');
      const { codigo:reserva } = (await this.db.uno<any>('SELECT codigo FROM reservas WHERE id = $1', [d.reservaId], c))!;
      await this.bitacora.registrar({ accion:'pago.conciliar_niubiz', entidad:'reserva', entidadId:reserva, descripcion:`Código Niubiz ${codigo} asociado a la devolución ${id}.`, datos:{ devolucionId:id, codigo } }, c);
    });
    return this.reintentar(id);
  }

  ver(id: number) {
    return this.db.uno<any>(`SELECT d.*, r.codigo AS codigo_reserva FROM devoluciones d JOIN reservas r ON r.id = d.reserva_id WHERE d.id = $1`, [id]);
  }
}
