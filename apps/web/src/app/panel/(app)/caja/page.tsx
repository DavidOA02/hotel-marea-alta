'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Banknote, CreditCard, Landmark, Printer, Smartphone, Undo2, Vault, XCircle } from 'lucide-react';
import { ETIQUETAS, hoyLima, sumarDias } from '@marea/shared';
import { dolares, fechaHora, fechaMedia, soles, soles0 } from '@/lib/formato';
import { useSesion } from '@/stores/sesion';
import { BotonP, Cabecera, Cargando, Estado, Kpi, useDatos } from '@/components/panel/base';
import { Tabla, columnas } from '@/components/panel/tabla';
import { FormAnular } from '@/components/panel/formularios';
import { useFicha } from '@/components/panel/reservas';
import { Diferencia, estadoTurno, MiTurno } from '@/components/panel/caja';

const ICONO: Record<string, React.ElementType> = { Tarjeta: CreditCard, Yape: Smartphone, Plin: Smartphone, Transferencia: Landmark, Efectivo: Banknote };

export default function Pagina() {
  return <Suspense fallback={<Cargando />}><Caja /></Suspense>;
}

function Caja() {
  const hoy = hoyLima();
  const params = useSearchParams();
  const [vista, setVista] = useState<'cobros' | 'turnos'>(params.get('vista') === 'turnos' ? 'turnos' : 'cobros');
  useEffect(() => { if (params.get('vista') === 'turnos') setVista('turnos'); }, [params]);   // enlaces de la campana estando ya en Caja
  const [desde, setDesde] = useState(hoy); const [hasta, setHasta] = useState(hoy);
  const sel = 'h-10 rounded-lg border border-[#D9D6CE] bg-white px-2 text-sm';
  return (
    <>
      <Cabecera titulo="Caja y pagos" sub="Tu turno de caja, los cobros por método de pago y los arqueos, en hora de Lima."><BotonP variante="claro" onClick={() => window.print()}><Printer className="size-4" />Imprimir</BotonP></Cabecera>
      <MiTurno />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4 print:hidden">
        <div className="mr-auto grid grid-cols-2 rounded-lg bg-sand p-1 text-sm" role="group" aria-label="Vista">
          {([['cobros', 'Cobros del periodo'], ['turnos', 'Turnos y arqueos']] as const).map(([v, t]) =>
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)} className={`rounded-md px-3 py-2 ${vista === v ? 'bg-white font-medium shadow-sm' : ''}`}>{t}</button>)}
        </div>
        <label className="grid gap-1 text-xs text-muted">Desde<input type="date" className={sel} value={desde} onChange={e => setDesde(e.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted">Hasta<input type="date" className={sel} value={hasta} onChange={e => setHasta(e.target.value)} /></label>
        {[['Hoy', hoy, hoy], ['Ayer', sumarDias(hoy, -1), sumarDias(hoy, -1)], ['Últimos 7 días', sumarDias(hoy, -6), hoy], ['Este mes', hoy.slice(0, 8) + '01', hoy]].map(([t, a, b]) =>
          <button key={t} onClick={() => { setDesde(a); setHasta(b); }} aria-pressed={desde === a && hasta === b} className={`rounded-full border px-3 py-1.5 text-sm ${desde === a && hasta === b ? 'border-ocean bg-ocean text-white' : 'border-line'}`}>{t}</button>)}
      </div>
      {vista === 'cobros' ? <Cobros desde={desde} hasta={hasta} /> : <Turnos desde={desde} hasta={hasta} />}
    </>
  );
}

/** Cobros y devoluciones del periodo por método de pago. */
function Cobros({ desde, hasta }: { desde: string; hasta: string }) {
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
    c.accessor('registradoPor', { header: 'Registró', cell: i => <>{i.getValue() || 'Web'}{i.row.original.turnoId && <span className="block text-xs text-muted">Turno N.° {i.row.original.turnoId}</span>}</> }),
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
  if (!d) return <Cargando />;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-6">
        <div className="col-span-2"><Kpi icono={Vault} tono="ok" etiqueta={`${d.devuelto ? 'Neto cobrado' : 'Total cobrado'} · ${desde === hasta ? fechaMedia(desde) : `${fechaMedia(desde)} – ${fechaMedia(hasta)}`}`} valor={soles(d.neto)}
          sub={d.devuelto ? `${soles(d.total)} cobrado − ${soles(d.devuelto)} devuelto` : `${d.cantidad} pago(s) aprobados`} /></div>
        {d.porMetodo.map((m: any) => <Kpi key={m.metodo} icono={ICONO[m.metodo] ?? Banknote} etiqueta={m.metodo} valor={soles0(m.monto)} sub={`${m.cantidad} pago(s)`} />)}
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Pagos">
        <Tabla etiqueta="pagos" datos={d.pagos} columnas={cols} vacio="No hay pagos en este periodo." porPagina={25}
          csv={{ nombre: `caja-${desde}-${hasta}.csv`, encabezados: ['Fecha', 'Reserva', 'Cliente', 'Método', 'Moneda', 'Monto', 'Tipo de cambio', 'Monto S/', 'Referencia', 'Estado', 'Registró', 'Turno'],
            filas: p => [p.fechaPago, p.codigoReserva, p.cliente, p.metodo, p.moneda, p.monto, p.tipoCambio, p.montoSoles, p.referencia, p.estado, p.registradoPor ?? 'Web', p.turnoId] }} />
      </section>
      {d.devoluciones.length > 0 && <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-white" aria-label="Devoluciones">
        <h2 className="flex items-center gap-2 px-5 pt-4 font-medium"><Undo2 className="size-4 text-gold-dark" aria-hidden />Devoluciones del periodo</h2>
        <Tabla etiqueta="devoluciones" datos={d.devoluciones} columnas={colsDev} buscador={false} vacio="Sin devoluciones."
          csv={{ nombre: `devoluciones-${desde}-${hasta}.csv`, encabezados: ['Fecha', 'Reserva', 'Cliente', 'Monto', 'Medio', 'Pasarela', 'Estado', 'Motivo', 'Descuento', 'Registró'],
            filas: x => [x.fechaResultado ?? x.fecha, x.codigoReserva, x.cliente, x.monto, x.medio, x.pasarela, x.estado, x.motivo, x.reduceTotal ? 'Sí' : 'No', x.registradoPor] }} />
      </section>}
      <FormAnular pago={anular} abierto={!!anular} alCerrar={() => setAnular(null)} />
    </>
  );
}

