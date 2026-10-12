'use client';
import { useState } from 'react';
import { CircleAlert, FileMinus, Landmark, Percent, ReceiptText, RefreshCw, XCircle } from 'lucide-react';
import { ESTADOS_COMPROBANTE, ETIQUETAS, hoyLima, MOTIVOS_NOTA_CREDITO, sumarDias, TIPOS_COMPROBANTE } from '@marea/shared';
import { fechaMedia, soles } from '@/lib/formato';
import { useSesion } from '@/stores/sesion';
import { Cabecera, Cargando, Estado, Kpi, useDatos } from '@/components/panel/base';
import { Tabla, columnas } from '@/components/panel/tabla';
import { admiteBaja, admiteNota, EnlacesComprobante, FormularioNotaCredito, nombreComprobante, sincronizarComprobante } from '@/components/panel/comprobantes';
import { FormAnularComprobante } from '@/components/panel/formularios';
import { useFicha } from '@/components/panel/reservas';

const DOC: Record<string, string> = { '1': 'DNI', '4': 'CE', '6': 'RUC', '7': 'Pasaporte' };

export default function Comprobantes() {
  const hoy = hoyLima();
  const [desde, setDesde] = useState(hoy.slice(0, 8) + '01'); const [hasta, setHasta] = useState(hoy); const [estado, setEstado] = useState('');
  const { datos: d } = useDatos<any>(`/gestion/comprobantes?desde=${desde}&hasta=${hasta}${estado ? `&estado=${estado}` : ''}`);
  const admin = useSesion(s => s.usuario?.rol === 'Administrador');
  const abrir = useFicha(s => s.abrir);
  const [anular, setAnular] = useState<any>(null);
  const [nota, setNota] = useState<any>(null);
  const c = columnas<any>();
  const cols = [
    c.accessor('fechaEmision', { header: 'Emisión', cell: i => fechaMedia(i.getValue()) }),
    c.accessor(k => nombreComprobante(k), { id: 'comprobante', header: 'Comprobante', cell: i => <><span className="font-medium">{i.getValue()}</span>
      {i.row.original.tipo === '07' && <span className="block text-xs text-muted">Modifica {TIPOS_COMPROBANTE[i.row.original.refTipo]} {i.row.original.refSerie}-{i.row.original.refNumero} · {MOTIVOS_NOTA_CREDITO[i.row.original.motivoNota]}</span>}
      {i.row.original.anuladoConNota && <span className="block text-xs text-bad">Neutralizada con {i.row.original.anuladoConNota}</span>}
      {i.row.original.exportacion > 0 && <span className="block text-xs text-muted">Exportación de servicios</span>}</> }),
    c.accessor('clienteNombre', { header: 'Cliente', cell: i => <>{i.getValue()}<span className="block text-xs text-muted">{DOC[i.row.original.clienteTipoDoc] ?? ''} {i.row.original.clienteNumDoc}</span></> }),
    c.accessor('codigoReserva', { header: 'Reserva', cell: i => <button className="font-mono font-semibold text-ocean underline decoration-gold" onClick={e => { e.stopPropagation(); abrir(i.getValue()); }}>{i.getValue()}</button> }),
    c.accessor('total', { header: 'Total', meta: { derecha: true }, cell: i => <span className={i.row.original.tipo === '07' ? 'text-bad' : ''}>{i.row.original.tipo === '07' ? '−' : ''}{soles(i.getValue())}</span> }),
    c.accessor('estado', { header: 'Estado', cell: i => <><Estado valor={i.getValue()} />{i.row.original.estado !== 'Aceptado' && i.row.original.mensaje && <span className="block max-w-64 text-xs text-muted">{i.row.original.mensaje}</span>}</> }),
    c.display({ id: 'acciones', header: () => <span className="sr-only">Acciones</span>, cell: i => { const k = i.row.original; return (
      <span className="flex items-center gap-2"><EnlacesComprobante k={k} />
        {k.estado === 'Pendiente' && <button onClick={() => sincronizarComprobante(k.id)} aria-label={`Actualizar estado de ${nombreComprobante(k)}`} title="Actualizar estado" className="grid size-8 place-items-center rounded-lg hover:bg-sand"><RefreshCw className="size-4" /></button>}
        {admin && admiteNota(k) && <button onClick={() => setNota(k)} aria-label={`Nota de crédito para ${nombreComprobante(k)}`} title="Nota de crédito" className="grid size-8 place-items-center rounded-lg text-bad hover:bg-bad-bg"><FileMinus className="size-4" /></button>}
        {admin && admiteBaja(k) && <button onClick={() => setAnular(k)} aria-label={`Dar de baja ${nombreComprobante(k)}`} title="Dar de baja (hasta 7 días)" className="grid size-8 place-items-center rounded-lg text-bad hover:bg-bad-bg"><XCircle className="size-4" /></button>}
      </span>); } })
  ];
  const sel = 'h-10 rounded-lg border border-[#D9D6CE] bg-white px-2 text-sm';
  return (
    <>
      <Cabecera titulo="Comprobantes electrónicos" sub={d ? (d.proveedor ? `Boletas y facturas enviadas a SUNAT mediante ${d.proveedor === 'Simulado' ? 'el OSE simulado (sin validez tributaria)' : d.proveedor}.` : 'La facturación electrónica no está configurada en la API.') : ' '} />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4">
        <label className="grid gap-1 text-xs text-muted">Desde<input type="date" className={sel} value={desde} onChange={e => setDesde(e.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted">Hasta<input type="date" className={sel} value={hasta} onChange={e => setHasta(e.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted">Estado<select className={sel} value={estado} onChange={e => setEstado(e.target.value)}><option value="">Todos</option>{ESTADOS_COMPROBANTE.map(x => <option key={x} value={x}>{ETIQUETAS[x]}</option>)}</select></label>
        {[['Este mes', hoy.slice(0, 8) + '01', hoy], ['Últimos 7 días', sumarDias(hoy, -6), hoy]].map(([t, a, b]) =>
          <button key={t} onClick={() => { setDesde(a); setHasta(b); }} aria-pressed={desde === a && hasta === b} className={`rounded-full border px-3 py-1.5 text-sm ${desde === a && hasta === b ? 'border-ocean bg-ocean text-white' : 'border-line'}`}>{t}</button>)}
      </div>
      {!d ? <Cargando /> : <>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icono={ReceiptText} tono="ok" etiqueta="Ventas netas" valor={soles(d.totales.total)} sub={`${d.totales.cantidad} comprobante(s) · ${d.totales.notas} nota(s) de crédito`} />
          <Kpi icono={Percent} etiqueta="IGV" valor={soles(d.totales.igv)} sub={`Op. gravada ${soles(d.totales.gravada)}`} />
          <Kpi icono={Landmark} tono="info" etiqueta="Exportación de servicios" valor={soles(d.totales.exportacion)} sub="Hospedaje a no domiciliados" />
          <Kpi icono={CircleAlert} tono={d.totales.pendientes || d.totales.rechazados ? 'warn' : 'ok'} etiqueta="Por revisar" valor={d.totales.pendientes + d.totales.rechazados}
            sub={`${d.totales.pendientes} pendiente(s) · ${d.totales.rechazados} rechazado(s)`} />
        </div>
        <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Comprobantes">
          <Tabla etiqueta="comprobantes" datos={d.comprobantes} columnas={cols} vacio="No hay comprobantes en este periodo." porPagina={25} placeholder="Serie, cliente, documento, reserva…"
            csv={{ nombre: `registro-ventas-${desde}-${hasta}.csv`, encabezados: ['Fecha', 'Tipo', 'Serie', 'Número', 'Tipo doc.', 'N.° doc.', 'Cliente', 'Op. gravada', 'Exportación', 'IGV', 'Total', 'Estado', 'Reserva', 'Modifica'],
              filas: k => { const s = k.tipo === '07' ? -1 : 1; return [k.fechaEmision, TIPOS_COMPROBANTE[k.tipo], k.serie, k.numero, DOC[k.clienteTipoDoc], k.clienteNumDoc, k.clienteNombre, s * k.gravada, s * k.exportacion, s * k.igv, s * k.total, k.estado, k.codigoReserva, k.tipo === '07' ? `${k.refSerie}-${k.refNumero}` : '']; } }} />
        </section>
      </>}
      <FormAnularComprobante k={anular} abierto={!!anular} alCerrar={() => setAnular(null)} />
      <FormularioNotaCredito k={nota} abierto={!!nota} alCerrar={() => setNota(null)} />
    </>
  );
}
