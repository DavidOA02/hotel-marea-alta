'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, CreditCard, Hourglass, Lock, RotateCcw, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { soles } from '@/lib/formato';
import { avisar } from '@/stores/avisos';

interface Orden {
  id: string; numero: number; estado: 'Pendiente' | 'Aprobado' | 'Rechazado'; vencida: boolean; pasarela: 'Simulada' | 'Culqi' | 'MercadoPago' | 'Niubiz';
  monto: number; codigoReserva: string; titular: string; email: string; mensaje: string | null; datosCheckout: Record<string, any> | null;
}
declare global { interface Window { CulqiCheckout?: any; VisanetCheckout?: any } }

const NOMBRE: Record<string, string> = { Simulada: 'Pasarela simulada', Culqi: 'Culqi', MercadoPago: 'Mercado Pago', Niubiz: 'Niubiz' };
const cargarScript = (src: string) => new Promise<void>((ok, mal) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  document.body.appendChild(Object.assign(document.createElement('script'), { src, async: true, onload: () => ok(), onerror: () => mal(new Error('No se pudo cargar la pasarela de pago. Revisa tu conexión.')) }));
});
const limpio = (s: string) => s.normalize('NFD').replace(/[^A-Za-z ]/g, '').trim().slice(0, 25);

/** Página de pago en línea: muestra el checkout de la pasarela y el resultado confirmado por la API. */
export function Pago() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('orden');
  const pagoMp = params.get('payment_id') ?? params.get('collection_id');   // retorno de Mercado Pago
  const [o, setO] = useState<Orden | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const confirmado = useRef(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    try { setO(await api<Orden>(`/pagos-en-linea/${id}`)); } catch (e) { setError((e as ApiError).message); }
  }, [id]);
  useEffect(() => {
    if (!id) return;
    // Al volver de Mercado Pago se confirma con la API (que consulta el pago); el aviso del webhook puede llegar después
    if (pagoMp && !confirmado.current) { confirmado.current = true; api(`/pagos-en-linea/${id}/mercadopago`, { method: 'POST', body: { pagoId: pagoMp } }).catch(() => undefined).finally(cargar); }
    else cargar();
  }, [id, pagoMp, cargar]);
  // Mientras Mercado Pago no decide (p. ej. pago en proceso), se vuelve a consultar
  useEffect(() => {
    if (!o || o.estado !== 'Pendiente' || o.pasarela !== 'MercadoPago' || !pagoMp) return;
    const t = setInterval(cargar, 4000); const fin = setTimeout(() => clearInterval(t), 120_000);
    return () => { clearInterval(t); clearTimeout(fin); };
  }, [o, pagoMp, cargar]);

  const ejecutar = async (fn: () => Promise<unknown>) => {
    setOcupado(true);
    try { await fn(); } catch (e) { avisar((e as Error).message, 'error'); } finally { setOcupado(false); await cargar(); }
  };
  const reintentar = async () => {
    setOcupado(true);
    try {
      const n = await api<{ id: string }>('/pagos-en-linea', { method: 'POST', body: { codigo: o!.codigoReserva, email: o!.email } });
      setO(null); router.replace(`/pago?orden=${n.id}`);
    } catch (e) { avisar((e as Error).message, 'error'); } finally { setOcupado(false); }
  };
  const simular = (aprobar: boolean) => ejecutar(() => api(`/pagos-en-linea/${id}/simulada`, { method: 'POST', body: { aprobar } }));
  const culqi = async () => {
    try {
      const d = o!.datosCheckout!;
      await cargarScript(d.script);
      const pasarela = new window.CulqiCheckout(d.llavePublica, {
        settings: { title: 'Hotel Marea Alta', currency: 'PEN', amount: d.montoCentimos },
        client: { email: o!.email },
        options: { lang: 'auto', installments: false, modal: true, paymentMethods: { tarjeta: true, yape: true, billetera: false, bancaMovil: false, agente: false, cuotealo: false } }
      });
      // Culqi tokeniza en el navegador; el cargo lo crea la API con la llave secreta
      pasarela.culqi = () => {
        if (pasarela.token) { const token = pasarela.token.id; pasarela.close(); ejecutar(() => api(`/pagos-en-linea/${id}/culqi`, { method: 'POST', body: { token } })); }
        else if (pasarela.error) { pasarela.close(); avisar(pasarela.error.user_message ?? 'Culqi no pudo procesar el pago.', 'error'); }
      };
      pasarela.open();
    } catch (e) { avisar((e as Error).message, 'error'); }
  };
  const niubiz = () => ejecutar(async () => {
    const d = o!.datosCheckout!;
    await cargarScript(d.script);
    const [nombre, ...apellido] = o!.titular.split(' ');
    // Niubiz envía el formulario a la API («action»), que autoriza el pago y devuelve al huésped a esta página
    window.VisanetCheckout.configure({ sessiontoken: d.sessionKey, channel: 'web', merchantid: d.comercio, purchasenumber: d.numeroPedido, amount: d.monto,
      expirationminutes: '20', timeouturl: d.retorno, action: d.accion, merchantlogo: `${window.location.origin}/marca/isotipo-512.png`, merchantname: 'Hotel Marea Alta',
      formbuttoncolor: '#12303A', cardholdername: limpio(nombre ?? ''), cardholderlastname: limpio(apellido.join(' ')), cardholderemail: o!.email, complete: () => undefined });
    window.VisanetCheckout.open();
  });

  if (!id) return <Aviso icono={XCircle} titulo="Falta el código de pago">Genera el pago desde <Link href="/mi-reserva" className="underline">Mi reserva</Link>.</Aviso>;
  if (error) return <Aviso icono={XCircle} titulo="No encontramos ese pago">{error} <Link href="/mi-reserva" className="underline">Ir a Mi reserva</Link></Aviso>;
  if (!o) return <div className="grid min-h-60 place-items-center bg-white" role="status"><span className="size-8 animate-spin rounded-full border-2 border-line border-t-ocean" /><span className="sr-only">Cargando…</span></div>;

  const volver = <Link className="btn-borde" href={`/mi-reserva?codigo=${o.codigoReserva}`}>Ver mi reserva</Link>;
  if (o.estado === 'Aprobado') return (
    <Aviso icono={CheckCircle2} tono="ok" titulo="¡Pago aprobado!">
      <p>Recibimos {soles(o.monto)} para la reserva <strong>{o.codigoReserva}</strong>. Te enviamos el comprobante del pago a {o.email}.</p>
      <div className="mt-6 flex justify-center">{volver}</div>
    </Aviso>);
  if (o.estado === 'Rechazado' || o.vencida) return (
    <Aviso icono={XCircle} tono="bad" titulo={o.vencida ? 'El tiempo para pagar venció' : 'El pago no se aprobó'}>
      {o.mensaje && !o.vencida && <p>{o.mensaje}</p>}
      <p className="text-muted">No se hizo ningún cargo. Puedes intentarlo de nuevo o pagar al llegar al hotel.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3"><button className="btn-oro" disabled={ocupado} onClick={reintentar}><RotateCcw className="size-4" aria-hidden />Intentar de nuevo</button>{volver}</div>
    </Aviso>);

  return (
    <div className="mx-auto grid max-w-xl gap-6 bg-white p-6 text-center md:p-10" aria-live="polite">
      <p className="eyebrow">Reserva {o.codigoReserva}</p>
      <p className="font-serif text-5xl text-ocean tabular-nums">{soles(o.monto)}</p>
      <p className="text-muted">Saldo de la reserva a nombre de {o.titular}. Pago seguro con {NOMBRE[o.pasarela]}.</p>
      {o.mensaje && <p className="bg-warn-bg p-3 text-sm text-warn">{o.mensaje}</p>}
      {o.pasarela === 'Simulada' && <>
        <p className="bg-info-bg p-3 text-sm text-info">Pasarela de <strong>prueba</strong> (solo en desarrollo): no se cobra nada.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button className="btn-oro" disabled={ocupado} onClick={() => simular(true)}><CheckCircle2 className="size-4" aria-hidden />Simular pago aprobado</button>
          <button className="btn-borde" disabled={ocupado} onClick={() => simular(false)}><XCircle className="size-4" aria-hidden />Simular rechazo</button>
        </div></>}
      {o.pasarela === 'Culqi' && <button className="btn-oro" disabled={ocupado} onClick={culqi}><CreditCard className="size-4" aria-hidden />{ocupado ? 'Procesando…' : 'Pagar con tarjeta o Yape'}</button>}
      {o.pasarela === 'Niubiz' && <button className="btn-oro" disabled={ocupado} onClick={niubiz}><CreditCard className="size-4" aria-hidden />{ocupado ? 'Abriendo…' : 'Pagar con tarjeta'}</button>}
      {o.pasarela === 'MercadoPago' && (pagoMp
        ? <p className="flex items-center justify-center gap-2 text-muted"><Hourglass className="size-4" aria-hidden />Confirmando tu pago con Mercado Pago…</p>
        : <a className="btn-oro" href={o.datosCheckout?.url}><CreditCard className="size-4" aria-hidden />Pagar con Mercado Pago</a>)}
      <p className="flex items-center justify-center gap-2 text-xs text-muted"><Lock className="size-3.5" aria-hidden />Los datos de tu tarjeta los recibe directamente la pasarela; el hotel nunca los ve.</p>
      {volver}
    </div>
  );
}

function Aviso({ icono: I, titulo, tono, children }: { icono: React.ElementType; titulo: string; tono?: 'ok' | 'bad'; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-2xl gap-3 bg-white p-6 text-center md:p-10" role="status">
      <I className={`mx-auto size-12 ${tono === 'ok' ? 'text-ok' : tono === 'bad' ? 'text-bad' : 'text-muted'}`} aria-hidden />
      <h2 className="font-serif text-3xl text-ocean">{titulo}</h2>
      <div>{children}</div>
    </div>
  );
}
