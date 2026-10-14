#!/usr/bin/env node
/* Revisión local de sandbox: no conecta a PostgreSQL ni a ningún proveedor. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const PROVEEDORES = ['culqi', 'mercadopago', 'niubiz', 'nubefact'];
const ARCHIVO = path.resolve(__dirname, '../apps/api/.env.sandbox');
const AYUDA = 'Uso: node tools/sandbox-verificar.js --proveedor culqi|mercadopago|niubiz|nubefact [--archivo ruta] [--entorno]';

/** La API conserva las variables heredadas: no deben sustituir la configuración revisada. */
function verificarEntorno(env, heredado, archivo) {
  const errores = [];
  const relevantes = /^(?:PG[A-Z0-9_]*|JWT_.*|SMTP_.*|SSH_.*|CULQI_.*|MP_.*|NIUBIZ_.*|NUBEFACT_.*|SERIE_.*|HOTEL_.*|CORREO_.*|NODE_ENV|NODE_OPTIONS|API_ENV_ARCHIVO|API_URL_PUBLICA|WEB_URL|PUERTO|TRUST_PROXY|CORS_ORIGENES|PASARELA|FACTURACION|PROCESOS_EN_SEGUNDO_PLANO|CORREOS_PROGRAMADOS|SIN_LIMITES)$/;
  for (const [clave, valor] of Object.entries(heredado)) {
    // Windows trata los nombres de entorno sin distinguir mayúsculas.
    const nombre = process.platform === 'win32' ? clave.toUpperCase() : clave;
    if (!relevantes.test(nombre) && !Object.hasOwn(env, nombre)) continue;
    if (valor === undefined) continue;
    if (nombre === 'API_ENV_ARCHIVO') {
      if (valor && path.resolve(valor) !== path.resolve(archivo)) errores.push('API_ENV_ARCHIVO heredado selecciona un archivo distinto del revisado.');
    } else if (Object.hasOwn(env, nombre) ? env[nombre] !== valor : valor !== '') {
      errores.push(`${nombre} heredado difiere del archivo sandbox o no está definido en él. Elimínalo del terminal o hazlo coincidir antes de iniciar la API.`);
    }
  }
  return errores;
}

function parsearEnv(texto) {
  const env = Object.create(null);
  for (const linea of texto.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!linea.trim() || linea.trim().startsWith('#')) continue;
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || Object.hasOwn(env, m[1])) throw new Error('Formato no admitido o variable duplicada en el archivo de configuración.');
    let valor = m[2];
    if (valor.startsWith('"') || valor.startsWith("'")) {
      if (valor.length < 2 || valor.at(-1) !== valor[0]) throw new Error('Comillas incompletas en el archivo de configuración.');
      valor = valor.slice(1, -1);
    }
    // No se expanden variables, comandos ni secuencias de escape.
    env[m[1]] = valor;
  }
  return env;
}

