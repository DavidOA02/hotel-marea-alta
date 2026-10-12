/** Fechas en hora oficial del Perú (UTC−5, sin horario de verano). Formato ISO AAAA-MM-DD. */
export function hoyLima(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}

export function ahoraLima(ahora: Date = new Date()): Date {
  // Representa la hora de Lima como Date "local" (útil para comparar horas del día)
  return new Date(ahora.getTime() - 5 * 3600 * 1000);
}

const aUTC = (iso: string) => new Date(iso + 'T00:00:00Z');
const aISO = (d: Date) => d.toISOString().slice(0, 10);

/** AAAA-MM-DD que existe en el calendario (rechaza 2026-02-30 y 2026-13-01). */
export function esFechaIso(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = aUTC(v);
  return !isNaN(d.getTime()) && aISO(d) === v;
}

export function sumarDias(iso: string, n: number): string {
  const d = aUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aISO(d);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta).getTime() - aUTC(desde).getTime()) / 86400000);
}

/** Suma días hábiles (lunes a viernes). No descuenta feriados. */
export function sumarDiasHabiles(iso: string, dias: number): string {
  let d = iso;
  while (dias > 0) {
    d = sumarDias(d, 1);
    const dow = aUTC(d).getUTCDay();
    if (dow !== 0 && dow !== 6) dias--;
  }
  return d;
}

/** Horas que faltan para las 15:00 (hora de Lima) del día de llegada. */
export function horasParaLlegada(fechaEntrada: string, ahora: Date = new Date()): number {
  const llegadaUtc = new Date(fechaEntrada + 'T20:00:00Z'); // 15:00 en Lima = 20:00 UTC
  return (llegadaUtc.getTime() - ahora.getTime()) / 3600000;
}
