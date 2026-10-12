'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Ban, CheckCheck, ClipboardList, Lock, Pencil, Play, Plus, Siren } from 'lucide-react';
import { ETIQUETAS, hoyLima, sumarDias } from '@marea/shared';
import { fechaHora, soles } from '@/lib/formato';
import { apiPanel, refrescar } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { BotonP, Cabecera, Cargando, Estado, Kpi, Modal, useDatos } from '@/components/panel/base';
import { Tabla, columnas } from '@/components/panel/tabla';
import { FormCancelarOrden, FormResolverOrden, rangoBloqueo, ubicacion, useOrden } from '@/components/panel/operacion';

export default function Pagina() {
  return <Suspense fallback={<Cargando />}><Mantenimiento /></Suspense>;
}

/** Órdenes de mantenimiento: abiertas (urgentes primero) y cerradas por periodo. Una orden puede bloquear la habitación por fechas. */
function Mantenimiento() {
  const params = useSearchParams();
  const hoy = hoyLima();
  const [vista, setVista] = useState<'abiertas' | 'cerradas'>('abiertas');
  const [desde, setDesde] = useState(sumarDias(hoy, -29)); const [hasta, setHasta] = useState(hoy);
  const { datos } = useDatos<any[]>(vista === 'abiertas' ? '/gestion/mantenimiento' : `/gestion/mantenimiento?vista=cerradas&desde=${desde}&hasta=${hasta}`);
  const { datos: r } = useDatos<any>('/gestion/mantenimiento/resumen');
  const abrirOrden = useOrden(s => s.abrir);
  const [ver, setVer] = useState<number | null>(null);
  useEffect(() => { const o = Number(params.get('orden')); if (o) setVer(o); }, [params]);   // enlaces de la bitácora

  const c = columnas<any>();
  const cols = [
    c.accessor('id', { header: 'N.°', cell: i => <span className="font-mono font-semibold">{i.getValue()}</span> }),
    c.accessor(o => ubicacion(o), { id: 'ubicacion', header: 'Ubicación', cell: i => <b>{i.getValue()}</b> }),
    c.accessor('categoria', { header: 'Categoría', cell: i => ETIQUETAS[i.getValue()] }),
    c.accessor('descripcion', { header: 'Descripción', cell: i => <span className="line-clamp-2 max-w-sm">{i.getValue()}</span> }),
    c.accessor(o => ({ Urgente: 0, Alta: 1, Media: 2, Baja: 3 } as any)[o.prioridad], { id: 'prioridad', header: 'Prioridad', cell: i => <Estado valor={i.row.original.prioridad} /> }),
    c.accessor('estado', { header: 'Estado', cell: i => <Estado valor={i.getValue()} /> }),
    c.accessor(o => o.bloqueoDesde ?? '', { id: 'bloqueo', header: 'Bloqueo', cell: i => { const o = i.row.original;
      return o.bloquea ? <span className={o.bloqueadaHoy ? 'font-medium text-bad' : ''}>{rangoBloqueo(o)}{o.bloqueadaHoy && <span className="block text-xs">bloqueada hoy</span>}</span> : <span className="text-muted">—</span>; } }),
    c.accessor('fechaReporte', { header: 'Reportó', cell: i => <>{fechaHora(i.getValue())}<span className="block text-xs text-muted">{i.row.original.reportadoPor}</span></> }),
    c.accessor('asignadoA', { header: 'Asignado', cell: i => i.getValue() || <span className="text-muted">—</span> })
  ];
  const sel = 'h-10 rounded-lg border border-[#D9D6CE] bg-white px-2 text-sm';
  return (
    <>
      <Cabecera titulo="Mantenimiento" sub="Órdenes por habitación o área común. Una orden puede bloquear la habitación: no se vende ni se asigna en esas fechas.">
        <BotonP onClick={() => abrirOrden()}><Plus className="size-4" />Nueva orden</BotonP>
      </Cabecera>
      {r && <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi icono={ClipboardList} etiqueta="Órdenes abiertas" valor={r.abiertas} />
        <Kpi icono={Siren} tono={r.urgentes ? 'bad' : 'ok'} etiqueta="Urgentes" valor={r.urgentes} />
        <div className="col-span-2 lg:col-span-1"><Kpi icono={Lock} tono={r.bloqueadasHoy ? 'warn' : 'ok'} etiqueta="Habitaciones bloqueadas hoy" valor={r.bloqueadasHoy} /></div>
      </div>}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4">
        <div className="mr-auto grid grid-cols-2 rounded-lg bg-sand p-1 text-sm" role="group" aria-label="Vista">
          {([['abiertas', 'Abiertas'], ['cerradas', 'Resueltas y canceladas']] as const).map(([v, t]) =>
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)} className={`rounded-md px-3 py-2 ${vista === v ? 'bg-white font-medium shadow-sm' : ''}`}>{t}</button>)}
        </div>
        {vista === 'cerradas' && <>
          <label className="grid gap-1 text-xs text-muted">Cerradas desde<input type="date" className={sel} value={desde} onChange={e => setDesde(e.target.value)} /></label>
          <label className="grid gap-1 text-xs text-muted">Hasta<input type="date" className={sel} value={hasta} onChange={e => setHasta(e.target.value)} /></label>
        </>}
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Órdenes de mantenimiento">
        {!datos ? <Cargando /> : <Tabla etiqueta="órdenes de mantenimiento" datos={datos} columnas={cols} alFila={o => setVer(o.id)} porPagina={25}
          vacio={vista === 'abiertas' ? 'No hay órdenes abiertas.' : 'No hay órdenes cerradas en este periodo.'}
          barra={vista === 'cerradas' && datos.length > 0 ? <span className="text-sm text-muted">Costo total: {soles(datos.reduce((s, o) => s + (o.costo ?? 0), 0))}</span> : null}
          csv={{ nombre: `mantenimiento-${vista}-${hoy}.csv`, encabezados: ['N.°', 'Ubicación', 'Categoría', 'Descripción', 'Prioridad', 'Estado', 'Bloqueo desde', 'Vuelve a venderse', 'Reportó', 'Fecha', 'Asignado', 'Cerró', 'Cierre', 'Solución', 'Costo'],
            filas: o => [o.id, ubicacion(o), ETIQUETAS[o.categoria], o.descripcion, o.prioridad, ETIQUETAS[o.estado], o.bloqueoDesde, o.bloqueoHasta, o.reportadoPor, o.fechaReporte,
              o.asignadoA, o.cerradoPor, o.fechaCierre, o.solucion, o.costo] }} />}
      </section>
      <DetalleOrden id={ver} alCerrar={() => setVer(null)} />
    </>
  );
}

