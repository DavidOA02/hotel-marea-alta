'use client';
import { useState } from 'react';
import { BedDouble, BellRing, Brush, CheckCheck, Play, Printer, Sparkles, UserRound, Wrench, X } from 'lucide-react';
import { ETIQUETAS } from '@marea/shared';
import { fechaHora, fechaLarga } from '@/lib/formato';
import { apiPanel, refrescar } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { BotonP, Cabecera, Cargando, confirmar, Estado, Kpi, useDatos } from '@/components/panel/base';
import { Tabla, columnas } from '@/components/panel/tabla';
import { useFicha } from '@/components/panel/reservas';
import { FormAsignar, FormTarea, FormTerminar, useOrden } from '@/components/panel/operacion';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' });

/** Plan de limpieza del día: qué habitación limpiar primero, quién la tiene y cuánto lleva. Se imprime como hoja de trabajo. */
export default function Limpieza() {
  const { datos: d } = useDatos<any>('/gestion/limpieza');
  const abrirReserva = useFicha(s => s.abrir);
  const abrirOrden = useOrden(s => s.abrir);
  const [todas, setTodas] = useState(false);
  const [programar, setProgramar] = useState<any>(null), [asignar, setAsignar] = useState<any>(null), [terminar, setTerminar] = useState<any>(null);
  if (!d) return <Cargando />;

  const accion = async (ruta: string, body: object = {}) => {
    try { const x = await apiPanel(ruta, { method: 'POST', body }); avisar(x.mensaje); refrescar(); } catch (e: any) { avisar(e.message, 'error'); }
  };
  const lista = d.habitaciones.filter((h: any) => todas || h.necesita || h.tareaId);
  const c = columnas<any>();
  const icono = 'grid size-8 place-items-center rounded-lg border border-line bg-white hover:bg-sand';
  const cols = [
    c.accessor('numero', { header: 'Hab.', cell: i => <><b className="text-lg text-ocean">{i.getValue()}</b><span className="block text-xs text-muted">{i.row.original.tipo} · piso {i.row.original.piso}</span></> }),
    c.accessor('situacion', { header: 'Situación', cell: i => { const h = i.row.original; return <>{i.getValue()}
      {h.huesped && <button className="block max-w-48 truncate text-left text-xs text-ocean underline decoration-gold" onClick={() => abrirReserva(h.codigoReserva)}>{h.huesped}</button>}
      {h.situacion === 'Llega hoy' && h.horaLlegada && <span className="block text-xs text-muted">Llega {h.horaLlegada}</span>}</>; } }),
    c.accessor('estadoLimpieza', { header: 'Limpieza', cell: i => <Estado valor={i.getValue()} /> }),
    c.accessor(h => h.tareaTipo ?? h.necesita ?? '', { id: 'tarea', header: 'Tarea', cell: i => { const h = i.row.original;
      if (h.tareaId) return <>{ETIQUETAS[h.tareaTipo]}<span className="block text-xs text-muted">{h.asignadaA ?? 'Sin asignar'}{h.tareaEstado === 'EnCurso' && h.inicio ? ` · desde ${hora(h.inicio)}` : ''}</span></>;
      if (h.necesita) return <span className="text-muted">{ETIQUETAS[h.necesita]} · sin programar</span>;
      return <span className="text-xs text-muted">{h.ultimaLimpieza ? `Última: ${fechaHora(h.ultimaLimpieza)}` : 'Lista'}</span>; } }),
    c.accessor(h => ({ Alta: 0, Media: 1, Baja: 2 } as any)[h.prioridad] ?? 9, { id: 'prioridad', header: 'Prioridad', cell: i => { const h = i.row.original;
      return h.prioridad ? <><Estado valor={h.prioridad} />{h.prioridad === 'Alta' && <span className="block text-xs text-bad">Llega un huésped hoy</span>}</> : null; } }),
    c.display({ id: 'acciones', header: () => <span className="sr-only">Acciones</span>, cell: i => { const h = i.row.original;
      return <div className="flex flex-wrap justify-end gap-1 print:hidden">
        {!h.tareaId && h.necesita && <>
          <BotonP variante="claro" className="!min-h-8 !px-2.5" onClick={() => setProgramar(h)}><UserRound className="size-4" />Programar</BotonP>
          <button className={icono} title="Empezar ahora" aria-label={`Empezar la limpieza de la habitación ${h.numero}`} onClick={() => accion('/gestion/limpieza', { habitacionId: h.id, tipo: h.necesita, iniciar: true })}><Play className="size-4" /></button>
        </>}
        {h.tareaEstado === 'Pendiente' && <>
          <BotonP variante="claro" className="!min-h-8 !px-2.5" onClick={() => setAsignar(h)}><UserRound className="size-4" />{h.asignadaA ? 'Reasignar' : 'Asignar'}</BotonP>
          <button className={icono} title="Empezar" aria-label={`Empezar la limpieza de la habitación ${h.numero}`} onClick={() => accion(`/gestion/limpieza/${h.tareaId}/iniciar`)}><Play className="size-4" /></button>
        </>}
        {h.tareaId && <BotonP variante="ok" className="!min-h-8 !px-2.5" onClick={() => setTerminar(h)}><CheckCheck className="size-4" />Lista</BotonP>}
        {h.tareaId && <button className={icono} title="Anular" aria-label={`Anular la limpieza de la habitación ${h.numero}`}
          onClick={async () => { if (await confirmar('Anular limpieza', `¿Anular la ${ETIQUETAS[h.tareaTipo].toLowerCase()} de la habitación ${h.numero}?`, 'Anular', true)) accion(`/gestion/limpieza/${h.tareaId}/anular`); }}><X className="size-4" /></button>}
        <button className={icono} title="Reportar desperfecto" aria-label={`Reportar desperfecto en la habitación ${h.numero}`} onClick={() => abrirOrden({ habitacionId: h.id })}><Wrench className="size-4" /></button>
      </div>; } })
  ];
  const r = d.resumen;
  return (
    <>
      <Cabecera titulo="Limpieza" sub={<>Plan del {fechaLarga(d.hoy)}. Primero las habitaciones donde llega un huésped hoy.</>}>
        <BotonP variante="claro" onClick={() => window.print()}><Printer className="size-4" />Imprimir hoja</BotonP>
      </Cabecera>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icono={BellRing} tono={r.llegadasSinLimpiar ? 'bad' : 'ok'} etiqueta="Llegan hoy y faltan limpiar" valor={r.llegadasSinLimpiar} />
        <Kpi icono={Sparkles} tono="warn" etiqueta="Por limpiar" valor={r.porLimpiar} />
        <Kpi icono={Brush} tono="info" etiqueta="En limpieza" valor={r.enLimpieza} />
        <Kpi icono={BedDouble} tono="gold" etiqueta="Servicio diario pendiente" valor={r.servicios} />
        <Kpi icono={CheckCheck} tono="ok" etiqueta="Terminadas hoy" valor={r.terminadasHoy} />
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Plan de limpieza">
        <Tabla etiqueta="limpieza" datos={lista} columnas={cols} porPagina={50} placeholder="Buscar habitación, huésped o persona…"
          vacio={todas ? 'No hay habitaciones.' : 'Todo limpio. No hay tareas pendientes.'}
          barra={<label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ocean" checked={todas} onChange={e => setTodas(e.target.checked)} />Ver todas las habitaciones</label>}
          csv={{ nombre: `limpieza-${d.hoy}.csv`, encabezados: ['Habitación', 'Tipo', 'Piso', 'Situación', 'Huésped', 'Limpieza', 'Tarea', 'Estado de la tarea', 'Asignada a', 'Prioridad'],
            filas: h => [h.numero, h.tipo, h.piso, h.situacion, h.huesped, ETIQUETAS[h.estadoLimpieza], h.tareaTipo ? ETIQUETAS[h.tareaTipo] : h.necesita ? ETIQUETAS[h.necesita] : '',
              h.tareaEstado ? ETIQUETAS[h.tareaEstado] : '', h.asignadaA, h.prioridad] }} />
      </section>
      <p className="mt-3 text-sm text-muted print:hidden">El check-out y el cambio de habitación programan solos la limpieza de salida. Al terminar, si encuentras un desperfecto, se abre una orden de mantenimiento.</p>
      <FormTarea habitacion={programar} personal={d.personal} abierto={!!programar} alCerrar={() => setProgramar(null)} />
      <FormAsignar tarea={asignar} personal={d.personal} abierto={!!asignar} alCerrar={() => setAsignar(null)} />
      <FormTerminar tarea={terminar} abierto={!!terminar} alCerrar={() => setTerminar(null)} />
    </>
  );
}
