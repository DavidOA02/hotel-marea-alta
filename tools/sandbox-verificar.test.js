'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parsearEnv, verificarConfiguracion, verificarEntorno, ejecutar } = require('./sandbox-verificar');

const base = {
  NODE_ENV: 'development', PGHOST: 'localhost', PGPORT: '5432', PGUSER: 'postgres', PGDATABASE: 'hotel_marea_alta_sandbox',
  JWT_SECRETO: 'accesoLocal123', JWT_SECRETO_RENOVACION: 'renovacionLocal456', WEB_URL: 'https://web-sandbox.example',
  API_URL_PUBLICA: 'https://api-sandbox.example/api', PROCESOS_EN_SEGUNDO_PLANO: 'false', CORREOS_PROGRAMADOS: 'false',
  SMTP_HOST: '', SMTP_USUARIO: '', SMTP_CLAVE: '', FACTURACION: 'simulado', PASARELA: 'culqi',
  CULQI_LLAVE_PUBLICA: 'pk_test_123sandbox', CULQI_LLAVE_SECRETA: 'sk_test_456sandbox',
};
const niubiz = {
  ...base, PASARELA: 'niubiz', NIUBIZ_COMERCIO: '123456789', NIUBIZ_USUARIO: 'usuarioSandbox', NIUBIZ_CLAVE: 'claveSandbox',
  NIUBIZ_PRODUCCION: 'false', HOTEL_RUC: '20000000000', NIUBIZ_DEVOLUCIONES_URL: 'https://apisandbox.vnforappstest.com',
  NIUBIZ_CONSULTA_DEVOLUCIONES_URL: 'https://apitestenv.vnforapps.com',
};
const nubefact = {
  ...base, PASARELA: 'simulada', FACTURACION: 'nubefact', NUBEFACT_RUTA: 'https://api.nubefact.com/api/v1/cuenta123',
  NUBEFACT_TOKEN: 'tokenDemo123', NUBEFACT_CUENTA_DEMO_CONFIRMADA: 'true', HOTEL_RUC: '20000000000',
  SERIE_BOLETA: 'B001', SERIE_FACTURA: 'F001', SERIE_NC_BOLETA: 'BC01', SERIE_NC_FACTURA: 'FC01', SERIE_ND_BOLETA: 'BD01', SERIE_ND_FACTURA: 'FD01',
};
const textoEnv = env => Object.entries(env).map(([nombre, valor]) => `${nombre}=${valor}`).join('\n');

test('lee valores literales, comillas y BOM; rechaza sintaxis ambigua o variables duplicadas', () => {
  const env = parsearEnv('\uFEFF# Prueba\r\nJWT_SECRETO="literal$TOKEN"\r\nSMTP_CLAVE=\r\n');
  assert.equal(env.JWT_SECRETO, 'literal$TOKEN');
  assert.equal(env.SMTP_CLAVE, '');
  for (const texto of ['JWT_SECRETO=x\nJWT_SECRETO=y', 'JWT_SECRETO="sin cerrar', 'export JWT_SECRETO=x']) assert.throws(() => parsearEnv(texto));
});

test('acepta configuración completa sin autenticar ni afirmar éxito de integración', () => {
  const salida = [];
  assert.equal(ejecutar(['--proveedor', 'culqi'], { leerArchivo: () => textoEnv(base), informar: x => salida.push(x) }), 0);
  assert.match(salida.join('\n'), /No se ha autenticado/);
  assert.match(salida.join('\n'), /Falta ejecutar/);
  assert.doesNotMatch(salida.join('\n'), /sk_test_456sandbox/);
});

test('lee solo .env.sandbox por defecto, sin consultar .env ni variables del sistema', () => {
  let archivo;
  const anterior = process.env.CULQI_LLAVE_PUBLICA;
  process.env.CULQI_LLAVE_PUBLICA = 'pk_test_heredada';
  try {
    const salida = [];
    const codigo = ejecutar(['--proveedor', 'culqi'], {
      leerArchivo: p => { archivo = p; return textoEnv({ ...base, CULQI_LLAVE_PUBLICA: '' }); }, informar: x => salida.push(x),
    });
    assert.equal(path.basename(archivo), '.env.sandbox');
    assert.equal(codigo, 1);
    assert.match(salida.join('\n'), /Falta completar CULQI_LLAVE_PUBLICA/);
  } finally {
    if (anterior === undefined) delete process.env.CULQI_LLAVE_PUBLICA;
    else process.env.CULQI_LLAVE_PUBLICA = anterior;
  }
});

test('archivo alternativo se usa sin fallback cuando no existe', () => {
  let lecturas = 0;
  const salida = [];
  assert.equal(ejecutar(['--proveedor', 'culqi', '--archivo', 'no-existe-sandbox'], {
    leerArchivo: () => { lecturas++; throw new Error('sk_live_SECRETO_EXTERNO'); }, informar: x => salida.push(x),
  }), 1);
  assert.equal(lecturas, 1);
  assert.doesNotMatch(salida.join('\n'), /SECRETO_EXTERNO/);
});

