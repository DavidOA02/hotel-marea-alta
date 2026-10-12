import { esFechaIso } from '@marea/shared';
import { falla } from './errores';

/** Fecha de un filtro (?desde=, ?hasta=): vacía o AAAA-MM-DD que exista. Se valida antes de calcular el periodo por defecto. */
export function fechaFiltro(valor: string | undefined, campo: 'desde' | 'hasta'): string | undefined {
  if (!valor) return undefined;
  if (!esFechaIso(valor)) throw falla(400, 'Fecha no válida.', campo);
  return valor;
}
