import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { cargarEnv } from '../src/config/env';

const nombreValido = /^hotel_marea_alta_e2e_[a-f0-9]{32}$/;
type Configuracion = { host: string; port: number; user: string; password: string };
// Jest comparte globalThis entre globalSetup y globalTeardown, pero no con los workers.
const estado = globalThis as typeof globalThis & { mareaBaseE2e?: { nombre: string; cfg: Configuracion } };

export function comprobarBaseE2e(nombre: string | undefined): string {
  if (!nombre || !nombreValido.test(nombre)) throw new Error('Falta la base aislada creada por el preparador e2e.');
  return nombre;
}

export function configuracionLocal(env: NodeJS.ProcessEnv): Configuracion {
  const host = env.PGHOST || 'localhost';
  const port = Number(env.PGPORT || 5432);
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || env.SSH_HOST || env.PGSSL === 'true' || env.NODE_ENV === 'production')
    throw new Error('Las e2e requieren PostgreSQL local, sin túnel SSH, SSL ni entorno de producción.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Puerto PostgreSQL de pruebas no válido.');
  return { host, port, user: env.PGUSER || 'postgres', password: env.PGPASSWORD || 'postgres' };
}

/** Solo elimina una base cuyo CREATE DATABASE terminó correctamente en esta ejecución. */
export async function limpiarBd() {
  const propia = estado.mareaBaseE2e;
  if (!propia) return;
  const nombre = comprobarBaseE2e(propia.nombre);
  const admin = new Client({ ...propia.cfg, database: 'postgres' });
  try {
    await admin.connect();
    await admin.query(`DROP DATABASE "${nombre}"`); // Sin FORCE: no interrumpe conexiones ajenas.
    delete estado.mareaBaseE2e;
  } finally {
    await admin.end();
  }
}

/** Crea una base nueva por ejecución; nunca reemplaza una base existente. */
export default async function prepararBd() {
  cargarEnv();
  const cfg = configuracionLocal(process.env);
  if (estado.mareaBaseE2e) throw new Error('Ya hay una base e2e creada por esta ejecución.');
  const nombre = comprobarBaseE2e(`hotel_marea_alta_e2e_${randomUUID().replace(/-/g, '')}`);
  const admin = new Client({ ...cfg, database: 'postgres' });
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${nombre}" ENCODING 'UTF8' TEMPLATE template0`);
    estado.mareaBaseE2e = { nombre, cfg };
  } finally {
    await admin.end();
  }
  const db = new Client({ ...cfg, database: nombre });
  try {
    await db.connect();
    for (const archivo of ['01_esquema.sql', '03_mejoras.sql']) await db.query(fs.readFileSync(path.resolve(__dirname, '../../../database', archivo), 'utf8'));
  } catch (error) {
    await db.end();
    await limpiarBd();
    throw error;
  }
  await db.end();
  process.env.MAREA_E2E_BD = nombre;
  process.env.PGDATABASE = nombre;
}