test('bloquea bases normales y de integración que no están separadas como sandbox', () => {
  for (const nombre of ['hotel_marea_alta', 'hotel_marea_alta_test', 'sandbox', 'hotel_marea_alta_sandbox; DROP DATABASE x']) {
    assert.ok(verificarConfiguracion({ ...base, PGDATABASE: nombre }, 'culqi').errores.some(x => x.includes('PGDATABASE')));
  }
});

test('bloquea producción, SMTP y procesos automáticos encendidos', () => {
  for (const [nombre, valor] of [['NODE_ENV', 'production'], ['SMTP_HOST', 'smtp.example'], ['SMTP_CLAVE', 'clave'], ['PROCESOS_EN_SEGUNDO_PLANO', 'true'], ['CORREOS_PROGRAMADOS', 'true']]) {
    assert.ok(verificarConfiguracion({ ...base, [nombre]: valor }, 'culqi').errores.some(x => x.includes(nombre)));
  }
});

test('bloquea llaves Culqi live y placeholders de prueba', () => {
  for (const [nombre, valor] of [['CULQI_LLAVE_PUBLICA', 'pk_live_123'], ['CULQI_LLAVE_SECRETA', 'sk_live_123'], ['CULQI_LLAVE_SECRETA', 'sk_test_REEMPLAZAR']]) {
    assert.ok(verificarConfiguracion({ ...base, [nombre]: valor }, 'culqi').errores.some(x => x.includes(nombre)));
  }
});

test('el proveedor elegido debe estar activo y el otro flujo simulado', () => {
  assert.ok(verificarConfiguracion({ ...base, PASARELA: 'simulada' }, 'culqi').errores.some(x => x.includes('PASARELA')));
  assert.ok(verificarConfiguracion({ ...base, FACTURACION: 'nubefact' }, 'culqi').errores.some(x => x.includes('FACTURACION')));
  assert.ok(verificarConfiguracion({ ...nubefact, PASARELA: 'niubiz' }, 'nubefact').errores.some(x => x.includes('PASARELA')));
});

test('Mercado Pago acepta TEST y exige confirmación del vendedor de prueba para APP_USR', () => {
  const mp = { ...base, PASARELA: 'mercadopago', MP_ACCESS_TOKEN: 'TEST-123sandbox', MP_WEBHOOK_SECRETO: 'webhook123' };
  assert.deepEqual(verificarConfiguracion(mp, 'mercadopago').errores, []);
  assert.ok(verificarConfiguracion({ ...mp, MP_ACCESS_TOKEN: 'APP_USR-123' }, 'mercadopago').errores.some(x => x.includes('MP_CUENTA_PRUEBA_CONFIRMADA')));
  const confirmado = verificarConfiguracion({ ...mp, MP_ACCESS_TOKEN: 'APP_USR-123', MP_CUENTA_PRUEBA_CONFIRMADA: 'true' }, 'mercadopago');
  assert.deepEqual(confirmado.errores, []);
  assert.ok(confirmado.avisos.some(x => x.includes('cuentas reales')));
});

test('requiere URLs HTTPS sin credenciales ni fragmentos para callbacks', () => {
  const mp = { ...base, PASARELA: 'mercadopago', MP_ACCESS_TOKEN: 'TEST-123sandbox', MP_WEBHOOK_SECRETO: 'webhook123' };
  for (const valor of ['http://api.example/api', 'https://token@api.example/api', 'https://api.example/api#secreto', 'https://api.example/api?token=secreto']) {
    const errores = verificarConfiguracion({ ...mp, API_URL_PUBLICA: valor }, 'mercadopago').errores;
    assert.ok(errores.some(x => x.includes('API_URL_PUBLICA')));
    assert.ok(errores.every(x => !x.includes(valor)));
  }
});

test('Niubiz requiere producción=false y hosts sandbox exactos para registro y consulta', () => {
  assert.deepEqual(verificarConfiguracion(niubiz, 'niubiz').errores, []);
  for (const [nombre, valor] of [
    ['NIUBIZ_PRODUCCION', 'true'], ['NIUBIZ_PRODUCCION', ''],
    ['NIUBIZ_DEVOLUCIONES_URL', 'https://apiprod.vnforapps.com'],
    ['NIUBIZ_DEVOLUCIONES_URL', 'https://apisandbox.vnforappstest.com.evil.example'],
    ['NIUBIZ_CONSULTA_DEVOLUCIONES_URL', 'https://apisandbox.vnforappstest.com'],
  ]) assert.ok(verificarConfiguracion({ ...niubiz, [nombre]: valor }, 'niubiz').errores.some(x => x.includes(nombre)));
});

test('Nubefact no infiere DEMO por URL, token o series', () => {
  assert.deepEqual(verificarConfiguracion(nubefact, 'nubefact').errores, []);
  assert.ok(verificarConfiguracion({ ...nubefact, NUBEFACT_CUENTA_DEMO_CONFIRMADA: 'false' }, 'nubefact').errores.some(x => x.includes('NUBEFACT_CUENTA_DEMO_CONFIRMADA')));
  assert.ok(verificarConfiguracion(nubefact, 'nubefact').avisos.some(x => x.includes('URL y el token no prueban')));
  assert.ok(verificarConfiguracion({ ...nubefact, SERIE_ND_BOLETA: 'BC01' }, 'nubefact').errores.some(x => x.includes('series')));
});

