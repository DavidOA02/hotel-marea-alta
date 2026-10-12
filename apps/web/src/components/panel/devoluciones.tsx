'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CornerDownRight, RotateCcw, Undo2 } from 'lucide-react';
import { devolucionSchema, ETIQUETAS, redondear, type DevolucionInput } from '@marea/shared';
import { ApiError } from '@/lib/api';
import { fechaHora, soles } from '@/lib/formato';
import { apiPanel, refrescar, useSesion } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { BotonP, Estado, Modal } from './base';
import { AlertaForm, Campo } from './campo';
import { esVigente } from './comprobantes';

const AUTOMATICAS = ['Culqi', 'MercadoPago', 'Simulada'];
const titulo = 'mb-2 text-xs font-medium uppercase tracking-[0.14em] text-gold-dark';

/** Pagos de la reserva con sus devoluciones (el administrador puede devolver dinero). */
export function SeccionPagos({ r, pagos, devoluciones, comprobantes, alCambiar }: { r: any; pagos: any[]; devoluciones: any[]; comprobantes: any[]; alCambiar: () => void }) {
  const admin = useSesion(s => s.usuario?.rol === 'Administrador');
  const [devolver, setDevolver] = useState<any>(null);
  const vigente = comprobantes.find(esVigente);
  const reintentar = async (id: number) => {
    try { const x = await apiPanel(`/gestion/pagos/devoluciones/${id}/reintentar`, { method: 'POST', body: {} }); avisar(x.mensaje, x.estado === 'Completada' ? 'ok' : 'warn'); alCambiar(); refrescar(); }
    catch (e: any) { avisar(e.message, 'error'); }
  };
  return (
    <section aria-label="Pagos"><h3 className={titulo}>Pagos</h3>
      {pagos.length ? <ul className="divide-y divide-line text-sm">{pagos.map(p => (
        <li key={p.id} className="py-2">
          <div className="flex items-center justify-between gap-3">
            <span>{fechaHora(p.fechaPago)}<span className="block text-xs text-muted">{p.pasarela ? `En línea · ${ETIQUETAS[p.pasarela] ?? p.pasarela} · ${p.metodo}` : p.metodo}{p.referencia ? ' · ' + p.referencia : ''}{p.registradoPor && !p.pasarela ? ' · ' + p.registradoPor : ''}</span></span>
            <span className="text-right tabular-nums">{p.moneda === 'USD' ? `US$ ${p.monto.toFixed(2)} → ` : ''}{soles(p.montoSoles)}<span className="flex items-center justify-end gap-2">
              {admin && p.estado === 'Aprobado' && p.disponibleDevolucion > 0.009 && <button onClick={() => setDevolver(p)} className="inline-flex items-center gap-1 text-xs text-ocean underline"><Undo2 className="size-3" />Devolver</button>}
              <Estado valor={p.estado} /></span></span>
          </div>
          {devoluciones.filter(x => x.pagoId === p.id).map(x => (
            <div key={x.id} className="mt-1 flex items-start justify-between gap-3 pl-4 text-xs text-muted">
              <span className="flex gap-1"><CornerDownRight className="size-3.5 shrink-0" aria-hidden />Devolución {x.medio === 'Pasarela' ? `por ${ETIQUETAS[x.pasarela] ?? x.pasarela}` : 'registrada'} · {fechaHora(x.fechaResultado ?? x.fecha)} · {x.motivo}{x.reduceTotal ? ' · descuento' : ''}{x.mensaje && x.estado !== 'Completada' ? ` · ${x.mensaje}` : ''}</span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums text-ink">−{soles(x.monto)}
                {admin && x.estado === 'Pendiente' && x.medio === 'Pasarela' && <button onClick={() => reintentar(x.id)} title="Reintentar con la pasarela" aria-label="Reintentar devolución" className="grid size-6 place-items-center rounded hover:bg-sand"><RotateCcw className="size-3.5" /></button>}
                <Estado valor={x.estado} /></span>
            </div>))}
        </li>))}</ul> : <p className="text-sm text-muted">Sin pagos registrados.</p>}
      <FormularioDevolucion pago={devolver} r={r} comprobante={vigente} abierto={!!devolver} alCerrar={() => setDevolver(null)} alDevolver={alCambiar} />
    </section>
  );
}

