'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Download, MessageCircle, Search, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { enlaceWhatsapp } from '@/lib/config';
import { fechaLarga, soles } from '@/lib/formato';
import { Insignia } from '@/components/ui';
import { avisar } from '@/stores/avisos';
import { descargarConfirmacion } from '@/components/pdf/confirmacion';

const busqueda = z.object({
  codigo: z.string().trim().toUpperCase().regex(/^MA\d{7,}$/, 'El código tiene el formato MA2600042 (MA + 7 dígitos).'),
  email: z.email({ error: 'Escribe el correo con el que reservaste.' })
});
type Busqueda = z.infer<typeof busqueda>;
const ESTADOS: Record<string, [string, 'ok' | 'info' | 'bad' | 'muted']> = { Confirmada: ['Confirmada', 'info'], CheckIn: ['En el hotel', 'ok'], CheckOut: ['Finalizada', 'muted'], Cancelada: ['Cancelada', 'bad'], NoShow: ['No se presentó', 'bad'] };

export function MiReserva() {
  const params = useSearchParams();
  const [r, setR] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Busqueda>({
    resolver: zodResolver(busqueda), defaultValues: { codigo: params.get('codigo') ?? '', email: '' }
  });

  const buscar = handleSubmit(async d => {
    try { setR(await api(`/reservas/${d.codigo}?email=${encodeURIComponent(d.email)}`)); setEmail(d.email); }
    catch (e) { setError('codigo', { message: (e as ApiError).message }); }
  });
  const cancelar = async () => {
    try {
      const x = await api(`/reservas/${r.codigo}/cancelar`, { method: 'POST', body: { email } });
      avisar(x.mensaje); setConfirmando(false);
      setR(await api(`/reservas/${r.codigo}?email=${encodeURIComponent(email)}`));
    } catch (e) { avisar((e as ApiError).message, 'error'); setConfirmando(false); }
  };

  if (!r) return (
    <form onSubmit={buscar} noValidate className="grid gap-8 bg-white p-6 md:p-8">
      <h2 className="font-serif text-3xl text-ocean">Busca tu reserva</h2>
      <div className="grid gap-6 sm:grid-cols-2">
        <div><label className="campo-label" htmlFor="mr-cod">Código de reserva</label>
          <input id="mr-cod" placeholder="MA2600042" autoComplete="off" className="campo" {...register('codigo')} aria-invalid={!!errors.codigo} aria-describedby="mr-e1" />
          {errors.codigo && <p id="mr-e1" role="alert" className="campo-error">{errors.codigo.message}</p>}</div>
        <div><label className="campo-label" htmlFor="mr-mail">Correo del titular</label>
          <input id="mr-mail" type="email" autoComplete="email" className="campo" {...register('email')} aria-invalid={!!errors.email} aria-describedby="mr-e2" />
          {errors.email && <p id="mr-e2" role="alert" className="campo-error">{errors.email.message}</p>}</div>
      </div>
      <button disabled={isSubmitting} className="btn-oro justify-self-start"><Search className="size-4" aria-hidden />{isSubmitting ? 'Buscando…' : 'Buscar reserva'}</button>
    </form>
  );

  const [txt, tono] = ESTADOS[r.estado] ?? [r.estado, 'muted'];
  return (
    <article className="grid gap-8 bg-white p-6 md:p-8" aria-live="polite">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div><p className="eyebrow">Reserva {r.codigo}</p><h2 className="mt-1 font-serif text-4xl text-ocean">{r.tipoHabitacion}</h2></div>
        <Insignia tono={tono}>{txt}</Insignia>
      </header>
      <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[['Titular', r.titular], ['Habitación N.°', r.habitacion], ['Huéspedes', r.huespedes], ['Llegada', `${fechaLarga(r.fechaEntrada)} · desde 15:00`],
          ['Salida', `${fechaLarga(r.fechaSalida)} · hasta 12:00`], ['Noches', r.noches], ['Valor de venta', soles(r.subtotal)],
          ['IGV', r.exoneradoIgv ? 'Exonerado' : soles(r.igv)], ['Total', soles(r.total)], ['Pagado', soles(r.pagado)]].map(([k, v]) => (
          <div key={k}><dt className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-gold-dark">{k}</dt><dd className="mt-1">{v}</dd></div>))}
      </dl>
      <p className="text-sm text-muted">{r.puedeCancelar ? 'Puedes cancelar sin costo hasta 72 horas antes de tu llegada.' : r.motivoNoCancelable}</p>
      <div className="flex flex-wrap gap-3">
        <button className="btn-oro" onClick={() => descargarConfirmacion({ ...r, titular: r.titular }).catch(() => avisar('No se pudo generar el PDF.', 'error'))}><Download className="size-4" aria-hidden />Descargar PDF</button>
        {r.puedeCancelar && !confirmando && <button className="btn-borde" onClick={() => setConfirmando(true)}><XCircle className="size-4" aria-hidden />Cancelar reserva</button>}
        <a className="btn-wa" href={enlaceWhatsapp(`Hola, tengo una consulta sobre mi reserva ${r.codigo}.`)} target="_blank" rel="noopener"><MessageCircle className="size-4" aria-hidden />Escribir al hotel</a>
        <button className="btn-borde" onClick={() => setR(null)}>Buscar otra</button>
      </div>
      {confirmando && (
        <div role="alertdialog" aria-labelledby="conf-t" className="grid gap-4 border border-bad/30 bg-bad-bg p-6">
          <p id="conf-t" className="font-medium text-bad">¿Seguro que quieres cancelar? La habitación quedará libre y no podrás recuperar la reserva.</p>
          <div className="flex gap-3"><button className="btn bg-bad text-white" onClick={cancelar}>Sí, cancelar</button><button className="btn-borde" onClick={() => setConfirmando(false)}>Mantener reserva</button></div>
        </div>
      )}
    </article>
  );
}
