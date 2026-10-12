'use client';
import { useEffect, useState } from 'react';
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodType } from 'zod';
import { anularComprobanteSchema, anularPagoSchema, clienteSchema, ESTADOS_HABITACION, ETIQUETAS, habitacionSchema, respuestaReclamoSchema, TIPOS_COMPROBANTE, tipoSchema, usuarioSchema } from '@marea/shared';
import { ApiError } from '@/lib/api';
import { soles0 } from '@/lib/formato';
import { apiPanel, refrescar } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { BotonP, Modal } from './base';
import { AlertaForm, Campo } from './campo';

/**
 * Modal de formulario genérico: React Hook Form + esquema Zod compartido.
 * Los errores de la API ({ mensaje, campo }) se marcan en el campo correspondiente.
 */
function FormularioModal<T extends FieldValues>({ abierto, alCerrar, titulo, esquema, valores, enviar, boton = 'Guardar', peligro = false, ancho, children }: {
  abierto: boolean; alCerrar: () => void; titulo: string; esquema: ZodType; valores: Partial<T>; enviar: (d: any) => Promise<any>;
  boton?: string; peligro?: boolean; ancho?: string; children: (f: UseFormReturn<T>) => React.ReactNode;
}) {
  const [general, setGeneral] = useState<string | null>(null);
  const f = useForm<T>({ resolver: zodResolver(esquema as any) as any });
  useEffect(() => { if (abierto) { f.reset(valores as T); setGeneral(null); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);
  const guardar = f.handleSubmit(async d => {
    try {
      const r = await enviar(d);
      avisar(r?.mensaje ?? 'Guardado.'); if (r?.advertencia) avisar(r.advertencia, 'warn');
      alCerrar(); refrescar();
    } catch (e) { const er = e as ApiError; if (er.campo) f.setError(er.campo as any, { message: er.message }, { shouldFocus: true }); else setGeneral(er.message); }
  });
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo={titulo} ancho={ancho}
      pie={<><BotonP variante="claro" onClick={alCerrar}>Cancelar</BotonP><BotonP variante={peligro ? 'peligro' : 'primario'} disabled={f.formState.isSubmitting} onClick={guardar}>{f.formState.isSubmitting ? 'Guardando…' : boton}</BotonP></>}>
      <form onSubmit={guardar} noValidate><AlertaForm texto={general} />{children(f)}</form>
    </Modal>
  );
}
const err = (f: UseFormReturn<any>, k: string) => (f.formState.errors as any)[k]?.message as string | undefined;

export function FormHabitacion({ h, tipos, abierto, alCerrar }: { h: any | null; tipos: any[]; abierto: boolean; alCerrar: () => void }) {
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo={h ? `Editar habitación ${h.numero}` : 'Nueva habitación'} esquema={habitacionSchema}
      valores={{ numero: h?.numero ?? '', piso: h?.piso ?? 1, tipoHabitacion: h?.tipoCodigo ?? tipos[0]?.codigo, estado: h?.estado ?? 'Operativa', notas: h?.notas ?? '' }}
      enviar={d => apiPanel(h ? `/gestion/habitaciones/${h.id}` : '/gestion/habitaciones', { method: h ? 'PUT' : 'POST', body: d })}>
      {f => <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Número" error={err(f, 'numero')}><input maxLength={10} {...f.register('numero')} /></Campo>
        <Campo etiqueta="Piso" error={err(f, 'piso')}><input type="number" min={0} max={50} {...f.register('piso')} /></Campo>
        <Campo etiqueta="Tipo" className="sm:col-span-2" error={err(f, 'tipoHabitacion')}><select {...f.register('tipoHabitacion')}>{tipos.map(t => <option key={t.codigo} value={t.codigo}>{t.nombre} · {soles0(t.precioNoche)}</option>)}</select></Campo>
        <Campo etiqueta="Estado" className="sm:col-span-2" ayuda="Las habitaciones que no están operativas no se ofrecen en la web."><select {...f.register('estado')}>{ESTADOS_HABITACION.map(e => <option key={e} value={e}>{ETIQUETAS[e]}</option>)}</select></Campo>
        <Campo etiqueta="Notas internas" className="sm:col-span-2"><textarea rows={2} className="!h-auto py-2" maxLength={300} {...f.register('notas')} /></Campo>
      </div>}
    </FormularioModal>
  );
}

