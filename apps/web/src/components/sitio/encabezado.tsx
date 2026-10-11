'use client';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useReserva } from '@/stores/reserva';
import { Emblema } from '../logo';

const ENLACES = [['#hotel', 'El hotel'], ['#habitaciones', 'Habitaciones'], ['#experiencias', 'Experiencias'], ['#paracas', 'Paracas'], ['#galeria', 'Galería']] as const;

export function Encabezado({ solido = false }: { solido?: boolean }) {
  const [scroll, setScroll] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const { moneda, setMoneda } = useReserva();
  useEffect(() => {
    const f = () => setScroll(window.scrollY > 60);
    f(); window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  useEffect(() => { document.body.style.overflow = abierto ? 'hidden' : ''; }, [abierto]);
  const claro = !solido && !scroll && !abierto;
  const inicio = solido ? '/' : '';

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${claro ? 'text-white' : 'bg-sand text-ocean shadow-[0_1px_0_var(--color-line)]'}`}>
      <div className="mx-auto grid max-w-[1440px] grid-cols-[44px_1fr_auto] items-center gap-3 px-5 py-4 md:px-12 lg:grid-cols-[1fr_auto_1fr]">
        <button className="grid size-11 place-items-center lg:hidden" onClick={() => setAbierto(a => !a)} aria-expanded={abierto} aria-controls="menu-movil" aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}>
          {abierto ? <X /> : <Menu />}
        </button>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Secciones">
          {ENLACES.slice(0, 4).map(([h, t]) => <a key={h} href={inicio + h} className="py-2 text-[0.78rem] uppercase tracking-[0.18em] hover:underline underline-offset-8">{t}</a>)}
        </nav>
        <Link href="/" className="flex items-center justify-center gap-2.5 leading-tight md:gap-3" aria-label="Hotel Marea Alta, inicio">
          <Emblema className="size-9 shrink-0 drop-shadow-sm md:size-12" mini />
          <span className="text-left">
            <span className="block whitespace-nowrap font-serif text-[1.05rem] font-medium uppercase tracking-[0.1em] min-[400px]:text-[1.2rem] md:text-[1.8rem] md:tracking-[0.14em]">Marea Alta</span>
            <span className="hidden text-[0.6rem] uppercase tracking-[0.38em] opacity-85 md:block">Paracas · Perú</span>
          </span>
        </Link>
        <div className="flex items-center justify-end gap-3">
          <div className="inline-flex border border-current" role="group" aria-label="Moneda">
            {(['PEN', 'USD'] as const).map(m => (
              <button key={m} onClick={() => setMoneda(m)} aria-pressed={moneda === m}
                className={`min-h-9 min-w-10 px-2 text-xs ${moneda === m ? (claro ? 'bg-white text-ocean' : 'bg-ocean text-white') : ''}`}>{m === 'PEN' ? 'S/' : 'US$'}</button>
            ))}
          </div>
          <a href={inicio + '#reservar'} className="btn-oro hidden min-h-10 px-5 sm:inline-flex">Reservar</a>
        </div>
      </div>
      {abierto && (
        <div id="menu-movil" className="fixed inset-0 top-[76px] z-40 flex flex-col items-center justify-center gap-5 bg-ocean text-white lg:hidden">
          {[...ENLACES, ['/mi-reserva', 'Mi reserva'] as const].map(([h, t]) => (
            <a key={h} href={h.startsWith('#') ? inicio + h : h} onClick={() => setAbierto(false)} className="font-serif text-3xl">{t}</a>
          ))}
          <a href={inicio + '#reservar'} onClick={() => setAbierto(false)} className="btn-oro mt-4">Reservar</a>
        </div>
      )}
    </header>
  );
}
