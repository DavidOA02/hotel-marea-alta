'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { CalendarCheck, CalendarPlus, Coins, Mail, MapPin, MessageCircle, Pencil } from 'lucide-react';
import { ETIQUETAS } from '@marea/shared';
import { fechaMedia, soles0 } from '@/lib/formato';
import { BotonP, Cabecera, Cargando, Kpi, Tarjeta, useDatos, Vacio } from '@/components/panel/base';
import { Tabla } from '@/components/panel/tabla';
import { columnasReservas } from '@/components/panel/columnas';
import { FormCliente } from '@/components/panel/formularios';
import { useFicha, useNuevaReserva } from '@/components/panel/reservas';

export default function FichaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos, error } = useDatos<any>(`/gestion/clientes/${id}`);
  const [editar, setEditar] = useState(false);
  const abrir = useFicha(s => s.abrir);
  const nueva = useNuevaReserva(s => s.abrir);
  if (error) return <Vacio texto={error} />;
  if (!datos) return <Cargando />;
  const c = datos.cliente;
  return (
    <>
      <Cabecera titulo={`${c.nombres} ${c.apellidos}`} sub={<><Link href="/panel/clientes" className="text-ocean underline decoration-gold">Clientes</Link> · Cliente desde {fechaMedia(c.fechaRegistro)}</>}>
        <BotonP variante="claro" onClick={() => setEditar(true)}><Pencil className="size-4" />Editar datos</BotonP>
        <BotonP onClick={() => nueva({ cliente: c })}><CalendarPlus className="size-4" />Nueva reserva</BotonP>
      </Cabecera>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icono={CalendarCheck} etiqueta="Reservas" valor={c.reservas} sub={`${c.estadias} estadía(s) realizadas`} />
        <Kpi icono={Coins} tono="ok" etiqueta="Total consumido" valor={soles0(c.totalGastado)} sub="Reservas no canceladas" />
        <Kpi icono={MapPin} tono="info" etiqueta="Residencia" valor={ETIQUETAS[c.residencia]} sub={c.residencia === 'EXT' ? 'Exonerado de IGV en hospedaje' : 'Tarifas con IGV'} />
        <Kpi icono={Mail} tono={c.aceptaPublicidad ? 'ok' : 'muted'} etiqueta="Ofertas por correo" valor={c.aceptaPublicidad ? 'Acepta' : 'No acepta'} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Tarjeta titulo="Datos">
          <dl className="grid gap-3 text-sm">
            <div><dt className="text-xs text-muted">Documento</dt><dd className="font-medium">{ETIQUETAS[c.tipoDocumento]} {c.numeroDocumento}</dd></div>
            <div><dt className="text-xs text-muted">Teléfono</dt><dd><a className="inline-flex items-center gap-1 text-ocean underline" href={`https://wa.me/${c.codigoPais}${c.telefono}`} target="_blank" rel="noopener"><MessageCircle className="size-4" />+{c.codigoPais} {c.telefono}</a></dd></div>
            <div><dt className="text-xs text-muted">Correo</dt><dd><a className="text-ocean underline" href={`mailto:${c.email}`}>{c.email}</a></dd></div>
            <div><dt className="text-xs text-muted">Notas internas</dt><dd>{c.notas || 'Sin notas.'}</dd></div>
          </dl>
        </Tarjeta>
        <Tarjeta titulo="Historial de reservas" sinPadding className="xl:col-span-2">
          <Tabla etiqueta="historial de reservas" datos={datos.reservas} columnas={columnasReservas} buscador={false} alFila={r => abrir(r.codigo)} vacio="Este cliente aún no tiene reservas." />
        </Tarjeta>
      </div>
      <FormCliente c={c} abierto={editar} alCerrar={() => setEditar(false)} />
    </>
  );
}
