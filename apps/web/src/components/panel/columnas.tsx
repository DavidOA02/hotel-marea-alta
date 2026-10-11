'use client';
import { ETIQUETAS } from '@marea/shared';
import { fechaDia, soles } from '@/lib/formato';
import { Estado } from './base';
import { columnas } from './tabla';

export type FilaReserva = {
  codigo: string; estado: string; canal: string; cliente: string; documento: string; email: string; telefono: string; residencia: string;
  tipoHabitacion: string; habitacion: string; fechaEntrada: string; fechaSalida: string; noches: number; huespedes: number;
  subtotal: number; igv: number; total: number; pagado: number; saldo: number; fechaReserva: string; registradoPor: string | null; clienteId: number;
};
const c = columnas<FilaReserva>();
const deuda = (r: FilaReserva) => r.saldo > 0.009 && !['Cancelada', 'NoShow'].includes(r.estado);

/** Columnas de reservas para TanStack Table (orden por cualquier columna, búsqueda global). */
export const columnasReservas = [
  c.accessor('codigo', { header: 'Código', cell: i => <><span className="font-mono font-semibold text-ocean">{i.getValue()}</span><span className="block text-xs text-muted">{ETIQUETAS[i.row.original.canal]}</span></> }),
  c.accessor('cliente', { header: 'Huésped', cell: i => <>{i.getValue()}<span className="block text-xs text-muted">{ETIQUETAS[i.row.original.residencia]} · {i.row.original.huespedes} huésp.</span></> }),
  c.accessor('habitacion', { header: 'Habitación', cell: i => <>{i.getValue()}<span className="block text-xs text-muted">{i.row.original.tipoHabitacion}</span></> }),
  c.accessor('fechaEntrada', { header: 'Llegada', cell: i => fechaDia(i.getValue()) }),
  c.accessor('fechaSalida', { header: 'Salida', cell: i => <>{fechaDia(i.getValue())}<span className="block text-xs text-muted">{i.row.original.noches} noche(s)</span></> }),
  c.accessor('estado', { header: 'Estado', cell: i => <Estado valor={i.getValue()} /> }),
  c.accessor('total', { header: 'Total', meta: { derecha: true }, cell: i => soles(i.getValue()) }),
  c.accessor('saldo', { header: 'Saldo', meta: { derecha: true }, cell: i => <span className={deuda(i.row.original) ? 'font-medium text-bad' : 'text-muted'}>{soles(i.getValue())}</span> }),
  c.accessor('documento', { header: 'Documento', enableGlobalFilter: true, cell: () => null, meta: { oculta: true } })
].filter(x => !(x as any).meta?.oculta);

export const csvReservas = {
  encabezados: ['Código', 'Estado', 'Canal', 'Huésped', 'Documento', 'Correo', 'Teléfono', 'Residencia', 'Tipo', 'Habitación', 'Llegada', 'Salida', 'Noches', 'Huéspedes', 'Subtotal', 'IGV', 'Total', 'Pagado', 'Saldo', 'Registrada', 'Registrada por'],
  filas: (r: FilaReserva) => [r.codigo, r.estado, r.canal, r.cliente, r.documento, r.email, r.telefono, r.residencia, r.tipoHabitacion, r.habitacion, r.fechaEntrada, r.fechaSalida, r.noches, r.huespedes, r.subtotal, r.igv, r.total, r.pagado, r.saldo, r.fechaReserva, r.registradoPor ?? 'Web']
};
