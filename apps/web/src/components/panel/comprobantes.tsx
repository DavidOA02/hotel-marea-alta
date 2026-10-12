'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FileMinus, FileText, ReceiptText, RefreshCw, XCircle } from 'lucide-react';
import { comprobanteSchema, diasEntre, hoyLima, MOTIVOS_NC_TOTALES, MOTIVOS_NOTA_CREDITO, notaCreditoSchema, redondear, TIPOS_COMPROBANTE, type ComprobanteInput, type NotaCreditoInput } from '@marea/shared';
import { ApiError } from '@/lib/api';
import { fechaMedia, soles } from '@/lib/formato';
import { apiPanel, refrescar, useSesion } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { BotonP, Estado, Modal } from './base';
import { AlertaForm, Campo } from './campo';
import { FormAnularComprobante } from './formularios';
import { notaDebitoSchema, MOTIVOS_NOTA_DEBITO, type NotaDebitoInput } from '@marea/shared';

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
          <p className="rounded-lg bg-sand p-4 text-sm"><strong>Factura de exportación de servicios</strong> (hospedaje a extranjero no domiciliado), a nombre de {r.cliente}, {r.documento}. El hospedaje no lleva IGV; los consumos adicionales sí.</p>
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
          {exportacion ? <><div className="flex justify-between"><span>Exportación de servicios</span><span className="tabular-nums">{soles(r.total - (r.consumosTotal ?? 0))}</span></div>
            {r.igv > 0 && <><div className="flex justify-between"><span>Consumos gravados</span><span>{soles((r.consumosTotal ?? 0) - r.igv)}</span></div><div className="flex justify-between"><span>IGV 18 %</span><span>{soles(r.igv)}</span></div></>}</> : <>
            <div className="flex justify-between"><span>Op. gravada</span><span className="tabular-nums">{soles(r.subtotal)}</span></div>
            <div className="flex justify-between"><span>IGV 18 %</span><span className="tabular-nums">{soles(r.igv)}</span></div></>}
          <div className="mt-1 flex justify-between border-t border-line pt-2 font-semibold"><span>Importe total</span><span className="tabular-nums">{soles(r.total)}</span></div>
          {estado?.series && <p className="mt-2 text-xs text-muted">Serie {exportacion || tipo === 'Factura' ? estado.series.factura : estado.series.boleta} · se envía por correo a {r.email} cuando SUNAT la acepte.</p>}
        </div>
      </form>}
    </Modal>
  );
}

/** Boleta o factura vigente: no es nota de crédito, ni rechazada, dada de baja o neutralizada por una nota total. */
export const esVigente = (k: any) => ['01','03'].includes(k.tipo) && !['Rechazado', 'Anulado'].includes(k.estado) && !k.anuladoConNota;
export const admiteDebito = (k: any) => esVigente(k) && ['Aceptado','Observado'].includes(k.estado);
/** Se puede emitir nota de crédito: comprobante vigente aceptado con importe por rebajar. */
export const admiteNota = (k: any) => esVigente(k) && ['Aceptado', 'Observado'].includes(k.estado) && k.disponibleNota > 0.009;
/** Baja: hasta 7 días y sin notas de crédito previas; si no, corresponde una nota de crédito. */
export const admiteBaja = (k: any) => admiteNota(k) && !k.tieneDebito && Math.abs(k.disponibleNota - k.total) < 0.005 && diasEntre(String(k.fechaEmision).slice(0, 10), hoyLima()) <= 7;

export function FormularioNotaDebito({ k, alCerrar, alEmitir }: { k:any; alCerrar:()=>void; alEmitir?:()=>void }) {
  const [general,setGeneral] = useState<string|null>(null);
  const {register,handleSubmit,reset,setError,formState:{errors,isSubmitting}} = useForm<NotaDebitoInput,unknown,any>({resolver:zodResolver(notaDebitoSchema)});
  useEffect(()=>{if(k){reset({motivo:'02',monto:undefined,sustento:''});setGeneral(null);}},[k,reset]);
  const enviar=handleSubmit(async d=>{try {const x=await apiPanel(`/gestion/comprobantes/${k.id}/nota-debito`,{method:'POST',body:d});avisar(x.mensaje,x.estado==='Rechazado'?'warn':'ok');if(x.advertencia)avisar(x.advertencia,'warn');alCerrar();alEmitir?.();refrescar();}catch(e){const er=e as ApiError;if(er.campo)setError(er.campo as any,{message:er.message});else setGeneral(er.message);}});
  return <Modal abierto={!!k} alCerrar={alCerrar} titulo={`Nota de débito · ${k ? nombreComprobante(k) : ''}`} pie={<><BotonP variante="claro" onClick={alCerrar}>Cancelar</BotonP><BotonP disabled={isSubmitting} onClick={enviar}>{isSubmitting?'Enviando…':'Emitir nota de débito'}</BotonP></>}>
    <form onSubmit={enviar} className="grid gap-4"><AlertaForm texto={general}/><p className="text-sm text-muted">Aumenta el total y el saldo de la reserva. Si SUNAT rechaza la nota, el cargo se revierte. El monto incluye IGV.</p>
      <Campo etiqueta="Motivo" error={errors.motivo?.message as string}><select {...register('motivo')}>{Object.entries(MOTIVOS_NOTA_DEBITO).map(([v,t])=><option key={v} value={v}>{v} · {t}</option>)}</select></Campo>
      <Campo etiqueta="Monto (S/)" error={errors.monto?.message as string}><input type="number" min="0.01" step="0.01" {...register('monto')}/></Campo>
      <Campo etiqueta="Sustento" error={errors.sustento?.message as string}><input maxLength={250} {...register('sustento')}/></Campo>
    </form></Modal>;
}

