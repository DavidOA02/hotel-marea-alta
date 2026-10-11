import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PaginaInterior } from '@/components/sitio/pagina-interior';
import { MiReserva } from './mi-reserva';

export const metadata: Metadata = { title: 'Mi reserva', robots: { index: false } };

export default function Pagina() {
  return (
    <PaginaInterior eyebrow="Huéspedes" titulo="Mi reserva" intro="Consulta el detalle de tu reserva, descarga la confirmación en PDF o cancélala sin costo hasta 72 horas antes de tu llegada.">
      <Suspense><MiReserva /></Suspense>
    </PaginaInterior>
  );
}
