'use client';
import { create } from 'zustand';
import { asignarLimpiezaSchema, cancelarMantenimientoSchema, CATEGORIAS_MANTENIMIENTO, ETIQUETAS, hoyLima, mantenimientoSchema, PRIORIDADES_MANTENIMIENTO,
  resolverMantenimientoSchema, sumarDias, tareaLimpiezaSchema, terminarLimpiezaSchema, TIPOS_LIMPIEZA } from '@marea/shared';
import { apiPanel } from '@/stores/sesion';
import { useDatos } from './base';
import { Campo } from './campo';
import { err, FormularioModal } from './formularios';

/** «Hab. 203» o el área común. */
export const ubicacion = (o: any) => o.habitacion ? `Hab. ${o.habitacion}` : o.area;
const ddmm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
/** «12/10 → 15/10» (el último día ya se vende); una orden cerrada antes de empezar el bloqueo no bloqueó noches. */
export const rangoBloqueo = (o: any) => !o.bloquea ? null : o.bloqueoHasta <= o.bloqueoDesde ? 'Sin noches bloqueadas' : `${ddmm(o.bloqueoDesde)} → ${ddmm(o.bloqueoHasta)}`;

/* ---------- Mantenimiento ---------- */
/** Abre «Nueva orden» (o su edición) desde cualquier vista: habitaciones, limpieza, mantenimiento. */
export const useOrden = create<{ abierto: boolean; orden: any | null; habitacionId: number | null; abrir: (o?: { orden?: any; habitacionId?: number }) => void; cerrar: () => void }>(set => ({
  abierto: false, orden: null, habitacionId: null,
  abrir: o => set({ abierto: true, orden: o?.orden ?? null, habitacionId: o?.habitacionId ?? null }), cerrar: () => set({ abierto: false })
}));

export function FormOrden() {
  const { abierto, orden: o, habitacionId, cerrar } = useOrden();
  const { datos: habs } = useDatos<any[]>(abierto ? '/gestion/habitaciones' : null);
  const hoy = hoyLima();
  return (
    <FormularioModal abierto={abierto} alCerrar={cerrar} titulo={o ? `Editar orden N.° ${o.id}` : 'Nueva orden de mantenimiento'} esquema={mantenimientoSchema} ancho="max-w-2xl"
      boton={o ? 'Guardar' : 'Registrar orden'}
      valores={{ habitacionId: o?.habitacionId ?? habitacionId ?? '', area: o?.area ?? '', categoria: o?.categoria ?? 'Otro', descripcion: o?.descripcion ?? '',
        prioridad: o?.prioridad ?? 'Media', asignadoA: o?.asignadoA ?? '', bloquea: o?.bloquea ?? false,
        bloqueoDesde: o?.bloqueoDesde ?? hoy, bloqueoHasta: o?.bloqueoHasta ?? sumarDias(hoy, 1) }}
      enviar={d => apiPanel(o ? `/gestion/mantenimiento/${o.id}` : '/gestion/mantenimiento', { method: o ? 'PUT' : 'POST', body: d })}>
      {f => {
        const hab = f.watch('habitacionId'), bloquea = f.watch('bloquea');
        return <div className="grid gap-4 sm:grid-cols-2">
          {o ? <p className="text-sm sm:col-span-2">Ubicación: <strong>{ubicacion(o)}</strong></p> : <>
            <Campo etiqueta="Habitación" error={err(f, 'habitacionId')}><select {...f.register('habitacionId')}>
              <option value="">Área común…</option>{habs?.map(h => <option key={h.id} value={h.id}>{h.numero} · {h.tipo}</option>)}</select></Campo>
            {!hab && <Campo etiqueta="Área común" error={err(f, 'area')}><input maxLength={60} placeholder="p. ej. piscina, lobby, cocina" {...f.register('area')} /></Campo>}
          </>}
          <Campo etiqueta="Categoría" error={err(f, 'categoria')}><select {...f.register('categoria')}>{CATEGORIAS_MANTENIMIENTO.map(c => <option key={c} value={c}>{ETIQUETAS[c]}</option>)}</select></Campo>
          <Campo etiqueta="Prioridad" error={err(f, 'prioridad')} ayuda="Urgente: afecta a un huésped ahora o es un riesgo."><select {...f.register('prioridad')}>{PRIORIDADES_MANTENIMIENTO.map(p => <option key={p} value={p}>{ETIQUETAS[p]}</option>)}</select></Campo>
          <Campo etiqueta="Qué pasa" className="sm:col-span-2" error={err(f, 'descripcion')}><textarea rows={2} className="!h-auto py-2" maxLength={300} placeholder="p. ej. el aire acondicionado no enfría" {...f.register('descripcion')} /></Campo>
          <Campo etiqueta="Asignado a (opcional)" className="sm:col-span-2" error={err(f, 'asignadoA')}><input maxLength={100} placeholder="Técnico o proveedor" {...f.register('asignadoA')} /></Campo>
          {(hab || o?.habitacionId) && <>
            <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-0.5 size-4 accent-ocean" {...f.register('bloquea')} />
              <span>Bloquear la habitación (no se vende ni se asigna)<span className="block text-xs text-muted">Si tiene reservas en esas fechas, primero cámbialas de habitación desde su ficha.</span></span></label>
            {bloquea && <>
              <Campo etiqueta="Bloqueada desde" error={err(f, 'bloqueoDesde')}><input type="date" min={o?.bloqueoDesde && o.bloqueoDesde < hoy ? o.bloqueoDesde : hoy} {...f.register('bloqueoDesde')} /></Campo>
              <Campo etiqueta="Vuelve a venderse el" error={err(f, 'bloqueoHasta')}><input type="date" {...f.register('bloqueoHasta')} /></Campo>
            </>}
          </>}
        </div>;
      }}
    </FormularioModal>
  );
}

