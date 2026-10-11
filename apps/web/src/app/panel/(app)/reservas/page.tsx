'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { hoyLima, sumarDias } from '@marea/shared';
import { BotonP, Cabecera, Cargando, useDatos } from '@/components/panel/base';
import { Tabla } from '@/components/panel/tabla';
import { columnasReservas, csvReservas, type FilaReserva } from '@/components/panel/columnas';
import { useFicha, useNuevaReserva } from '@/components/panel/reservas';

export default function Reservas() {
  const hoy = hoyLima();
  const VISTAS = { proximas: ['Próximas llegadas', `estado=Confirmada&desde=${hoy}&hasta=${sumarDias(hoy, 30)}`], hoy: ['Llegan hoy', `estado=Confirmada&hasta=${hoy}`],
    casa: ['En el hotel', 'estado=CheckIn'], todas: ['Todas (recientes)', 'limite=500'] } as const;
  const [vista, setVista] = useState<keyof typeof VISTAS>('proximas');
  const [estado, setEstado] = useState(''); const [desde, setDesde] = useState(''); const [hasta, setHasta] = useState('');
  const personal = estado || desde || hasta;
  const qs = personal ? new URLSearchParams(Object.entries({ estado, desde, hasta, limite: '1000' }).filter(([, v]) => v)).toString() : VISTAS[vista][1];
  const { datos } = useDatos<FilaReserva[]>(`/gestion/reservas?${qs}`);
  const abrir = useFicha(s => s.abrir);
  const nueva = useNuevaReserva(s => s.abrir);
  const sel = 'h-10 rounded-lg border border-[#D9D6CE] bg-white px-2 text-sm';
  return (
    <>
      <Cabecera titulo="Reservas" sub="Ordena por cualquier columna, filtra y exporta."><BotonP onClick={() => nueva()}><Plus className="size-4" />Nueva reserva</BotonP></Cabecera>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Vistas rápidas">
        {Object.entries(VISTAS).map(([k, [t]]) => <button key={k} aria-pressed={!personal && vista === k} onClick={() => { setVista(k as any); setEstado(''); setDesde(''); setHasta(''); }}
          className={`rounded-full border px-3 py-1.5 text-sm ${!personal && vista === k ? 'border-ocean bg-ocean text-white' : 'border-line bg-white'}`}>{t}</button>)}
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Lista de reservas">
        {!datos ? <Cargando /> : <Tabla etiqueta="reservas" datos={datos} columnas={columnasReservas} alFila={r => abrir(r.codigo)} placeholder="Código, huésped, documento, habitación…"
          csv={{ nombre: `reservas-${hoy}.csv`, ...csvReservas }}
          barra={<>
            <label className="sr-only" htmlFor="fe">Estado</label>
            <select id="fe" className={sel} value={estado} onChange={e => setEstado(e.target.value)}><option value="">Estado: todos</option>{['Confirmada', 'CheckIn', 'CheckOut', 'Cancelada', 'NoShow'].map(x => <option key={x} value={x}>{x === 'CheckIn' ? 'En el hotel' : x === 'CheckOut' ? 'Finalizada' : x === 'NoShow' ? 'No show' : x}</option>)}</select>
            <label className="flex items-center gap-1 text-sm text-muted">Desde<input type="date" className={sel} value={desde} onChange={e => setDesde(e.target.value)} /></label>
            <label className="flex items-center gap-1 text-sm text-muted">hasta<input type="date" className={sel} value={hasta} onChange={e => setHasta(e.target.value)} /></label>
          </>} />}
      </section>
    </>
  );
}
