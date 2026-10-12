'use client';
import { useState } from 'react';
import { Banknote, CreditCard, Landmark, Printer, Smartphone, Undo2, Vault, XCircle } from 'lucide-react';
import { ETIQUETAS, hoyLima, sumarDias } from '@marea/shared';
import { fechaHora, fechaMedia, soles, soles0 } from '@/lib/formato';
import { useSesion } from '@/stores/sesion';
import { BotonP, Cabecera, Cargando, Estado, Kpi, useDatos } from '@/components/panel/base';
import { Tabla, columnas } from '@/components/panel/tabla';
import { FormAnular } from '@/components/panel/formularios';
import { useFicha } from '@/components/panel/reservas';

const ICONO: Record<string, React.ElementType> = { Tarjeta: CreditCard, Yape: Smartphone, Plin: Smartphone, Transferencia: Landmark, Efectivo: Banknote };

export default function Caja() {
  const hoy = hoyLima();
  const [desde, setDesde] = useState(hoy); const [hasta, setHasta] = useState(hoy);
  const { datos: d } = useDatos<any>(`/gestion/pagos?desde=${desde}&hasta=${hasta}`);
  const admin = useSesion(s => s.usuario?.rol === 'Administrador');
  const abrir = useFicha(s => s.abrir);
  const [anular, setAnular] = useState<any>(null);
  const c = columnas<any>();
  const cols = [
    c.accessor('fechaPago', { header: 'Fecha', cell: i => fechaHora(i.getValue()) }),
    c.accessor('codigoReserva', { header: 'Reserva', cell: i => <button className="font-mono font-semibold text-ocean underline decoration-gold" onClick={e => { e.stopPropagation(); abrir(i.getValue()); }}>{i.getValue()}</button> }),
    c.accessor('cliente', { header: 'Cliente' }), c.accessor('metodo', { header: 'Método' }),
    c.accessor('referencia', { header: 'Referencia', cell: i => i.getValue() || '—' }),
    c.accessor('montoSoles', { header: 'Monto', meta: { derecha: true }, cell: i => <>{soles(i.getValue())}{i.row.original.moneda === 'USD' && <span className="block text-xs text-muted">US$ {i.row.original.monto.toFixed(2)} × {i.row.original.tipoCambio}</span>}</> }),
    c.accessor('registradoPor', { header: 'Registró', cell: i => i.getValue() || 'Web' }),
    c.accessor('estado', { header: 'Estado', cell: i => <><Estado valor={i.getValue()} />{i.row.original.motivoAnulacion && <span className="block text-xs text-muted">{i.row.original.motivoAnulacion}</span>}</> }),
    ...(admin ? [c.display({ id: 'acciones', header: () => <span className="sr-only">Acciones</span>, cell: i => i.row.original.estado === 'Aprobado' ?
      <button onClick={() => setAnular(i.row.original)} aria-label={`Anular pago de ${i.row.original.cliente}`} className="grid size-8 place-items-center rounded-lg text-bad hover:bg-bad-bg"><XCircle className="size-4" /></button> : null })] : [])
  ];
  const colsDev = [
    c.accessor(x => x.fechaResultado ?? x.fecha, { id: 'fecha', header: 'Fecha', cell: i => fechaHora(i.getValue()) }),
    c.accessor('codigoReserva', { header: 'Reserva', cell: i => <button className="font-mono font-semibold text-ocean underline decoration-gold" onClick={() => abrir(i.getValue())}>{i.getValue()}</button> }),
    c.accessor('cliente', { header: 'Cliente' }),
    c.accessor('medio', { header: 'Medio', cell: i => <>{i.getValue() === 'Pasarela' ? ETIQUETAS[i.row.original.pasarela] ?? i.row.original.pasarela : `Manual · ${i.row.original.metodo}`}<span className="block text-xs text-muted">{i.row.original.motivo}{i.row.original.reduceTotal ? ' · descuento' : ''}</span></> }),
    c.accessor('monto', { header: 'Monto', meta: { derecha: true }, cell: i => <span className="text-bad">−{soles(i.getValue())}</span> }),
    c.accessor('estado', { header: 'Estado', cell: i => <><Estado valor={i.getValue()} />{i.row.original.estado !== 'Completada' && i.row.original.mensaje && <span className="block max-w-56 text-xs text-muted">{i.row.original.mensaje}</span>}</> })
  ];
  const sel = 'h-10 rounded-lg border border-[#D9D6CE] bg-white px-2 text-sm';
  return (
    <>
      <Cabecera titulo="Caja y pagos" sub="Cobros por método de pago, en hora de Lima."><BotonP variante="claro" onClick={() => window.print()}><Printer className="size-4" />Imprimir cierre</BotonP></Cabecera>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4 print:hidden">
        <label className="grid gap-1 text-xs text-muted">Desde<input type="date" className={sel} value={desde} onChange={e => setDesde(e.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted">Hasta<input type="date" className={sel} value={hasta} onChange={e => setHasta(e.target.value)} /></label>
        {[['Hoy', hoy, hoy], ['Ayer', sumarDias(hoy, -1), sumarDias(hoy, -1)], ['Este mes', hoy.slice(0, 8) + '01', hoy]].map(([t, a, b]) =>
          <button key={t} onClick={() => { setDesde(a); setHasta(b); }} aria-pressed={desde === a && hasta === b} className={`rounded-full border px-3 py-1.5 text-sm ${desde === a && hasta === b ? 'border-ocean bg-ocean text-white' : 'border-line'}`}>{t}</button>)}
      </div>
      {!d ? <Cargando /> : <>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div className="col-span-2"><Kpi icono={Vault} tono="ok" etiqueta={`${d.devuelto ? 'Neto cobrado' : 'Total cobrado'} · ${desde === hasta ? fechaMedia(desde) : `${fechaMedia(desde)} – ${fechaMedia(hasta)}`}`} valor={soles(d.neto)}
            sub={d.devuelto ? `${soles(d.total)} cobrado − ${soles(d.devuelto)} devuelto` : `${d.cantidad} pago(s) aprobados`} /></div>
          {d.porMetodo.map((m: any) => <Kpi key={m.metodo} icono={ICONO[m.metodo] ?? Banknote} etiqueta={m.metodo} valor={soles0(m.monto)} sub={`${m.cantidad} pago(s)`} />)}
        </div>
        <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Pagos">
          <Tabla etiqueta="pagos" datos={d.pagos} columnas={cols} vacio="No hay pagos en este periodo." porPagina={25}
            csv={{ nombre: `caja-${desde}-${hasta}.csv`, encabezados: ['Fecha', 'Reserva', 'Cliente', 'Método', 'Moneda', 'Monto', 'Tipo de cambio', 'Monto S/', 'Referencia', 'Estado', 'Registró'],
              filas: p => [p.fechaPago, p.codigoReserva, p.cliente, p.metodo, p.moneda, p.monto, p.tipoCambio, p.montoSoles, p.referencia, p.estado, p.registradoPor ?? 'Web'] }} />
        </section>
        {d.devoluciones.length > 0 && <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-white" aria-label="Devoluciones">
          <h2 className="flex items-center gap-2 px-5 pt-4 font-medium"><Undo2 className="size-4 text-gold-dark" aria-hidden />Devoluciones del periodo</h2>
          <Tabla etiqueta="devoluciones" datos={d.devoluciones} columnas={colsDev} buscador={false} vacio="Sin devoluciones."
            csv={{ nombre: `devoluciones-${desde}-${hasta}.csv`, encabezados: ['Fecha', 'Reserva', 'Cliente', 'Monto', 'Medio', 'Pasarela', 'Estado', 'Motivo', 'Descuento', 'Registró'],
              filas: x => [x.fechaResultado ?? x.fecha, x.codigoReserva, x.cliente, x.monto, x.medio, x.pasarela, x.estado, x.motivo, x.reduceTotal ? 'Sí' : 'No', x.registradoPor] }} />
        </section>}
      </>}
      <FormAnular pago={anular} abierto={!!anular} alCerrar={() => setAnular(null)} />
    </>
  );
}
