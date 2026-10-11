'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { suscripcionSchema } from '@marea/shared';
import { api } from '@/lib/api';
import { avisar } from '@/stores/avisos';

/** Boletín (React Hook Form + Zod). */
export function Boletin() {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<{ email: string }>({ resolver: zodResolver(suscripcionSchema) });
  const enviar = handleSubmit(async d => {
    try { const r = await api('/suscriptores', { method: 'POST', body: d }); avisar(r.mensaje); reset(); }
    catch (e: any) { avisar(e.message, 'error'); }
  });
  return (
    <form onSubmit={enviar} noValidate>
      <h2 className="mb-4 text-xs uppercase tracking-[0.26em] text-gold-light">Ofertas exclusivas</h2>
      <p className="mb-3 text-sm text-[#A9BCC0]">Tarifas especiales para feriados largos y temporada de verano.</p>
      <label htmlFor="nl" className="sr-only">Correo electrónico</label>
      <div className="flex border-b border-white/30">
        <input id="nl" type="email" autoComplete="email" placeholder="Tu correo electrónico" {...register('email')} aria-invalid={!!errors.email}
          className="min-w-0 flex-1 bg-transparent py-3 text-white outline-none placeholder:text-[#A9BCC0]" />
        <button disabled={isSubmitting} className="btn-oro min-h-10 px-4">Suscribirme</button>
      </div>
      {errors.email && <p className="mt-2 text-sm text-gold-light" role="alert">{errors.email.message}</p>}
    </form>
  );
}
