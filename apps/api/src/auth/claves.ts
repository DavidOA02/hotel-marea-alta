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
  const [prefijo, iter, sal, hash] = (almacenado || '').split('$');
  if (prefijo !== PREFIJO || !iter || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = pbkdf2Sync(clave, Buffer.from(sal, 'base64'), Number(iter), esperado.length, 'sha256');
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/** Cambia si cambian la contraseña, el rol o el estado: invalida los tokens anteriores. */
export function selloUsuario(u: { claveHash: string; activo: boolean; rol: string }): string {
  return createHash('sha256').update(`${u.claveHash}|${u.activo}|${u.rol}`).digest('hex').slice(0, 16);
}
