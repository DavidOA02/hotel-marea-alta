import * as fs from 'fs';
import * as path from 'path';

/** Carga apps/api/.env (sin dependencias extra). Las variables del sistema tienen prioridad. */
export function cargarEnv(archivo = path.resolve(__dirname, '..', '..', '.env')) {
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !linea.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const produccion = () => process.env.NODE_ENV === 'production';
const sinBarra = (u: string) => u.replace(/\/+$/, '');

/** URL pública de la web (enlaces de los correos y retorno de las pasarelas). */
export const urlWeb = () => sinBarra(process.env.WEB_URL || 'http://localhost:3000');
/** URL pública de la API (avisos de Mercado Pago y formulario de Niubiz). */
export const urlApi = () => sinBarra(process.env.API_URL_PUBLICA || `http://localhost:${process.env.PUERTO || 4000}/api`);

export const PASARELAS = ['Simulada', 'Culqi', 'MercadoPago', 'Niubiz'] as const;
export type NombrePasarela = (typeof PASARELAS)[number];

/** Pasarela activa según PASARELA y sus credenciales. Sin configurar: «simulada» en desarrollo y ninguna en producción. */
export function pasarelaActiva(): NombrePasarela | null {
  const p = (process.env.PASARELA ?? (produccion() ? '' : 'simulada')).trim().toLowerCase();
  const e = process.env;
  if (p === 'simulada') return produccion() ? null : 'Simulada';
  if (p === 'culqi' && e.CULQI_LLAVE_PUBLICA && e.CULQI_LLAVE_SECRETA) return 'Culqi';
  if (p === 'mercadopago' && e.MP_ACCESS_TOKEN) return 'MercadoPago';
  if (p === 'niubiz' && e.NIUBIZ_COMERCIO && e.NIUBIZ_USUARIO && e.NIUBIZ_CLAVE) return 'Niubiz';
  return null;
}

/** Proveedor de facturación electrónica: Nubefact (PSE/OSE) o simulado (solo desarrollo). */
export function facturadorActivo(): 'Simulado' | 'Nubefact' | null {
  const f = (process.env.FACTURACION ?? (produccion() ? '' : 'simulado')).trim().toLowerCase();
  if (f === 'simulado') return produccion() ? null : 'Simulado';
  if (f === 'nubefact' && process.env.NUBEFACT_RUTA && process.env.NUBEFACT_TOKEN) return 'Nubefact';
  return null;
}