function verificarConfiguracion(env, proveedor) {
  const errores = [];
  const avisos = [];
  if (!PROVEEDORES.includes(proveedor)) return { errores: ['Proveedor no admitido.'], avisos };
  const valor = nombre => (env[nombre] || '').trim();
  const falta = nombre => {
    const v = valor(nombre);
    const vacio = !v || /(?:REEMPLAZAR|CAMBIAR|PENDIENTE|\.\.\.|<[^>]*>)/i.test(v);
    if (vacio) errores.push(`Falta completar ${nombre}.`);
    return vacio;
  };
  const exigir = (nombre, esperado) => {
    if (!falta(nombre) && valor(nombre) !== esperado) errores.push(`${nombre} debe ser ${esperado}.`);
  };
  const url = (nombre, host, base = false) => {
    if (falta(nombre)) return;
    try {
      const u = new URL(valor(nombre));
      if (u.protocol !== 'https:' || (host && u.hostname !== host) || u.username || u.password || u.port || u.search || u.hash || (base && u.pathname !== '/')) throw new Error();
    } catch { errores.push(`${nombre} debe ser una URL HTTPS ${host ? 'del host permitido' : 'sin credenciales, puerto, consulta ni fragmento'}.`); }
  };

  for (const nombre of ['PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'JWT_SECRETO', 'JWT_SECRETO_RENOVACION', 'WEB_URL']) falta(nombre);
  if (valor('PGDATABASE') && !/^[a-z][a-z0-9_]*_sandbox$/i.test(valor('PGDATABASE'))) errores.push('PGDATABASE debe identificar una base separada con sufijo _sandbox.');
  if (valor('PGPORT') && (!/^\d+$/.test(valor('PGPORT')) || Number(valor('PGPORT')) < 1 || Number(valor('PGPORT')) > 65535)) errores.push('PGPORT no es un puerto válido.');
  exigir('NODE_ENV', 'development');
  exigir('PROCESOS_EN_SEGUNDO_PLANO', 'false');
  exigir('CORREOS_PROGRAMADOS', 'false');
  if (valor('SMTP_HOST') || valor('SMTP_USUARIO') || valor('SMTP_CLAVE')) errores.push('SMTP_HOST, SMTP_USUARIO y SMTP_CLAVE deben quedar vacíos para estas pruebas.');

  if (proveedor === 'nubefact') {
    exigir('PASARELA', 'simulada');
    exigir('FACTURACION', 'nubefact');
    falta('NUBEFACT_TOKEN');
    url('NUBEFACT_RUTA', 'api.nubefact.com');
    exigir('NUBEFACT_CUENTA_DEMO_CONFIRMADA', 'true');
    falta('HOTEL_RUC');
    const series = ['SERIE_BOLETA', 'SERIE_FACTURA', 'SERIE_NC_BOLETA', 'SERIE_NC_FACTURA', 'SERIE_ND_BOLETA', 'SERIE_ND_FACTURA'];
    for (const nombre of series) falta(nombre);
    if (series.every(n => valor(n)) && new Set(series.map(valor)).size !== series.length) errores.push('Las seis series de comprobantes y notas deben ser diferentes.');
    avisos.push('La confirmación DEMO es una declaración del operador: la URL y el token no prueban que la cuenta sea de prueba. Confírmalo en Nubefact antes de emitir.');
  } else {
    exigir('PASARELA', proveedor);
    exigir('FACTURACION', 'simulado');
    if (proveedor === 'culqi') {
      for (const [nombre, prefijo] of [['CULQI_LLAVE_PUBLICA', 'pk_test_'], ['CULQI_LLAVE_SECRETA', 'sk_test_']]) {
        if (!falta(nombre) && !new RegExp(`^${prefijo}[A-Za-z0-9_-]+$`).test(valor(nombre))) errores.push(`${nombre} debe ser una llave de prueba (${prefijo}).`);
      }
    } else if (proveedor === 'mercadopago') {
      if (!falta('MP_ACCESS_TOKEN')) {
        const token = valor('MP_ACCESS_TOKEN');
        if (/^APP_USR-[A-Za-z0-9_-]+$/.test(token)) {
          exigir('MP_CUENTA_PRUEBA_CONFIRMADA', 'true');
          avisos.push('APP_USR también se usa en cuentas reales. Confirma en el panel que este token pertenece al vendedor de prueba; el verificador no identifica su cuenta.');
        } else if (!/^TEST-[A-Za-z0-9_-]+$/.test(token)) errores.push('MP_ACCESS_TOKEN debe ser de prueba (TEST-) o de una cuenta vendedor de prueba confirmada.');
      }
      falta('MP_WEBHOOK_SECRETO');
      url('API_URL_PUBLICA');
      url('WEB_URL');
    } else {
      for (const nombre of ['NIUBIZ_COMERCIO', 'NIUBIZ_USUARIO', 'NIUBIZ_CLAVE', 'HOTEL_RUC']) falta(nombre);
      exigir('NIUBIZ_PRODUCCION', 'false');
      url('NIUBIZ_DEVOLUCIONES_URL', 'apisandbox.vnforappstest.com', true);
      url('NIUBIZ_CONSULTA_DEVOLUCIONES_URL', 'apitestenv.vnforapps.com', true);
      url('API_URL_PUBLICA');
      avisos.push('Niubiz debe habilitar las devoluciones del comercio sandbox y proporcionar una venta de prueba liquidada. Los nombres de usuario no demuestran esos permisos.');
    }
  }
  return { errores, avisos };
}

function ejecutar(args, opciones = {}) {
  const informar = opciones.informar || console.log;
  const leerArchivo = opciones.leerArchivo || (archivo => fs.readFileSync(archivo, 'utf8'));
  if (args.length === 1 && args[0] === '--ayuda') { informar(AYUDA); return 0; }
  let proveedor;
  let revisarEntorno = false;
  let archivo = ARCHIVO;
  const vistos = new Set();
  for (let i = 0; i < args.length; i++) {
    const clave = args[i];
    if (clave === '--entorno' && !vistos.has(clave)) {
      vistos.add(clave); revisarEntorno = true; continue;
    }
    if (!['--proveedor', '--archivo'].includes(clave) || vistos.has(clave) || !args[i + 1] || args[i + 1].startsWith('--')) {
      informar(AYUDA); return 2;
    }
    vistos.add(clave);
    if (clave === '--proveedor') proveedor = args[i + 1];
    else archivo = path.resolve(args[i + 1]);
    i++;
  }
  if (!PROVEEDORES.includes(proveedor)) { informar(AYUDA); return 2; }
  let env;
  try { env = parsearEnv(leerArchivo(archivo)); }
  catch {
    // No imprimir la excepción: puede contener rutas o líneas con secretos.
    informar('No se pudo leer la configuración sandbox: archivo ausente, inaccesible o formato inválido.');
    return 1;
  }
  const resultado = verificarConfiguracion(env, proveedor);
  if (revisarEntorno) resultado.errores.push(...verificarEntorno(env, opciones.entorno || process.env, archivo));
  informar(`Configuración local de sandbox: ${proveedor}.`);
  for (const error of resultado.errores) informar(`ERROR: ${error}`);
  for (const aviso of resultado.avisos) informar(`AVISO: ${aviso}`);
  informar('No se ha autenticado con el proveedor ni conectado a la base: no se hicieron solicitudes HTTP, cobros, devoluciones ni comprobantes.');
  informar(revisarEntorno
    ? 'Se revisaron el archivo seleccionado y las variables heredadas relevantes de este terminal; vuelve a verificar si cambias el entorno antes de iniciar la API.'
    : 'Solo se revisó el archivo seleccionado; las variables heredadas del terminal no se verificaron.');
  if (!resultado.errores.length) informar('Configuración local completa. Falta ejecutar y registrar las pruebas reales del sandbox.');
  return resultado.errores.length ? 1 : 0;
}

if (require.main === module) process.exitCode = ejecutar(process.argv.slice(2));
module.exports = { parsearEnv, verificarConfiguracion, verificarEntorno, ejecutar };
