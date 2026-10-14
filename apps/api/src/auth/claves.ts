import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

const ITERACIONES = 100_000;
const PREFIJO = 'PBKDF2-SHA256';

/** Contraseñas con PBKDF2-SHA256 (100 000 iteraciones, sal aleatoria de 16 bytes). */
export function hashClave(clave: string): string {
  const sal = randomBytes(16);
  const hash = pbkdf2Sync(clave, sal, ITERACIONES, 32, 'sha256');
  return `${PREFIJO}$${ITERACIONES}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export function verificarClave(clave: string, almacenado: string): boolean {
  // Validar antes de PBKDF2: un registro corrupto no debe causar excepciones
  // ni controlar el coste del cálculo durante el inicio de sesión.
  if (typeof almacenado !== 'string' || almacenado.length > 100) return false;
  const partes = almacenado.split('$');
  if (partes.length !== 4) return false;
  const [prefijo, iter, sal, hash] = partes;
  if (prefijo !== PREFIJO || iter !== String(ITERACIONES) || sal.length !== 24 || hash.length !== 44) return false;
  const salBytes = Buffer.from(sal, 'base64');
  const esperado = Buffer.from(hash, 'base64');
  if (salBytes.length !== 16 || esperado.length !== 32 || salBytes.toString('base64') !== sal || esperado.toString('base64') !== hash) return false;
  const calculado = pbkdf2Sync(clave, salBytes, ITERACIONES, 32, 'sha256');
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/** Cambia si cambian la contraseña, el rol o el estado: invalida los tokens anteriores. */
export function selloUsuario(u: { claveHash: string; activo: boolean; rol: string }): string {
  return createHash('sha256').update(`${u.claveHash}|${u.activo}|${u.rol}`).digest('hex').slice(0, 16);
}
