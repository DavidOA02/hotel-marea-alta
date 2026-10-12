'use client';
import { useState } from 'react';
import { Brush, LayoutGrid, List, Plus, Sparkles, Trash2, Wrench } from 'lucide-react';
import Link from 'next/link';
import { ETIQUETAS } from '@marea/shared';
import { fechaDia, soles0 } from '@/lib/formato';
import { apiPanel, refrescar, useSesion } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { BotonP, Cabecera, Cargando, confirmar, Estado, PanelLateral, useDatos } from '@/components/panel/base';
import { Tabla, columnas } from '@/components/panel/tabla';
import { FormHabitacion } from '@/components/panel/formularios';
import { useFicha } from '@/components/panel/reservas';
import { useOrden } from '@/components/panel/operacion';

const COLOR: Record<string, string> = { Libre: 'border-t-[#3E9B66] text-ok', Ocupada: 'border-t-ocean text-ocean', 'Llegada hoy': 'border-t-gold text-gold-dark', 'Salida hoy': 'border-t-[#D9822B] text-[#A85D12]', Mantenimiento: 'border-t-bad text-bad', 'Fuera de servicio': 'border-t-bad text-bad' };
const FILTROS = ['Todas', 'Libre', 'Ocupada', 'Llegada hoy', 'Salida hoy', 'Mantenimiento', 'Por limpiar'];
const c = columnas<any>();
const cols = [
  c.accessor('numero', { header: 'N.°', cell: i => <b>{i.getValue()}</b> }), c.accessor('tipo', { header: 'Tipo' }), c.accessor('piso', { header: 'Piso' }),
  c.accessor('situacion', { header: 'Situación hoy', cell: i => <>{i.getValue()}{i.row.original.huesped && <span className="block text-xs text-muted">{i.row.original.huesped}</span>}</> }),
  c.accessor('estado', { header: 'Estado', cell: i => <Estado valor={i.getValue()} /> }), c.accessor('estadoLimpieza', { header: 'Limpieza', cell: i => <Estado valor={i.getValue()} /> }),
  c.accessor('precioNoche', { header: 'Tarifa', meta: { derecha: true }, cell: i => soles0(i.getValue()) })
];

