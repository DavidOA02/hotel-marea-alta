'use client';
import { SeccionConsumos } from './consumos';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeftRight, BedDouble, CalendarCheck, Download, LogIn, LogOut, Mail, RotateCcw, UserX, Wallet, XCircle } from 'lucide-react';
import { cotizar, diasEntre, ETIQUETAS, hoyLima, METODOS_PAGO, pagoSchema, reservaPanelSchema, sumarDias, type PagoInput, type ReservaPanelInput } from '@marea/shared';
import { ApiError } from '@/lib/api';
import { TIPO_CAMBIO } from '@/lib/config';
import { fechaDia, fechaHora, soles, soles0 } from '@/lib/formato';
import { apiPanel, refrescar, useSesion } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { descargarConfirmacion } from '../pdf/confirmacion';
import { BotonP, Cargando, confirmar, Estado, Modal, PanelLateral } from './base';
import { AlertaForm, Campo } from './campo';
import { FormularioCambioHabitacion } from './cambio-habitacion';
import { SeccionComprobantes } from './comprobantes';
import { SeccionPagos } from './devoluciones';
import { AvisoTurno, useTurno } from './caja';

/* ---------- Stores (Zustand) para abrir la ficha y los formularios desde cualquier vista ---------- */
export const useFicha = create<{ codigo: string | null; abrir: (c: string) => void; cerrar: () => void }>(set => ({ codigo: null, abrir: codigo => set({ codigo }), cerrar: () => set({ codigo: null }) }));
export const usePago = create<{ reserva: any | null; abrir: (r: any) => void; cerrar: () => void }>(set => ({ reserva: null, abrir: reserva => set({ reserva }), cerrar: () => set({ reserva: null }) }));
export const useNuevaReserva = create<{ abierto: boolean; walkin: boolean; cliente: any | null; abrir: (o?: { walkin?: boolean; cliente?: any }) => void; cerrar: () => void }>(set => ({
  abierto: false, walkin: false, cliente: null, abrir: o => set({ abierto: true, walkin: !!o?.walkin, cliente: o?.cliente ?? null }), cerrar: () => set({ abierto: false })
}));

/** Ejecuta una acción sobre una reserva y refresca todas las vistas. */
export async function accionReserva(ruta: string, body: object = {}) {
  try {
    const r = await apiPanel(ruta, { method: 'POST', body });
    avisar(r.mensaje ?? 'Listo.'); if (r.advertencia) avisar(r.advertencia, 'warn');
    refrescar(); return true;
  } catch (e: any) { avisar(e.message, 'error'); return false; }
}

