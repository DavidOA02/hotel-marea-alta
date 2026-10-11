'use client';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BellRing, CalendarPlus, Clock, DoorOpen, LogIn, LogOut, NotebookText, Plus, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { ETIQUETAS } from '@marea/shared';
import { fechaDia, mesCorto, pct, soles, soles0, solesCorto } from '@/lib/formato';
import { useSesion } from '@/stores/sesion';
import { BotonP, Cabecera, Cargando, Kpi, Tarjeta, useDatos, Vacio } from '@/components/panel/base';
import { Tabla } from '@/components/panel/tabla';
import { columnasReservas } from '@/components/panel/columnas';
import { useFicha, useNuevaReserva } from '@/components/panel/reservas';

import { COLORES } from '@/lib/colores';

export default function Dashboard() {
  const { datos: d, error } = useDatos<any>('/gestion/dashboard');
  const nombre = useSesion(s => s.usuario?.nombre ?? '');
  const abrir = useFicha(s => s.abrir);
  const nueva = useNuevaReserva(s => s.abrir);
  if (error) return <Vacio texto={error} />;
  if (!d) return <Cargando />;
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false }));
  const hab = d.habitaciones;
  return (
    <>
      <Cabecera titulo={`${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${nombre.split(' ')[0]}`} sub={`Resumen del hotel al ${fechaDia(d.hoy)}.`}>
        <Link href="/panel/recepcion" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium hover:bg-sand"><BellRing className="size-4" />Recepción</Link>
        <BotonP onClick={() => nueva()}><Plus className="size-4" />Nueva reserva</BotonP>
      </Cabecera>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icono={DoorOpen} etiqueta="Ocupación hoy" valor={pct(d.ocupacionHoy)} sub={`${hab.ocupadas} de ${hab.operativas} habitaciones`} barra={d.ocupacionHoy} />
        <Kpi icono={LogIn} tono="info" etiqueta="Llegadas hoy" valor={d.llegadasHoy} sub={`${d.enCasa} huéspedes en el hotel`} />
        <Kpi icono={LogOut} tono="warn" etiqueta="Salidas hoy" valor={d.salidasHoy} sub={`${hab.sucias} habitación(es) por limpiar`} />
        <Kpi icono={CalendarPlus} tono="ok" etiqueta="Reservas nuevas hoy" valor={d.reservasHoy} sub="Web, teléfono y recepción" />
        <Kpi icono={TrendingUp} tono="ok" etiqueta="Ingresos del mes" valor={soles0(d.ingresosMes)} sub={`ADR ${soles0(d.adrMes)} · Ocupación ${pct(d.ocupacionMes)}`} />
        <Kpi icono={Wallet} etiqueta="Cobrado hoy" valor={soles(d.cobradoHoy)} sub={`En el mes: ${soles0(d.cobradoMes)}`} />
        <Kpi icono={Receipt} tono={d.saldoEnCasa > 0 ? 'warn' : 'ok'} etiqueta="Saldo de huéspedes en casa" valor={soles(d.saldoEnCasa)} sub="Por cobrar antes del check-out" />
        <Kpi icono={NotebookText} tono={d.reclamosPendientes ? 'bad' : 'ok'} etiqueta="Reclamos pendientes" valor={d.reclamosPendientes} sub={d.reclamosPorVencer ? `${d.reclamosPorVencer} por vencer` : 'Al día'} />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Tarjeta titulo="Ocupación próximos 14 días" icono={Clock} className="xl:col-span-2">
          <div className="h-64" role="img" aria-label={`Ocupación de los próximos 14 días: entre ${pct(Math.min(...d.proximos14.map((x: any) => x.ocupacion)))} y ${pct(Math.max(...d.proximos14.map((x: any) => x.ocupacion)))}`}>
            <ResponsiveContainer><BarChart data={d.proximos14.map((x: any) => ({ dia: fechaDia(x.fecha), ocupacion: Math.round(x.ocupacion * 100), hab: x.ocupadas }))}>
              <CartesianGrid vertical={false} stroke="#ECEAE4" /><XAxis dataKey="dia" tick={{ fontSize: 11 }} interval={1} /><YAxis unit=" %" domain={[0, 100]} tick={{ fontSize: 11 }} width={44} />
              <Tooltip formatter={(v: any, _n, p: any) => [`${v} % (${p.payload.hab} hab.)`, 'Ocupación']} />
              <Bar dataKey="ocupacion" radius={[6, 6, 0, 0]}>{d.proximos14.map((_: any, i: number) => <Cell key={i} fill={i === 0 ? '#B08D57' : '#12303A'} />)}</Bar>
            </BarChart></ResponsiveContainer></div>
        </Tarjeta>
        <Tarjeta titulo="Habitaciones hoy" icono={DoorOpen} accion={<Link href="/panel/habitaciones" className="text-sm text-ocean underline decoration-gold">Ver tablero</Link>}>
          <div className="h-64" role="img" aria-label={`${hab.ocupadas} ocupadas, ${hab.libres} libres y ${hab.mantenimiento} fuera de servicio`}>
            <ResponsiveContainer><PieChart><Pie data={[{ n: 'Ocupadas', v: hab.ocupadas }, { n: 'Libres', v: hab.libres }, { n: 'Fuera de servicio', v: hab.mantenimiento }]} dataKey="v" nameKey="n" innerRadius="58%" outerRadius="85%">
              {['#12303A', '#3E9B66', '#A2321A'].map(c => <Cell key={c} fill={c} />)}</Pie><Tooltip /><Legend iconType="circle" /></PieChart></ResponsiveContainer></div>
        </Tarjeta>
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Tarjeta titulo="Ingresos por mes (prorrateados por noche)" icono={TrendingUp} className="xl:col-span-2">
          <div className="h-64" role="img" aria-label="Ingresos y ocupación de los últimos 6 meses">
            <ResponsiveContainer><ComposedChart data={d.meses.map((m: any) => ({ mes: mesCorto(m.mes), ingresos: m.ingresos, ocupacion: Math.round(m.ocupacion * 100) }))}>
              <CartesianGrid vertical={false} stroke="#ECEAE4" /><XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="i" tickFormatter={v => solesCorto(v)} tick={{ fontSize: 11 }} width={70} /><YAxis yAxisId="o" orientation="right" unit=" %" domain={[0, 100]} tick={{ fontSize: 11 }} width={44} />
              <Tooltip formatter={(v: any, n: any) => n === 'Ingresos' ? soles(v) : `${v} %`} /><Legend iconType="circle" />
              <Bar yAxisId="i" dataKey="ingresos" name="Ingresos" fill="#12303A" radius={[6, 6, 0, 0]} maxBarSize={48} />
              <Line yAxisId="o" dataKey="ocupacion" name="Ocupación" stroke="#B08D57" strokeWidth={2} />
            </ComposedChart></ResponsiveContainer></div>
        </Tarjeta>
        <Tarjeta titulo="Canales (30 días)" icono={CalendarPlus}>
          <div className="h-64" role="img" aria-label={d.canales.map((c: any) => `${ETIQUETAS[c.canal]}: ${c.reservas}`).join(', ')}>
            <ResponsiveContainer><PieChart><Pie data={d.canales.map((c: any) => ({ n: ETIQUETAS[c.canal], v: c.reservas }))} dataKey="v" nameKey="n" innerRadius="58%" outerRadius="85%">
              {d.canales.map((_: any, i: number) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}</Pie><Tooltip /><Legend iconType="circle" /></PieChart></ResponsiveContainer></div>
        </Tarjeta>
      </div>
      <Tarjeta titulo="Últimas reservas" icono={Clock} sinPadding accion={<Link href="/panel/reservas" className="text-sm text-ocean underline decoration-gold">Ver todas</Link>}>
        <Tabla etiqueta="últimas reservas" datos={d.ultimas} columnas={columnasReservas} buscador={false} alFila={r => abrir(r.codigo)} />
      </Tarjeta>
    </>
  );
}