test('errores de configuración y argumentos nunca revelan valores secretos', () => {
  const salida = [];
  ejecutar(['--proveedor', 'niubiz'], {
    leerArchivo: () => textoEnv({ ...niubiz, NIUBIZ_CLAVE: 'ultra-secreto', NIUBIZ_DEVOLUCIONES_URL: 'https://ultra-secreto@apiprod.vnforapps.com' }),
    informar: x => salida.push(x),
  });
  assert.doesNotMatch(salida.join('\n'), /ultra-secreto/);
  salida.length = 0;
  assert.equal(ejecutar(['--proveedor', 'ultra-secreto'], { informar: x => salida.push(x) }), 2);
  assert.doesNotMatch(salida.join('\n'), /ultra-secreto/);
});

test('--entorno bloquea valores heredados que reemplazarían la base, proveedor o barreras', () => {
  for (const [nombre, valor] of [
    ['PGDATABASE', 'hotel_marea_alta'], ['PGHOST', 'base-real.example'], ['PGPASSWORD', 'clave-real'],
    ['CULQI_LLAVE_SECRETA', 'sk_live_secreto'], ['FACTURACION', 'nubefact'], ['SMTP_HOST', 'smtp-real.example'],
    ['PROCESOS_EN_SEGUNDO_PLANO', 'true'], ['CORREOS_PROGRAMADOS', 'true'], ['NODE_ENV', 'production'],
    ['SSH_HOST', 'servidor-real.example'], ['PGOPTIONS', '-c search_path=public'], ['SIN_LIMITES', 'true'],
    ['NODE_OPTIONS', '--require archivo-real.js']
  ]) {
    const salida = [];
    assert.equal(ejecutar(['--entorno', '--proveedor', 'culqi'], {
      leerArchivo: () => textoEnv(base), entorno: { [nombre]: valor }, informar: x => salida.push(x)
    }), 1);
    assert.ok(salida.some(x => x.includes(`${nombre} heredado`)));
    assert.ok(salida.every(x => !x.includes(valor)));
  }
});

test('--entorno permite valores idénticos, variables del sistema ajenas y claves ausentes', () => {
  const salida = [];
  assert.equal(ejecutar(['--proveedor', 'culqi', '--entorno'], {
    leerArchivo: () => textoEnv(base), entorno: { ...base, PATH: 'ruta-del-sistema', SSH_HOST: '' }, informar: x => salida.push(x)
  }), 0);
  assert.match(salida.join('\n'), /variables heredadas relevantes de este terminal/);
  assert.deepEqual(verificarEntorno(base, {}, 'apps/api/.env.sandbox'), []);
  // Incluso una cadena vacía heredada impide a cargarEnv leer el valor del archivo.
  assert.ok(verificarEntorno(base, { PGDATABASE: '' }, 'apps/api/.env.sandbox').some(x => x.includes('PGDATABASE')));
});

test('--entorno comprueba que API_ENV_ARCHIVO seleccione el mismo archivo revisado', () => {
  const archivo = path.resolve('pruebas/cuenta.sandbox');
  assert.deepEqual(verificarEntorno(base, { API_ENV_ARCHIVO: archivo }, archivo), []);
  const errores = verificarEntorno(base, { API_ENV_ARCHIVO: 'secreto/no-es-sandbox.env' }, archivo);
  assert.equal(errores.length, 1);
  assert.match(errores[0], /API_ENV_ARCHIVO/);
  assert.doesNotMatch(errores[0], /secreto/);
  assert.equal(ejecutar(['--archivo', archivo, '--entorno', '--proveedor', 'culqi'], {
    leerArchivo: () => textoEnv(base), entorno: { API_ENV_ARCHIVO: archivo }, informar: () => {}
  }), 0);
});

test('--entorno no completa campos faltantes con secretos del terminal', () => {
  const salida = [];
  assert.equal(ejecutar(['--proveedor', 'culqi', '--entorno'], {
    leerArchivo: () => textoEnv({ ...base, CULQI_LLAVE_SECRETA: '' }),
    entorno: { CULQI_LLAVE_SECRETA: 'sk_test_secreto-heredado' }, informar: x => salida.push(x)
  }), 1);
  assert.match(salida.join('\n'), /Falta completar CULQI_LLAVE_SECRETA/);
  assert.doesNotMatch(salida.join('\n'), /secreto-heredado/);
});

test('rechaza opciones repetidas o valores extra sin mostrar argumentos', () => {
  for (const args of [
    ['--proveedor', 'culqi', '--entorno', '--entorno'], ['--entorno', 'secreto'],
    ['--proveedor', 'culqi', '--archivo'], ['--proveedor', 'culqi', '--proveedor', 'culqi']
  ]) {
    const salida = [];
    assert.equal(ejecutar(args, { informar: x => salida.push(x) }), 2);
    assert.doesNotMatch(salida.join('\n'), /secreto/);
  }
});
