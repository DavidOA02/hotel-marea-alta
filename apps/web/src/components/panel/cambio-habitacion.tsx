'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeftRight } from 'lucide-react';
import { cambioHabitacionSchema, type CambioHabitacionInput } from '@marea/shared';
import { ApiError } from '@/lib/api';
import { fechaDia, soles, soles0 } from '@/lib/formato';
import { apiPanel, refrescar } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { BotonP, Cargando, Modal } from './base';
import { AlertaForm, Campo } from './campo';

interface Opciones {
  habitacion: string; tipoHabitacion: string; desde: string; nochesRestantes: number; total: number; tieneComprobante: boolean; estado: string;
  opciones: { id: number; numero: string; piso: number; tipo: string; tipoCodigo: string; capacidad: number; precioNoche: number; estadoLimpieza: string; totalRecalculado: number }[];
}

/** Cambio de habitación de una reserva confirmada o en curso (React Hook Form + esquema Zod compartido). */
export function FormularioCambioHabitacion({ codigo, abierto, alCerrar, alCambiar }: { codigo: string; abierto: boolean; alCerrar: () => void; alCambiar: () => void }) {
  const [d, setD] = useState<Opciones | null>(null);
  const [general, setGeneral] = useState<string | null>(null);
  const { register, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm<CambioHabitacionInput, unknown, any>({ resolver: zodResolver(cambioHabitacionSchema) });
  useEffect(() => {
    if (!abierto) return;
    setD(null); setGeneral(null); reset({ habitacionId: '' as any, tarifa: 'Mantener', motivo: '' });
    apiPanel<Opciones>(`/gestion/reservas/${codigo}/cambio-habitacion`).then(setD).catch(e => { setGeneral(e.message); });
  }, [abierto, codigo, reset]);

  const sel = d?.opciones.find(h => h.id === Number(watch('habitacionId')));
  const tarifa = watch('tarifa');
  const nuevoTotal = sel ? (tarifa === 'Recalcular' ? sel.totalRecalculado : d!.total) : null;
  const tipos = [...new Set(d?.opciones.map(h => h.tipo) ?? [])];

  const enviar = handleSubmit(async x => {
    setGeneral(null);
    try {
      const r = await apiPanel(`/gestion/reservas/${codigo}/cambiar-habitacion`, { method: 'POST', body: x });
      avisar(r.mensaje); if (r.advertencia) avisar(r.advertencia, 'warn');
      alCerrar(); alCambiar(); refrescar();
    } catch (e) { const er = e as ApiError; if (er.campo) setError(er.campo as any, { message: er.message }, { shouldFocus: true }); else setGeneral(er.message); }
  });

  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo="Cambiar de habitación" ancho="max-w-2xl"
      pie={<><BotonP variante="claro" onClick={alCerrar}>Cancelar</BotonP><BotonP disabled={isSubmitting || !d} onClick={enviar}><ArrowLeftRight className="size-4" />{isSubmitting ? 'Guardando…' : 'Cambiar habitación'}</BotonP></>}>
      <AlertaForm texto={general} />
      {!d ? (!general && <Cargando />) : (
        <form onSubmit={enviar} noValidate className="grid gap-4">
          <p className="text-sm text-muted">
            Actual: <strong className="text-ink">{d.habitacion} · {d.tipoHabitacion}</strong>. El cambio rige {d.estado === 'CheckIn' ? 'desde hoy' : 'desde la llegada'}, {fechaDia(d.desde)}: {d.nochesRestantes} noche(s).
            {d.estado === 'CheckIn' && ' La habitación actual pasará a «Por limpiar».'}
          </p>
          {d.opciones.length ? (
            <Campo etiqueta="Nueva habitación" error={errors.habitacionId?.message as string}>
              <select {...register('habitacionId')}>
                <option value="">Elige una habitación libre</option>
                {tipos.map(t => <optgroup key={t} label={t}>{d.opciones.filter(h => h.tipo === t).map(h =>
                  <option key={h.id} value={h.id}>{h.numero} · piso {h.piso} · {soles0(h.precioNoche)}/noche{h.estadoLimpieza === 'Sucia' ? ' · por limpiar' : ''}</option>)}</optgroup>)}
              </select>
            </Campo>
          ) : <p className="rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn">No hay habitaciones libres para esas fechas con capacidad suficiente.</p>}
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-muted">Tarifa</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm has-checked:border-ocean has-checked:bg-sand">
                <input type="radio" value="Mantener" className="mt-0.5 size-4 accent-ocean" {...register('tarifa')} />
                <span><strong>Mantener tarifa</strong><span className="block text-xs text-muted">Cortesía, mantenimiento o reubicación por el hotel.</span></span></label>
              <label className={`flex items-start gap-2 rounded-lg border border-line p-3 text-sm has-checked:border-ocean has-checked:bg-sand ${d.tieneComprobante ? 'opacity-60' : ''}`}>
                <input type="radio" value="Recalcular" disabled={d.tieneComprobante} className="mt-0.5 size-4 accent-ocean" {...register('tarifa')} />
                <span><strong>Aplicar la tarifa nueva</strong><span className="block text-xs text-muted">{d.tieneComprobante ? 'No disponible: la reserva ya tiene comprobante.' : 'A las noches restantes; las ya usadas no cambian.'}</span></span></label>
            </div>
            {errors.tarifa && <p role="alert" className="mt-1 text-xs text-bad">{errors.tarifa.message as string}</p>}
          </fieldset>
          <Campo etiqueta="Motivo" error={errors.motivo?.message as string} ayuda="Queda en la bitácora de auditoría.">
            <input maxLength={200} placeholder="p. ej. aire acondicionado malogrado, upgrade solicitado…" {...register('motivo')} />
          </Campo>
          {sel && nuevoTotal !== null && (
            <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl bg-gold-soft p-4 text-sm" aria-live="polite">
              <span>{d.habitacion} → <strong>{sel.numero}</strong> ({sel.tipo})</span>
              <span className="text-right">Total de la reserva<strong className="block text-lg text-ocean">{soles(nuevoTotal)}</strong>
                {nuevoTotal !== d.total && <span className="text-xs">{nuevoTotal > d.total ? '+' : '−'}{soles(Math.abs(nuevoTotal - d.total))} respecto de {soles(d.total)}</span>}</span>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