function DetalleOrden({ id, alCerrar }: { id: number | null; alCerrar: () => void }) {
  const { datos: o } = useDatos<any>(id ? `/gestion/mantenimiento/${id}` : null);
  const abrirOrden = useOrden(s => s.abrir);
  const [resolver, setResolver] = useState(false), [cancelar, setCancelar] = useState(false);
  const abierta = o && ['Pendiente', 'EnProceso'].includes(o.estado);
  const iniciar = async () => { try { const x = await apiPanel(`/gestion/mantenimiento/${o.id}/iniciar`, { method: 'POST', body: {} }); avisar(x.mensaje); refrescar(); } catch (e: any) { avisar(e.message, 'error'); } };
  const listo = o && o.id === id;
  return (
    <>
      <Modal abierto={!!id} alCerrar={alCerrar} titulo={`Orden de mantenimiento N.° ${id ?? ''}`} ancho="max-w-2xl"
        pie={listo && abierta ? <>
          <BotonP variante="claro" className="text-bad" onClick={() => setCancelar(true)}><Ban className="size-4" />Cancelar orden</BotonP>
          <BotonP variante="claro" onClick={() => { alCerrar(); abrirOrden({ orden: o }); }}><Pencil className="size-4" />Editar</BotonP>
          {o.estado === 'Pendiente' && <BotonP variante="claro" onClick={iniciar}><Play className="size-4" />En proceso</BotonP>}
          <BotonP variante="ok" onClick={() => setResolver(true)}><CheckCheck className="size-4" />Resolver</BotonP>
        </> : <BotonP onClick={alCerrar}>Cerrar</BotonP>}>
        {!listo ? <Cargando /> : <div className="grid gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-2"><Estado valor={o.estado} /><Estado valor={o.prioridad} />{o.bloqueadaHoy && <Estado valor="Bloqueada hoy" />}</div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {[['Ubicación', ubicacion(o)], ['Categoría', ETIQUETAS[o.categoria]], ['Reportó', `${o.reportadoPor} · ${fechaHora(o.fechaReporte)}`], ['Asignado a', o.asignadoA ?? '—'],
              ['Bloqueo', o.bloquea ? (abierta ? `${rangoBloqueo(o)} (el último día ya se vende)` : rangoBloqueo(o)) : 'No bloquea la habitación'], ['En proceso desde', o.fechaInicio ? fechaHora(o.fechaInicio) : '—']].map(([k, v]) =>
              <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
            <div className="sm:col-span-2"><dt className="text-xs text-muted">Descripción</dt><dd>{o.descripcion}</dd></div>
            {o.limpiezaId && <p className="text-xs text-muted sm:col-span-2">Reportada al terminar una limpieza.</p>}
            {!abierta && <>
              <div><dt className="text-xs text-muted">{o.estado === 'Resuelto' ? 'Resolvió' : 'Canceló'}</dt><dd className="font-medium">{o.cerradoPor} · {fechaHora(o.fechaCierre)}</dd></div>
              {o.costo !== null && <div><dt className="text-xs text-muted">Costo</dt><dd className="font-medium">{soles(o.costo)}</dd></div>}
              <div className="sm:col-span-2"><dt className="text-xs text-muted">{o.estado === 'Resuelto' ? 'Qué se hizo' : 'Motivo'}</dt><dd>{o.solucion}</dd></div>
            </>}
          </dl>
        </div>}
      </Modal>
      <FormResolverOrden orden={o} abierto={resolver} alCerrar={() => setResolver(false)} />
      <FormCancelarOrden orden={o} abierto={cancelar} alCerrar={() => setCancelar(false)} />
    </>
  );
}