/** Turnos abiertos en el periodo (y los que siguen abiertos) con su arqueo. El recepcionista ve solo los suyos. */
function Turnos({ desde, hasta }: { desde: string; hasta: string }) {
  const router = useRouter();
  const { datos } = useDatos<any[]>(`/gestion/turnos?desde=${desde}&hasta=${hasta}`);
  const admin = useSesion(s => s.usuario?.rol === 'Administrador');
  const c = columnas<any>();
  const esperado = (t: any) => t.estado === 'Abierto' ? t.esperadoActual : { soles: t.esperadoSoles, dolares: t.esperadoDolares };
  const cols = [
    c.accessor('id', { header: 'N.°', cell: i => <span className="font-mono font-semibold">{i.getValue()}</span> }),
    ...(admin ? [c.accessor('usuario', { header: 'Usuario' })] : []),
    c.accessor('fechaApertura', { header: 'Apertura', cell: i => fechaHora(i.getValue()) }),
    c.accessor('fechaCierre', { header: 'Cierre', cell: i => i.getValue() ? fechaHora(i.getValue()) : <span className="text-muted">En curso</span> }),
    c.accessor('cobrado', { header: 'Cobrado', meta: { derecha: true }, cell: i => <>{soles(i.getValue())}<span className="block text-xs text-muted">{i.row.original.pagos} pago(s)</span></> }),
    c.accessor(t => esperado(t).soles, { id: 'esperado', header: 'Efectivo esperado', meta: { derecha: true }, cell: i => { const e = esperado(i.row.original);
      return <>{soles(e.soles)}{e.dolares !== 0 && <span className="block text-xs text-muted">{dolares(e.dolares)}</span>}{i.row.original.estado === 'Abierto' && <span className="block text-xs text-muted">ahora</span>}</>; } }),
    c.accessor('contadoSoles', { header: 'Contado', meta: { derecha: true }, cell: i => i.getValue() === null ? '—' : <>{soles(i.getValue())}{(i.row.original.contadoDolares || i.row.original.esperadoDolares) ? <span className="block text-xs text-muted">{dolares(i.row.original.contadoDolares)}</span> : null}</> }),
    c.accessor('diferenciaSoles', { header: 'Diferencia', meta: { derecha: true }, cell: i => <><Diferencia valor={i.getValue()} />{Math.abs(i.row.original.diferenciaDolares ?? 0) >= 0.005 && <span className="block text-xs"><Diferencia valor={i.row.original.diferenciaDolares} moneda="USD" /></span>}</> }),
    c.accessor(t => estadoTurno(t), { id: 'estado', header: 'Estado', cell: i => <Estado valor={i.getValue()} /> })
  ];
  if (!datos) return <Cargando />;
  const cerrados = datos.filter(t => t.estado === 'Cerrado');
  const neto = cerrados.reduce((s, t) => s + t.diferenciaSoles, 0);
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Turnos de caja">
      <Tabla etiqueta="turnos de caja" datos={datos} columnas={cols} alFila={t => router.push(`/panel/caja/turnos/${t.id}`)} porPagina={25} placeholder="Buscar por usuario o N.°…"
        vacio="No hay turnos de caja en este periodo."
        barra={cerrados.length > 0 && <span className="text-sm text-muted">{cerrados.length} arqueo(s) · diferencia neta <Diferencia valor={Math.round(neto * 100) / 100} /></span>}
        csv={{ nombre: `turnos-${desde}-${hasta}.csv`, encabezados: ['N.°', 'Usuario', 'Estado', 'Apertura', 'Cierre', 'Fondo inicial', 'Cobrado S/', 'Pagos', 'Esperado S/', 'Contado S/', 'Diferencia S/', 'Esperado US$', 'Contado US$', 'Diferencia US$', 'Observaciones', 'Revisó'],
          filas: t => [t.id, t.usuario, ETIQUETAS[estadoTurno(t)], t.fechaApertura, t.fechaCierre, t.fondoInicial, t.cobrado, t.pagos, esperado(t).soles, t.contadoSoles, t.diferenciaSoles,
            esperado(t).dolares, t.contadoDolares, t.diferenciaDolares, t.observaciones, t.revisadoPor] }} />
    </section>
  );
}
