import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { Db, Ejecutor } from '../db/db.service';
import type { Mensaje } from './plantillas';

export type TipoCorreo = 'confirmacion' | 'cancelacion' | 'pago' | 'reclamo_constancia' | 'reclamo_respuesta' | 'comprobante';
const MAX_INTENTOS = 5;
const ESPERAS_MIN = [1, 5, 15, 60];   // reintentos: 1 min, 5 min, 15 min, 1 h

/**
 * Correos automáticos con bandeja de salida (tabla «correos»).
 * La operación guarda el correo en su misma transacción y un proceso lo envía después por SMTP,
 * así un servidor de correo caído nunca hace fallar una reserva. Sin SMTP_HOST, se marcan como «Simulado».
 */
@Injectable()
export class Correos implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Correos');
  private transporte: Transporter | null = null;
  private reloj?: NodeJS.Timeout;
  private pronto?: NodeJS.Timeout;
  private enCurso: Promise<number> | null = null;
  private cerrado = false;
  constructor(private readonly db: Db) {}

  onModuleInit() {
    const e = process.env;
    if (e.SMTP_HOST) {
      const puerto = Number(e.SMTP_PUERTO || 587);
      this.transporte = createTransport({ host: e.SMTP_HOST, port: puerto, secure: puerto === 465, connectionTimeout: 15_000, socketTimeout: 30_000,
        auth: e.SMTP_USUARIO ? { user: e.SMTP_USUARIO, pass: e.SMTP_CLAVE } : undefined });
    } else if (e.NODE_ENV === 'production') this.log.warn('SMTP_HOST no está definido: los correos se registran como «Simulado» y NO se envían.');
    if (this.automatico()) { this.reloj = setInterval(() => this.procesar(), 30_000); this.reloj.unref(); }
  }

  async onModuleDestroy() {
    this.cerrado = true;
    clearInterval(this.reloj); clearTimeout(this.pronto);
    await this.enCurso?.catch(() => undefined);
  }

  private automatico() { return process.env.PROCESOS_EN_SEGUNDO_PLANO !== 'false'; }

  /** Guarda un correo en la bandeja. Con `c` queda dentro de la transacción de la operación. */
  async encolar(m: Mensaje & { tipo: TipoCorreo; para: string; reservaId?: number | null; reclamacionId?: number | null }, c?: Ejecutor) {
    const r = await this.db.uno<{ id: number }>(`INSERT INTO correos (tipo, para, asunto, html, texto, reserva_id, reclamacion_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [m.tipo, m.para, m.asunto.slice(0, 200), m.html, m.texto, m.reservaId ?? null, m.reclamacionId ?? null], c);
    this.programar();
    return r!.id;
  }

  /** Procesa la bandeja en unos milisegundos (después del COMMIT de la operación que encoló). */
  private programar() {
    if (!this.automatico() || this.cerrado) return;
    clearTimeout(this.pronto);
    this.pronto = setTimeout(() => this.procesar(), 400);
    this.pronto.unref();
  }

  /** Envía los correos pendientes. Varias instancias de la API pueden procesar a la vez (SKIP LOCKED). */
  procesar(): Promise<number> {
    if (this.cerrado) return Promise.resolve(0);
    this.enCurso ??= this.procesarLotes().finally(() => { this.enCurso = null; });
    return this.enCurso;
  }

  private async procesarLotes() {
    let n = 0;
    try {
      while (!this.cerrado) {
        // Reserva el lote: si la API se cae a mitad del envío, vuelven a la cola en 10 minutos
        const lote = await this.db.query<{ id: number; para: string; asunto: string; html: string; texto: string; intentos: number }>(`
          UPDATE correos SET intentos = intentos + 1, proximo_intento = now() + interval '10 minutes'
          WHERE id IN (SELECT id FROM correos WHERE estado = 'Pendiente' AND proximo_intento <= now() ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED)
          RETURNING id, para, asunto, html, texto, intentos`);
        if (!lote.length) break;
        for (const m of lote) { await this.enviar(m); n++; }
      }
    } catch (e: any) {
      if (!this.cerrado) this.log.error(`Bandeja de correos: ${e.message}`);
    }
    return n;
  }

  private async enviar(m: { id: number; para: string; asunto: string; html: string; texto: string; intentos: number }) {
    if (!this.transporte) {
      await this.db.query(`UPDATE correos SET estado = 'Simulado', fecha_envio = now(), error = NULL WHERE id = $1`, [m.id]);
      this.log.log(`(simulado, sin SMTP) «${m.asunto}» → ${m.para}`);
      return;
    }
    try {
      const info = await this.transporte.sendMail({
        from: process.env.CORREO_REMITENTE || 'Hotel Marea Alta <reservas@mareaalta.pe>', replyTo: process.env.CORREO_RESPONDER_A || undefined,
        to: m.para, subject: m.asunto, html: m.html, text: m.texto
      });
      await this.db.query(`UPDATE correos SET estado = 'Enviado', fecha_envio = now(), error = NULL, id_mensaje = $2 WHERE id = $1`, [m.id, String(info.messageId ?? '').slice(0, 250)]);
    } catch (e: any) {
      const final = m.intentos >= MAX_INTENTOS;
      await this.db.query(`UPDATE correos SET estado = $2, error = $3, proximo_intento = now() + make_interval(mins => $4) WHERE id = $1`,
        [m.id, final ? 'Fallido' : 'Pendiente', String(e?.message ?? e).slice(0, 500), ESPERAS_MIN[m.intentos - 1] ?? 60]);
      this.log.warn(`No se pudo enviar «${m.asunto}» a ${m.para} (intento ${m.intentos}/${MAX_INTENTOS}): ${e?.message}`);
    }
  }

  /** Vuelve a poner en la cola un correo fallido. */
  async reintentar(id: number) {
    const r = await this.db.uno<{ id: number; para: string; asunto: string }>(`UPDATE correos SET estado = 'Pendiente', intentos = 0, proximo_intento = now(), error = NULL
      WHERE id = $1 AND estado = 'Fallido' RETURNING id, para, asunto`, [id]);
    if (r) this.programar();
    return r;
  }

  /** Correos de una reserva o de una hoja de reclamación (para el panel). */
  listar(filtro: { reservaId?: number; reclamacionId?: number }) {
    const [col, val] = filtro.reservaId ? ['reserva_id', filtro.reservaId] : ['reclamacion_id', filtro.reclamacionId];
    return this.db.query(`SELECT id, tipo, para, asunto, estado, intentos, error, fecha_creacion, fecha_envio FROM correos WHERE ${col} = $1 ORDER BY id`, [val]);
  }
}
