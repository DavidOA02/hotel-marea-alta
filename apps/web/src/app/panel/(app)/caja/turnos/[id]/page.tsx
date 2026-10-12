'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, Calculator, ClipboardCheck, Printer, TriangleAlert } from 'lucide-react';
import { DENOMINACIONES_SOLES, ETIQUETAS, revisarTurnoSchema } from '@marea/shared';
import { dolares, fechaHora, soles } from '@/lib/formato';
import { apiPanel, useSesion } from '@/stores/sesion';
import { BotonP, Cabecera, Cargando, Estado, Tarjeta, useDatos, Vacio } from '@/components/panel/base';
import { Tabla, columnas } from '@/components/panel/tabla';
import { Campo } from '@/components/panel/campo';
import { err, FormularioModal } from '@/components/panel/formularios';
import { useFicha } from '@/components/panel/reservas';
import { CobrosPorMetodo, DesgloseEfectivo, Diferencia, estadoTurno, FormArqueo, FormMovimiento } from '@/components/panel/caja';

/** Reporte de un turno de caja: arqueo, desglose del efectivo, cobros, devoluciones y movimientos. Se imprime con firmas. */
export default function ReporteTurno({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos: t, error } = useDatos<any>(`/gestion/turnos/${id}`);
  const usuario = useSesion(s => s.usuario);
  const abrir = useFicha(s => s.abrir);
  const [revisar, setRevisar] = useState(false), [movimiento, setMovimiento] = useState(false), [arqueo, setArqueo] = useState(false);
  if (error) return <Vacio texto={error} />;
  if (!t) return <Cargando />;
  const admin = usuario?.rol === 'Administrador';
  const abierto = t.estado === 'Abierto';
  const e = t.resumen.esperado;
  // Lo esperado se guardó al cerrar; si después se anuló un pago del turno, hoy sería distinto
  const cambioPosterior = !abierto && (Math.abs(e.soles - t.esperadoSoles) >= 0.005 || Math.abs(e.dolares - t.esperadoDolares) >= 0.005);
  const conDolares = abierto ? e.dolares !== 0 : t.esperadoDolares !== 0 || t.contadoDolares !== 0;

  const c = columnas<any>();
  const reserva = c.accessor('codigoReserva', { header: 'Reserva', cell: i => <button className="font-mono font-semibold text-ocean underline decoration-gold" onClick={() => abrir(i.getValue())}>{i.getValue()}</button> });
  const colsPagos = [
    c.accessor('fechaPago', { header: 'Fecha', cell: i => fechaHora(i.getValue()) }), reserva, c.accessor('cliente', { header: 'Cliente' }),
    c.accessor('metodo', { header: 'Método', cell: i => <>{i.getValue()}{i.row.original.referencia && <span className="block text-xs text-muted">{i.row.original.referencia}</span>}</> }),
    c.accessor('montoSoles', { header: 'Monto', meta: { derecha: true }, cell: i => <>{soles(i.getValue())}{i.row.original.moneda === 'USD' && <span className="block text-xs text-muted">{dolares(i.row.original.monto)} × {i.row.original.tipoCambio}</span>}</> }),
    c.accessor('estado', { header: 'Estado', cell: i => <><Estado valor={i.getValue()} />{i.row.original.motivoAnulacion && <span className="block text-xs text-muted">{i.row.original.motivoAnulacion}</span>}</> })
  ];
  const colsDev = [
    c.accessor('fecha', { header: 'Fecha', cell: i => fechaHora(i.getValue()) }), reserva, c.accessor('cliente', { header: 'Cliente' }),
    c.accessor('metodo', { header: 'Método', cell: i => <>{i.getValue()}<span className="block text-xs text-muted">{i.row.original.motivo}</span></> }),
    c.accessor('monto', { header: 'Monto', meta: { derecha: true }, cell: i => <span className="text-bad">−{soles(i.getValue())}</span> }),
    c.accessor('registradoPor', { header: 'Registró' })
  ];
  const colsMov = [
    c.accessor('fecha', { header: 'Fecha', cell: i => fechaHora(i.getValue()) }), c.accessor('tipo', { header: 'Tipo', cell: i => ETIQUETAS[i.getValue()] }),
    c.accessor('motivo', { header: 'Motivo' }),
    c.accessor('monto', { header: 'Monto', meta: { derecha: true }, cell: i => { const m = i.row.original; const f = m.moneda === 'USD' ? dolares : soles;
      return <span className={m.tipo === 'Retiro' ? 'text-bad' : 'text-ok'}>{m.tipo === 'Retiro' ? '−' : '+'}{f(i.getValue())}</span>; } }),
    c.accessor('registradoPor', { header: 'Registró' })
  ];
  const conteo = t.denominaciones ? DENOMINACIONES_SOLES.filter(d => Number(t.denominaciones[String(d)]) > 0) : [];

  return (
    <>
      <Cabecera titulo={`Turno de caja N.° ${t.id}`} sub={<>{t.usuario} · {fechaHora(t.fechaApertura)} → {abierto ? 'abierto' : fechaHora(t.fechaCierre)}</>}>
        <Link href="/panel/caja?vista=turnos" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium hover:bg-sand print:hidden"><ArrowLeft className="size-4" />Caja</Link>
        {abierto && <BotonP variante="claro" className="print:hidden" onClick={() => setMovimiento(true)}><ArrowLeftRight className="size-4" />Ingreso o retiro</BotonP>}
        {abierto && <BotonP className="print:hidden" onClick={() => setArqueo(true)}><Calculator className="size-4" />Cerrar turno</BotonP>}
        {admin && !abierto && !t.fechaRevision && t.usuarioId !== usuario?.id && <BotonP variante="ok" className="print:hidden" onClick={() => setRevisar(true)}><ClipboardCheck className="size-4" />Marcar como revisado</BotonP>}
        <BotonP variante="claro" className="print:hidden" onClick={() => window.print()}><Printer className="size-4" />Imprimir</BotonP>
      </Cabecera>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Tarjeta titulo={abierto ? 'Efectivo en caja (turno abierto)' : 'Arqueo'} accion={<Estado valor={estadoTurno(t)} />}>
          {abierto ? <p className="text-sm text-muted">Debería haber <strong className="text-ink">{soles(e.soles)}</strong>{e.dolares ? <> y <strong className="text-ink">{dolares(e.dolares)}</strong></> : ''}. El arqueo se hace al cerrar el turno.</p>
            : <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-[0.1em] text-muted"><th className="py-2 font-medium">Moneda</th><th className="text-right font-medium">Esperado</th><th className="text-right font-medium">Contado</th><th className="text-right font-medium">Diferencia</th></tr></thead>
              <tbody className="tabular-nums">
                <tr className="border-b border-[#EFEDE7]"><td className="py-2">Soles</td><td className="text-right">{soles(t.esperadoSoles)}</td><td className="text-right">{soles(t.contadoSoles)}</td><td className="text-right"><Diferencia valor={t.diferenciaSoles} /></td></tr>
                {conDolares && <tr><td className="py-2">Dólares</td><td className="text-right">{dolares(t.esperadoDolares)}</td><td className="text-right">{dolares(t.contadoDolares)}</td><td className="text-right"><Diferencia valor={t.diferenciaDolares} moneda="USD" /></td></tr>}
              </tbody>
            </table>}
          {cambioPosterior && <p className="mt-3 flex gap-2 rounded-lg bg-warn-bg p-3 text-sm text-warn"><TriangleAlert className="size-4 shrink-0" aria-hidden />
            Después del cierre cambiaron pagos de este turno (por ejemplo, una anulación): hoy lo esperado sería {soles(e.soles)}{conDolares ? ` y ${dolares(e.dolares)}` : ''}. El arqueo guardado no cambia.</p>}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Abrió</dt><dd>{t.usuario} · fondo de {soles(t.fondoInicial)}{t.notaApertura && <span className="block text-xs text-muted">{t.notaApertura}</span>}</dd></div>
            {!abierto && <div><dt className="text-xs text-muted">Cerró</dt><dd>{t.cerradoPor} · {fechaHora(t.fechaCierre)}</dd></div>}
            {t.observaciones && <div className="sm:col-span-2"><dt className="text-xs text-muted">Observaciones</dt><dd>{t.observaciones}</dd></div>}
            {t.fechaRevision && <div className="sm:col-span-2"><dt className="text-xs text-muted">Revisión</dt><dd>{t.revisadoPor} · {fechaHora(t.fechaRevision)}{t.notaRevision && <span className="block">{t.notaRevision}</span>}</dd></div>}
          </dl>
        </Tarjeta>
        <Tarjeta titulo={abierto ? 'Efectivo esperado' : 'Desglose del efectivo'}>
          <DesgloseEfectivo turno={t} />
        </Tarjeta>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <Tarjeta titulo="Cobros del turno por método"><CobrosPorMetodo turno={t} />
          <p className="mt-3 text-xs text-muted">Total cobrado: {soles(t.resumen.cobrado)} en {t.resumen.pagos} pago(s). Cuadra la tarjeta con el cierre del POS y Yape, Plin o transferencias con sus movimientos.</p>
        </Tarjeta>
        {conteo.length > 0 && <Tarjeta titulo="Conteo por billetes y monedas">
          <table className="w-full text-sm tabular-nums"><tbody>
            {conteo.map(d => { const n = Number(t.denominaciones[String(d)]); return <tr key={d}><td className="py-0.5">{n} × S/ {d < 1 ? d.toFixed(2) : d}</td><td className="text-right">{soles(n * d)}</td></tr>; })}
            <tr className="border-t border-line font-semibold"><td className="pt-1.5">Total</td><td className="pt-1.5 text-right">{soles(t.contadoSoles)}</td></tr>
          </tbody></table>
        </Tarjeta>}
      </div>

      <Tarjeta titulo="Pagos registrados en el turno" className="mt-4" sinPadding>
        <Tabla etiqueta="pagos del turno" datos={t.pagos} columnas={colsPagos} buscador={false} porPagina={50} vacio="Sin pagos en este turno."
          csv={{ nombre: `turno-${t.id}-pagos.csv`, encabezados: ['Fecha', 'Reserva', 'Cliente', 'Método', 'Moneda', 'Monto', 'Tipo de cambio', 'Monto S/', 'Referencia', 'Estado'],
            filas: p => [p.fechaPago, p.codigoReserva, p.cliente, p.metodo, p.moneda, p.monto, p.tipoCambio, p.montoSoles, p.referencia, p.estado] }} />
      </Tarjeta>
      {t.devoluciones.length > 0 && <Tarjeta titulo="Devoluciones entregadas en el turno" className="mt-4" sinPadding>
        <Tabla etiqueta="devoluciones del turno" datos={t.devoluciones} columnas={colsDev} buscador={false} porPagina={50} />
      </Tarjeta>}
      {t.movimientos.length > 0 && <Tarjeta titulo="Ingresos y retiros de efectivo" className="mt-4" sinPadding>
        <Tabla etiqueta="movimientos de caja" datos={t.movimientos} columnas={colsMov} buscador={false} porPagina={50} />
      </Tarjeta>}

      <div className="mt-16 hidden grid-cols-2 gap-16 text-center text-sm print:grid" aria-hidden>
        <p className="border-t border-ink pt-2">Entregó: {t.usuario}</p><p className="border-t border-ink pt-2">Recibió</p>
      </div>

      <FormMovimiento turno={t} abierto={movimiento} alCerrar={() => setMovimiento(false)} />
      <FormArqueo turno={t} abierto={arqueo} alCerrar={() => setArqueo(false)} />
      <FormularioModal abierto={revisar} alCerrar={() => setRevisar(false)} titulo={`Revisar arqueo del turno N.° ${t.id}`} esquema={revisarTurnoSchema} boton="Marcar como revisado"
        valores={{ nota: '' }} enviar={d => apiPanel(`/gestion/turnos/${t.id}/revisar`, { method: 'POST', body: d })}>
        {f => <><p className="mb-4 text-sm text-muted">Confirma que revisaste el arqueo{t.observaciones ? ' y la explicación de la diferencia' : ''}. La revisión queda en la bitácora y no se puede deshacer.</p>
          <Campo etiqueta="Nota (opcional)" error={err(f, 'nota')}><textarea rows={2} className="!h-auto py-2" maxLength={300} {...f.register('nota')} /></Campo></>}
      </FormularioModal>
    </>
  );
}