export function FormResolverOrden({ orden: o, abierto, alCerrar }: { orden: any; abierto: boolean; alCerrar: () => void }) {
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo={`Resolver orden N.° ${o?.id ?? ''}`} esquema={resolverMantenimientoSchema} boton="Marcar como resuelta"
      valores={{ solucion: '', costo: '', limpiar: !!o?.habitacionId }} enviar={d => apiPanel(`/gestion/mantenimiento/${o.id}/resolver`, { method: 'POST', body: d })}>
      {f => <div className="grid gap-4 sm:grid-cols-3">
        <Campo etiqueta="Qué se hizo" className="sm:col-span-2" error={err(f, 'solucion')}><input maxLength={500} placeholder="p. ej. se cambió el empaque del caño" {...f.register('solucion')} /></Campo>
        <Campo etiqueta="Costo (S/, opcional)" error={err(f, 'costo')}><input type="number" step="0.01" min="0" {...f.register('costo')} /></Campo>
        {o?.habitacionId && <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" className="size-4 accent-ocean" {...f.register('limpiar')} />
          Dejar la habitación por limpiar (limpieza profunda)</label>}
        {o?.bloquea && <p className="text-xs text-muted sm:col-span-3">El bloqueo termina hoy: la habitación vuelve a venderse.</p>}
      </div>}
    </FormularioModal>
  );
}

export function FormCancelarOrden({ orden: o, abierto, alCerrar }: { orden: any; abierto: boolean; alCerrar: () => void }) {
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo={`Cancelar orden N.° ${o?.id ?? ''}`} esquema={cancelarMantenimientoSchema} boton="Cancelar orden" peligro
      valores={{ motivo: '' }} enviar={d => apiPanel(`/gestion/mantenimiento/${o.id}/cancelar`, { method: 'POST', body: d })}>
      {f => <Campo etiqueta="Motivo" error={err(f, 'motivo')}><input maxLength={200} placeholder="p. ej. orden duplicada" {...f.register('motivo')} /></Campo>}
    </FormularioModal>
  );
}

/* ---------- Limpieza ---------- */
const Personal = ({ id, nombres }: { id: string; nombres: string[] }) => <datalist id={id}>{nombres.map(n => <option key={n} value={n} />)}</datalist>;

/** Programar una limpieza para una habitación sin tarea abierta. */
export function FormTarea({ habitacion: h, personal, abierto, alCerrar }: { habitacion: any; personal: string[]; abierto: boolean; alCerrar: () => void }) {
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo={`Programar limpieza · Hab. ${h?.numero ?? ''}`} esquema={tareaLimpiezaSchema} boton="Programar"
      valores={{ habitacionId: h?.id, tipo: h?.necesita ?? 'Salida', asignadaA: '', iniciar: false }} enviar={d => apiPanel('/gestion/limpieza', { method: 'POST', body: d })}>
      {f => <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Tipo" error={err(f, 'tipo')}><select {...f.register('tipo')}>{TIPOS_LIMPIEZA.map(t => <option key={t} value={t}>{ETIQUETAS[t]}</option>)}</select></Campo>
        <Campo etiqueta="Quién limpia (opcional)" error={err(f, 'asignadaA')}><input maxLength={100} list="personal-limpieza" {...f.register('asignadaA')} /></Campo>
        <Personal id="personal-limpieza" nombres={personal} />
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="size-4 accent-ocean" {...f.register('iniciar')} />Empieza ahora (la habitación pasa a «En limpieza»)</label>
      </div>}
    </FormularioModal>
  );
}

export function FormAsignar({ tarea: t, personal, abierto, alCerrar }: { tarea: any; personal: string[]; abierto: boolean; alCerrar: () => void }) {
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo={`Asignar limpieza · Hab. ${t?.numero ?? ''}`} esquema={asignarLimpiezaSchema} boton="Asignar"
      valores={{ asignadaA: t?.asignadaA ?? '' }} enviar={d => apiPanel(`/gestion/limpieza/${t.tareaId}/asignar`, { method: 'POST', body: d })}>
      {f => <><Campo etiqueta="Quién limpia" error={err(f, 'asignadaA')} ayuda="Déjalo vacío para quitar la asignación."><input maxLength={100} list="personal-asignar" {...f.register('asignadaA')} /></Campo>
        <Personal id="personal-asignar" nombres={personal} /></>}
    </FormularioModal>
  );
}

export function FormTerminar({ tarea: t, abierto, alCerrar }: { tarea: any; abierto: boolean; alCerrar: () => void }) {
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo={`Terminar limpieza · Hab. ${t?.numero ?? ''}`} esquema={terminarLimpiezaSchema} boton="Habitación lista"
      valores={{ observaciones: '', desperfecto: '' }} enviar={d => apiPanel(`/gestion/limpieza/${t.tareaId}/terminar`, { method: 'POST', body: d })}>
      {f => <div className="grid gap-4">
        <Campo etiqueta="Observaciones (opcional)" error={err(f, 'observaciones')} ayuda="p. ej. objeto olvidado guardado en recepción, minibar repuesto."><input maxLength={300} {...f.register('observaciones')} /></Campo>
        <Campo etiqueta="Desperfecto encontrado (opcional)" error={err(f, 'desperfecto')} ayuda="Si lo escribes se abre una orden de mantenimiento para esta habitación.">
          <textarea rows={2} className="!h-auto py-2" maxLength={300} placeholder="p. ej. la ducha gotea, foco quemado" {...f.register('desperfecto')} /></Campo>
      </div>}
    </FormularioModal>
  );
}
