import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PaginaInterior } from '@/components/sitio/pagina-interior';
import { Pago } from './pago';

export const metadata: Metadata = { title: 'Pago en línea', robots: { index: false } };

export default function Pagina() {
  return (
    <PaginaInterior eyebrow="Huéspedes" titulo="Pago en línea" intro="Paga el saldo de tu reserva con tarjeta o billetera digital. Recibirás la confirmación en tu correo.">
      <Suspense><Pago /></Suspense>
    </PaginaInterior>
  );
}