export default function Habitaciones() {
  const { datos: habs } = useDatos<any[]>('/gestion/habitaciones');
  const { datos: tipos } = useDatos<any[]>('/gestion/tipos');
  const admin = useSesion(s => s.usuario?.rol === 'Administrador');
  const abrirReserva = useFicha(s => s.abrir);
  const abrirOrden = useOrden(s => s.abrir);
  const [filtro, setFiltro] = useState('Todas');
  const [modo, setModo] = useState<'tablero' | 'lista'>('tablero');
  const [sel, setSel] = useState<any>(null);
  const [form, setForm] = useState<{ h: any | null } | null>(null);
  if (!habs || !tipos) return <Cargando />;
  const lista = habs.filter(h => filtro === 'Todas' || (filtro === 'Por limpiar' ? h.estadoLimpieza !== 'Limpia' : filtro === 'Mantenimiento' ? h.estado !== 'Operativa' || h.bloqueada || h.mantenimientosAbiertos > 0 : h.situacion === filtro));
  const limpieza = async (h: any) => { try { await apiPanel(`/gestion/habitaciones/${h.id}/limpieza`, { method: 'PATCH', body: { estadoLimpieza: h.estadoLimpieza === 'Limpia' ? 'Sucia' : 'Limpia' } }); avisar('Estado de limpieza actualizado.'); setSel(null); refrescar(); } catch (e: any) { avisar(e.message, 'error'); } };
  const eliminar = async (h: any) => {
    if (!await confirmar('Eliminar habitación', `¿Eliminar la habitación ${h.numero}? Esta acción no se puede deshacer.`, 'Eliminar', true)) return;
    try { const r = await apiPanel(`/gestion/habitaciones/${h.id}`, { method: 'DELETE' }); avisar(r.mensaje); setSel(null); refrescar(); } catch (e: any) { avisar(e.message, 'error'); }
  };
  return (
    <>
      <Cabecera titulo="Habitaciones" sub={`${habs.length} habitaciones · ${habs.filter(h => h.situacion === 'Libre').length} libres hoy · ${habs.filter(h => h.estadoLimpieza !== 'Limpia').length} por limpiar`}>
        <div className="flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Vista">
          <button aria-pressed={modo === 'tablero'} onClick={() => setModo('tablero')} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${modo === 'tablero' ? 'bg-ocean text-white' : ''}`}><LayoutGrid className="size-4" />Tablero</button>
          <button aria-pressed={modo === 'lista'} onClick={() => setModo('lista')} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${modo === 'lista' ? 'bg-ocean text-white' : ''}`}><List className="size-4" />Lista</button>
        </div>
        {admin && <BotonP onClick={() => setForm({ h: null })}><Plus className="size-4" />Nueva habitación</BotonP>}
      </Cabecera>
      <div className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-line bg-white p-3" role="group" aria-label="Filtrar habitaciones">
        {FILTROS.map(f => <button key={f} aria-pressed={filtro === f} onClick={() => setFiltro(f)} className={`rounded-full border px-3 py-1.5 text-sm ${filtro === f ? 'border-ocean bg-ocean text-white' : 'border-line'}`}>{f}</button>)}
      </div>
      {modo === 'tablero' ? [...new Set(lista.map(h => h.piso))].map(p => (
        <section key={p} aria-label={`Piso ${p}`} className="mb-5">
          <h2 className="mb-2 text-xs uppercase tracking-[0.16em] text-muted">Piso {p}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {lista.filter(h => h.piso === p).map(h => (
              <button key={h.id} onClick={() => setSel(h)} className={`relative rounded-xl border border-t-4 border-line bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${COLOR[h.situacion]}`}>
                <span className="absolute right-2.5 top-2.5 flex gap-1">{h.estadoLimpieza === 'Sucia' && <Sparkles className="size-4 text-[#B7791F]" aria-label="Por limpiar" />}{h.estadoLimpieza === 'EnLimpieza' && <Brush className="size-4 text-info" aria-label="En limpieza" />}
                  {h.mantenimientosAbiertos > 0 && <Wrench className="size-4 text-bad" aria-label={`${h.mantenimientosAbiertos} orden(es) de mantenimiento abiertas`} />}</span>
                <span className="block text-2xl font-semibold text-ocean">{h.numero}</span><span className="block text-xs text-muted">{h.tipo}</span>
                <span className="mt-2 block text-sm font-medium">{h.situacion}</span>
                <span className="block truncate text-xs text-ink">{h.huesped ?? (h.proximaLlegada ? `Próx.: ${fechaDia(h.proximaLlegada)}` : '\u00a0')}</span>
              </button>))}
          </div>
        </section>
      )) : <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Lista de habitaciones"><Tabla etiqueta="habitaciones" datos={lista} columnas={cols} alFila={setSel} porPagina={30} /></section>}

      <PanelLateral abierto={!!sel} alCerrar={() => setSel(null)} titulo={`Habitación ${sel?.numero ?? ''}`}>
        {sel && <div className="grid gap-5">
          <div className="flex flex-wrap gap-2"><Estado valor={sel.estado} /><Estado valor={sel.estadoLimpieza} /></div>
          <dl className="grid grid-cols-2 gap-4 text-sm">{[['Tipo', sel.tipo], ['Piso', sel.piso], ['Capacidad', `${sel.capacidad} huéspedes`], ['Tarifa', soles0(sel.precioNoche)], ['Situación hoy', sel.situacion], ['Reservas históricas', sel.totalReservas]].map(([k, v]) =>
            <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
            {sel.notas && <div className="col-span-2"><dt className="text-xs text-muted">Notas</dt><dd>{sel.notas}</dd></div>}
            {sel.tareaId && <div className="col-span-2"><dt className="text-xs text-muted">Limpieza</dt><dd>{ETIQUETAS[sel.tareaTipo]} · {ETIQUETAS[sel.tareaEstado].toLowerCase()}{sel.asignadaA ? ` · ${sel.asignadaA}` : ''} <Link href="/panel/limpieza" className="text-ocean underline decoration-gold">ver plan</Link></dd></div>}
            {sel.mantenimientosAbiertos > 0 && <div className="col-span-2"><dt className="text-xs text-muted">Mantenimiento</dt><dd>{sel.mantenimientosAbiertos} orden(es) abiertas{sel.bloqueada ? ' · bloqueada hoy' : ''} <Link href="/panel/mantenimiento" className="text-ocean underline decoration-gold">ver órdenes</Link></dd></div>}</dl>
          <div className="grid gap-2">
            {sel.codigoReserva && <BotonP variante="claro" onClick={() => { setSel(null); abrirReserva(sel.codigoReserva); }}>Ver reserva {sel.codigoReserva}</BotonP>}
            <BotonP variante="claro" onClick={() => limpieza(sel)}><Sparkles className="size-4" />Marcar como {sel.estadoLimpieza === 'Limpia' ? 'por limpiar' : 'limpia'}</BotonP>
            <BotonP variante="claro" onClick={() => { abrirOrden({ habitacionId: sel.id }); setSel(null); }}><Wrench className="size-4" />Reportar desperfecto</BotonP>
            {admin && <BotonP variante="claro" onClick={() => { setForm({ h: sel }); setSel(null); }}>Editar habitación</BotonP>}
            {admin && <BotonP variante="claro" className="text-bad" disabled={sel.totalReservas > 0} onClick={() => eliminar(sel)}><Trash2 className="size-4" />Eliminar</BotonP>}
            {admin && sel.totalReservas > 0 && <p className="text-xs text-muted">Las habitaciones con historial no se eliminan: usa el estado «Fuera de servicio».</p>}
          </div>
        </div>}
      </PanelLateral>
      <FormHabitacion abierto={!!form} h={form?.h ?? null} tipos={tipos} alCerrar={() => setForm(null)} />
    </>
  );
}
