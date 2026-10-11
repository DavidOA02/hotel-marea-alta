#!/usr/bin/env node
/* ==========================================================
   HOTEL MAREA ALTA — Configuración de PostgreSQL
   Uso:  npm run db         crea la base hotel_marea_alta (BORRA la anterior)
         npm run db:demo    además carga ~15 meses de datos de demostración
   Usa los datos de apps/api/.env (PGHOST, PGPORT, PGUSER, PGPASSWORD).
   Si la contraseña no funciona, la pide y la guarda en el .env.
   ========================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require(require.resolve('pg', { paths: [path.resolve(__dirname, '../apps/api')] }));

const RAIZ = path.resolve(__dirname, '..');
const ENV = path.join(RAIZ, 'apps/api/.env');
const demo = process.argv.includes('--demo');
const c = { ok: '\x1b[32m', err: '\x1b[31m', av: '\x1b[33m', b: '\x1b[1m', dim: '\x1b[2m', x: '\x1b[0m' };

function leerEnv() {
  if (!fs.existsSync(ENV)) fs.copyFileSync(path.join(RAIZ, 'apps/api/.env.ejemplo'), ENV);
  const v = {};
  for (const l of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/); if (m) v[m[1]] = m[2].trim(); }
  return v;
}
function escribirEnv(clave, valor) {
  let t = fs.readFileSync(ENV, 'utf8');
  t = new RegExp(`^${clave}=.*$`, 'm').test(t) ? t.replace(new RegExp(`^${clave}=.*$`, 'm'), `${clave}=${valor}`) : t + `\n${clave}=${valor}\n`;
  fs.writeFileSync(ENV, t);
}
const preguntar = q => new Promise(r => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, a => { rl.close(); r(a); }); });

async function conectar(cfg, db) { const cl = new Client({ ...cfg, database: db, connectionTimeoutMillis: 5000 }); await cl.connect(); return cl; }

(async () => {
  console.log(`\n${c.b}Hotel Marea Alta · configuración de PostgreSQL${c.x}\n`);
  const env = leerEnv();
  const cfg = { host: env.PGHOST || 'localhost', port: Number(env.PGPORT || 5432), user: env.PGUSER || 'postgres', password: env.PGPASSWORD ?? 'postgres' };
  const base = env.PGDATABASE || 'hotel_marea_alta';
  let admin;
  for (let intento = 0; ; intento++) {
    try { admin = await conectar(cfg, 'postgres'); break; }
    catch (e) {
      if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || /timeout/i.test(e.message)) {
        console.log(`${c.err}✗ No hay un PostgreSQL respondiendo en ${cfg.host}:${cfg.port}.${c.x}`);
        console.log('  → Instálalo:  winget install PostgreSQL.PostgreSQL.17   (o desde https://www.postgresql.org/download/windows/)');
        console.log('  → Si ya está instalado, inicia el servicio «postgresql-x64-…» en services.msc.');
        process.exit(1);
      }
      if (e.code === '28P01' && intento < 3) {
        cfg.password = await preguntar(`${c.av}La contraseña de «${cfg.user}» no es correcta.${c.x} Escribe la que pusiste al instalar PostgreSQL: `);
        continue;
      }
      console.log(`${c.err}✗ ${e.message}${c.x}`); process.exit(1);
    }
  }
  console.log(`  ${c.ok}✓${c.x} Conectado a PostgreSQL ${(await admin.query('SHOW server_version')).rows[0].server_version} en ${cfg.host}:${cfg.port}`);
  if (cfg.password !== env.PGPASSWORD) { escribirEnv('PGPASSWORD', cfg.password); console.log(`  ${c.ok}✓${c.x} Contraseña guardada en apps/api/.env`); }

  await admin.query(`DROP DATABASE IF EXISTS ${base} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${base} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  console.log(`  ${c.ok}✓${c.x} Base de datos «${base}» creada`);

  const db = await conectar(cfg, base);
  for (const [archivo, texto] of [['01_esquema.sql', 'Tablas, 24 habitaciones, usuarios y vistas de Power BI'], ...(demo ? [['02_datos_demo.sql', 'Datos de demostración (15 meses)']] : [])]) {
    process.stdout.write(`  … ${texto}`);
    try { await db.query(fs.readFileSync(path.join(RAIZ, 'database', archivo), 'utf8')); process.stdout.write(`\r  ${c.ok}✓${c.x} ${texto}   \n`); }
    catch (e) { console.log(`\n${c.err}✗ Error en ${archivo}: ${e.message}${c.x}`); if (/btree_gist/.test(e.message)) console.log('  → El usuario necesita permiso para crear extensiones (usa «postgres»).'); process.exit(1); }
  }
  const r = (await db.query('SELECT (SELECT count(*) FROM habitaciones) h, (SELECT count(*) FROM reservas) r, (SELECT count(*) FROM usuarios) u')).rows[0];
  await db.end();
  console.log(`\n${c.ok}${c.b}Listo.${c.x} ${r.h} habitaciones · ${r.r} reservas · ${r.u} usuarios.`);
  console.log(`Ahora ejecuta ${c.b}npm run dev${c.x} y abre http://localhost:3000  ·  Panel: http://localhost:3000/panel`);
  console.log(`${c.dim}Usuarios: admin@mareaalta.pe / Admin2026!  ·  recepcion@mareaalta.pe / Recepcion2026!  (cambian la contraseña al ingresar)${c.x}\n`);
})().catch(e => { console.error(e); process.exit(1); });
