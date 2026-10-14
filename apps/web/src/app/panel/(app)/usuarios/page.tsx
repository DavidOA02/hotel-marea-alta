'use client';
import { useState } from 'react';
import { Pencil, ShieldCheck, UserPlus } from 'lucide-react';
import { fechaHora, iniciales } from '@/lib/formato';
import { useSesion } from '@/stores/sesion';
import { BotonP, Cabecera, Cargando, ErrorCarga, Estado, useDatos } from '@/components/panel/base';
import { Tabla, columnas } from '@/components/panel/tabla';
import { FormUsuario } from '@/components/panel/formularios';

export default function Usuarios() {
  const { datos, error, cargando, recargar } = useDatos<any[]>('/gestion/usuarios');
  const yo = useSesion(s => s.usuario?.id);
  const [form, setForm] = useState<{ u: any | null } | null>(null);
  const c = columnas<any>();
  const cols = [
    c.accessor('nombre', { header: 'Usuario', cell: i => <span className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-ocean text-xs text-white">{iniciales(i.getValue())}</span>
      <span>{i.getValue()}{i.row.original.id === yo && <span className="ml-2 rounded-full bg-[#EEEDE8] px-2 text-xs">Tú</span>}<span className="block text-xs text-muted">{i.row.original.email}</span></span></span> }),
    c.accessor('rol', { header: 'Rol', cell: i => <Estado valor={i.getValue()} /> }),
    c.accessor('activo', { header: 'Estado', cell: i => <>{i.getValue() ? <span className="text-ok">Activo</span> : <span className="text-muted">Desactivado</span>}{i.row.original.debeCambiarClave && <span className="block text-xs text-muted">Debe cambiar su contraseña</span>}</> }),
    c.accessor('ultimoAcceso', { header: 'Último acceso', cell: i => i.getValue() ? fechaHora(i.getValue()) : <span className="text-muted">Nunca</span> }),
    c.display({ id: 'acciones', header: () => <span className="sr-only">Acciones</span>, cell: i => <BotonP variante="claro" className="!min-h-8" onClick={() => setForm({ u: i.row.original })}><Pencil className="size-4" />Editar</BotonP> })
  ];
  return (
    <>
      <Cabecera titulo="Usuarios del panel" sub="Administradores y recepcionistas con acceso al sistema."><BotonP onClick={() => setForm({ u: null })}><UserPlus className="size-4" />Nuevo usuario</BotonP></Cabecera>
      <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Usuarios">{error ? <ErrorCarga mensaje={error} recargar={recargar} cargando={cargando} /> : !datos ? <Cargando /> : <Tabla etiqueta="usuarios" datos={datos} columnas={cols} buscador={false} />}</section>
      <p className="mt-3 flex items-start gap-2 text-sm text-muted"><ShieldCheck className="size-4 shrink-0" aria-hidden />Al desactivar un usuario o cambiar su contraseña o rol, sus sesiones se cierran al instante. Tras 5 intentos fallidos, la cuenta se bloquea 15 minutos.</p>
      <FormUsuario u={form?.u ?? null} abierto={!!form} alCerrar={() => setForm(null)} />
    </>
  );
}
