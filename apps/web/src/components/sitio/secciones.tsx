import Image from 'next/image';
import Link from 'next/link';
import { Binoculars, Clock, Compass, CupSoda, Egg, Flower, Mail, MapPin, MessageCircle, Phone, Quote, Sun, Waves } from 'lucide-react';
import { Carrusel } from '../carrusel';
import { Foto } from '../ui';
import { enlaceWhatsapp, HOTEL } from '@/lib/config';
import { Boletin } from './boletin';
import { Emblema } from '../logo';

export function Intro() {
  return (
    <section id="hotel" className="seccion pt-24 md:pt-28">
      <div className="contenedor grid items-center gap-10 lg:grid-cols-12">
        <div className="grid max-w-xl gap-5 lg:col-span-5">
          <p className="eyebrow">Bienvenidos</p>
          <h2 className="display">Una casa de playa con alma iqueña, frente al mar de Paracas</h2>
          <p className="text-muted">Desde 2011 recibimos a quienes buscan el ritmo lento de la costa sur. La casa conserva muros de adobe, techos de caña y un patio central con algarrobos; a su alrededor hay veinticuatro habitaciones, un restaurante de cocina marina peruana, un bar de pisco y un spa con vista a la bahía.</p>
          <p className="text-muted">Cada mañana servimos el desayuno en el patio: pan chuta horneado en casa, frutas de Ica, tamalitos y café de Chanchamayo.</p>
        </div>
        <div className="relative pb-20 lg:col-span-7">
          <Foto id="1564501049412-61c2a3083791" alt="Interior del hotel con luz natural" sizes="(min-width:1024px) 45vw, 80vw" className="ml-auto aspect-[4/5] w-[78%]" fondo="linear-gradient(160deg,#cdb99a,#8a7a63)" />
          <Foto id="1514933651103-005eec06c04b" alt="Barra del bar de pisco" sizes="(min-width:1024px) 25vw, 45vw" className="absolute bottom-0 left-0 aspect-square w-[46%] border-[10px] border-sand" />
        </div>
      </div>
      <dl className="contenedor mt-12 grid grid-cols-2 border-y border-line text-center md:grid-cols-4">
        {[['24', 'habitaciones y suites'], ['4 ★', 'categoría hotelera'], ['15:00', 'check-in'], ['12:00', 'check-out']].map(([v, t], i) => (
          <div key={t} className={`grid gap-1 px-4 py-8 ${i ? 'md:border-l' : ''} ${i === 1 || i === 3 ? 'border-l' : ''} ${i > 1 ? 'border-t md:border-t-0' : ''} border-line`}>
            <dt className="order-2 text-[0.72rem] uppercase tracking-[0.2em] text-muted">{t}</dt>
            <dd className="order-1 font-serif text-4xl text-ocean">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const EXPERIENCIAS = [
  { id: '1414235077428-338989a2e8c0', icono: Egg, tag: 'Restaurante', nombre: 'La Caleta', texto: 'Cocina marina peruana con la pesca del día: ceviche, tiradito, conchas a la parmesana y arroz con mariscos.' },
  { id: '1541971875076-8f970d573be6', icono: CupSoda, tag: 'Bar', nombre: 'El Chaco', texto: 'Barra de pisco con etiquetas de bodegas iqueñas, chilcanos de temporada y pisco sour al atardecer.' },
  { id: '1540555700478-4be289fbecef', icono: Flower, tag: 'Bienestar', nombre: 'Spa Bajamar', texto: 'Masajes con aceites de muña y palo santo, exfoliación con sal de Paracas y sauna.' },
  { id: '1571896349842-33c89424de2d', icono: Waves, tag: 'Piscina', nombre: 'Frente al mar', texto: 'Temperada todo el año, de 8:00 a 21:00, con servicio de bar: chicha morada, jugos y cócteles.' }
];
export function Experiencias() {
  return (
    <section id="experiencias" className="seccion bg-ocean text-white">
      <div className="contenedor">
        <header className="mx-auto mb-8 max-w-2xl text-center md:mb-10"><p className="eyebrow-claro">En el hotel</p><h2 className="display mt-3 text-white">Sabores y descanso</h2></header>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {EXPERIENCIAS.map(x => (
            <article key={x.nombre} className="group relative flex aspect-[3/4] items-end overflow-hidden">
              <Foto id={x.id} alt={x.nombre} sizes="(min-width:1280px) 25vw, (min-width:768px) 50vw, 100vw" className="absolute inset-0 transition-transform duration-1000 group-hover:scale-105" fondo="linear-gradient(170deg,#6b5a48,#2a211a)" />
              <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(12,34,42,.92),rgba(12,34,42,.2)_60%,transparent)]" />
              <div className="relative grid gap-2 p-6">
                <span className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.22em] text-gold-light"><x.icono className="size-4" aria-hidden />{x.tag}</span>
                <h3 className="font-serif text-3xl">{x.nombre}</h3>
                <p className="text-[0.96rem] text-[#D6E0E2]">{x.texto}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Paracas() {
  const tours = [
    { icono: Binoculars, meta: 'A 10 min · tour de 2 h', nombre: 'Islas Ballestas', texto: 'Paseo en lancha para ver lobos marinos, pingüinos de Humboldt y el geoglifo del Candelabro.',
      foto: '/img/tours/islas-ballestas.webp', alt: 'Arcos de roca de las Islas Ballestas sobre el mar', fondo: 'linear-gradient(160deg,#7d9aa1,#2b4f59)' },
    { icono: Sun, meta: 'A 15 min · medio día', nombre: 'Reserva Nacional de Paracas', texto: 'Desierto que llega al mar: Playa Roja, la Catedral y miradores con flamencos en temporada.',
      foto: '/img/tours/reserva-paracas.webp', alt: 'Lobos marinos nadando frente a los cerros del desierto de Paracas', fondo: 'linear-gradient(160deg,#d9b98a,#9a6d3c)' },
    { icono: Compass, meta: 'A 1 h 15 · día completo', nombre: 'Huacachina e Ica', texto: 'Tubulares y sandboard en las dunas del oasis, y visita a bodegas tradicionales de pisco y vino.',
      foto: '/img/tours/huacachina.webp', alt: 'Oasis de Huacachina iluminado al anochecer entre dunas', fondo: 'linear-gradient(160deg,#e3c89a,#b08655)' }
  ];
  return (
    <section id="paracas" className="seccion">
      <div className="contenedor">
        <header className="mx-auto mb-8 max-w-2xl text-center md:mb-10"><p className="eyebrow">Descubre Paracas</p><h2 className="display mt-3">Excursiones desde el hotel</h2>
          <p className="mt-4 text-muted">Coordinamos tours con operadores autorizados. Pídelos al reservar o en recepción.</p></header>
        <div className="grid gap-6 md:grid-cols-3">
          {tours.map(t => (
            <article key={t.nombre} className="grid gap-2">
              <div className="group relative mb-2 aspect-[4/3] overflow-hidden" style={{ background: t.fondo }}>
                <Image src={t.foto} alt={t.alt} fill sizes="(min-width:768px) 33vw, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(12,34,42,.55),transparent_45%)]" />
                <t.icono className="absolute bottom-4 right-4 size-8 text-white drop-shadow" aria-hidden />
              </div>
              <p className="flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.2em] text-gold-dark"><Clock className="size-3.5" aria-hidden />{t.meta}</p>
              <h3 className="font-serif text-3xl text-ocean">{t.nombre}</h3>
              <p className="text-muted">{t.texto}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const GALERIA = [
  ['1566073771259-6a8506099945', 'Vista del hotel y su piscina'], ['1578683010236-d716f9a3f461', 'Habitación con ropa de cama blanca'],
  ['1571896349842-33c89424de2d', 'Piscina rodeada de tumbonas'], ['1600607687939-ce8a6c25118c', 'Sala de estar de una suite'],
  ['1414235077428-338989a2e8c0', 'Comedor del restaurante'], ['1540555700478-4be289fbecef', 'Sala de tratamientos del spa']
];
export function Galeria() {
  return (
    <section id="galeria" className="seccion bg-stone">
      <div className="contenedor">
        <header className="mx-auto mb-8 max-w-2xl text-center md:mb-10"><p className="eyebrow">Galería</p><h2 className="display mt-3">Momentos Marea Alta</h2></header>
        <Carrusel etiqueta="Galería de fotos del hotel" slideClass="basis-full pr-4 sm:basis-1/2 lg:basis-1/3">
          {GALERIA.map(([id, alt]) => (
            <figure key={id}>
              <Foto id={id} alt={alt} sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" className="aspect-[4/3]" />
              <figcaption className="mt-2 text-sm text-muted">{alt}</figcaption>
            </figure>
          ))}
        </Carrusel>
      </div>
    </section>
  );
}

export function Mareas() {
  return (
    <section className="seccion">
      <div className="contenedor grid items-center gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5"><p className="eyebrow">La bahía hoy</p><h2 className="display mt-3">Planifica tu día según la marea</h2>
          <p className="mt-5 text-muted">Paracas tiene sol casi todo el año y vientos de tarde ideales para el kitesurf. Con la bajamar aparecen las pozas de roca; con la pleamar, el mejor momento para nadar.</p></div>
        <figure className="border-y border-line py-8 lg:col-span-7">
          <svg viewBox="0 0 520 200" role="img" aria-label="Curva de mareas: pleamar 6:42 y 19:05, bajamar 12:58" className="w-full">
            <line x1="0" y1="160" x2="520" y2="160" stroke="#C9BFAE" strokeDasharray="2 6" />
            <path d="M0 110 C 50 45, 90 35, 130 40 S 210 150, 260 160 S 360 55, 420 42 S 500 85, 520 100 L 520 200 L 0 200 Z" fill="#12303A" opacity=".08" />
            <path d="M0 110 C 50 45, 90 35, 130 40 S 210 150, 260 160 S 360 55, 420 42 S 500 85, 520 100" fill="none" stroke="#12303A" strokeWidth="1.5" />
            {[[130, 40, '#B08D57', 'Pleamar 6:42', 22], [260, 160, '#12303A', 'Bajamar 12:58', 188], [420, 42, '#B08D57', 'Pleamar 19:05', 24]].map(([x, y, c, t, ty]) => (
              <g key={t as string}><circle cx={x as number} cy={y as number} r="5" fill={c as string} /><text x={x as number} y={ty as number} textAnchor="middle" fill="#12303A" fontSize="14">{t}</text></g>
            ))}
          </svg>
          <figcaption className="mt-2 text-sm text-muted">Valores referenciales.</figcaption>
        </figure>
      </div>
    </section>
  );
}

const OPINIONES = [
  ['El ceviche de La Caleta, la salida temprano a las Ballestas y el atardecer desde la terraza de la suite. Volvemos cada feriado largo.', 'Familia Rojas, Lima · Suite Pleamar'],
  ['Servicio impecable, espacios hermosos y una tranquilidad difícil de encontrar. Todo se siente personalizado sin ser invasivo.', 'Mariana R., Cusco · Habitación Horizonte'],
  ['La cena, el spa y el pisco sour en la terraza estuvieron al nivel de los mejores hoteles en los que me he quedado.', 'Alejandro M., Madrid · Suite Pleamar']
];
export function Testimonios() {
  return (
    <section className="seccion bg-stone text-center" aria-label="Testimonios">
      <div className="contenedor max-w-3xl">
        <Quote className="mx-auto mb-4 size-12 text-gold" aria-hidden />
        <Carrusel etiqueta="Opiniones de huéspedes" autoplay={8000}>
          {OPINIONES.map(([t, a]) => (
            <blockquote key={a} className="px-2">
              <p className="font-serif text-3xl italic leading-snug text-ocean md:text-4xl">{t}</p>
              <footer className="mt-6 text-xs uppercase tracking-[0.24em] text-muted">— {a}</footer>
            </blockquote>
          ))}
        </Carrusel>
      </div>
    </section>
  );
}

const PREGUNTAS = [
  ['¿Cómo llego al hotel desde Lima?', 'Por la Panamericana Sur, unos 250 km (aprox. 3 h 30 en auto). También hay buses interprovinciales directos hasta Paracas. Ofrecemos traslado desde el terminal de Paracas, Pisco o el aeropuerto de Pisco con 24 horas de aviso.'],
  ['¿Los turistas extranjeros pagan IGV?', 'Los huéspedes extranjeros no domiciliados están exonerados del IGV (18 %) en el hospedaje, por estadías de hasta 60 días. Presenta tu pasaporte y la Tarjeta Andina de Migración al registrarte.'],
  ['¿Qué medios de pago aceptan?', 'Efectivo en soles o dólares, tarjetas Visa, Mastercard, American Express y Diners Club, Yape, Plin y transferencia bancaria. Emitimos boleta o factura electrónica.'],
  ['¿Puedo cancelar mi reserva?', 'Sí, sin costo hasta 72 horas antes de las 15:00 del día de llegada, desde «Mi reserva» con tu código y correo.'],
  ['¿Aceptan mascotas?', 'Por ahora no admitimos mascotas, salvo perros de asistencia.']
];
export function Preguntas() {
  return (
    <section id="preguntas" className="seccion">
      <div className="contenedor max-w-3xl">
        <header className="mb-8 text-center md:mb-10"><p className="eyebrow">Antes de viajar</p><h2 className="display mt-3">Preguntas frecuentes</h2></header>
        <div className="border-t border-line">
          {PREGUNTAS.map(([p, r]) => (
            <details key={p} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-6 font-serif text-2xl text-ocean [&::-webkit-details-marker]:hidden">
                {p}<span aria-hidden className="text-gold-dark transition-transform group-open:rotate-45">+</span></summary>
              <p className="pb-6 text-muted">{r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Ubicacion() {
  return (
    <section id="ubicacion" className="seccion bg-ocean-2 text-white">
      <div className="contenedor grid items-center gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="eyebrow-claro">Ubicación</p><h2 className="display mt-3 text-white">Cómo llegar</h2>
          <address className="mt-6 grid gap-3 not-italic">
            <p className="font-serif text-2xl">{HOTEL.direccion}</p>
            <p className="text-[#D6E0E2]">A 5 minutos del muelle El Chaco, punto de salida a las Islas Ballestas, y a 15 minutos de la Reserva Nacional de Paracas. Estacionamiento gratuito.</p>
            <p className="flex items-center gap-2"><Phone className="size-4 text-gold-light" aria-hidden /><a href="tel:+5156000000" className="underline decoration-gold underline-offset-4">{HOTEL.telefono}</a></p>
            <p className="flex items-center gap-2"><Mail className="size-4 text-gold-light" aria-hidden /><a href={`mailto:${HOTEL.email}`} className="underline decoration-gold underline-offset-4">{HOTEL.email}</a></p>
          </address>
          <a className="btn-oro mt-6" href="https://www.google.com/maps/dir/?api=1&destination=Paracas%2C%20Ica%2C%20Peru" target="_blank" rel="noopener"><MapPin className="size-4" aria-hidden />Cómo llegar en Google Maps</a>
        </div>
        <div className="relative aspect-[4/3] bg-ocean-3 lg:col-span-7">
          <iframe src="https://www.google.com/maps?q=Paracas%2C%20Ica%2C%20Peru&z=13&output=embed" title="Mapa de Paracas, Ica" loading="lazy" className="absolute inset-0 size-full border-0 grayscale-[.35]" />
        </div>
      </div>
    </section>
  );
}

export function Pie() {
  return (
    <footer className="bg-ocean-3 pt-12 text-[#D6E0E2] md:pt-14">
      <div className="contenedor grid gap-8 pb-10 md:grid-cols-2 lg:grid-cols-4">
        <div><p className="flex items-center gap-3 whitespace-nowrap font-serif text-2xl uppercase tracking-[0.12em] text-white"><Emblema className="size-12 shrink-0" />Marea Alta</p><p className="mt-2 text-[#A9BCC0]">Hotel boutique frente a la bahía de Paracas.</p>
          <p className="mt-4 text-sm text-[#A9BCC0]">{HOTEL.razon}<br />RUC {HOTEL.ruc}</p></div>
        <div><h2 className="mb-4 text-xs uppercase tracking-[0.26em] text-gold-light">Contacto</h2><p>{HOTEL.direccion}</p><p className="mt-2">{HOTEL.telefono}</p><p>{HOTEL.email}</p></div>
        <div><h2 className="mb-4 text-xs uppercase tracking-[0.26em] text-gold-light">Información</h2>
          <ul className="grid gap-2">
            <li><Link href="/mi-reserva" className="hover:text-gold-light">Consultar mi reserva</Link></li>
            <li><Link href="/privacidad" className="hover:text-gold-light">Política de privacidad</Link></li>
            <li><Link href="/libro-reclamaciones" className="inline-block border border-white/30 px-3 py-2 hover:text-gold-light">Libro de Reclamaciones</Link></li>
            <li><Link href="/panel" className="hover:text-gold-light">Acceso del personal</Link></li>
          </ul></div>
        <Boletin />
      </div>
      <div className="contenedor flex flex-wrap justify-between gap-3 border-t border-white/10 py-6 text-sm text-[#A9BCC0]">
        <span>© {new Date().getFullYear()} {HOTEL.razon.replace(/\.?$/, '.')} Proyecto de práctica con datos ficticios. Fotos referenciales.</span>
        <a href="#" className="hover:text-white">Volver arriba ↑</a>
      </div>
    </footer>
  );
}



export function WhatsappFlotante() {
  return (
    <aside aria-label="Contacto rápido">
      <a href={enlaceWhatsapp()} target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp"
        className="fixed bottom-5 right-5 z-40 grid size-14 place-items-center rounded-full bg-wa text-white shadow-xl transition-transform hover:scale-105">
        <MessageCircle className="size-7" aria-hidden />
      </a>
    </aside>
  );
}
