'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { cambiarClaveSchema, loginSchema, type CambiarClaveInput, type LoginInput } from '@marea/shared';
import { api, ApiError } from '@/lib/api';
import { useSesion } from '@/stores/sesion';
import { Emblema } from '@/components/logo';

const AVISOS: Record<string, string> = { expirada: 'Tu sesión expiró o fue cerrada. Ingresa de nuevo.', inactividad: 'Cerramos tu sesión por inactividad para proteger los datos del hotel.' };
const inputCls = 'h-12 w-full rounded-lg border border-[#D9D6CE] bg-white px-3 outline-none focus:border-gold focus:ring-2 focus:ring-gold/20 aria-[invalid=true]:border-bad';

export function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const { guardar, token, usuario } = useSesion();
  const [paso, setPaso] = useState<'login' | 'cambio'>('login');
  const [claveActual, setClaveActual] = useState('');
  const [ver, setVer] = useState(false);
  const [alerta, setAlerta] = useState<string | null>(AVISOS[params.get('motivo') ?? ''] ?? null);
  const [local, setLocal] = useState(false);
  useEffect(() => { setLocal(['localhost', '127.0.0.1'].includes(window.location.hostname)); }, []);
  useEffect(() => { if (token && usuario && !usuario.debeCambiarClave) router.replace('/panel/dashboard'); }, [token, usuario, router]);

  const fl = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const fc = useForm<CambiarClaveInput>({ resolver: zodResolver(cambiarClaveSchema) });

  const ingresar = fl.handleSubmit(async d => {
    setAlerta(null);
    try {
      const r = await api('/auth/login', { method: 'POST', body: d });
      guardar(r);
      if (r.usuario.debeCambiarClave) { setClaveActual(d.clave); setPaso('cambio'); }
      else router.replace('/panel/dashboard');
    } catch (e) { setAlerta((e as ApiError).status === 0 ? 'No se pudo conectar con la API. ¿Está ejecutándose el backend (npm run dev)?' : (e as ApiError).message); }
  });
  const cambiar = fc.handleSubmit(async d => {
    try {
      const r = await api('/auth/cambiar-clave', { method: 'POST', token: useSesion.getState().token, body: { claveActual, claveNueva: d.claveNueva } });
      guardar(r); router.replace('/panel/dashboard');
    } catch (e) { fc.setError('claveNueva', { message: (e as ApiError).message }); }
  });

  return (
    <main id="contenido" className="grid min-h-screen bg-white lg:grid-cols-[1.1fr_1fr]">
      <section aria-hidden className="relative hidden flex-col justify-between bg-ocean-3 bg-[linear-gradient(180deg,rgba(12,34,42,.35),rgba(12,34,42,.9)),url(https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=70)] bg-cover bg-center p-12 text-white lg:flex">
        <p className="flex items-center gap-4 font-serif text-3xl uppercase tracking-[0.14em]"><Emblema className="size-16" /><span>Marea Alta<span className="block font-sans text-[0.65rem] tracking-[0.36em] text-gold-light">Paracas · Perú</span></span></p>
        <div><p className="font-serif text-5xl leading-tight">Panel de gestión del hotel</p><p className="mt-3 max-w-md text-[#D6E0E2]">Reservas, recepción, habitaciones, caja y reportes en un solo lugar.</p></div>
        <p className="text-sm">© {new Date().getFullYear()} Marea Alta Hoteles S.A.C.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {paso === 'login' ? (
            <form onSubmit={ingresar} noValidate className="grid gap-4">
              <div><Emblema className="mb-4 size-14 lg:hidden" /><h1 className="font-serif text-4xl font-medium text-ocean">Bienvenido</h1><p className="mt-1 text-muted">Ingresa con tu cuenta del hotel.</p></div>
              {alerta && <p role="alert" className="rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn">{alerta}</p>}
              <div><label htmlFor="email" className="mb-1 block text-xs font-medium text-muted">Correo</label>
                <input id="email" type="email" autoComplete="username" className={inputCls} {...fl.register('email')} aria-invalid={!!fl.formState.errors.email} />
                {fl.formState.errors.email && <p role="alert" className="mt-1 text-xs text-bad">{fl.formState.errors.email.message}</p>}</div>
              <div><label htmlFor="clave" className="mb-1 block text-xs font-medium text-muted">Contraseña</label>
                <div className="relative"><input id="clave" type={ver ? 'text' : 'password'} autoComplete="current-password" className={`${inputCls} pr-11`} {...fl.register('clave')} aria-invalid={!!fl.formState.errors.clave} />
                  <button type="button" onClick={() => setVer(x => !x)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center text-muted">{ver ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></div>
                {fl.formState.errors.clave && <p role="alert" className="mt-1 text-xs text-bad">{fl.formState.errors.clave.message}</p>}</div>
              <button disabled={fl.formState.isSubmitting} className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-ocean font-medium text-white hover:bg-ocean-2 disabled:opacity-60"><LogIn className="size-5" />{fl.formState.isSubmitting ? 'Ingresando…' : 'Ingresar'}</button>
              {local && <div className="rounded-lg bg-gold-soft p-3 text-sm"><strong className="font-medium">Usuarios de prueba</strong> (solo en tu PC):<br />
                {[['Administrador', 'admin@mareaalta.pe', 'Admin2026!'], ['Recepcionista', 'recepcion@mareaalta.pe', 'Recepcion2026!']].map(([r, e, c]) =>
                  <button key={r} type="button" className="mr-3 text-ocean underline decoration-gold" onClick={() => { fl.setValue('email', e); fl.setValue('clave', c); }}>{r}</button>)}</div>}
              <Link href="/" className="mt-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ocean"><ArrowLeft className="size-4" />Volver a la web del hotel</Link>
            </form>
          ) : (
            <form onSubmit={cambiar} noValidate className="grid gap-4">
              <div><h1 className="font-serif text-4xl font-medium text-ocean">Crea tu contraseña</h1><p className="mt-1 text-muted">Por seguridad, cambia la contraseña temporal antes de continuar.</p></div>
              <input type="hidden" value={claveActual} {...fc.register('claveActual')} />
              <div><label htmlFor="nueva" className="mb-1 block text-xs font-medium text-muted">Nueva contraseña</label>
                <input id="nueva" type="password" autoComplete="new-password" className={inputCls} {...fc.register('claveNueva')} aria-invalid={!!fc.formState.errors.claveNueva} aria-describedby="nueva-a" />
                <p id="nueva-a" className="mt-1 text-xs text-muted">Mínimo 8 caracteres, con letras y números.</p>
                {fc.formState.errors.claveNueva && <p role="alert" className="mt-1 text-xs text-bad">{fc.formState.errors.claveNueva.message}</p>}</div>
              <div><label htmlFor="repite" className="mb-1 block text-xs font-medium text-muted">Repite la contraseña</label>
                <input id="repite" type="password" autoComplete="new-password" className={inputCls} {...fc.register('repetir')} aria-invalid={!!fc.formState.errors.repetir} />
                {fc.formState.errors.repetir && <p role="alert" className="mt-1 text-xs text-bad">{fc.formState.errors.repetir.message}</p>}</div>
              <button disabled={fc.formState.isSubmitting} className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-ocean font-medium text-white hover:bg-ocean-2"><ShieldCheck className="size-5" />Guardar y continuar</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
