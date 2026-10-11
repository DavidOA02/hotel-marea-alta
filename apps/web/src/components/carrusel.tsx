'use client';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { Children, useCallback, useEffect, useState } from 'react';

/**
 * Carrusel accesible con Embla:
 * · flechas, puntos y teclado (← →),
 * · autoplay opcional que se pausa con el mouse, el foco o el botón de pausa,
 * · respeta «reducir movimiento» y anuncia «diapositiva X de Y».
 */
export function Carrusel({ children, etiqueta, autoplay = 0, claro = false, className = '', slideClass = 'basis-full' }:
  { children: React.ReactNode; etiqueta: string; autoplay?: number; claro?: boolean; className?: string; slideClass?: string }) {
  const [ref, api] = useEmblaCarousel({ loop: true, align: 'start' });
  const [actual, setActual] = useState(0);
  const [total, setTotal] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [usuarioPauso, setUsuarioPauso] = useState(false);
  const slides = Children.toArray(children);

  useEffect(() => {
    if (!api) return;
    const sel = () => { setActual(api.selectedScrollSnap()); setTotal(api.scrollSnapList().length); };
    sel(); api.on('select', sel); api.on('reInit', sel);
    return () => { api.off('select', sel); api.off('reInit', sel); };
  }, [api]);

  useEffect(() => {
    if (!api || !autoplay || pausado || usuarioPauso) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => api.scrollNext(), autoplay);
    return () => clearInterval(t);
  }, [api, autoplay, pausado, usuarioPauso]);

  const tecla = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); api?.scrollPrev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); api?.scrollNext(); }
  }, [api]);

  const btn = claro ? 'bg-white/15 text-white hover:bg-white/30 border-white/40' : 'bg-white text-ocean hover:bg-sand border-line';
  return (
    <section aria-roledescription="carrusel" aria-label={etiqueta} className={`relative ${className}`}
      onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)}
      onFocusCapture={() => setPausado(true)} onBlurCapture={() => setPausado(false)} onKeyDown={tecla}>
      <div className="overflow-hidden" ref={ref}>
        <div className="flex">
          {slides.map((s, i) => (
            <div key={i} className={`min-w-0 shrink-0 grow-0 ${slideClass}`} role="group" aria-roledescription="diapositiva" aria-label={`${i + 1} de ${slides.length}`}>{s}</div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex items-center justify-center gap-3">
        <button type="button" onClick={() => api?.scrollPrev()} className={`grid size-10 place-items-center rounded-full border ${btn}`} aria-label="Anterior"><ChevronLeft className="size-5" /></button>
        <div className="flex gap-2">
          {Array.from({ length: total }).map((_, i) => (
            <button key={i} type="button" onClick={() => api?.scrollTo(i)} aria-label={`Ir a la diapositiva ${i + 1}`} aria-current={i === actual}
              className={`h-1.5 rounded-full transition-all ${i === actual ? 'w-7 ' + (claro ? 'bg-white' : 'bg-ocean') : 'w-3 ' + (claro ? 'bg-white/40' : 'bg-line')}`} />
          ))}
        </div>
        <button type="button" onClick={() => api?.scrollNext()} className={`grid size-10 place-items-center rounded-full border ${btn}`} aria-label="Siguiente"><ChevronRight className="size-5" /></button>
        {autoplay > 0 && (
          <button type="button" onClick={() => setUsuarioPauso(p => !p)} className={`grid size-10 place-items-center rounded-full border ${btn}`}
            aria-label={usuarioPauso ? 'Reanudar el pase automático' : 'Pausar el pase automático'}>
            {usuarioPauso ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
        )}
      </div>
      <p className="sr-only" aria-live="polite">Diapositiva {actual + 1} de {total}</p>
    </section>
  );
}
