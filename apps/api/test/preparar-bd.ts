import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { cargarEnv } from '../src/config/env';

/** Crea desde cero la base de prueba hotel_marea_alta_test con el esquema real (01_esquema.sql + 03_mejoras.sql). */
export default async function prepararBd() {
  cargarEnv();   // contraseña de PostgreSQL desde apps/api/.env
  const cfg = { host: process.env.PGHOST || 'localhost', port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER || 'postgres', password: process.env.PGPASSWORD || 'postgres' };
  const admin = new Client({ ...cfg, database: 'postgres' });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS hotel_marea_alta_test WITH (FORCE)');
  await admin.query(`CREATE DATABASE hotel_marea_alta_test ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  const db = new Client({ ...cfg, database: 'hotel_marea_alta_test' });
  await db.connect();
  for (const archivo of ['01_esquema.sql', '03_mejoras.sql']) await db.query(fs.readFileSync(path.resolve(__dirname, '../../../database', archivo), 'utf8'));
  await db.end();
  process.env.PGDATABASE = 'hotel_marea_alta_test';
}
