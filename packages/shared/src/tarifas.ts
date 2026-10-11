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

/** Separa un total (IGV incluido salvo exoneración) en valor de venta e IGV. */
export function desglosar(total: number, noches: number, exonerado: boolean): Cotizacion {
  const t = redondear(total);
  if (exonerado) return { noches, subtotal: t, igv: 0, total: t, exoneradoIgv: true };
  const subtotal = redondear(t / (1 + TASA_IGV));
  return { noches, subtotal, igv: redondear(t - subtotal), total: t, exoneradoIgv: false };
}

/**
 * Cambio de habitación con nueva tarifa: las noches ya usadas conservan lo que costaban
 * (parte proporcional del total original) y las restantes se cobran con la tarifa de la nueva habitación.
 */
export function recalcularPorCambio(totalOriginal: number, noches: number, nochesRestantes: number, precioNuevoConIgv: number, exonerado: boolean): Cotizacion {
  const usadas = noches - nochesRestantes;
  const parteUsada = noches > 0 ? redondear((totalOriginal * usadas) / noches) : 0;
  const parteNueva = cotizar(precioNuevoConIgv, nochesRestantes, exonerado).total;
  return desglosar(parteUsada + parteNueva, noches, exonerado);
}
