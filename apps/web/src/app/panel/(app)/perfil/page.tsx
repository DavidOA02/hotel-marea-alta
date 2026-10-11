'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { cambiarClaveSchema, type CambiarClaveInput } from '@marea/shared';
import { api, ApiError } from '@/lib/api';
import { fechaHora, iniciales } from '@/lib/formato';
import { useSesion } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { BotonP, Cabecera, Estado, Tarjeta } from '@/components/panel/base';
import { Campo } from '@/components/panel/campo';

export default function Perfil() {
  const { usuario, token, guardar } = useSesion();
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<CambiarClaveInput>({ resolver: zodResolver(cambiarClaveSchema) });
  const enviar = handleSubmit(async d => {
    try { guardar(await api('/auth/cambiar-clave', { method: 'POST', token, body: { claveActual: d.claveActual, claveNueva: d.claveNueva } })); reset(); avisar('Contraseña actualizada.'); }
    catch (e) { const x = e as ApiError; setError((x.campo ?? 'claveActual') as any, { message: x.message }); }
  });
  if (!usuario) return null;
  return (
    <>
      <Cabecera titulo="Mi cuenta" />
      <div className="grid gap-4 lg:grid-cols-5">
        <Tarjeta className="lg:col-span-2"><div className="flex items-center gap-4"><span className="grid size-14 place-items-center rounded-full bg-ocean text-lg text-white">{iniciales(usuario.nombre)}</span>
          <div><p className="text-lg font-medium">{usuario.nombre}</p><p className="text-muted">{usuario.email}</p><div className="mt-1"><Estado valor={usuario.rol} /></div></div></div>
          {usuario.ultimoAcceso && <p className="mt-4 text-sm text-muted">Último acceso: {fechaHora(usuario.ultimoAcceso)}</p>}</Tarjeta>
        <Tarjeta titulo="Cambiar contraseña" icono={KeyRound} className="lg:col-span-3">
          <form onSubmit={enviar} noValidate className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Contraseña actual" className="sm:col-span-2" error={errors.claveActual?.message}><input type="password" autoComplete="current-password" {...register('claveActual')} /></Campo>
            <Campo etiqueta="Nueva contraseña" error={errors.claveNueva?.message} ayuda="Mínimo 8 caracteres, con letras y números."><input type="password" autoComplete="new-password" {...register('claveNueva')} /></Campo>
            <Campo etiqueta="Repite la nueva" error={errors.repetir?.message}><input type="password" autoComplete="new-password" {...register('repetir')} /></Campo>
            <div className="sm:col-span-2"><BotonP type="submit" disabled={isSubmitting}>Actualizar contraseña</BotonP></div>
          </form>
        </Tarjeta>
      </div>
    </>
  );
}
