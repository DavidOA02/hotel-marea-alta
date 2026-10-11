import type { Metadata } from 'next';
import { PaginaInterior } from '@/components/sitio/pagina-interior';
import { FormularioReclamo } from './formulario';

export const metadata: Metadata = { title: 'Libro de Reclamaciones', description: 'Libro de Reclamaciones virtual de Marea Alta Hoteles S.A.C., conforme a la Ley N.° 29571.' };

export default function Pagina() {
  return (
    <PaginaInterior eyebrow="Atención al consumidor" titulo="Libro de Reclamaciones virtual"
      intro="Conforme al Código de Protección y Defensa del Consumidor (Ley N.° 29571). Responderemos en un plazo máximo de 15 días hábiles.">
      <FormularioReclamo />
    </PaginaInterior>
  );
}
