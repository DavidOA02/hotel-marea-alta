'use client';
import { Star } from 'lucide-react';
import { hoyLima, sumarDias } from '@marea/shared';
import { Carrusel } from '../carrusel';
import { Foto } from '../ui';
import { useReserva } from '@/stores/reserva';
import { useTipos } from '@/lib/usar-tipos';

const DIAPOSITIVAS = [
  { id: '1566073771259-6a8506099945', titulo: 'Frente a la bahía de Paracas', texto: 'A 3 h 30 de Lima, entre el desierto y el Pacífico.' },
  { id: '1571896349842-33c89424de2d', titulo: 'Atardeceres desde la piscina', texto: 'Temperada todo el año, con bar de pisco junto al mar.' },
  { id: '1582719478250-c89cae4dc85b', titulo: 'Suites con terraza y tina exterior', texto: 'Despierta con el sonido de las olas.' }
];

export function Portada() {
  const { borrador, setBorrador } = useReserva();
  const { tipos } = useTipos();
  const hoy = hoyLima();
  return (
    <section className="relative bg-ocean-3 text-white" aria-label="Portada">
      <Carrusel etiqueta="Fotos del hotel" autoplay={6500} claro className="pb-6">
        {DIAPOSITIVAS.map((d, i) => (
          <div key={d.id} className="relative h-[78svh] min-h-[540px]">
            <Foto id={d.id} alt="" sizes="100vw" prioridad={i === 0} className="absolute inset-0" fondo="linear-gradient(180deg,#2c4a55,#6f8f94 45%,#c9a97c 70%,#1d3a44)" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,34,42,.6)_0%,rgba(12,34,42,0)_30%),linear-gradient(0deg,rgba(12,34,42,.85)_0%,rgba(12,34,42,.1)_60%)]" />
            <div className="relative flex h-full flex-col items-center justify-end px-6 pb-16 text-center">
              <p className="eyebrow-claro flex items-center gap-2">Hotel boutique <span className="inline-flex" role="img" aria-label="4 estrellas">{[1, 2, 3, 4].map(n => <Star key={n} className="size-2.5 fill-current" aria-hidden />)}</span> Paracas, Ica</p>
              {i === 0 ? <h1 className="mt-4 max-w-4xl font-serif text-5xl leading-none md:text-8xl">{d.titulo}</h1>
                       : <p className="mt-4 max-w-4xl font-serif text-5xl leading-none md:text-8xl">{d.titulo}</p>}
              <p className="mt-5 text-lg text-[#E6EEEF]">{d.texto}</p>
            </div>
          </div>
        ))}
      </Carrusel>

      <form className="relative z-10 mx-auto -mb-12 grid w-[min(1180px,calc(100%-2.5rem))] grid-cols-2 bg-white text-ink shadow-2xl lg:grid-cols-[repeat(4,1fr)_auto]"
        aria-label="Consultar disponibilidad" onSubmit={e => { e.preventDefault(); document.getElementById('reservar')?.scrollIntoView({ behavior: 'smooth' }); }}>
        {[
          ['Llegada', <input key="e" id="b-in" type="date" min={hoy} value={borrador.fechaEntrada} onChange={e => setBorrador({ fechaEntrada: e.target.value })} className="w-full bg-transparent font-serif text-lg text-ocean outline-none" />],
          ['Salida', <input key="s" id="b-out" type="date" min={sumarDias(borrador.fechaEntrada || hoy, 1)} value={borrador.fechaSalida} onChange={e => setBorrador({ fechaSalida: e.target.value })} className="w-full bg-transparent font-serif text-lg text-ocean outline-none" />],
          ['Huéspedes', <select key="h" id="b-g" value={borrador.huespedes} onChange={e => setBorrador({ huespedes: Number(e.target.value) })} className="w-full bg-transparent font-serif text-lg text-ocean outline-none">{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} {n === 1 ? 'adulto' : 'adultos'}</option>)}</select>],
          ['Habitación', <select key="t" id="b-t" value={borrador.tipoHabitacion} onChange={e => setBorrador({ tipoHabitacion: e.target.value })} className="w-full bg-transparent font-serif text-lg text-ocean outline-none">{tipos.map(t => <option key={t.codigo} value={t.codigo}>{t.nombre.replace('Habitación ', '')}</option>)}</select>]
        ].map(([t, campo], i) => (
          <label key={i} htmlFor={['b-in', 'b-out', 'b-g', 'b-t'][i]} className="flex flex-col border-b border-r border-line px-5 py-3 focus-within:bg-sand lg:border-b-0">
            <span className="campo-label">{t as string}</span>{campo}
          </label>
        ))}
        <button className="btn-oro col-span-2 min-h-14 lg:col-span-1 lg:min-h-full">Ver disponibilidad</button>
      </form>
    </section>
  );
}
