'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Printer } from 'lucide-react';
import { reclamacionSchema, type ReclamacionInput } from '@marea/shared';
import { api, ApiError } from '@/lib/api';
import { HOTEL } from '@/lib/config';
import { fechaLarga } from '@/lib/formato';

type Salida = import('zod').output<typeof reclamacionSchema>;

export function FormularioReclamo() {
  const [constancia, setConstancia] = useState<any>(null);
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<ReclamacionInput, unknown, Salida>({
    resolver: zodResolver(reclamacionSchema),
    defaultValues: { tipo: 'Reclamo', tipoDocumento: 'DNI', bienTipo: 'Servicio', esMenor: false, declaraVeracidad: false, aceptaPrivacidad: false, montoReclamado: '' as unknown as null }
  });
  const esMenor = watch('esMenor');
  const enviar = handleSubmit(async d => {
    try { setConstancia({ ...(await api('/reclamaciones', { method: 'POST', body: d })), email: d.email }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (e) { const x = e as ApiError; setError((x.campo ?? 'root') as any, { message: x.message }); }
  });
  const E = ({ k }: { k: keyof ReclamacionInput }) => errors[k] ? <p id={`e-${k}`} role="alert" className="campo-error">{errors[k]?.message as string}</p> : null;
  const a = (k: keyof ReclamacionInput) => ({ 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `e-${k}` : undefined });
  const Campo = ({ k, t, tipo = 'text', full = false, ...p }: { k: keyof ReclamacionInput; t: string; tipo?: string; full?: boolean; [x: string]: unknown }) => (
    <div className={full ? 'sm:col-span-2' : ''}><label className="campo-label" htmlFor={`r-${k}`}>{t}</label>
      <input id={`r-${k}`} type={tipo} className="campo" {...register(k)} {...a(k)} {...p} /><E k={k} /></div>);

  if (constancia) return (
    <div className="grid gap-4 bg-white p-8 text-center md:p-14">
      <p className="eyebrow">Constancia</p>
      <h2 className="display text-4xl">Registramos tu {constancia.tipo.toLowerCase()}</h2>
      <p>Hoja N.° <strong className="font-mono">{constancia.numero}</strong> del {new Date(constancia.fecha).toLocaleDateString('es-PE')}.</p>
      <p className="text-muted">Te responderemos a {constancia.email} a más tardar el {fechaLarga(constancia.fechaLimiteRespuesta)}. Guarda esta constancia.</p>
      <div className="flex justify-center gap-3 print:hidden"><button className="btn-borde" onClick={() => window.print()}><Printer className="size-4" aria-hidden />Imprimir o guardar en PDF</button><Link href="/" className="btn-oro">Volver al inicio</Link></div>
    </div>
  );

  return (
    <form onSubmit={enviar} noValidate className="grid gap-8 bg-white p-5 md:p-8">
      <fieldset><legend className="mb-3 font-serif text-2xl text-ocean">1. Identificación del proveedor</legend>
        <p className="text-muted">{HOTEL.razon} · RUC {HOTEL.ruc}<br />{HOTEL.direccion}</p></fieldset>
      <fieldset className="grid gap-6 sm:grid-cols-2"><legend className="mb-3 font-serif text-2xl text-ocean">2. Identificación del consumidor</legend>
        <Campo k="nombreCompleto" t="Nombres y apellidos" full autoComplete="name" />
        <div><label className="campo-label" htmlFor="r-td">Tipo de documento</label><select id="r-td" className="campo" {...register('tipoDocumento')}><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="PAS">Pasaporte</option><option value="RUC">RUC</option></select></div>
        <Campo k="numeroDocumento" t="Número de documento" />
        <Campo k="domicilio" t="Domicilio" full autoComplete="street-address" />
        <Campo k="telefono" t="Teléfono" tipo="tel" autoComplete="tel" />
        <Campo k="email" t="Correo electrónico" tipo="email" autoComplete="email" />
        <label className="flex items-center gap-3 sm:col-span-2"><input type="checkbox" className="size-5 accent-ocean" {...register('esMenor')} /> Soy menor de edad</label>
        {esMenor && <Campo k="apoderado" t="Nombre del padre, madre o apoderado" full />}
      </fieldset>
      <fieldset className="grid gap-6 sm:grid-cols-2"><legend className="mb-3 font-serif text-2xl text-ocean">3. Bien contratado</legend>
        <div className="flex gap-8 sm:col-span-2">{['Servicio', 'Producto'].map(x => <label key={x} className="flex items-center gap-2"><input type="radio" value={x} className="size-5 accent-ocean" {...register('bienTipo')} /> {x}</label>)}</div>
        <Campo k="montoReclamado" t="Monto reclamado (S/) — opcional" tipo="number" step="0.01" min="0" />
        <Campo k="codigoReserva" t="N.° de reserva — opcional" />
        <Campo k="descripcionBien" t="Descripción" full placeholder="Ej.: Hospedaje en Habitación Horizonte del 12 al 14 de octubre" />
      </fieldset>
      <fieldset className="grid gap-6"><legend className="mb-3 font-serif text-2xl text-ocean">4. Detalle</legend>
        <div className="grid gap-3">
          <label className="flex items-start gap-3"><input type="radio" value="Reclamo" className="mt-1 size-5 accent-ocean" {...register('tipo')} /><span><strong className="font-medium">Reclamo:</strong> disconformidad con el producto o servicio.</span></label>
          <label className="flex items-start gap-3"><input type="radio" value="Queja" className="mt-1 size-5 accent-ocean" {...register('tipo')} /><span><strong className="font-medium">Queja:</strong> malestar por la atención, no relacionado con el producto o servicio.</span></label>
        </div>
        <div><label className="campo-label" htmlFor="r-det">Detalle</label><textarea id="r-det" rows={5} className="campo font-sans text-base" {...register('detalle')} {...a('detalle')} /><E k="detalle" /></div>
        <div><label className="campo-label" htmlFor="r-ped">Pedido del consumidor</label><textarea id="r-ped" rows={3} className="campo font-sans text-base" {...register('pedido')} {...a('pedido')} /><E k="pedido" /></div>
      </fieldset>
      <div className="grid gap-3">
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5 accent-ocean" {...register('declaraVeracidad')} {...a('declaraVeracidad')} />Declaro que la información proporcionada es verdadera.</label><E k="declaraVeracidad" />
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5 accent-ocean" {...register('aceptaPrivacidad')} {...a('aceptaPrivacidad')} /><span>Acepto el tratamiento de mis datos según la <Link href="/privacidad" className="text-ocean underline">Política de privacidad</Link>.</span></label><E k="aceptaPrivacidad" />
      </div>
      <p className="bg-stone p-5 text-sm text-muted">La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.</p>
      {errors.root && <p role="alert" className="bg-bad-bg p-4 text-bad">{errors.root.message}</p>}
      <button disabled={isSubmitting} className="btn-oro justify-self-start">{isSubmitting ? 'Enviando…' : 'Enviar reclamación'}</button>
    </form>
  );
}
