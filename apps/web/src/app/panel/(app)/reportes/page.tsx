'use client';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarCheck, Coins, Moon, PieChart as Torta, Printer, Receipt, Tag, TrendingUp, XOctagon } from 'lucide-react';
import { ETIQUETAS, hoyLima, sumarDias } from '@marea/shared';
import { entero, fechaMedia, mesCorto, pct, soles, soles0, solesCorto } from '@/lib/formato';
import { BotonP, Cabecera, Cargando, descargarCsv, Kpi, Tarjeta, useDatos } from '@/components/panel/base';
import { COLORES } from '@/lib/colores';

export default function Reportes() {
  const hoy = hoyLima(), mesIni = hoy.slice(0, 8) + '01';
  const finPrev = sumarDias(mesIni, -1);
  const P: Record<string, [string, string, string]> = { mes: ['Este mes', mesIni, hoy], pasado: ['Mes pasado', finPrev.slice(0, 8) + '01', finPrev], d30: ['Últimos 30 días', sumarDias(hoy, -29), hoy],
    d90: ['Últimos 90 días', sumarDias(hoy, -89), hoy], anio: ['Este año', hoy.slice(0, 4) + '-01-01', hoy] };
  const [r, setR] = useState<[string, string]>([mesIni, hoy]);
  const { datos: d, error } = useDatos<any>(`/gestion/reportes?desde=${r[0]}&hasta=${r[1]}`);
  const csv = () => d && descargarCsv(`reporte-${d.desde}-${d.hasta}.csv`, [['Indicador', 'Valor'], ['Desde', d.desde], ['Hasta', d.hasta], ['Ocupación', d.ocupacion], ['ADR', d.adr], ['RevPAR', d.revpar],
    ['Ingresos', d.ingresos], ['Cobrado', d.cobrado], ['Reservas', d.reservas], ['Canceladas', d.canceladas], ['No show', d.noShow], ['IGV', d.igv], [],
    ['Mes', 'Noches', 'Ocupación', 'ADR', 'RevPAR', 'Ingresos'], ...d.porMes.map((x: any) => [x.mes, x.noches, x.ocupacion, x.adr, x.revpar, x.ingresos]), [],
    ['Tipo', 'Habitaciones', 'Noches', 'Ocupación', 'ADR', 'Ingresos'], ...d.porTipo.map((x: any) => [x.tipo, x.habitaciones, x.noches, x.ocupacion, x.adr, x.ingresos])]);
  const sel = 'h-10 rounded-lg border border-[#D9D6CE] bg-white px-2 text-sm';
  return (
    <>
      <Cabecera titulo="Reportes de gestión" sub="Indicadores hoteleros por periodo (las estadías se prorratean por noche).">
        <BotonP variante="claro" onClick={csv}>CSV</BotonP><BotonP variante="claro" onClick={() => window.print()}><Printer className="size-4" />Imprimir / PDF</BotonP>
      </Cabecera>
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-white p-4 print:hidden">
        {Object.entries(P).map(([k, [t, a, b]]) => <button key={k} aria-pressed={r[0] === a && r[1] === b} onClick={() => setR([a, b])} className={`rounded-full border px-3 py-1.5 text-sm ${r[0] === a && r[1] === b ? 'border-ocean bg-ocean text-white' : 'border-line'}`}>{t}</button>)}
        <label className="ml-auto grid gap-1 text-xs text-muted">Desde<input type="date" className={sel} value={r[0]} onChange={e => setR([e.target.value, r[1]])} /></label>
        <label className="grid gap-1 text-xs text-muted">Hasta<input type="date" className={sel} value={r[1]} onChange={e => setR([r[0], e.target.value])} /></label>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-bad-bg p-4 text-bad">{error}</p> : !d ? <Cargando /> : <>
        <p className="mb-3 text-sm text-muted">Periodo: <strong>{fechaMedia(d.desde)} – {fechaMedia(d.hasta)}</strong> · {d.dias} días · {d.habitaciones} habitaciones operativas</p>
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Kpi icono={Torta} etiqueta="Ocupación" valor={pct(d.ocupacion, 1)} sub={`${entero(d.nochesOcupadas)} de ${entero(d.nochesDisponibles)} noches`} barra={d.ocupacion} />
          <Kpi icono={Tag} tono="info" etiqueta="ADR · tarifa promedio" valor={soles(d.adr)} sub="Ingreso por noche ocupada" />
          <Kpi icono={TrendingUp} tono="ok" etiqueta="RevPAR" valor={soles(d.revpar)} sub="Ingreso por habitación disponible" />
          <Kpi icono={Coins} tono="ok" etiqueta="Ingresos de habitaciones" valor={soles0(d.ingresos)} sub={`Cobrado: ${soles0(d.cobrado)}`} />
          <Kpi icono={CalendarCheck} etiqueta="Reservas con llegada" valor={d.reservas} sub={`${d.reservasEfectivas} efectivas`} />
          <Kpi icono={XOctagon} tono={d.tasaCancelacion > 0.1 ? 'bad' : 'warn'} etiqueta="Cancelación + no show" valor={pct(d.tasaCancelacion, 1)} sub={`${d.canceladas} canceladas · ${d.noShow} no show`} />
          <Kpi icono={Moon} tono="info" etiqueta="Estadía promedio" valor={`${d.estadiaPromedio} noches`} sub={`Anticipación: ${d.anticipacionPromedio} días`} />
          <Kpi icono={Receipt} etiqueta="IGV generado" valor={soles0(d.igv)} sub={`Ventas exoneradas: ${soles0(d.ventasExoneradas)}`} />
        </div>
        <div className="mb-4 grid gap-4 xl:grid-cols-3">
          <Tarjeta titulo="Ocupación, ADR y RevPAR por mes" className="xl:col-span-2">
            <div className="h-72" role="img" aria-label="Ocupación, ADR y RevPAR por mes"><ResponsiveContainer><ComposedChart data={d.porMes.map((m: any) => ({ mes: mesCorto(m.mes), ocupacion: +(m.ocupacion * 100).toFixed(1), adr: m.adr, revpar: m.revpar }))}>
              <CartesianGrid vertical={false} stroke="#ECEAE4" /><XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis yAxisId="o" unit=" %" domain={[0, 100]} width={44} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="s" orientation="right" tickFormatter={v => solesCorto(v)} width={70} tick={{ fontSize: 11 }} /><Tooltip formatter={(v: any, n: any) => n === 'Ocupación %' ? `${v} %` : soles(v)} /><Legend iconType="circle" />
              <Bar yAxisId="o" dataKey="ocupacion" name="Ocupación %" fill="#12303A" radius={[6, 6, 0, 0]} maxBarSize={42} />
              <Line yAxisId="s" dataKey="adr" name="ADR" stroke="#B08D57" strokeWidth={2} /><Line yAxisId="s" dataKey="revpar" name="RevPAR" stroke="#4F8A8B" strokeDasharray="5 4" strokeWidth={2} />
            </ComposedChart></ResponsiveContainer></div>
          </Tarjeta>
          <Tarjeta titulo="Ocupación por día de la semana">
            <div className="h-72" role="img" aria-label={d.porDiaSemana.map((x: any) => `${x.dia}: ${pct(x.ocupacion)}`).join(', ')}><ResponsiveContainer><BarChart data={d.porDiaSemana.map((x: any) => ({ dia: x.dia.slice(0, 3), ocupacion: +(x.ocupacion * 100).toFixed(1) }))}>
              <CartesianGrid vertical={false} stroke="#ECEAE4" /><XAxis dataKey="dia" tick={{ fontSize: 11 }} /><YAxis unit=" %" domain={[0, 100]} width={44} tick={{ fontSize: 11 }} /><Tooltip formatter={(v: any) => `${v} %`} />
              <Bar dataKey="ocupacion" name="Ocupación" radius={[6, 6, 0, 0]}>{d.porDiaSemana.map((_: any, i: number) => <Cell key={i} fill={i >= 4 ? '#B08D57' : '#12303A'} />)}</Bar>
            </BarChart></ResponsiveContainer></div>
          </Tarjeta>
        </div>
        <div className="mb-4 grid gap-4 md:grid-cols-3">
          {[['Reservas por canal', d.porCanal.map((x: any) => ({ n: ETIQUETAS[x.canal], v: x.reservas }))], ['Residentes vs. extranjeros', d.porResidencia.map((x: any) => ({ n: x.residencia, v: x.reservas }))],
            ['Cobros por método', d.pagosPorMetodo.map((x: any) => ({ n: x.metodo, v: x.monto }))]].map(([t, datos]: any) => (
            <Tarjeta key={t} titulo={t}><div className="h-56" role="img" aria-label={`${t}: ${datos.map((x: any) => `${x.n} ${t.includes('Cobros') ? soles0(x.v) : x.v}`).join(', ')}`}><ResponsiveContainer><PieChart>
              <Pie data={datos} dataKey="v" nameKey="n" innerRadius="55%" outerRadius="85%">{datos.map((_: any, i: number) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}</Pie>
              <Tooltip formatter={(v: any) => t.includes('Cobros') ? soles(v) : v} /><Legend iconType="circle" /></PieChart></ResponsiveContainer></div></Tarjeta>))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Tarjeta titulo="Rendimiento por tipo de habitación" sinPadding>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Rendimiento por tipo"><table className="w-full text-sm"><thead className="bg-[#FAF9F6] text-left text-xs uppercase tracking-wider text-muted"><tr>{['Tipo', 'Hab.', 'Noches', 'Ocupación', 'ADR', 'Ingresos'].map(h => <th key={h} scope="col" className="px-4 py-2 first:pl-5">{h}</th>)}</tr></thead>
              <tbody>{d.porTipo.map((t: any) => <tr key={t.tipo} className="border-t border-line"><td className="px-4 py-2.5 pl-5 font-medium">{t.tipo}</td><td className="px-4">{t.habitaciones}</td><td className="px-4 tabular-nums">{entero(t.noches)}</td><td className="px-4 tabular-nums">{pct(t.ocupacion, 1)}</td><td className="px-4 tabular-nums">{soles(t.adr)}</td><td className="px-4 tabular-nums">{soles(t.ingresos)}</td></tr>)}</tbody></table></div>
          </Tarjeta>
          <Tarjeta titulo="Mejores clientes del periodo" sinPadding>
            <ol className="divide-y divide-line">{d.topClientes.map((x: any, i: number) => <li key={x.clienteId} className="flex items-center justify-between px-5 py-2.5 text-sm"><span><span className="mr-3 text-muted">{i + 1}.</span><a className="hover:underline" href={`/panel/clientes/${x.clienteId}`}>{x.cliente}</a></span><span className="tabular-nums">{x.reservas} res. · {soles(x.total)}</span></li>)}</ol>
          </Tarjeta>
        </div>
      </>}
    </>
  );
}
