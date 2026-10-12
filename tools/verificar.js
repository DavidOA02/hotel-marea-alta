#!/usr/bin/env node
/* Verifica el entorno antes de «npm run dev». Nunca bloquea: solo informa. */
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const RAIZ = path.resolve(__dirname, '..');
const c = { ok: '\x1b[32m', err: '\x1b[31m', av: '\x1b[33m', b: '\x1b[1m', x: '\x1b[0m' };
const ok = (t, d = '') => console.log(`  ${c.ok}✓${c.x} ${t} ${d}`);
const mal = (t, ...p) => { console.log(`  ${c.err}✗ ${t}${c.x}`); p.forEach(x => console.log(`      → ${x}`)); };
const puertoAbierto = (host, port) => new Promise(r => { const s = net.connect({ host, port, timeout: 1500 }, () => { s.end(); r(true); }); s.on('error', () => r(false)); s.on('timeout', () => { s.destroy(); r(false); }); });

(async () => {
  console.log(`\n${c.b}Hotel Marea Alta · verificación del entorno${c.x}`);
  const [M, m] = process.versions.node.split('.').map(Number);
  M > 20 || (M === 20 && m >= 9) ? ok('Node.js', process.versions.node) : mal(`Node.js ${process.versions.node}: Next.js 16 necesita 20.9 o superior`, 'winget install OpenJS.NodeJS.LTS');
  fs.existsSync(path.join(RAIZ, 'node_modules')) ? ok('Dependencias instaladas') : mal('Faltan dependencias', 'npm install');
  fs.existsSync(path.join(RAIZ, 'packages/shared/dist/index.js')) ? ok('Paquete compartido compilado') : mal('Falta compilar @marea/shared', 'npm run build -w @marea/shared');
  const env = {};
  if (fs.existsSync(path.join(RAIZ, 'apps/api/.env'))) for (const l of fs.readFileSync(path.join(RAIZ, 'apps/api/.env'), 'utf8').split(/\r?\n/)) { const x = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/); if (x) env[x[1]] = x[2].trim(); }
  else mal('Falta apps/api/.env', 'node tools/preparar-env.js');
  const host = env.PGHOST || 'localhost', port = Number(env.PGPORT || 5432);
  if (await puertoAbierto(host, port)) {
    ok('PostgreSQL responde', `en ${host}:${port}`);
    // ¿La base tiene las tablas de 03_mejoras.sql (bitácora, correos, comprobantes…)?
    try {
      const { Client } = require(require.resolve('pg', { paths: [path.join(RAIZ, 'apps/api')] }));
      const cl = new Client({ host, port, user: env.PGUSER || 'postgres', password: env.PGPASSWORD ?? 'postgres', database: env.PGDATABASE || 'hotel_marea_alta', connectionTimeoutMillis: 3000 });
      await cl.connect();
      const { rows } = await cl.query(`SELECT to_regclass('public.reservas') IS NOT NULL AS base, to_regclass('public.bitacora') IS NOT NULL AND to_regclass('public.devoluciones') IS NOT NULL AND to_regclass('public.encuestas') IS NOT NULL AS mejoras`);
      await cl.end();
      if (!rows[0].base) mal('La base de datos está vacía', 'npm run db:demo');
      else rows[0].mejoras ? ok('Base de datos al día', '(bitácora, correos, pagos, devoluciones, facturación y encuestas)') : mal('A la base le faltan las tablas de las mejoras', 'npm run db:migrar   (no borra datos)');
    } catch { /* sin acceso a la base: npm run db lo resuelve */ }
  } else mal(`PostgreSQL no responde en ${host}:${port}`, 'Instálalo (winget install PostgreSQL.PostgreSQL.17) o inicia su servicio', 'Luego: npm run db:demo');
  for (const [p, n] of [[4000, 'API'], [3000, 'web']]) if (await puertoAbierto('127.0.0.1', p)) mal(`El puerto ${p} (${n}) ya está en uso`, '¿Tienes otra ventana con «npm run dev» abierta?');
  console.log('');
})();
