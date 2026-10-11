import { diasEntre } from './fechas';
import { redondear } from './tarifas';

export interface Estadia { entrada: string; salida: string; noches: number; total: number }

/** Noches e ingreso (prorrateado por noche) de una estadía dentro de [desde, hastaExclusivo). */
export function enRango(e: Estadia, desde: string, hastaExclusivo: string): { noches: number; ingreso: number } {
  const ini = e.entrada > desde ? e.entrada : desde;
  const fin = e.salida < hastaExclusivo ? e.salida : hastaExclusivo;
  const noches = diasEntre(ini, fin);
  if (noches <= 0 || e.noches <= 0) return { noches: 0, ingreso: 0 };
  return { noches, ingreso: redondear((e.total / e.noches) * noches) };
}

export function sumarEstadias(lista: Estadia[], desde: string, hastaExclusivo: string) {
  return lista.reduce((a, e) => { const r = enRango(e, desde, hastaExclusivo); return { noches: a.noches + r.noches, ingreso: redondear(a.ingreso + r.ingreso) }; }, { noches: 0, ingreso: 0 });
}

export const dividir = (a: number, b: number, dec = 4) => (b === 0 ? 0 : Number((a / b).toFixed(dec)));
