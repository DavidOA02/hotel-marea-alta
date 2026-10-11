import { Injectable, Logger } from '@nestjs/common';
import { contexto } from '../comun/contexto';
import { Db, Ejecutor } from '../db/db.service';

export interface Evento {
  accion: string; entidad: string; entidadId?: string | number | null; descripcion: string; datos?: unknown;
  /** Autor cuando no hay sesión (login, huésped en la web, pasarela, sistema). */
  autor?: { id?: number | null; nombre: string };
}

/** Campos que cambiaron entre dos versiones de un registro: { campo: { antes, despues } }. */
export function cambios(antes: Record<string, any>, despues: Record<string, any>, campos = Object.keys(despues)) {
  const r: Record<string, { antes: unknown; despues: unknown }> = {};
  for (const k of campos) {
    const a = antes?.[k] ?? null, d = despues?.[k] ?? null;
    if (String(a) !== String(d)) r[k] = { antes: a, despues: d };
  }
  return r;
}

/** Bitácora de auditoría (solo inserción; la base rechaza UPDATE y DELETE). */
@Injectable()
export class Bitacora {
  private readonly log = new Logger('Bitácora');
  constructor(private readonly db: Db) {}

  /** Con `c` se guarda en la misma transacción que la operación: si una falla, no queda ninguna. */
  async registrar(e: Evento, c?: Ejecutor) {
    const ctx = contexto.getStore();
    const u = ctx?.usuario;
    const id = e.autor ? e.autor.id ?? null : u?.id ?? null;
    const nombre = e.autor?.nombre ?? (u ? `${u.nombre} (${u.rol})` : 'Huésped (web)');
    await this.db.query(`INSERT INTO bitacora (usuario_id, usuario, accion, entidad, entidad_id, descripcion, datos, ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, nombre.slice(0, 150), e.accion, e.entidad, e.entidadId == null ? null : String(e.entidadId), e.descripcion.slice(0, 500),
        e.datos === undefined ? null : JSON.stringify(e.datos), ctx?.ip ?? null], c);
  }

  /** Para eventos que no deben hacer fallar la operación (p. ej. un login fallido). */
  registrarSinFallar(e: Evento) {
    return this.registrar(e).catch(err => this.log.error(`No se pudo registrar «${e.accion}»: ${err.message}`));
  }
}