export function FormTipo({ t, abierto, alCerrar }: { t: any | null; abierto: boolean; alCerrar: () => void }) {
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo={t ? 'Editar tipo de habitación' : 'Nuevo tipo de habitación'} esquema={tipoSchema}
      valores={{ codigo: t?.codigo ?? '', nombre: t?.nombre ?? '', descripcion: t?.descripcion ?? '', capacidad: t?.capacidad ?? 2, metrosCuadrados: t?.metrosCuadrados ?? 25, precioNoche: t?.precioNoche ?? undefined, activo: t?.activo ?? true }}
      enviar={d => apiPanel(t ? `/gestion/tipos/${t.id}` : '/gestion/tipos', { method: t ? 'PUT' : 'POST', body: d })}>
      {f => <div className="grid gap-4 sm:grid-cols-3">
        <Campo etiqueta="Nombre" className="sm:col-span-2" error={err(f, 'nombre')}><input {...f.register('nombre')} /></Campo>
        <Campo etiqueta="Código (web)" error={err(f, 'codigo')}><input placeholder="bungalow" {...f.register('codigo')} /></Campo>
        <Campo etiqueta="Tarifa / noche (S/, con IGV)" error={err(f, 'precioNoche')}><input type="number" step="0.01" {...f.register('precioNoche')} /></Campo>
        <Campo etiqueta="Capacidad" error={err(f, 'capacidad')}><input type="number" min={1} max={8} {...f.register('capacidad')} /></Campo>
        <Campo etiqueta="m²" error={err(f, 'metrosCuadrados')}><input type="number" {...f.register('metrosCuadrados')} /></Campo>
        <Campo etiqueta="Descripción" className="sm:col-span-3"><textarea rows={2} className="!h-auto py-2" maxLength={300} {...f.register('descripcion')} /></Campo>
        <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" className="size-4 accent-ocean" {...f.register('activo')} />Activo (se ofrece en la web)</label>
      </div>}
    </FormularioModal>
  );
}

export function FormCliente({ c, abierto, alCerrar, alCrear }: { c: any | null; abierto: boolean; alCerrar: () => void; alCrear?: (id: number) => void }) {
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo={c ? 'Editar cliente' : 'Nuevo cliente'} esquema={clienteSchema} ancho="max-w-2xl"
      valores={{ nombres: c?.nombres ?? '', apellidos: c?.apellidos ?? '', tipoDocumento: c?.tipoDocumento ?? 'DNI', numeroDocumento: c?.numeroDocumento ?? '', email: c?.email ?? '',
        codigoPais: c?.codigoPais ?? '51', telefono: c?.telefono ?? '', residencia: c?.residencia ?? 'PE', idioma: c?.idioma ?? '', aceptaPublicidad: c?.aceptaPublicidad ?? false, notas: c?.notas ?? '' }}
      enviar={async d => { const r = await apiPanel(c ? `/gestion/clientes/${c.id}` : '/gestion/clientes', { method: c ? 'PUT' : 'POST', body: d }); if (!c) alCrear?.(r.id); return r; }}>
      {f => <div className="grid gap-4 sm:grid-cols-6">
        <Campo etiqueta="Nombres" className="sm:col-span-3" error={err(f, 'nombres')}><input {...f.register('nombres')} /></Campo>
        <Campo etiqueta="Apellidos" className="sm:col-span-3" error={err(f, 'apellidos')}><input {...f.register('apellidos')} /></Campo>
        <Campo etiqueta="Tipo de documento" className="sm:col-span-2" error={err(f, 'tipoDocumento')}><select {...f.register('tipoDocumento')}><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="PAS">Pasaporte</option></select></Campo>
        <Campo etiqueta="Número" className="sm:col-span-2" error={err(f, 'numeroDocumento')}><input {...f.register('numeroDocumento')} /></Campo>
        <Campo etiqueta="Residencia" className="sm:col-span-2" error={err(f, 'residencia')}><select {...f.register('residencia')}><option value="PE">Residente en Perú</option><option value="EXT">Extranjero no domiciliado</option></select></Campo>
        <Campo etiqueta="Correo" className="sm:col-span-3" error={err(f, 'email')}><input type="email" {...f.register('email')} /></Campo>
        <Campo etiqueta="Idioma de correos" className="sm:col-span-3" error={err(f, 'idioma')}><select {...f.register('idioma', {setValueAs:v=>v || null})}><option value="">Automático según residencia</option><option value="es">Español</option><option value="en">English</option></select></Campo>
        <Campo etiqueta="País" error={err(f, 'codigoPais')}><input inputMode="numeric" maxLength={3} {...f.register('codigoPais')} /></Campo>
        <Campo etiqueta="Teléfono" className="sm:col-span-2" error={err(f, 'telefono')}><input inputMode="tel" {...f.register('telefono')} /></Campo>
        <Campo etiqueta="Notas internas" className="sm:col-span-6" ayuda="Preferencias, alergias, ocasiones especiales…"><textarea rows={2} className="!h-auto py-2" maxLength={500} {...f.register('notas')} /></Campo>
        <label className="flex items-center gap-2 text-sm sm:col-span-6"><input type="checkbox" className="size-4 accent-ocean" {...f.register('aceptaPublicidad')} />Acepta recibir ofertas por correo</label>
      </div>}
    </FormularioModal>
  );
}

