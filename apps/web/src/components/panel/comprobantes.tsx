'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileText, ReceiptText, RefreshCw, XCircle } from 'lucide-react';
import { comprobanteSchema, TIPOS_COMPROBANTE, type ComprobanteInput } from '@marea/shared';
import { ApiError } from '@/lib/api';
import { fechaMedia, soles } from '@/lib/formato';
import { apiPanel, refrescar, useSesion } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { BotonP, Estado, Modal } from './base';
import { AlertaForm, Campo } from './campo';
import { FormAnularComprobante } from './formularios';

export const nombreComprobante = (k: { tipo: string; serie: string; numero: number }) => `${TIPOS_COMPROBANTE[k.tipo]} ${k.serie}-${k.numero}`;

/** Enlaces a la representación impresa, el XML y la constancia de recepción (CDR) que entrega el OSE. */
export const EnlacesComprobante = ({ k }: { k: any }) => (
  <span className="flex flex-wrap gap-x-3 text-xs">
    {[['PDF', k.enlacePdf], ['XML', k.enlaceXml], ['CDR', k.enlaceCdr]].filter(([, u]) => u).map(([t, u]) =>
      <a key={t} href={u} target="_blank" rel="noopener" className="text-ocean underline decoration-gold">{t}</a>)}
  </span>
);

export async function sincronizarComprobante(id: number, alTerminar?: () => void) {
  try { const r = await apiPanel(`/gestion/comprobantes/${id}/sincronizar`, { method: 'POST', body: {} }); avisar(r.mensaje, r.estado === 'Rechazado' ? 'warn' : 'ok'); refrescar(); alTerminar?.(); }
  catch (e: any) { avisar(e.message, 'error'); }
}

/** Emitir boleta, factura o factura de exportación (extranjero no domiciliado) para una reserva pagada. */
export function FormularioComprobante({ r, abierto, alCerrar, alEmitir }: { r: any; abierto: boolean; alCerrar: () => void; alEmitir: () => void }) {
  const [general, setGeneral] = useState<string | null>(null);
  const [estado, setEstado] = useState<{ proveedor: string | null; series: { boleta: string; factura: string } | null } | null>(null);
  const exportacion = !!r?.exoneradoIgv;
  const { register, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm<ComprobanteInput, unknown, any>({ resolver: zodResolver(comprobanteSchema) });
  useEffect(() => {
    if (!abierto) return;
    reset({ tipo: exportacion ? 'Factura' : 'Boleta', exportacion, ruc: '', razonSocial: '', direccion: '' }); setGeneral(null);
    apiPanel('/gestion/facturacion/estado').then(setEstado).catch(() => setEstado(null));
  }, [abierto, exportacion, reset]);
  const tipo = watch('tipo');
  const enviar = handleSubmit(async d => {
    setGeneral(null);
    try {
      const x = await apiPanel(`/gestion/reservas/${r.codigo}/comprobante`, { method: 'POST', body: d });
      avisar(x.mensaje, x.estado === 'Rechazado' ? 'warn' : 'ok'); if (x.advertencia && x.estado !== 'Rechazado') avisar(x.advertencia, 'warn');
      alCerrar(); alEmitir(); refrescar();
    } catch (e) { const er = e as ApiError; if (er.campo) setError(er.campo as any, { message: er.message }, { shouldFocus: true }); else setGeneral(er.message); }
  });
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo="Emitir comprobante electrónico" ancho="max-w-xl"
      pie={<><BotonP variante="claro" onClick={alCerrar}>Cancelar</BotonP><BotonP disabled={isSubmitting || estado?.proveedor === null} onClick={enviar}><ReceiptText className="size-4" />{isSubmitting ? 'Enviando a SUNAT…' : 'Emitir'}</BotonP></>}>
      {r && <form onSubmit={enviar} noValidate className="grid gap-4">
        <AlertaForm texto={general} />
        {estado?.proveedor === null && <p className="rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn">La facturación electrónica no está configurada en la API (FACTURACION y credenciales del OSE).</p>}
        {estado?.proveedor === 'Simulado' && <p className="rounded-lg bg-info-bg px-4 py-3 text-sm text-info">Modo simulado: el comprobante no se envía a SUNAT y no tiene validez tributaria.</p>}
        {exportacion ? (
          <p className="rounded-lg bg-sand p-4 text-sm"><strong>Factura de exportación de servicios</strong> (hospedaje a extranjero no domiciliado), a nombre de {r.cliente}, {r.documento}. No lleva IGV.</p>
        ) : <>
          <div className="grid grid-cols-2 rounded-lg bg-sand p-1 text-sm" role="radiogroup" aria-label="Tipo de comprobante">
            {(['Boleta', 'Factura'] as const).map(t => <label key={t} className={`cursor-pointer rounded-md py-2 text-center ${tipo === t ? 'bg-white font-medium shadow-sm' : ''}`}>
              <input type="radio" value={t} className="sr-only" {...register('tipo')} />{t === 'Boleta' ? 'Boleta de venta' : 'Factura'}</label>)}
          </div>
          {tipo === 'Boleta' ? <p className="text-sm text-muted">A nombre de <strong className="text-ink">{r.cliente}</strong> ({r.documento}).</p> : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="RUC" error={errors.ruc?.message as string}><input inputMode="numeric" maxLength={11} {...register('ruc')} /></Campo>
              <Campo etiqueta="Razón social" className="sm:col-span-2" error={errors.razonSocial?.message as string}><input maxLength={200} {...register('razonSocial')} /></Campo>
              <Campo etiqueta="Dirección fiscal" className="sm:col-span-3" error={errors.direccion?.message as string}><input maxLength={200} {...register('direccion')} /></Campo>
            </div>)}
        </>}
        <div className="rounded-xl border border-line bg-[#FAF8F4] p-4 text-sm">
          {exportacion ? <div className="flex justify-between"><span>Exportación de servicios</span><span className="tabular-nums">{soles(r.total)}</span></div> : <>
            <div className="flex justify-between"><span>Op. gravada</span><span className="tabular-nums">{soles(r.subtotal)}</span></div>
            <div className="flex justify-between"><span>IGV 18 %</span><span className="tabular-nums">{soles(r.igv)}</span></div></>}
          <div className="mt-1 flex justify-between border-t border-line pt-2 font-semibold"><span>Importe total</span><span className="tabular-nums">{soles(r.total)}</span></div>
          {estado?.series && <p className="mt-2 text-xs text-muted">Serie {exportacion || tipo === 'Factura' ? estado.series.factura : estado.series.boleta} · se envía por correo a {r.email} cuando SUNAT la acepte.</p>}
        </div>
      </form>}
    </Modal>
  );
}

