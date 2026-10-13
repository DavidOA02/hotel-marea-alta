'use client';
import { Check, CupSoda, Footprints, Home, LogIn, LogOut, Phone, Sparkles, Wallet } from 'lucide-react';
import { ETIQUETAS } from '@marea/shared';
import { fechaDia, soles, soles0 } from '@/lib/formato';
import { apiPanel, refrescar } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { BotonP, Cabecera, Cargando, useDatos, Vacio } from '@/components/panel/base';
import { accionReserva, useFicha, useNuevaReserva, usePago } from '@/components/panel/reservas';

function Item({ r, sub, children, oro, abrir }: { r: any; sub: React.ReactNode; children?: React.ReactNode; oro?: boolean; abrir: (codigo: string) => void }) {
  return (
    <li className="flex items-center gap-3 border-b border-[#EFEDE7] px-4 py-3 last:border-0">
      <span className={`grid h-11 min-w-13 place-items-center rounded-lg px-2 font-semibold text-white ${oro ? 'bg-gold-dark' : 'bg-ocean'}`}>{r.habitacion}</span>
      <div className="min-w-0 flex-1"><button onClick={() => abrir(r.codigo)} className="block max-w-full truncate text-left font-medium hover:underline">{r.cliente}</button><span className="text-sm text-muted">{sub}</span></div>
      <div className="flex gap-1">{children}</div>
    </li>
  );
}

function Columna({ t, icono: I, n, children }: { t: string; icono: React.ElementType; n: number; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label={t}>
      <h2 className="flex items-center justify-between border-b border-line px-4 py-3 font-medium"><span className="flex items-center gap-2"><I className="size-4 text-gold-dark" aria-hidden />{t}</span><span className="rounded-full bg-[#EEEDE8] px-2 text-xs text-muted">{n}</span></h2>
      {n ? <ul>{children}</ul> : null}
    </section>
  );
}

export default function Recepcion() {
  const { datos: d } = useDatos<any>('/gestion/recepcion');
  const abrir = useFicha(s => s.abrir);
  const pagar = usePago(s => s.abrir);
  const nueva = useNuevaReserva(s => s.abrir);
  if (!d) return <Cargando />;
  return (
    <>
      <Cabecera titulo="Recepción" sub={`Movimientos del ${fechaDia(d.hoy)}.`}>
        <BotonP variante="claro" onClick={() => nueva()}><Phone className="size-4" />Reserva telefónica</BotonP>
        <BotonP onClick={() => nueva({ walkin: true })}><Footprints className="size-4" />Walk-in</BotonP>
      </Cabecera>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <Columna t="Llegadas de hoy" icono={LogIn} n={d.llegadas.length}>{d.llegadas.length ? d.llegadas.map((r: any) => (
          <Item key={r.codigo} r={r} abrir={abrir} oro sub={<>{r.tipoHabitacion} · {r.noches} noche(s){r.horaLlegada ? ` · ${r.horaLlegada}` : ''}{r.saldo > 0.009 ? <> · <span className="text-bad">{soles0(r.saldo)}</span></> : null}</>}>
            <BotonP variante="ok" className="!min-h-9 !px-3" onClick={() => accionReserva(`/gestion/reservas/${r.codigo}/checkin`)}><Check className="size-4" />Check-in</BotonP></Item>)) : null}</Columna>
        <Columna t="Salidas de hoy" icono={LogOut} n={d.salidas.length}>{d.salidas.map((r: any) => (
          <Item key={r.codigo} r={r} abrir={abrir} sub={<>Saldo: <span className={r.saldo > 0.009 ? 'text-bad' : ''}>{soles(r.saldo)}</span></>}>
            {r.saldo > 0.009 ? <BotonP variante="oro" className="!min-h-9 !px-3" onClick={() => pagar(r)}><Wallet className="size-4" />Cobrar</BotonP>
              : <BotonP className="!min-h-9 !px-3" onClick={() => accionReserva(`/gestion/reservas/${r.codigo}/checkout`)}><Check className="size-4" />Check-out</BotonP>}</Item>))}</Columna>
        <Columna t="En el hotel" icono={Home} n={d.enCasa.length}>{d.enCasa.map((r: any) => (
          <Item key={r.codigo} r={r} abrir={abrir} sub={<>Sale {fechaDia(r.fechaSalida)} · {r.saldo > 0.009 ? <span className="text-bad">{soles0(r.saldo)}</span> : 'pagado'}</>}>
            {r.saldo > 0.009 && <button onClick={() => pagar(r)} aria-label={`Registrar pago de ${r.cliente}`} className="grid size-9 place-items-center rounded-lg border border-line hover:bg-sand"><Wallet className="size-4" /></button>}</Item>))}</Columna>
        <Columna t="Limpieza pendiente" icono={Sparkles} n={d.limpieza.length}>{d.limpieza.map((h: any) => (
          <li key={h.id} className="flex items-center gap-3 border-b border-[#EFEDE7] px-4 py-3 last:border-0">
            <span className="grid h-11 min-w-13 place-items-center rounded-lg bg-ocean px-2 font-semibold text-white">{h.numero}</span>
            <div className="flex-1"><p className="font-medium">{h.tipo}</p><p className="text-sm text-muted">{h.estadoLimpieza === 'EnLimpieza' ? 'En limpieza' : h.tareaTipo ? ETIQUETAS[h.tareaTipo] : 'Por limpiar'}{h.asignadaA ? ` · ${h.asignadaA}` : ''}</p>
              {h.llegaHoy && <p className="text-xs font-medium text-bad">Llega un huésped hoy</p>}</div>
            <BotonP variante="claro" className="!min-h-9 !px-3" onClick={async () => { try { await apiPanel(`/gestion/habitaciones/${h.id}/limpieza`, { method: 'PATCH', body: { estadoLimpieza: 'Limpia' } }); avisar('Habitación lista para el siguiente huésped.'); refrescar(); } catch (e: any) { avisar(e.message, 'error'); } }}><Check className="size-4" />Limpia</BotonP>
          </li>))}</Columna>
      </div>
      {!d.llegadas.length && !d.salidas.length && !d.enCasa.length && <div className="mt-4 rounded-2xl border border-line bg-white"><Vacio texto="Sin movimientos por ahora. Buen momento para un café." icono={CupSoda} /></div>}
    </>
  );
}