export function FormUsuario({ u, abierto, alCerrar }: { u: any | null; abierto: boolean; alCerrar: () => void }) {
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo={u ? 'Editar usuario' : 'Nuevo usuario'} esquema={usuarioSchema}
      valores={{ nombre: u?.nombre ?? '', email: u?.email ?? '', rol: u?.rol ?? 'Recepcionista', activo: u?.activo ?? true, clave: '' }}
      enviar={d => apiPanel(u ? `/gestion/usuarios/${u.id}` : '/gestion/usuarios', { method: u ? 'PUT' : 'POST', body: { ...d, clave: d.clave || null } })
        .then(() => ({ mensaje: u ? 'Usuario actualizado.' : 'Usuario creado. Comparte la contraseña temporal de forma segura.' }))}>
      {f => <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre completo" className="sm:col-span-2" error={err(f, 'nombre')}><input {...f.register('nombre')} /></Campo>
        <Campo etiqueta="Correo (usuario)" className="sm:col-span-2" error={err(f, 'email')}><input type="email" autoComplete="off" {...f.register('email')} /></Campo>
        <Campo etiqueta="Rol" error={err(f, 'rol')}><select {...f.register('rol')}><option value="Recepcionista">Recepcionista</option><option value="Administrador">Administrador</option></select></Campo>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" className="size-4 accent-ocean" {...f.register('activo')} />Usuario activo</label>
        <Campo etiqueta={u ? 'Nueva contraseña temporal (vacía = no cambiar)' : 'Contraseña temporal'} className="sm:col-span-2" error={err(f, 'clave')} ayuda="Mínimo 8 caracteres con letras y números. Se pedirá cambiarla al ingresar.">
          <input type="text" autoComplete="new-password" {...f.register('clave')} /></Campo>
        <p className="text-xs text-muted sm:col-span-2"><strong>Recepcionista:</strong> recepción, reservas, habitaciones (limpieza), clientes, caja y reclamaciones (lectura). <strong>Administrador:</strong> además reportes, tarifas, CRUD de habitaciones, anulación de pagos, respuesta a reclamos y usuarios.</p>
      </div>}
    </FormularioModal>
  );
}

export function FormRespuesta({ r, abierto, alCerrar }: { r: any | null; abierto: boolean; alCerrar: () => void }) {
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo={`Responder ${r?.tipo?.toLowerCase() ?? ''} N.° ${r?.numero ?? ''}`} esquema={respuestaReclamoSchema} boton="Registrar respuesta" ancho="max-w-2xl"
      valores={{ respuesta: '' }} enviar={d => apiPanel(`/gestion/reclamaciones/${r.numero}/respuesta`, { method: 'PATCH', body: d })}>
      {f => <Campo etiqueta="Respuesta del proveedor" error={err(f, 'respuesta')} ayuda="Se registra y se envía automáticamente al correo del consumidor."><textarea rows={6} className="!h-auto py-2" {...f.register('respuesta')} /></Campo>}
    </FormularioModal>
  );
}

export function FormAnularComprobante({ k, abierto, alCerrar }: { k: any | null; abierto: boolean; alCerrar: () => void }) {
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo={`Anular ${TIPOS_COMPROBANTE[k?.tipo] ?? ''} ${k?.serie ?? ''}-${k?.numero ?? ''}`} esquema={anularComprobanteSchema} boton="Comunicar baja" peligro
      valores={{ motivo: '' }} enviar={d => apiPanel(`/gestion/comprobantes/${k.id}/anular`, { method: 'POST', body: d })}>
      {f => <><p className="mb-4 text-sm text-muted">Se envía la comunicación de baja a SUNAT a través del OSE (hasta 7 días después de emitido). No devuelve dinero: si corresponde, registra la devolución aparte.</p>
        <Campo etiqueta="Motivo" error={err(f, 'motivo')}><input maxLength={200} placeholder="p. ej. error en el RUC del cliente" {...f.register('motivo')} /></Campo></>}
    </FormularioModal>
  );
}

export function FormAnular({ pago, abierto, alCerrar }: { pago: any | null; abierto: boolean; alCerrar: () => void }) {
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo="Anular pago" esquema={anularPagoSchema} boton="Anular pago" peligro
      valores={{ motivo: '' }} enviar={d => apiPanel(`/gestion/pagos/${pago.id}/anular`, { method: 'POST', body: d })}>
      {f => <><p className="mb-4 text-sm text-muted">El pago dejará de contar para el saldo. Queda registrado quién lo anuló y por qué.</p>
        <Campo etiqueta="Motivo" error={err(f, 'motivo')}><input maxLength={200} placeholder="p. ej. monto digitado por error" {...f.register('motivo')} /></Campo></>}
    </FormularioModal>
  );
}