/** Sección «Comprobante electrónico» de la ficha de la reserva. */
export function SeccionComprobantes({ r, comprobantes, alCambiar }: { r: any; comprobantes: any[]; alCambiar: () => void }) {
  const admin = useSesion(s => s.usuario?.rol === 'Administrador');
  const [emitir, setEmitir] = useState(false);
  const [anular, setAnular] = useState<any>(null);
  const vigente = comprobantes.find(k => !['Rechazado', 'Anulado'].includes(k.estado));
  const pagada = r.pagado > 0.009 && r.saldo <= 0.009;
  const puede = !vigente && !['Cancelada', 'NoShow'].includes(r.estado);
  return (
    <section aria-label="Comprobante electrónico">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-gold-dark">Comprobante electrónico</h3>
        {puede && pagada && <BotonP variante="claro" className="!min-h-8" onClick={() => setEmitir(true)}><ReceiptText className="size-4" />Emitir</BotonP>}
      </div>
      {comprobantes.length ? <ul className="divide-y divide-line text-sm">{comprobantes.map(k => (
        <li key={k.id} className="grid gap-1 py-2">
          <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-medium"><FileText className="size-4 text-muted" aria-hidden />{nombreComprobante(k)}</span><Estado valor={k.estado} /></div>
          <span className="text-xs text-muted">{fechaMedia(k.fechaEmision)} · {k.clienteNombre} ({k.clienteNumDoc}) · {soles(k.total)}{k.proveedor === 'Simulado' ? ' · simulado' : ''}</span>
          {k.mensaje && k.estado !== 'Aceptado' && <span className="text-xs text-muted">{k.mensaje}</span>}
          {k.motivoAnulacion && <span className="text-xs text-bad">Anulado: {k.motivoAnulacion}</span>}
          <div className="flex flex-wrap items-center gap-2">
            <EnlacesComprobante k={k} />
            {k.estado === 'Pendiente' && <button className="inline-flex items-center gap-1 text-xs text-ocean underline" onClick={() => sincronizarComprobante(k.id, alCambiar)}><RefreshCw className="size-3" />Actualizar estado</button>}
            {admin && ['Aceptado', 'Observado'].includes(k.estado) && <button className="inline-flex items-center gap-1 text-xs text-bad underline" onClick={() => setAnular(k)}><XCircle className="size-3" />Anular</button>}
          </div>
        </li>))}</ul>
        : <p className="text-sm text-muted">{puede && !pagada ? 'Se emite cuando la reserva esté pagada por completo.' : 'Sin comprobantes.'}</p>}
      <FormularioComprobante r={r} abierto={emitir} alCerrar={() => setEmitir(false)} alEmitir={alCambiar} />
      <FormAnularComprobante k={anular} abierto={!!anular} alCerrar={() => { setAnular(null); alCambiar(); }} />
    </section>
  );
}
