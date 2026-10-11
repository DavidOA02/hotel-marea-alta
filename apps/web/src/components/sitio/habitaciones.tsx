'use client';
import { BedDouble, Droplets, Flower2, Maximize2, Users, Waves } from 'lucide-react';
import { Foto } from '../ui';
import { useReserva } from '@/stores/reserva';
import { useTipos } from '@/lib/usar-tipos';

const DETALLE: Record<string, { foto: string; texto: string; extras: [typeof BedDouble, string][]; etiqueta?: string }> = {
  duna: { foto: '1611892440504-42a792e24d32', texto: 'En la planta baja, con terraza privada hacia el jardín de buganvillas. Ideal para una escapada en pareja desde Lima.', extras: [[BedDouble, 'Cama queen'], [Flower2, 'Vista al jardín']] },
  horizonte: { foto: '1590490360182-c33d57733427', texto: 'Segundo piso, con balcón frente a la bahía y ventanal de piso a techo. Desde aquí se ven salir las lanchas hacia las Islas Ballestas.', extras: [[BedDouble, 'Cama king'], [Waves, 'Vista al mar']] },
  pleamar: { foto: '1582719478250-c89cae4dc85b', texto: 'Nuestra suite principal: terraza con tina al aire libre, sala independiente y vista abierta a toda la bahía.', extras: [[BedDouble, 'King + sofá cama'], [Droplets, 'Tina exterior']], etiqueta: 'Más solicitada' }
};

export function Habitaciones() {
  const { tipos, precio } = useTipos();
  const setBorrador = useReserva(s => s.setBorrador);
  return (
    <section id="habitaciones" className="seccion bg-stone">
      <div className="contenedor">
        <header className="mx-auto mb-8 max-w-2xl text-center md:mb-10">
          <p className="eyebrow">Alojamiento</p>
          <h2 className="display mt-3">Habitaciones y suites</h2>
          <p className="mt-4 text-muted">Tarifas por noche para la habitación completa, con IGV incluido. Todas incluyen desayuno buffet, Wi-Fi, estacionamiento y amenidades.</p>
        </header>
        <div className="space-y-10 md:space-y-14">
          {tipos.map((t, i) => {
            const d = DETALLE[t.codigo] ?? { foto: '1578683010236-d716f9a3f461', texto: t.descripcion ?? '', extras: [] };
            return (
              <article key={t.codigo} className={`grid items-center lg:grid-cols-12 ${i % 2 ? 'lg:[&>*:first-child]:order-2' : ''}`}>
                <Foto id={d.foto} alt={t.nombre} sizes="(min-width:1024px) 58vw, 100vw" className="aspect-[4/3] lg:col-span-7" fondo="linear-gradient(150deg,#d8cdbb,#a99a83)" />
                <div className={`relative z-10 mx-4 -mt-16 grid gap-4 bg-white p-6 shadow-[0_30px_60px_-40px_rgba(18,48,58,.35)] md:p-10 lg:col-span-5 lg:mx-0 lg:mt-0 ${i % 2 ? 'lg:-mr-20' : 'lg:-ml-20'}`}>
                  <p className="font-serif text-lg italic text-gold-dark">0{i + 1} {d.etiqueta && <span className="ml-2 bg-gold-dark px-2.5 py-1 align-middle font-sans text-[0.62rem] not-italic uppercase tracking-[0.18em] text-white">{d.etiqueta}</span>}</p>
                  <h3 className="font-serif text-4xl text-ocean">{t.nombre}</h3>
                  <p className="text-muted">{d.texto}</p>
                  <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[0.72rem] uppercase tracking-[0.14em] text-ocean">
                    <li className="flex items-center gap-2"><Maximize2 className="size-4 text-gold-dark" aria-hidden />{t.metrosCuadrados} m²</li>
                    <li className="flex items-center gap-2"><Users className="size-4 text-gold-dark" aria-hidden />Hasta {t.capacidad} huéspedes</li>
                    {d.extras.map(([I, txt]) => <li key={txt} className="flex items-center gap-2"><I className="size-4 text-gold-dark" aria-hidden />{txt}</li>)}
                  </ul>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
                    <p className="text-sm text-muted">Desde <strong className="mx-1 font-serif text-3xl font-normal text-ocean">{precio(t.precioNoche)}</strong> por noche</p>
                    <a href="#reservar" onClick={() => setBorrador({ tipoHabitacion: t.codigo })} className="btn-borde min-h-11">Reservar</a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
