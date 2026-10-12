import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DIAS_RECORDATORIO, hoyLima, sumarDias } from '@marea/shared';
import { Db } from '../db/db.service';
import { ReservasService, SQL_RESERVA } from '../reservas/reservas.service';
import { Correos } from './correos.service';
import { encuestaEstadia, recordatorioLlegada } from './plantillas';

/**
 * Correos programados (cada 30 minutos):
 * · Recordatorio a los huéspedes que llegan en 1 o 2 días (si reservaron con más de un día de anticipación).
 * · Encuesta de satisfacción entre 2 horas y 3 días después del check-out.
 * Un índice único en la base garantiza uno solo por reserva, aunque corran varias instancias de la API.
 */
@Injectable()
export class CorreosProgramados implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Correos programados');
  private reloj?: NodeJS.Timeout;
  private inicio?: NodeJS.Timeout;
  private enCurso: Promise<{ recordatorios: number; encuestas: number }> | null = null;
  private cerrado = false;
  constructor(private readonly db: Db, private readonly correos: Correos) {}

  onModuleInit() {
    if (process.env.PROCESOS_EN_SEGUNDO_PLANO === 'false' || process.env.CORREOS_PROGRAMADOS === 'false') return;
    this.inicio = setTimeout(() => this.ejecutar(), 60_000); this.inicio.unref();
    this.reloj = setInterval(() => this.ejecutar(), 30 * 60_000); this.reloj.unref();
  }
  async onModuleDestroy() { this.cerrado = true; clearTimeout(this.inicio); clearInterval(this.reloj); await this.enCurso?.catch(() => undefined); }

  ejecutar() {
    if (this.cerrado) return Promise.resolve({ recordatorios: 0, encuestas: 0 });
    this.enCurso ??= (async () => {
      const r = { recordatorios: await this.recordatorios(), encuestas: await this.encuestas() };
      if (r.recordatorios || r.encuestas) this.log.log(`Encolados: ${r.recordatorios} recordatorio(s) y ${r.encuestas} encuesta(s)`);
      return r;
    })().catch(e => { if (!this.cerrado) this.log.error(e.message); return { recordatorios: 0, encuestas: 0 }; }).finally(() => { this.enCurso = null; });
    return this.enCurso;
  }

  private async recordatorios() {
    const hoy = hoyLima();
    const lista = await this.db.query<any>(`${SQL_RESERVA}
      WHERE r.estado = 'Confirmada' AND r.fecha_entrada BETWEEN $1 AND $2 AND r.fecha_reserva < now() - interval '1 day'
        AND NOT EXISTS (SELECT 1 FROM correos k WHERE k.reserva_id = r.id AND k.tipo = 'recordatorio')`, [sumarDias(hoy, 1), sumarDias(hoy, DIAS_RECORDATORIO)]);
    let n = 0;
    for (const r of lista) {
      if (this.cerrado) break;
      if (await this.correos.encolar({ tipo: 'recordatorio', para: r.email, reservaId: r.id, ...recordatorioLlegada(r, ReservasService.puedePagarEnLinea(r)) })) n++;
    }
    return n;
  }

  private async encuestas() {
    const lista = await this.db.query<any>(`${SQL_RESERVA}
      WHERE r.estado = 'CheckOut' AND r.fecha_check_out BETWEEN now() - interval '3 days' AND now() - interval '2 hours'
        AND NOT EXISTS (SELECT 1 FROM encuestas e WHERE e.reserva_id = r.id)`);
    let n = 0;
    for (const r of lista) {
      if (this.cerrado) break;
      const ok = await this.db.transaccion(async c => {
        const e = await this.db.uno<{ token: string }>('INSERT INTO encuestas (reserva_id) VALUES ($1) ON CONFLICT (reserva_id) DO NOTHING RETURNING token', [r.id], c);
        return !!e && !!(await this.correos.encolar({ tipo: 'encuesta', para: r.email, reservaId: r.id, ...encuestaEstadia(r, e.token) }, c));
      });
      if (ok) n++;
    }
    return n;
  }
}
