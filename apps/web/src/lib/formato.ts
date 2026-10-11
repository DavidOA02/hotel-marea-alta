const nf2 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const soles = (n: number | null | undefined) => 'S/ ' + nf2.format(Number(n || 0));
export const soles0 = (n: number | null | undefined) => 'S/ ' + nf0.format(Number(n || 0));
export const dolares = (n: number) => 'US$ ' + nf2.format(n);
export const dolares0 = (n: number) => 'US$ ' + nf0.format(n);
export const entero = (n: number) => nf0.format(n);
export const pct = (n: number, d = 0) => (Number(n || 0) * 100).toFixed(d) + ' %';
const fecha = (iso: string) => new Date(String(iso).slice(0, 10) + 'T12:00:00');
export const fechaCorta = (iso?: string | null) => { if (!iso) return '—'; const d = fecha(iso); return `${d.getDate()} ${MESES[d.getMonth()]}`; };
export const fechaMedia = (iso?: string | null) => { if (!iso) return '—'; const d = fecha(iso); return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`; };
export const fechaDia = (iso?: string | null) => { if (!iso) return '—'; const d = fecha(iso); return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`; };
export const fechaLarga = (iso?: string | null) => { if (!iso) return '—'; const d = fecha(iso); return `${DIAS_L[d.getDay()]} ${d.getDate()} de ${MESES_L[d.getMonth()]} de ${d.getFullYear()}`; };
export const fechaHora = (iso?: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
export const mesCorto = (yyyyMm: string) => { const [y, m] = yyyyMm.split('-'); return `${MESES[Number(m) - 1]} ${y.slice(2)}`; };
export const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');

/** Montos compactos para ejes de gráficos: S/ 280 mil, S/ 1.2 M. */
export const solesCorto = (n: number) => n >= 1e6 ? `S/ ${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `S/ ${Math.round(n / 1e3)} mil` : `S/ ${Math.round(n)}`;