/** Nota de crédito (administrador): anulación total, error en el RUC o disminución parcial del valor. */
export function FormularioNotaCredito({ k, abierto, alCerrar, alEmitir }: { k: any; abierto: boolean; alCerrar: () => void; alEmitir?: () => void }) {
  const [general, setGeneral] = useState<string | null>(null);
  const { register, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm<NotaCreditoInput, unknown, any>({ resolver: zodResolver(notaCreditoSchema) });
  useEffect(() => { if (k) { reset({ motivo: '09', monto: '' as any, sustento: '' }); setGeneral(null); } }, [k, reset]);
  const motivo = watch('motivo'), monto = Number(watch('monto')) || 0;
  const enviar = handleSubmit(async d => {
    setGeneral(null);
    try {
      const x = await apiPanel(`/gestion/comprobantes/${k.id}/nota-credito`, { method: 'POST', body: d });
      avisar(x.mensaje, x.estado === 'Rechazado' ? 'warn' : 'ok'); if (x.advertencia && x.estado !== 'Rechazado') avisar(x.advertencia, 'warn');
      alCerrar(); alEmitir?.(); refrescar();
    } catch (e) { const er = e as ApiError; if (er.campo) setError(er.campo as any, { message: er.message }, { shouldFocus: true }); else setGeneral(er.message); }
  });
  if (!k) return null;
  const total = MOTIVOS_NC_TOTALES.includes(motivo);
  const motivos = Object.entries(MOTIVOS_NOTA_CREDITO).filter(([m]) => m !== '02' || k.tipo === '01');
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo={`Nota de crédito · ${nombreComprobante(k)}`}
      pie={<><BotonP variante="claro" onClick={alCerrar}>Cancelar</BotonP><BotonP variante="peligro" disabled={isSubmitting} onClick={enviar}><FileMinus className="size-4" />{isSubmitting ? 'Enviando a SUNAT…' : 'Emitir nota de crédito'}</BotonP></>}>
      <form onSubmit={enviar} noValidate className="grid gap-4">
        <AlertaForm texto={general} />
        <p className="text-sm text-muted">{k.clienteNombre} ({k.clienteNumDoc}) · total {soles(k.total)} · por rebajar: <strong className="text-ink">{soles(k.disponibleNota)}</strong></p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Motivo (catálogo 09 de SUNAT)" className="sm:col-span-2" error={errors.motivo?.message as string}>
            <select {...register('motivo')}>{motivos.map(([m, t]) => <option key={m} value={m}>{m} · {t}</option>)}</select></Campo>
          {!total && <Campo etiqueta="Monto (S/)" error={errors.monto?.message as string}><input type="number" step="0.01" min="0.01" max={k.disponibleNota} {...register('monto')} /></Campo>}
          <Campo etiqueta="Sustento" className="sm:col-span-3" error={errors.sustento?.message as string} ayuda="Aparece en la nota de crédito y en la bitácora.">
            <input maxLength={250} placeholder="p. ej. descuento por falla del aire acondicionado" {...register('sustento')} /></Campo>
        </div>
        <p className="rounded-lg bg-sand p-3 text-sm">{total
          ? `Por ${soles(k.disponibleNota)}. Al aceptarla SUNAT, la ${nombreComprobante(k)} queda neutralizada y podrás emitir otra si corresponde. No mueve dinero: si hay que devolver, hazlo desde el pago.`
          : `Baja el total de la reserva en ${soles(monto)}${monto > 0 ? ` (en el comprobante quedarán ${soles(redondear(k.disponibleNota - monto))})` : ''}. Si el huésped ya pagó, quedará saldo a favor para devolver desde el pago.`}</p>
      </form>
    </Modal>
  );
}