/** Devolver dinero de un pago: automática por la pasarela o registro de una devolución hecha en efectivo, transferencia o en el portal de Niubiz. */
export function FormularioDevolucion({ pago: p, r, comprobante, abierto, alCerrar, alDevolver }: { pago: any; r: any; comprobante: any; abierto: boolean; alCerrar: () => void; alDevolver: () => void }) {
  const [general, setGeneral] = useState<string | null>(null);
  const { register, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm<DevolucionInput, unknown, any>({ resolver: zodResolver(devolucionSchema) });
  useEffect(() => { if (p) { reset({ monto: Number(p.disponibleDevolucion.toFixed(2)), motivo: '', reducirTotal: false }); setGeneral(null); } }, [p, reset]);
  const monto = Number(watch('monto')) || 0, reducir = !!watch('reducirTotal');
  const enviar = handleSubmit(async d => {
    setGeneral(null);
    try {
      const x = await apiPanel(`/gestion/pagos/${p.id}/devolver`, { method: 'POST', body: d });
      avisar(x.mensaje, x.estado === 'Fallida' ? 'warn' : 'ok'); if (x.advertencia) avisar(x.advertencia, 'warn');
      alCerrar(); alDevolver(); refrescar();
    } catch (e) { const er = e as ApiError; if (er.campo) setError(er.campo as any, { message: er.message }, { shouldFocus: true }); else setGeneral(er.message); }
  });
  if (!p) return null;
  const automatica = AUTOMATICAS.includes(p.pasarela);
  const medio = automatica ? `Se devolverá automáticamente a la tarjeta o cuenta del huésped por ${ETIQUETAS[p.pasarela] ?? p.pasarela}.`
    : p.pasarela === 'Niubiz' ? 'Niubiz no devuelve por API: haz la devolución en su portal y regístrala aquí.'
    : `Registra la devolución que ya entregaste al huésped (${p.metodo.toLowerCase()}, transferencia, Yape…).`;
  const activa = !['Cancelada', 'NoShow'].includes(r.estado);
  const nuevoTotal = redondear(r.total - monto), nuevoSaldo = redondear((reducir ? nuevoTotal : r.total) - (r.pagado - monto));
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo="Devolver dinero"
      pie={<><BotonP variante="claro" onClick={alCerrar}>Cancelar</BotonP><BotonP variante="peligro" disabled={isSubmitting} onClick={enviar}><Undo2 className="size-4" />{isSubmitting ? 'Procesando…' : automatica ? 'Devolver' : 'Registrar devolución'}</BotonP></>}>
      <form onSubmit={enviar} noValidate className="grid gap-4">
        <AlertaForm texto={general} />
        <p className="text-sm text-muted">Pago del {fechaHora(p.fechaPago)} por {soles(p.montoSoles)} · disponible para devolver: <strong className="text-ink">{soles(p.disponibleDevolucion)}</strong></p>
        <p className="rounded-lg bg-sand p-3 text-sm">{medio}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Monto (S/)" error={errors.monto?.message as string}><input type="number" step="0.01" min="0.01" max={p.disponibleDevolucion} {...register('monto')} /></Campo>
          <Campo etiqueta="Motivo" className="sm:col-span-2" error={errors.motivo?.message as string}><input maxLength={200} placeholder="p. ej. cancelación, noche no usada, cobro duplicado" {...register('motivo')} /></Campo>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-ocean" {...register('reducirTotal')} />
          <span>Es un descuento o noches no usadas: <strong>bajar el total de la reserva</strong>
            <span className="block text-xs text-muted">{comprobante ? `Se emitirá automáticamente una nota de crédito sobre la ${comprobante.tipo === '01' ? 'factura' : 'boleta'} ${comprobante.serie}-${comprobante.numero}.` : 'Déjalo sin marcar si devuelves un saldo a favor o un cobro duplicado.'}</span></span></label>
        {monto > 0 && <div className="rounded-xl border border-line bg-[#FAF8F4] p-3 text-sm">
          {reducir && <div className="flex justify-between"><span>Total de la reserva</span><span className="tabular-nums">{soles(r.total)} → <strong>{soles(nuevoTotal)}</strong></span></div>}
          <div className="flex justify-between"><span>Pagado</span><span className="tabular-nums">{soles(r.pagado)} → {soles(r.pagado - monto)}</span></div>
          {activa && nuevoSaldo > 0.009 && <p className="mt-1 text-warn">La reserva quedará con un saldo pendiente de {soles(nuevoSaldo)}.</p>}
        </div>}
      </form>
    </Modal>
  );
}
