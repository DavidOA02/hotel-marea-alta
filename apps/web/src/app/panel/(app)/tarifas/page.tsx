'use client';
import { useState } from 'react';
import { DoorOpen, Maximize2, Pencil, Plus, Users } from 'lucide-react';
import { soles } from '@/lib/formato';
import { BotonP, Cabecera, Cargando, ErrorCarga, Estado, useDatos } from '@/components/panel/base';
import { FormTipo } from '@/components/panel/formularios';

export default function Tarifas() {
  const { datos, error, cargando, recargar } = useDatos<any[]>('/gestion/tipos');
  const [form, setForm] = useState<{ t: any | null } | null>(null);
  return (
    <>
      <Cabecera titulo="Tipos y tarifas" sub="Las tarifas incluyen IGV. Un cambio solo afecta a las reservas nuevas."><BotonP onClick={() => setForm({ t: null })}><Plus className="size-4" />Nuevo tipo</BotonP></Cabecera>
      {error ? <ErrorCarga mensaje={error} recargar={recargar} cargando={cargando} /> : !datos ? <Cargando /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{datos.map(t => (
        <article key={t.id} className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-2 flex items-start justify-between"><div><h2 className="text-lg font-medium">{t.nombre}</h2><span className="font-mono text-sm text-muted">{t.codigo}</span></div>{t.activo ? <Estado valor="Operativa" /> : <span className="rounded-full bg-[#EEEDE8] px-2.5 py-0.5 text-xs text-muted">Inactivo</span>}</div>
          <p className="text-2xl font-medium text-ocean">{soles(t.precioNoche)} <span className="text-sm font-normal text-muted">/ noche</span></p>
          <p className="my-2 text-sm text-muted">{t.descripcion}</p>
          <p className="mb-4 flex flex-wrap gap-4 text-sm"><span className="flex items-center gap-1"><Users className="size-4" aria-hidden />{t.capacidad} huésp.</span><span className="flex items-center gap-1"><Maximize2 className="size-4" aria-hidden />{t.metrosCuadrados} m²</span><span className="flex items-center gap-1"><DoorOpen className="size-4" aria-hidden />{t.operativas}/{t.habitaciones} operativas</span></p>
          <BotonP variante="claro" onClick={() => setForm({ t })}><Pencil className="size-4" />Editar</BotonP>
        </article>))}</div>}
      <FormTipo t={form?.t ?? null} abierto={!!form} alCerrar={() => setForm(null)} />
    </>
  );
}
