'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Star } from 'lucide-react';
import { encuestaSchema, type EncuestaInput } from '@marea/shared';
import { api, ApiError } from '@/lib/api';
import { fechaLarga } from '@/lib/formato';

/** Encuesta de satisfacción (enlace del correo tras el check-out): calificación de 1 a 5 y recomendación de 0 a 10. */
export function Encuesta() {
  const token = useSearchParams().get('token');
  const [e, setE] = useState<{ nombre: string; tipoHabitacion: string; fechaEntrada: string; fechaSalida: string; respondida: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gracias, setGracias] = useState(false);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<EncuestaInput, unknown, any>({ resolver: zodResolver(encuestaSchema), defaultValues: { comentario: '' } });
  useEffect(() => { if (token) api(`/encuestas/${encodeURIComponent(token)}`).then(setE).catch(x => setError((x as ApiError).message)); }, [token]);
  const calificacion = Number(watch('calificacion')) || 0, recomendacion = watch('recomendacion');
  const enviar = handleSubmit(async d => {
    try { await api(`/encuestas/${encodeURIComponent(token!)}`, { method: 'POST', body: d }); setGracias(true); }
    catch (x) { setError((x as ApiError).message); }
  });

  if (!token || error) return <p role="alert" className="bg-white p-6 text-center md:p-10">{error ?? 'Abre la encuesta desde el enlace de tu correo.'}</p>;
  if (!e) return <div className="grid min-h-60 place-items-center bg-white" role="status"><span className="size-8 animate-spin rounded-full border-2 border-line border-t-ocean" /><span className="sr-only">Cargando…</span></div>;
  if (gracias || e.respondida) return (
    <div className="mx-auto grid max-w-2xl gap-3 bg-white p-6 text-center md:p-10" role="status">
      <CheckCircle2 className="mx-auto size-12 text-ok" aria-hidden />
      <h2 className="font-serif text-3xl text-ocean">¡Gracias, {e.nombre}!</h2>
      <p>Tu opinión nos ayuda a mejorar. Esperamos verte pronto de nuevo en Paracas.</p>
    </div>);
  return (
    <form onSubmit={enviar} noValidate className="mx-auto grid max-w-2xl gap-8 bg-white p-6 md:p-10">
      <p>Hola {e.nombre}, gracias por hospedarte en la {e.tipoHabitacion} del {fechaLarga(e.fechaEntrada)} al {fechaLarga(e.fechaSalida)}.</p>
      <fieldset aria-describedby={errors.calificacion ? 'e-cal' : undefined}>
        <legend className="mb-3 font-serif text-2xl text-ocean">¿Cómo calificas tu estadía?</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Calificación de 1 a 5 estrellas">
          {[1, 2, 3, 4, 5].map(n => (
            <label key={n} className="cursor-pointer" title={`${n} de 5`}>
              <input type="radio" value={n} className="peer sr-only" {...register('calificacion')} />
              <Star className={`size-10 rounded transition peer-focus-visible:outline-2 peer-focus-visible:outline-gold ${n <= calificacion ? 'fill-gold text-gold' : 'text-line'}`} aria-hidden />
              <span className="sr-only">{n} de 5</span>
            </label>))}
        </div>
        {errors.calificacion && <p id="e-cal" role="alert" className="campo-error">{errors.calificacion.message as string}</p>}
      </fieldset>
      <fieldset>
        <legend className="mb-3 font-serif text-2xl text-ocean">Del 0 al 10, ¿qué tan probable es que nos recomiendes?</legend>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-11" role="radiogroup" aria-label="Probabilidad de recomendarnos, de 0 a 10">
          {Array.from({ length: 11 }, (_, n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" value={n} className="peer sr-only" {...register('recomendacion')} />
              <span className={`grid h-11 place-items-center border text-sm peer-focus-visible:outline-2 peer-focus-visible:outline-gold ${String(recomendacion) === String(n) ? 'border-ocean bg-ocean text-white' : 'border-line hover:border-gold'}`}>{n}</span>
            </label>))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted"><span>Nada probable</span><span>Muy probable</span></div>
        {errors.recomendacion && <p role="alert" className="campo-error">{errors.recomendacion.message as string}</p>}
      </fieldset>
      <div><label className="campo-label" htmlFor="e-com">¿Algo que quieras contarnos? <span className="normal-case tracking-normal text-muted">(opcional)</span></label>
        <textarea id="e-com" rows={4} maxLength={1000} className="campo font-sans text-base" {...register('comentario')} /></div>
      <button disabled={isSubmitting} className="btn-oro justify-self-start">{isSubmitting ? 'Enviando…' : 'Enviar respuesta'}</button>
    </form>
  );
}