/** Sección «Comprobantes electrónicos» de la ficha de la reserva. */
export function SeccionComprobantes({ r, comprobantes, alCambiar }: { r: any; comprobantes: any[]; alCambiar: () => void }) {
  const admin = useSesion(s => s.usuario?.rol === 'Administrador');
  const [emitir, setEmitir] = useState(false);
  const [anular, setAnular] = useState<any>(null);
  const [nota, setNota] = useState<any>(null);
  const [debito, setDebito] = useState<any>(null);
  const vigente = comprobantes.find(esVigente);
  const pagada = r.pagado > 0.009 && r.saldo <= 0.009;
  const puede = !vigente && !['Cancelada', 'NoShow'].includes(r.estado);
  return (
    <section aria-label="Comprobantes electrónicos">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-gold-dark">Comprobantes electrónicos</h3>
        {puede && pagada && <BotonP variante="claro" className="!min-h-8" onClick={() => setEmitir(true)}><ReceiptText className="size-4" />Emitir</BotonP>}
      </div>
      {comprobantes.length ? <ul className="divide-y divide-line text-sm">{comprobantes.map(k => (
        <li key={k.id} className={`grid gap-1 py-2 ${k.tipo === '07' ? 'pl-4' : ''}`}>
          <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-medium">
            {k.tipo === '07' ? <FileMinus className="size-4 text-bad" aria-hidden /> : <FileText className="size-4 text-muted" aria-hidden />}{nombreComprobante(k)}</span><Estado valor={k.estado} /></div>
          <span className="text-xs text-muted">{fechaMedia(k.fechaEmision)} · {k.clienteNombre} ({k.clienteNumDoc}) · {k.tipo === '07' ? '−' : ''}{soles(k.total)}{k.proveedor === 'Simulado' ? ' · simulado' : ''}</span>
          {['07','08'].includes(k.tipo) && <span className="text-xs text-muted">Modifica {TIPOS_COMPROBANTE[k.refTipo]} {k.refSerie}-{k.refNumero} · {(k.tipo === '08' ? MOTIVOS_NOTA_DEBITO : MOTIVOS_NOTA_CREDITO)[k.motivoNota]}: {k.sustento}</span>}
          {k.anuladoConNota && <span className="text-xs text-bad">Neutralizado con la nota de crédito {k.anuladoConNota}</span>}
          {k.tipo !== '07' && !k.anuladoConNota && k.disponibleNota < k.total - 0.005 && <span className="text-xs text-muted">Rebajado con notas de crédito: quedan {soles(k.disponibleNota)}</span>}
          {k.mensaje && k.estado !== 'Aceptado' && <span className="text-xs text-muted">{k.mensaje}</span>}
          {k.motivoAnulacion && <span className="text-xs text-bad">Anulado: {k.motivoAnulacion}</span>}
          <div className="flex flex-wrap items-center gap-2">
            <EnlacesComprobante k={k} />
            {k.estado === 'Pendiente' && <button className="inline-flex items-center gap-1 text-xs text-ocean underline" onClick={() => sincronizarComprobante(k.id, alCambiar)}><RefreshCw className="size-3" />Actualizar estado</button>}
            {admin && admiteNota(k) && <button className="inline-flex items-center gap-1 text-xs text-bad underline" onClick={() => setNota(k)}><FileMinus className="size-3" />Nota de crédito</button>}
            {admin && admiteBaja(k) && <button className="inline-flex items-center gap-1 text-xs text-bad underline" onClick={() => setAnular(k)}><XCircle className="size-3" />Dar de baja</button>}
          </div>
        </li>))}</ul>
        : <p className="text-sm text-muted">{puede && !pagada ? 'Se emite cuando la reserva esté pagada por completo.' : 'Sin comprobantes.'}</p>}
      <FormularioComprobante r={r} abierto={emitir} alCerrar={() => setEmitir(false)} alEmitir={alCambiar} />
      <FormAnularComprobante k={anular} abierto={!!anular} alCerrar={() => { setAnular(null); alCambiar(); }} />
      <FormularioNotaCredito k={nota} abierto={!!nota} alCerrar={() => setNota(null)} alEmitir={alCambiar} />
      {admin && vigente && admiteDebito(vigente) && <BotonP variante="claro" onClick={()=>setDebito(vigente)}>Nota de débito</BotonP>}
      <FormularioNotaDebito k={debito} alCerrar={()=>setDebito(null)} alEmitir={alCambiar}/>
    </section>
  );
}
