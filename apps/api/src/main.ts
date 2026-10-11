import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/** Carga apps/api/.env (sin dependencias extra). Las variables del sistema tienen prioridad. */
function cargarEnv() {
  const archivo = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !linea.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function iniciar() {
  cargarEnv();
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (process.env.CORS_ORIGENES || 'http://localhost:3000,http://127.0.0.1:3000').split(',').map(s => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization']
  });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const puerto = Number(process.env.PUERTO || 4000);
  await app.listen(puerto);
  new Logger('API').log(`Hotel Marea Alta API en http://localhost:${puerto}/api  (salud: /api/salud)`);
}
iniciar();
