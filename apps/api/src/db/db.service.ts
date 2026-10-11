import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, types } from 'pg';
import { abrirTunelSsh } from './tunel-ssh';

// numeric → number, bigint (count) → number, date → 'AAAA-MM-DD' (sin desfase de zona horaria)
types.setTypeParser(1700, v => parseFloat(v));
types.setTypeParser(20, v => parseInt(v, 10));
types.setTypeParser(1082, v => v);

/** snake_case → camelCase para devolver JSON uniforme a la web. */
const aCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
export function camelizar<T = any>(fila: Record<string, any>): T {
  const o: Record<string, any> = {};
  for (const k of Object.keys(fila)) o[aCamel(k)] = fila[k];
  return o as T;
}

export type Ejecutor = Pick<PoolClient, 'query'>;

@Injectable()
export class Db implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger('PostgreSQL');
  private pool!: Pool;
  private cerrarTunel?: () => void;

  async onModuleInit() {
    let host = process.env.PGHOST || 'localhost';
    let port = Number(process.env.PGPORT || 5432);
    if (process.env.SSH_HOST) {
      const t = await abrirTunelSsh({
        host: process.env.SSH_HOST, puerto: Number(process.env.SSH_PUERTO || 22), usuario: process.env.SSH_USUARIO || 'root',
        llave: process.env.SSH_LLAVE, clave: process.env.SSH_CLAVE, destinoHost: host, destinoPuerto: port
      });
      this.cerrarTunel = t.cerrar;
      host = '127.0.0.1';
      port = t.puertoLocal;
    }
    this.pool = new Pool({
      host, port,
      database: process.env.PGDATABASE || 'hotel_marea_alta',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      max: 10,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
    this.pool.on('error', e => this.log.error(e.message));
  }

  /** Se cierra al final (después de onModuleDestroy), cuando los procesos en segundo plano ya terminaron su lote. */
  async onApplicationShutdown() {
    await this.pool?.end();
    this.cerrarTunel?.();
  }

  /** Ejecuta una consulta y devuelve las filas en camelCase. */
  async query<T = any>(sql: string, params: unknown[] = [], ejecutor?: Ejecutor): Promise<T[]> {
    const r = await (ejecutor ?? this.pool).query(sql, params);
    return r.rows.map(f => camelizar<T>(f));
  }

  async uno<T = any>(sql: string, params: unknown[] = [], ejecutor?: Ejecutor): Promise<T | null> {
    return (await this.query<T>(sql, params, ejecutor))[0] ?? null;
  }

  /** Transacción: COMMIT si todo sale bien, ROLLBACK si hay error. */
  async transaccion<T>(fn: (c: PoolClient) => Promise<T>, aislamiento = 'READ COMMITTED'): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query(`BEGIN ISOLATION LEVEL ${aislamiento}`);
      const res = await fn(c);
      await c.query('COMMIT');
      return res;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  async disponible(): Promise<boolean> {
    try { await this.pool.query('SELECT 1'); return true; } catch { return false; }
  }
}