/* ---------- Ficha de la reserva ---------- */
export function FichaReserva() {
  const { codigo, cerrar } = useFicha();
  const abrirPago = usePago(s => s.abrir);
  const admin = useSesion(s => s.usuario?.rol === 'Administrador');
  const [d, setD] = useState<any>(null);
  const [n, setN] = useState(0);
  const [cambio, setCambio] = useState(false);
  useEffect(() => {
    if (!codigo) { setD(null); setCambio(false); return; }
    // Si se abre otra reserva antes de que llegue esta respuesta, se descarta: los botones actúan sobre «codigo»
    let vigente = true;
    apiPanel(`/gestion/reservas/${codigo}`).then(x => { if (vigente) setD(x); }).catch(e => { if (vigente) avisar(e.message, 'error'); });
    return () => { vigente = false; };
  }, [codigo, n]);
  const recargar = () => setN(x => x + 1);
  const hoy = hoyLima();
  const r = d && d.reserva.codigo === codigo?.toUpperCase() ? d.reserva : null;   // datos de otra reserva = aún cargando
  const cod = codigo ?? '';
  const ejecutar = async (accion: string, body: object = {}) => { if (await accionReserva(`/gestion/reservas/${cod}/${accion}`, body)) recargar(); };

  const checkout = async () => {
    if (r.saldo > 0.009) {
      if (!admin) return avisar(`Hay un saldo pendiente de ${soles(r.saldo)}. Registra el pago antes del check-out.`, 'warn');
      if (!await confirmar('Saldo pendiente', `La reserva tiene un saldo de ${soles(r.saldo)}. ¿Cerrar la estadía de todas formas?`, 'Cerrar con saldo', true)) return;
      return ejecutar('checkout', { forzarConSaldo: true });
    }
    ejecutar('checkout');
  };

  return (
    <PanelLateral abierto={!!codigo} alCerrar={cerrar} titulo={<>Reserva <span className="font-mono text-xl">{codigo}</span></>}>
      {!r ? <Cargando /> : <div className="grid gap-6">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-lg font-medium">{r.cliente}</p><p className="text-sm text-muted">{r.documento} · {ETIQUETAS[r.residencia]}</p></div>
          <Estado valor={r.estado} />
        </div>
        <div className="flex flex-wrap gap-2">
          {r.estado === 'Confirmada' && r.fechaEntrada <= hoy && <BotonP variante="ok" onClick={() => ejecutar('checkin')}><LogIn className="size-4" />Check-in</BotonP>}
          {r.estado === 'CheckIn' && <BotonP onClick={checkout}><LogOut className="size-4" />Check-out</BotonP>}
          {r.saldo > 0.009 && !['Cancelada', 'NoShow'].includes(r.estado) && <BotonP variante="oro" onClick={() => abrirPago({ ...r, alPagar: recargar })}><Wallet className="size-4" />Registrar pago</BotonP>}
          {r.estado === 'Confirmada' && <BotonP variante="claro" className="text-bad" onClick={async () => { if (await confirmar('Cancelar reserva', `¿Cancelar la reserva ${r.codigo} de ${r.cliente}? La habitación quedará libre.`, 'Cancelar reserva', true)) ejecutar('cancelar'); }}><XCircle className="size-4" />Cancelar</BotonP>}
          {r.estado === 'Confirmada' && r.fechaEntrada <= hoy && <BotonP variante="claro" onClick={async () => { if (await confirmar('No show', `¿Marcar que ${r.cliente} no se presentó?`, 'Marcar no show', true)) ejecutar('noshow'); }}><UserX className="size-4" />No show</BotonP>}
          {['Confirmada', 'CheckIn'].includes(r.estado) && r.fechaSalida > hoy && <BotonP variante="claro" onClick={() => setCambio(true)}><ArrowLeftRight className="size-4" />Cambiar habitación</BotonP>}
          {!['Cancelada', 'NoShow'].includes(r.estado) && <BotonP variante="claro" onClick={() => descargarConfirmacion({ ...r, titular: r.cliente }).catch(() => avisar('No se pudo generar el PDF.', 'error'))}><Download className="size-4" />PDF</BotonP>}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          {[['Habitación', `${r.habitacion} · ${r.tipoHabitacion}${r.habitacionDesde ? ` (desde el ${fechaDia(r.habitacionDesde)})` : ''}`], ['Huéspedes', r.huespedes], ['Llegada', `${fechaDia(r.fechaEntrada)}${r.horaLlegada ? ' · ' + r.horaLlegada : ''}`],
            ['Salida', `${fechaDia(r.fechaSalida)} (${r.noches} noche${r.noches === 1 ? '' : 's'})`], ['Correo', r.email], ['Teléfono', r.telefono]].map(([k, v]) => (
            <div key={k as string}><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 font-medium break-words">{v}</dd></div>))}
          {r.notas && <div className="col-span-2"><dt className="text-xs text-muted">Notas</dt><dd className="mt-0.5">{r.notas}</dd></div>}
        </dl>
        <div className="rounded-xl border border-line bg-[#FAF8F4] p-4 text-sm">
          {[['Valor de venta', soles(r.subtotal)], ['IGV 18 %', r.exoneradoIgv && r.igv <= 0 ? 'Exonerado' : soles(r.igv)]].map(([k, v]) => <div key={k} className="flex justify-between py-0.5"><span>{k}</span><span className="tabular-nums">{v}</span></div>)}
          <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-semibold"><span>Total</span><span className="tabular-nums">{soles(r.total)}</span></div>
          <div className="flex justify-between py-0.5"><span>Pagado</span><span className="tabular-nums">{soles(r.pagado)}</span></div>
          <div className={`flex justify-between py-0.5 font-medium ${r.saldo > 0.009 ? 'text-bad' : ''}`}><span>Saldo</span><span className="tabular-nums">{soles(r.saldo)}</span></div>
        </div>
        <SeccionConsumos r={r} consumos={d.consumos ?? []} alCambiar={recargar} />
        <SeccionPagos r={r} pagos={d.pagos} devoluciones={d.devoluciones} comprobantes={d.comprobantes} alCambiar={recargar} />
        <SeccionComprobantes r={r} comprobantes={d.comprobantes} alCambiar={recargar} />
        <SeccionCorreos r={r} correos={d.correos} alCambiar={recargar} />
        <Historial r={r} historial={d.historial} />
        <Link href={`/panel/clientes/${r.clienteId}`} onClick={cerrar} className="text-sm text-ocean underline decoration-gold underline-offset-4">Ver ficha del cliente →</Link>
      </div>}
      {r && <FormularioCambioHabitacion codigo={r.codigo} abierto={cambio} alCerrar={() => setCambio(false)} alCambiar={recargar} />}
    </PanelLateral>
  );
}

const titulo = 'text-xs font-medium uppercase tracking-[0.14em] text-gold-dark';

/** Correos automáticos de la reserva: estado de envío, reintento y reenvío de la confirmación. */
function SeccionCorreos({ r, correos, alCambiar }: { r: any; correos: any[]; alCambiar: () => void }) {
  const accion = async (ruta: string) => {
    try { const x = await apiPanel(ruta, { method: 'POST', body: {} }); avisar(x.mensaje); alCambiar(); } catch (e: any) { avisar(e.message, 'error'); }
  };
  return (
    <section aria-label="Correos">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className={titulo}>Correos al huésped</h3>
        {['Confirmada', 'CheckIn'].includes(r.estado) && <BotonP variante="claro" className="!min-h-8" onClick={() => accion(`/gestion/reservas/${r.codigo}/reenviar-confirmacion`)}><Mail className="size-4" />Reenviar confirmación</BotonP>}
      </div>
      {correos.length ? <ul className="divide-y divide-line text-sm">{correos.map(c => (
        <li key={c.id} className="flex items-center justify-between gap-3 py-2">
          <span>{ETIQUETAS[c.tipo] ?? c.tipo}<span className="block text-xs text-muted">{c.para} · {fechaHora(c.fechaEnvio ?? c.fechaCreacion)}{c.error ? ` · ${c.error}` : ''}</span></span>
          <span className="flex items-center gap-2">
            {c.estado === 'Fallido' && <button onClick={() => accion(`/gestion/correos/${c.id}/reintentar`)} aria-label={`Reintentar envío a ${c.para}`} title="Reintentar" className="grid size-8 place-items-center rounded-lg hover:bg-sand"><RotateCcw className="size-4" /></button>}
            <Estado valor={c.estado} />
          </span>
        </li>))}</ul> : <p className="text-sm text-muted">Sin correos registrados.</p>}
    </section>
  );
}

/** Historial a partir de la bitácora de auditoría (las reservas antiguas usan las fechas de la propia reserva). */
function Historial({ r, historial }: { r: any; historial: any[] }) {
  const reservada = <li key="r">Reservada el {fechaHora(r.fechaReserva)} · {ETIQUETAS[r.canal]}{r.registradoPor ? ` por ${r.registradoPor}` : ''}</li>;
  return (
    <section aria-label="Historial"><h3 className={`${titulo} mb-2`}>Historial</h3>
      <ol className="grid gap-2 border-l-2 border-line pl-4 text-sm">
        {!historial.length ? <>{reservada}
          {r.fechaCheckIn && <li>Check-in: {fechaHora(r.fechaCheckIn)}</li>}
          {r.fechaCheckOut && <li>Check-out: {fechaHora(r.fechaCheckOut)}</li>}
          {r.fechaCancelacion && <li>Cancelada: {fechaHora(r.fechaCancelacion)}</li>}</>
          : <>{!historial.some(h => h.accion === 'reserva.crear') && reservada}
            {historial.map((h, i) => <li key={i}>{h.descripcion}<span className="block text-xs text-muted">{fechaHora(h.fecha)} · {h.usuario}</span></li>)}</>}
      </ol>
    </section>
  );
}

/* ---------- Registrar pago (React Hook Form + Zod) ---------- */
export function FormularioPago() {
  const { reserva: r, cerrar } = usePago();
  const [general, setGeneral] = useState<string | null>(null);
  const { register, handleSubmit, watch, setValue, setError, reset, formState: { errors, isSubmitting } } = useForm<PagoInput, unknown, any>({ resolver: zodResolver(pagoSchema) });
  useEffect(() => { if (r) { reset({ monto: Number(r.saldo.toFixed(2)), moneda: 'PEN', metodo: 'Tarjeta', tipoCambio: TIPO_CAMBIO, referencia: '' }); setGeneral(null); } }, [r, reset]);
  const moneda = watch('moneda');
  const { turno, cargado } = useTurno(!!r);
  useEffect(() => { if (r) setValue('monto', Number((moneda === 'USD' ? r.saldo / TIPO_CAMBIO : r.saldo).toFixed(2))); }, [moneda, r, setValue]);
  const enviar = handleSubmit(async d => {
    try {
      const x = await apiPanel(`/gestion/reservas/${r.codigo}/pagos`, { method: 'POST', body: { ...d, tipoCambio: d.moneda === 'USD' ? d.tipoCambio : null } });
      avisar(`${x.mensaje} Saldo: ${soles(x.saldo)}.`); cerrar(); refrescar(); r.alPagar?.();
    } catch (e) { const er = e as ApiError; if (er.campo) setError(er.campo as any, { message: er.message }); else setGeneral(er.message); }
  });
  return (
    <Modal abierto={!!r} alCerrar={cerrar} titulo="Registrar pago"
      pie={<><BotonP variante="claro" onClick={cerrar}>Cancelar</BotonP><BotonP variante="oro" disabled={isSubmitting} onClick={enviar}>{isSubmitting ? 'Guardando…' : 'Registrar pago'}</BotonP></>}>
      {r && <form onSubmit={enviar} noValidate className="grid gap-4">
        <AlertaForm texto={general} />
        <p className="text-sm text-muted">{r.codigo} · {r.cliente} · Saldo: <strong className="text-ink">{soles(r.saldo)}</strong></p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Monto" error={errors.monto?.message}><input type="number" step="0.01" min="0.01" {...register('monto')} /></Campo>
          <Campo etiqueta="Moneda"><select {...register('moneda')}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select></Campo>
          {moneda === 'USD' && <Campo etiqueta="Tipo de cambio" error={errors.tipoCambio?.message}><input type="number" step="0.001" {...register('tipoCambio')} /></Campo>}
          <Campo etiqueta="Método" error={errors.metodo?.message}><select {...register('metodo')}>{METODOS_PAGO.map(m => <option key={m}>{m}</option>)}</select></Campo>
          <Campo etiqueta="Referencia (opcional)" className="sm:col-span-2" ayuda="N.° de operación de Yape, Plin o transferencia, o voucher."><input {...register('referencia')} maxLength={60} /></Campo>
        </div>
        {cargado && !turno && <AvisoTurno texto="Para registrar cobros abre tu turno de caja." />}
        {turno && <p className="text-xs text-muted">Se registrará en tu turno de caja N.° {turno.id}.</p>}
      </form>}
    </Modal>
  );
}

/* ---------- Nueva reserva: teléfono, WhatsApp o walk-in ---------- */
export function FormularioNuevaReserva() {
  const { abierto, walkin, cliente: clientePre, cerrar } = useNuevaReserva();
  const abrirFicha = useFicha(s => s.abrir);
  const hoy = hoyLima();
  const [tipos, setTipos] = useState<any[]>([]);
  const [habs, setHabs] = useState<any[]>([]);
  const [modo, setModo] = useState<'buscar' | 'nuevo'>('buscar');
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [elegido, setElegido] = useState<any>(null);
  const [disp, setDisp] = useState<any[] | null>(null);
  const [general, setGeneral] = useState<string | null>(null);
  const { register, handleSubmit, watch, setValue, setError, reset, formState: { errors, isSubmitting } } = useForm<ReservaPanelInput, unknown, any>({ resolver: zodResolver(reservaPanelSchema) });

  useEffect(() => {
    if (!abierto) return;
    Promise.all([apiPanel('/gestion/tipos'), apiPanel('/gestion/habitaciones')]).then(([t, h]) => { setTipos(t.filter((x: any) => x.activo)); setHabs(h); });
    reset({ tipoHabitacion: 'horizonte', fechaEntrada: walkin ? hoy : '', fechaSalida: '', huespedes: 2, residencia: clientePre?.residencia ?? 'PE',
      canal: walkin ? 'Recepcion' : 'Telefono', checkInInmediato: walkin, clienteId: clientePre?.id ?? null, cliente: null, habitacionId: null, horaLlegada: '', notas: '' });
    setModo('buscar'); setElegido(clientePre); setQ(''); setResultados([]); setGeneral(null);
  }, [abierto, walkin, clientePre, reset, hoy]);

  const v = watch();
  useEffect(() => { // búsqueda de clientes
    if (modo !== 'buscar' || q.trim().length < 2) { setResultados([]); return; }
    let vigente = true;
    const t = setTimeout(() => apiPanel(`/gestion/clientes?limite=8&buscar=${encodeURIComponent(q.trim())}`).then(x => { if (vigente) setResultados(x); }).catch(() => {}), 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [q, modo]);
  useEffect(() => { // disponibilidad y cotización reales
    if (!v.fechaEntrada || !v.fechaSalida || v.fechaSalida <= v.fechaEntrada) { setDisp(null); return; }
    let vigente = true;
    const t = setTimeout(() => apiPanel(`/disponibilidad?entrada=${v.fechaEntrada}&salida=${v.fechaSalida}&huespedes=${v.huespedes || 1}`)
      .then(x => { if (vigente) setDisp(x); }).catch(() => { if (vigente) setDisp(null); }), 250);
    return () => { vigente = false; clearTimeout(t); };
  }, [v.fechaEntrada, v.fechaSalida, v.huespedes]);

  const cambiarModo = (m: 'buscar' | 'nuevo') => {
    setModo(m);
    if (m === 'nuevo') { setValue('clienteId', null); setValue('cliente', { nombres: '', apellidos: '', tipoDocumento: 'DNI', numeroDocumento: '', email: '', codigoPais: '51', telefono: '', residencia: v.residencia as 'PE' | 'EXT' }); }
    else { setValue('cliente', null); setValue('clienteId', elegido?.id ?? null); }
  };
  const elegir = (c: any) => { setElegido(c); setValue('clienteId', c.id, { shouldValidate: true }); setValue('residencia', c.residencia); };
  useEffect(() => { if (modo === 'nuevo') setValue('cliente.residencia', v.residencia as any); }, [v.residencia, modo, setValue]);

  const enviar = handleSubmit(async d => {
    setGeneral(null);
    try {
      const r = await apiPanel('/gestion/reservas', { method: 'POST', body: { ...d, habitacionId: d.habitacionId ? Number(d.habitacionId) : null } });
      avisar(r.mensaje); cerrar(); refrescar(); setTimeout(() => abrirFicha(r.codigo), 300);
    } catch (e) { const er = e as ApiError; if (er.campo) setError(er.campo as any, { message: er.message }, { shouldFocus: true }); else setGeneral(er.message); }
  });

  const t = disp?.find(x => x.codigo === v.tipoHabitacion);
  const cot = t ? cotizar(t.precioNoche, diasEntre(String(v.fechaEntrada), String(v.fechaSalida)), v.residencia === 'EXT') : null;
  const e = errors as any;
  return (
    <Modal abierto={abierto} alCerrar={cerrar} titulo={walkin ? 'Walk-in: llegada sin reserva' : 'Nueva reserva'} ancho="max-w-5xl"
      pie={<><BotonP variante="claro" onClick={cerrar}>Cancelar</BotonP><BotonP disabled={isSubmitting} onClick={enviar}><CalendarCheck className="size-4" />{isSubmitting ? 'Guardando…' : 'Crear reserva'}</BotonP></>}>
      <form onSubmit={enviar} noValidate>
        <AlertaForm texto={general} />
        <div className="grid gap-8 lg:grid-cols-2">
          <fieldset>
            <legend className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-gold-dark">1. Cliente</legend>
            <div className="mb-4 grid grid-cols-2 rounded-lg bg-sand p-1 text-sm" role="group" aria-label="Tipo de cliente">
              {(['buscar', 'nuevo'] as const).map(m => <button key={m} type="button" aria-pressed={modo === m} onClick={() => cambiarModo(m)}
                className={`rounded-md py-2 ${modo === m ? 'bg-white font-medium shadow-sm' : ''}`}>{m === 'buscar' ? 'Cliente registrado' : 'Cliente nuevo'}</button>)}
            </div>
            {modo === 'buscar' ? <>
              {elegido ? (
                <div className="flex items-center justify-between rounded-lg bg-ok-bg px-4 py-3 text-sm">
                  <div><strong>{elegido.nombres} {elegido.apellidos}</strong><br />{elegido.tipoDocumento} {elegido.numeroDocumento} · {elegido.email}</div>
                  <BotonP variante="claro" onClick={() => { setElegido(null); setValue('clienteId', null); }}>Cambiar</BotonP>
                </div>
              ) : <>
                <Campo etiqueta="Buscar cliente" error={e.clienteId?.message}><input value={q} onChange={x => setQ(x.target.value)} placeholder="Nombre, documento, correo o teléfono" autoComplete="off" /></Campo>
                <ul className="mt-2 max-h-56 divide-y divide-line overflow-y-auto rounded-lg border border-line" aria-label="Resultados">
                  {resultados.length ? resultados.map(c => <li key={c.id}><button type="button" onClick={() => elegir(c)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-gold-soft">
                    <strong>{c.nombres} {c.apellidos}</strong><span className="block text-xs text-muted">{c.tipoDocumento} {c.numeroDocumento} · {c.email} · {c.reservas} reserva(s)</span></button></li>)
                    : <li className="px-4 py-3 text-sm text-muted">{q.trim().length < 2 ? 'Escribe al menos 2 letras.' : 'Sin resultados. Usa «Cliente nuevo».'}</li>}
                </ul></>}
            </> : (
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Nombres" error={e.cliente?.nombres?.message}><input {...register('cliente.nombres')} /></Campo>
                <Campo etiqueta="Apellidos" error={e.cliente?.apellidos?.message}><input {...register('cliente.apellidos')} /></Campo>
                <Campo etiqueta="Documento" error={e.cliente?.tipoDocumento?.message}><select {...register('cliente.tipoDocumento')}><option value="DNI">DNI</option><option value="CE">Carné ext.</option><option value="PAS">Pasaporte</option></select></Campo>
                <Campo etiqueta="Número" error={e.cliente?.numeroDocumento?.message}><input {...register('cliente.numeroDocumento')} /></Campo>
                <Campo etiqueta="Correo" className="col-span-2" error={e.cliente?.email?.message}><input type="email" {...register('cliente.email')} /></Campo>
                <Campo etiqueta="Idioma de correos" className="col-span-2" error={e.cliente?.idioma?.message}><select {...register('cliente.idioma', {setValueAs:v=>v || null})}><option value="">Automático según residencia</option><option value="es">Español</option><option value="en">English</option></select></Campo>
                <Campo etiqueta="País"><select {...register('cliente.codigoPais')}>{['51', '1', '54', '55', '56', '57', '34', '49'].map(c => <option key={c} value={c}>+{c}</option>)}</select></Campo>
                <Campo etiqueta="Celular" error={e.cliente?.telefono?.message}><input inputMode="tel" {...register('cliente.telefono')} /></Campo>
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-gold-dark">2. Estadía</legend>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Tipo de habitación" error={e.tipoHabitacion?.message}><select {...register('tipoHabitacion')}>{tipos.map(x => <option key={x.codigo} value={x.codigo}>{x.nombre} · {soles0(x.precioNoche)}</option>)}</select></Campo>
              <Campo etiqueta="Habitación" error={e.habitacionId?.message}><select {...register('habitacionId')}><option value="">Automática</option>
                {habs.filter(h => h.tipoCodigo === v.tipoHabitacion && h.estado === 'Operativa').map(h => <option key={h.id} value={h.id}>{h.numero}{h.situacion !== 'Libre' ? ` · ${h.situacion}` : ''}</option>)}</select></Campo>
              <Campo etiqueta="Llegada" error={e.fechaEntrada?.message}><input type="date" min={hoy} readOnly={walkin} {...register('fechaEntrada')} /></Campo>
              <Campo etiqueta="Salida" error={e.fechaSalida?.message}><input type="date" min={sumarDias(String(v.fechaEntrada || hoy), 1)} {...register('fechaSalida')} /></Campo>
              <Campo etiqueta="Huéspedes" error={e.huespedes?.message}><input type="number" min={1} max={8} {...register('huespedes')} /></Campo>
              <Campo etiqueta="Residencia (IGV)" error={e.residencia?.message}><select {...register('residencia')}><option value="PE">Residente en Perú</option><option value="EXT">Extranjero (exonerado)</option></select></Campo>
              <Campo etiqueta="Canal"><select {...register('canal')}>{(walkin ? ['Recepcion'] : ['Telefono', 'WhatsApp', 'Recepcion']).map(c => <option key={c} value={c}>{ETIQUETAS[c]}</option>)}</select></Campo>
              <Campo etiqueta="Hora de llegada"><input placeholder="p. ej. 16:00" {...register('horaLlegada')} /></Campo>
              <Campo etiqueta="Notas" className="col-span-2"><textarea rows={2} className="!h-auto py-2" {...register('notas')} /></Campo>
              {v.fechaEntrada === hoy && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ocean" {...register('checkInInmediato')} />Registrar check-in ahora</label>}
            </div>
            <div className="mt-4 rounded-xl bg-gold-soft p-4 text-sm" aria-live="polite">
              {!t || !cot ? 'Elige las fechas para ver la disponibilidad y el total.' : (
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div><BedDouble className="mr-1 inline size-4" aria-hidden />{cot.noches} noche(s) · {t.disponibles > 0 ? <span className="text-ok">{t.disponibles} disponible(s)</span> : <span className="text-bad">Sin disponibilidad</span>}
                    <br /><span className="text-xs">{cot.exoneradoIgv ? 'Exonerado de IGV' : `Incluye IGV ${soles(cot.igv)}`}</span></div>
                  <div className="text-right"><span className="block text-xs">Total</span><strong className="text-xl text-ocean">{soles(cot.total)}</strong></div>
                </div>)}
            </div>
          </fieldset>
        </div>
      </form>
    </Modal>
  );
}
