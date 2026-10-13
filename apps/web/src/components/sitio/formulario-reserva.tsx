'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, CreditCard, Download, Info, MessageCircle, ShieldCheck } from 'lucide-react';
import { cotizar, diasEntre, hoyLima, reservaWebSchema, sumarDias, type ReservaWeb, type ReservaWebInput } from '@marea/shared';
import { api, ApiError } from '@/lib/api';
import { enlaceWhatsapp, TIPO_CAMBIO } from '@/lib/config';
import { dolares, fechaCorta, fechaDia, soles } from '@/lib/formato';
import { useTipos } from '@/lib/usar-tipos';
import { useReserva } from '@/stores/reserva';
import { avisar } from '@/stores/avisos';
import { descargarConfirmacion, type DatosConfirmacion } from '../pdf/confirmacion';

const PAISES = [['51', '+51 PE'], ['1', '+1 US/CA'], ['54', '+54 AR'], ['55', '+55 BR'], ['56', '+56 CL'], ['57', '+57 CO'], ['593', '+593 EC'], ['52', '+52 MX'], ['34', '+34 ES']];

export function FormularioReserva() {
  const { tipos, moneda, apiDisponible } = useTipos();
  const { borrador, setBorrador } = useReserva();
  const [libres, setLibres] = useState<Record<string, number> | null>(null);
  const [confirmada, setConfirmada] = useState<(DatosConfirmacion & { email: string; puedePagarEnLinea: boolean; correoRegistrado?: boolean }) | null>(null);
  const [pagando, setPagando] = useState(false);
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const hoy = hoyLima();

  const { register, handleSubmit, watch, setValue, setError, reset, formState: { errors, isSubmitting } } = useForm<ReservaWebInput, unknown, ReservaWeb>({
    resolver: zodResolver(reservaWebSchema),
    defaultValues: { tipoHabitacion: borrador.tipoHabitacion, fechaEntrada: borrador.fechaEntrada, fechaSalida: borrador.fechaSalida, huespedes: borrador.huespedes,
      residencia: 'PE', tipoDocumento: 'DNI', codigoPais: '51', aceptaPrivacidad: false, aceptaPublicidad: false, nombres: '', apellidos: '', numeroDocumento: '', email: '', telefono: '' }
  });
  const v = watch();

  // Barra de la portada → formulario (Zustand)
  useEffect(() => {
    (['fechaEntrada', 'fechaSalida', 'huespedes', 'tipoHabitacion'] as const).forEach(k => {
      if (borrador[k] !== undefined && borrador[k] !== '' && borrador[k] !== v[k]) setValue(k, borrador[k] as never, { shouldValidate: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrador]);
  const sincronizar = (k: 'fechaEntrada' | 'fechaSalida' | 'huespedes' | 'tipoHabitacion', valor: string | number) => setBorrador({ [k]: valor });

  // Pasaporte automático para extranjeros (exoneración de IGV)
  useEffect(() => {
    if (v.residencia === 'EXT' && v.tipoDocumento === 'DNI') setValue('tipoDocumento', 'PAS');
    if (v.residencia === 'PE' && v.tipoDocumento === 'PAS') setValue('tipoDocumento', 'DNI');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.residencia]);

  // Disponibilidad en vivo
  const noches = v.fechaEntrada && v.fechaSalida && v.fechaSalida > v.fechaEntrada ? diasEntre(v.fechaEntrada, v.fechaSalida) : 0;
  useEffect(() => {
    if (!noches || !apiDisponible) { setLibres(null); return; }
    let vigente = true;   // la disponibilidad de fechas anteriores no pisa la de las elegidas
    const t = setTimeout(() => {
      api<any[]>(`/disponibilidad?entrada=${v.fechaEntrada}&salida=${v.fechaSalida}&huespedes=${v.huespedes}`)
        .then(l => { if (vigente) setLibres(Object.fromEntries(l.map(x => [x.codigo, x.disponibles]))); }).catch(() => { if (vigente) setLibres(null); });
    }, 300);
    return () => { vigente = false; clearTimeout(t); };
  }, [v.fechaEntrada, v.fechaSalida, v.huespedes, noches, apiDisponible]);

  const tipo = tipos.find(t => t.codigo === v.tipoHabitacion) ?? tipos[0];
  const q = useMemo(() => cotizar(tipo.precioNoche, noches || 0, v.residencia === 'EXT'), [tipo, noches, v.residencia]);
  const dinero = (n: number) => (moneda === 'USD' ? dolares(n / TIPO_CAMBIO) : soles(n));
  const quedan = libres ? libres[v.tipoHabitacion] : null;

  const enviar = handleSubmit(async d => {
    setErrorGeneral(null);
    if (quedan === 0) { setError('tipoHabitacion', { message: 'No quedan habitaciones de este tipo para tus fechas. Elige otro tipo o cambia las fechas.' }); return; }
    try {
      const r = await api('/reservas', { method: 'POST', body: d });
      setConfirmada({ ...r, email: d.email, titular: `${d.nombres} ${d.apellidos}`, documento: `${d.tipoDocumento} ${d.numeroDocumento}` });
      avisar(`Reserva ${r.codigo} confirmada.`);
      document.getElementById('reservar')?.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      const err = e as ApiError;
      if (err.campo) setError(err.campo as keyof ReservaWebInput, { message: err.message }, { shouldFocus: true });
      else setErrorGeneral(err.message);
    }
  });

  const pagarEnLinea = async () => {
    setPagando(true);
    try { const o = await api<{ id: string }>('/pagos-en-linea', { method: 'POST', body: { codigo: confirmada!.codigo, email: confirmada!.email } }); router.push(`/pago?orden=${o.id}`); }
    catch (e) { avisar((e as ApiError).message, 'error'); setPagando(false); }
  };

  const mensajeWa = `Hola, quisiera reservar en Marea Alta: ${tipo.nombre}, del ${fechaCorta(v.fechaEntrada)} al ${fechaCorta(v.fechaSalida)}, ${v.huespedes} huésped(es).`;
  const err = (k: keyof ReservaWebInput) => errors[k] ? <p id={`e-${k}`} className="campo-error" role="alert">{errors[k]?.message as string}</p> : null;
  const aria = (k: keyof ReservaWebInput) => ({ 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `e-${k}` : undefined });

  if (confirmada) return (
    <div className="mx-auto grid max-w-3xl gap-4 bg-white p-6 text-center md:p-10" role="status">
      <CheckCircle2 className="mx-auto size-12 text-ok" aria-hidden />
      <p className="eyebrow">Código de reserva {confirmada.codigo}</p>
      <h3 className="display text-4xl">¡Listo, {confirmada.titular.split(' ')[0]}! Tu reserva está confirmada</h3>
      <p>{confirmada.tipoHabitacion} N.° {confirmada.habitacion}, del {fechaDia(confirmada.fechaEntrada)} al {fechaDia(confirmada.fechaSalida)} ({confirmada.noches} {confirmada.noches === 1 ? 'noche' : 'noches'}). Total: <strong>{soles(confirmada.total)}</strong>{confirmada.exoneradoIgv ? ', exonerado de IGV' : ', IGV incluido'}. {confirmada.puedePagarEnLinea ? 'Puedes pagar al llegar o ahora en línea.' : 'Pagas al llegar.'}</p>
      {confirmada.correoRegistrado
        ? <p className="text-muted">Tu documento ya estaba registrado con otro correo: te enviamos la confirmación a ese correo y no cambiamos tus datos. Guarda tu código y úsalo con ese correo en «Mi reserva». Si tu correo cambió, <a className="font-medium text-ocean underline" href={enlaceWhatsapp(`Hola, hice la reserva ${confirmada.codigo} y quiero actualizar mi correo.`)} target="_blank" rel="noopener">escríbenos por WhatsApp</a> y lo actualizamos.</p>
        : <p className="text-muted">Te enviamos la confirmación a {confirmada.email}. Guarda tu código: con él puedes consultar o cancelar tu reserva (hasta 72 h antes) en «Mi reserva».</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {confirmada.puedePagarEnLinea && <button className="btn-oro" disabled={pagando} onClick={pagarEnLinea}><CreditCard className="size-4" aria-hidden />{pagando ? 'Preparando…' : 'Pagar ahora en línea'}</button>}
        <button className={confirmada.puedePagarEnLinea ? 'btn-borde' : 'btn-oro'} onClick={() => descargarConfirmacion(confirmada).catch(() => avisar('No se pudo generar el PDF.', 'error'))}><Download className="size-4" aria-hidden />Descargar confirmación (PDF)</button>
        <Link className="btn-borde" href={`/mi-reserva?codigo=${confirmada.codigo}`}>Ver mi reserva</Link>
        <button className="btn-borde" onClick={() => { setConfirmada(null); reset(); }}>Hacer otra reserva</button>
      </div>
    </div>
  );

  return (
    <form onSubmit={enviar} noValidate className="grid items-start gap-6 lg:grid-cols-[7fr_4fr]">
      <div className="grid gap-8 bg-white p-5 md:p-8">
        <fieldset className="grid gap-6 sm:grid-cols-2">
          <legend className="mb-4 font-serif text-2xl text-ocean">Tu estadía</legend>
          <div className="sm:col-span-2"><label className="campo-label" htmlFor="f-tipo">Habitación</label>
            <select id="f-tipo" className="campo" {...register('tipoHabitacion', { onChange: e => sincronizar('tipoHabitacion', e.target.value) })} {...aria('tipoHabitacion')}>
              {tipos.map(t => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}</select>{err('tipoHabitacion')}</div>
          <div><label className="campo-label" htmlFor="f-in">Llegada</label>
            <input id="f-in" type="date" min={hoy} className="campo" {...register('fechaEntrada', { onChange: e => sincronizar('fechaEntrada', e.target.value) })} {...aria('fechaEntrada')} />{err('fechaEntrada')}</div>
          <div><label className="campo-label" htmlFor="f-out">Salida</label>
            <input id="f-out" type="date" min={sumarDias(v.fechaEntrada || hoy, 1)} className="campo" {...register('fechaSalida', { onChange: e => sincronizar('fechaSalida', e.target.value) })} {...aria('fechaSalida')} />{err('fechaSalida')}</div>
          <div><label className="campo-label" htmlFor="f-g">Huéspedes</label>
            <select id="f-g" className="campo" {...register('huespedes', { onChange: e => sincronizar('huespedes', Number(e.target.value)) })} {...aria('huespedes')}>
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} {n === 1 ? 'adulto' : 'adultos'}</option>)}</select>{err('huespedes')}</div>
          <div><label className="campo-label" htmlFor="f-hora">Hora estimada de llegada</label>
            <select id="f-hora" className="campo" {...register('horaLlegada')}><option value="">Sin definir</option>
              {['Antes de las 15:00', '15:00 – 18:00', '18:00 – 21:00', 'Después de las 21:00'].map(h => <option key={h}>{h}</option>)}</select></div>
        </fieldset>

        <fieldset>
          <legend className="mb-4 flex items-center gap-2 font-serif text-2xl text-ocean">Residencia <span title="Los extranjeros no domiciliados no pagan el IGV del hospedaje (estadías de hasta 60 días)."><Info className="size-4 text-gold-dark" aria-hidden /></span></legend>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <label className="flex items-center gap-3"><input type="radio" value="PE" className="size-5 accent-ocean" {...register('residencia')} /> Resido en el Perú</label>
            <label className="flex items-center gap-3"><input type="radio" value="EXT" className="size-5 accent-ocean" {...register('residencia')} /> Soy turista extranjero (no domiciliado)</label>
          </div>
          <p className="mt-3 text-sm text-muted">{v.residencia === 'EXT' ? 'Hospedaje exonerado de IGV (estadías de hasta 60 días). Presenta tu pasaporte y la Tarjeta Andina de Migración al registrarte.' : 'Las tarifas incluyen IGV (18 %).'}</p>
        </fieldset>

        <fieldset className="grid gap-6 sm:grid-cols-2">
          <legend className="mb-4 font-serif text-2xl text-ocean">Datos del titular</legend>
          <div><label className="campo-label" htmlFor="f-nom">Nombres</label><input id="f-nom" autoComplete="given-name" className="campo" {...register('nombres')} {...aria('nombres')} />{err('nombres')}</div>
          <div><label className="campo-label" htmlFor="f-ape">Apellidos</label><input id="f-ape" autoComplete="family-name" className="campo" {...register('apellidos')} {...aria('apellidos')} />{err('apellidos')}</div>
          <div><label className="campo-label" htmlFor="f-td">Tipo de documento</label>
            <select id="f-td" className="campo" {...register('tipoDocumento')} {...aria('tipoDocumento')}><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="PAS">Pasaporte</option></select>{err('tipoDocumento')}</div>
          <div><label className="campo-label" htmlFor="f-doc">Número de documento</label><input id="f-doc" inputMode={v.tipoDocumento === 'DNI' ? 'numeric' : 'text'} className="campo" {...register('numeroDocumento')} {...aria('numeroDocumento')} />{err('numeroDocumento')}</div>
          <div><label className="campo-label" htmlFor="f-tel">Celular / WhatsApp</label>
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <select aria-label="Código de país" className="campo" {...register('codigoPais')}>{PAISES.map(([c, t]) => <option key={c} value={c}>{t}</option>)}</select>
              <input id="f-tel" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="987 654 321" className="campo" {...register('telefono')} {...aria('telefono')} />
            </div>{err('telefono')}</div>
          <div><label className="campo-label" htmlFor="f-mail">Correo electrónico</label><input id="f-mail" type="email" autoComplete="email" className="campo" {...register('email')} {...aria('email')} />{err('email')}</div>
          <div><label className="campo-label" htmlFor="f-idioma">Idioma de correos / Email language</label><select id="f-idioma" className="campo" {...register('idioma', {setValueAs:v=>v || null})}><option value="">Automático según residencia / Automatic</option><option value="es">Español</option><option value="en">English</option></select>{err('idioma')}</div>
          <div className="sm:col-span-2"><label className="campo-label" htmlFor="f-notas">Solicitudes especiales <span className="normal-case tracking-normal text-muted">(opcional)</span></label>
            <textarea id="f-notas" rows={3} placeholder="Aniversario, cuna, tour a Islas Ballestas, traslado desde Pisco…" className="campo font-sans text-base" {...register('notas')} /></div>
        </fieldset>

        <div className="grid gap-3">
          <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5 accent-ocean" {...register('aceptaPrivacidad')} {...aria('aceptaPrivacidad')} />
            <span>He leído y acepto la <Link href="/privacidad" target="_blank" className="text-ocean underline">Política de privacidad</Link> (Ley N.° 29733).</span></label>{err('aceptaPrivacidad')}
          <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5 accent-ocean" {...register('aceptaPublicidad')} /><span>Acepto recibir ofertas del hotel (opcional).</span></label>
        </div>
        {errorGeneral && <div role="alert" className="bg-bad-bg p-4 text-bad">{errorGeneral} <a className="font-medium underline" href={enlaceWhatsapp(mensajeWa)} target="_blank" rel="noopener">Reservar por WhatsApp</a></div>}
      </div>

      <aside className="sticky top-24 grid gap-4 bg-ocean p-6 text-white md:p-8" aria-label="Resumen de la reserva" aria-live="polite">
        <p className="eyebrow-claro">Resumen</p>
        <h3 className="font-serif text-3xl">{tipo.nombre}</h3>
        {quedan !== null && quedan !== undefined && (
          <p className={`text-sm ${quedan === 0 ? 'text-[#FFB4A2]' : quedan <= 3 ? 'text-gold-light' : 'text-[#9FE0B8]'}`}>
            {quedan === 0 ? 'Sin disponibilidad para estas fechas' : quedan <= 3 ? `¡Quedan ${quedan} ${quedan === 1 ? 'habitación' : 'habitaciones'}!` : 'Disponible para tus fechas'}</p>)}
        <dl className="grid gap-2.5 text-sm">
          {[['Fechas', noches ? `${fechaCorta(v.fechaEntrada)} – ${fechaCorta(v.fechaSalida)}` : 'Elige fechas'], ['Noches', noches || '—'], ['Huéspedes', String(v.huespedes)],
            ['Valor de venta', noches ? dinero(q.subtotal) : '—'], ['IGV (18 %)', q.exoneradoIgv ? 'Exonerado' : noches ? dinero(q.igv) : '—']].map(([k, val]) => (
            <div key={k as string} className="flex justify-between gap-3 border-b border-white/10 pb-2.5"><dt className="text-[#A9BCC0]">{k}</dt><dd className="tabular-nums">{val}</dd></div>))}
        </dl>
        <div className="flex items-baseline justify-between"><span className="text-xs uppercase tracking-[0.2em] text-[#A9BCC0]">Total</span>
          <strong className="font-serif text-4xl font-normal text-gold-light tabular-nums">{noches ? dinero(q.total) : '—'}</strong></div>
        {moneda === 'USD' && noches > 0 && <p className="text-xs text-[#A9BCC0]">Tipo de cambio referencial S/ {TIPO_CAMBIO.toFixed(2)}. Total en soles: {soles(q.total)}.</p>}
        <button disabled={isSubmitting} className="btn-oro w-full">{isSubmitting ? 'Reservando…' : 'Reservar ahora'}</button>
        <a href={enlaceWhatsapp(mensajeWa)} target="_blank" rel="noopener" className="btn-wa w-full"><MessageCircle className="size-4" aria-hidden />Reservar por WhatsApp</a>
        <p className="flex gap-2 text-sm text-[#A9BCC0]"><ShieldCheck className="size-4 shrink-0" aria-hidden />Cancelación sin costo hasta 72 h antes de la llegada.</p>
        <p className="flex gap-2 border-t border-white/10 pt-3 text-xs text-[#A9BCC0]"><CreditCard className="size-4 shrink-0" aria-hidden />Visa · Mastercard · American Express · Diners Club · Yape · Plin · Transferencia</p>
      </aside>
    </form>
  );
}
