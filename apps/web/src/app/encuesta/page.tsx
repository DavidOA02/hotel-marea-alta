import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PaginaInterior } from '@/components/sitio/pagina-interior';
import { Encuesta } from './encuesta';

export const metadata: Metadata = { title: 'Encuesta de satisfacción', robots: { index: false } };

export default function Pagina() {
  return (
    <PaginaInterior eyebrow="Huéspedes" titulo="¿Cómo fue tu estadía?" intro="Son dos preguntas y te toma menos de un minuto.">
      <Suspense><Encuesta /></Suspense>
    </PaginaInterior>
  );
}
