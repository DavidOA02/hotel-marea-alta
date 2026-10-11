'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { ETIQUETAS } from '@marea/shared';
import { fechaMedia, iniciales, soles } from '@/lib/formato';
import { BotonP, Cabecera, Cargando, useDatos } from '@/components/panel/base';
import { Tabla, columnas } from '@/components/panel/tabla';
import { FormCliente } from '@/components/panel/formularios';

const c = columnas<any>();
const cols = [
  c.accessor(r => `${r.nombres} ${r.apellidos}`, { id: 'cliente', header: 'Cliente', cell: i => <span className="flex items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-ocean text-xs text-white">{iniciales(i.getValue())}</span>
    <span>{i.getValue()}{i.row.original.estadias >= 3 && <span className="ml-2 rounded-full bg-gold-soft px-2 text-xs text-gold-dark">Frecuente</span>}</span></span> }),
  c.accessor(r => `${r.tipoDocumento} ${r.numeroDocumento}`, { id: 'documento', header: 'Documento' }),
  c.accessor('email', { header: 'Contacto', cell: i => <>{i.getValue()}<span className="block text-xs text-muted">+{i.row.original.codigoPais} {i.row.original.telefono}</span></> }),
  c.accessor('residencia', { header: 'Residencia', cell: i => ETIQUETAS[i.getValue()] }),
  c.accessor('reservas', { header: 'Reservas', meta: { derecha: true } }),
  c.accessor('totalGastado', { header: 'Total consumido', meta: { derecha: true }, cell: i => soles(i.getValue()) }),
  c.accessor('ultimaLlegada', { header: 'Última llegada', cell: i => i.getValue() ? fechaMedia(i.getValue()) : '—' })
];

export default function Clientes() {
  const router = useRouter();
  const { datos } = useDatos<any[]>('/gestion/clientes?limite=500');
  const [nuevo, setNuevo] = useState(false);
  return (
    <>
      <Cabecera titulo="Clientes" sub="Huéspedes registrados, historial y datos de contacto."><BotonP onClick={() => setNuevo(true)}><UserPlus className="size-4" />Nuevo cliente</BotonP></Cabecera>
      <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Lista de clientes">
        {!datos ? <Cargando /> : <Tabla etiqueta="clientes" datos={datos} columnas={cols} alFila={x => router.push(`/panel/clientes/${x.id}`)} placeholder="Nombre, documento, correo o teléfono"
          csv={{ nombre: 'clientes.csv', encabezados: ['Nombres', 'Apellidos', 'Tipo doc.', 'Documento', 'Correo', 'País', 'Teléfono', 'Residencia', 'Acepta publicidad', 'Reservas', 'Estadías', 'Total', 'Última llegada'],
            filas: x => [x.nombres, x.apellidos, x.tipoDocumento, x.numeroDocumento, x.email, x.codigoPais, x.telefono, x.residencia, x.aceptaPublicidad ? 'Sí' : 'No', x.reservas, x.estadias, x.totalGastado, x.ultimaLlegada] }} />}
      </section>
      <FormCliente c={null} abierto={nuevo} alCerrar={() => setNuevo(false)} alCrear={id => router.push(`/panel/clientes/${id}`)} />
    </>
  );
}
