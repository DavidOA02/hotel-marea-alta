import { Encabezado } from '@/components/sitio/encabezado';
import { Portada } from '@/components/sitio/portada';
import { Habitaciones } from '@/components/sitio/habitaciones';
import { Experiencias, Galeria, Intro, Mareas, Paracas, Pie, Preguntas, Testimonios, Ubicacion, WhatsappFlotante } from '@/components/sitio/secciones';
import { FormularioReserva } from '@/components/sitio/formulario-reserva';

const jsonLd = {
  '@context': 'https://schema.org', '@type': 'Hotel', name: 'Hotel Marea Alta Paracas', url: 'https://www.mareaalta.pe/',
  telephone: '+51 56 000 000', priceRange: 'S/ 450 – S/ 1,090', currenciesAccepted: 'PEN, USD', starRating: { '@type': 'Rating', ratingValue: '4' },
  checkinTime: '15:00', checkoutTime: '12:00', numberOfRooms: 24,
  address: { '@type': 'PostalAddress', streetAddress: 'Av. Paracas Mz. A Lt. 10', addressLocality: 'Paracas', addressRegion: 'Ica', addressCountry: 'PE' }
};

export default function Inicio() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Encabezado />
      <main id="contenido">
        <Portada />
        <Intro />
        <Habitaciones />
        <Experiencias />
        <Paracas />
        <Galeria />
        <Mareas />
        <Testimonios />
        <section id="reservar" className="seccion">
          <div className="contenedor">
            <header className="mx-auto mb-8 max-w-2xl text-center md:mb-10">
              <p className="eyebrow">Reserva directa</p><h2 className="display mt-3">Reserva tu estadía</h2>
              <p className="mt-4 text-muted">Mejor tarifa garantizada. Pagas al llegar.</p>
            </header>
            <FormularioReserva />
          </div>
        </section>
        <Preguntas />
        <Ubicacion />
      </main>
      <Pie />
      <WhatsappFlotante />
    </>
  );
}
