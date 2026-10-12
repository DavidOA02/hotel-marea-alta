import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { cargarEnv, facturadorActivo, pasarelaActiva } from './config/env';

async function iniciar() {
  cargarEnv();
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (process.env.CORS_ORIGENES || 'http://localhost:3000,http://127.0.0.1:3000').split(',').map(s => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization']
  });
  // Proxies de confianza para la IP real (TRUST_PROXY: número de saltos, false o lista de IP/subredes). Por defecto, uno.
  const proxy = (process.env.TRUST_PROXY ?? '1').trim();
  app.getHttpAdapter().getInstance().set('trust proxy', proxy === 'false' ? false : /^\d+$/.test(proxy) ? Number(proxy) : proxy);
  const puerto = Number(process.env.PUERTO || 4000);
  await app.listen(puerto);
  const log = new Logger('API');
  log.log(`Hotel Marea Alta API en http://localhost:${puerto}/api  (salud: /api/salud)`);
  log.log(`Pagos en línea: ${pasarelaActiva() ?? 'desactivados'} · Facturación electrónica: ${facturadorActivo() ?? 'desactivada'} · Correos: ${process.env.SMTP_HOST ? 'SMTP ' + process.env.SMTP_HOST : 'modo simulado (sin SMTP_HOST)'}`);
}
iniciar();
