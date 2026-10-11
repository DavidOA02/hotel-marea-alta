import { TASA_IGV } from './constantes';

/** Redondeo a 2 decimales «half away from zero» (como el redondeo tributario). */
export function redondear(n: number): number {
  return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
}

export interface Cotizacion { noches: number; subtotal: number; igv: number; total: number; exoneradoIgv: boolean }

/**
 * Las tarifas incluyen IGV (18 %). El hospedaje de extranjeros no domiciliados
 * está exonerado: se cobra solo el valor de venta.
 */
export function cotizar(precioNocheConIgv: number, noches: number, exonerado: boolean): Cotizacion {
  const bruto = redondear(precioNocheConIgv * noches);
  const valorVenta = redondear(bruto / (1 + TASA_IGV));
  return exonerado
    ? { noches, subtotal: valorVenta, igv: 0, total: valorVenta, exoneradoIgv: true }
    : { noches, subtotal: valorVenta, igv: redondear(bruto - valorVenta), total: bruto, exoneradoIgv: false };
}
