'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { ArrowLeftRight, Calculator, LockKeyholeOpen, Vault } from 'lucide-react';
import { abrirTurnoSchema, cerrarTurnoSchema, DENOMINACIONES_SOLES, ETIQUETAS, HORAS_TURNO_LARGO, movimientoCajaSchema, primerError, redondear, sumarDenominaciones } from '@marea/shared';
import { ApiError } from '@/lib/api';
import { dolares, fechaHora, soles } from '@/lib/formato';
import { apiPanel, refrescar } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { BotonP, Estado, Modal, useDatos } from './base';
import { AlertaForm, Campo } from './campo';
import { err, FormularioModal } from './formularios';

/* ---------- Turno de caja del usuario ---------- */
/** Abre el formulario «Abrir turno» desde cualquier vista (caja, cobro, devolución). */
export const useAbrirTurno = create<{ abierto: boolean; abrir: () => void; cerrar: () => void }>(set => ({
  abierto: false, abrir: () => set({ abierto: true }), cerrar: () => set({ abierto: false })
}));

/** Turno abierto del usuario con lo esperado en caja; al administrador también le indica qué arqueos revisar. */
export function useTurno(activo = true) {
  const { datos } = useDatos<any>(activo ? '/gestion/turnos/actual' : null);
  return { turno: datos?.turno ?? null, cargado: !!datos, porRevisar: datos?.porRevisar ?? 0 };
}

/** Abierto, cerrado o revisado (cerrado con la revisión del administrador). */
export const estadoTurno = (t: any) => (t.estado === 'Cerrado' && t.fechaRevision ? 'Revisado' : t.estado);
export const horasAbierto = (t: any) => (Date.now() - new Date(t.fechaApertura).getTime()) / 3_600_000;

/** «Cuadra», «Faltan S/ 10.00» o «Sobran US$ 5.00». */
export function Diferencia({ valor, moneda = 'PEN' }: { valor: number | null | undefined; moneda?: 'PEN' | 'USD' }) {
  if (valor === null || valor === undefined) return <span className="text-muted">—</span>;
  if (Math.abs(valor) < 0.005) return <span className="text-ok">Cuadra</span>;
  const f = moneda === 'USD' ? dolares : soles;
  return <span className={`font-medium ${valor < 0 ? 'text-bad' : 'text-warn'}`}>{valor < 0 ? 'Faltan' : 'Sobran'} {f(Math.abs(valor))}</span>;
}

/** Monto devuelto en soles y, si el pago fue en dólares, los dólares entregados. */
export const MontoDevuelto = ({ monto, montoDolares }: { monto: number; montoDolares?: number | null }) =>
  <span className="text-bad">−{soles(monto)}{montoDolares != null && <span className="block text-xs">{dolares(montoDolares)} entregados</span>}</span>;

/** De dónde sale el efectivo esperado: fondo + cobros − devoluciones + ingresos − retiros. */
export function DesgloseEfectivo({ turno }: { turno: any }) {
  const r = turno.resumen;
  const efectivo = r.porMetodo.find((m: any) => m.metodo === 'Efectivo');
  // El signo va en el concepto; los montos se muestran en positivo
  const filas: [string, number, number][] = [
    ['Fondo inicial', turno.fondoInicial, 0],
    ['+ Cobros en efectivo', efectivo?.soles ?? 0, efectivo?.dolares ?? 0],
    ['− Devoluciones en efectivo', r.devolucionesEfectivo.soles, r.devolucionesEfectivo.dolares],
    ['+ Ingresos de efectivo', r.ingresos.soles, r.ingresos.dolares],
    ['− Retiros de efectivo', r.retiros.soles, r.retiros.dolares]
  ];
  const conDolares = r.esperado.dolares !== 0 || filas.some(f => f[2] !== 0);
  return (
    <table className="w-full text-sm">
      <thead className="sr-only"><tr><th>Concepto</th><th>Soles</th>{conDolares && <th>Dólares</th>}</tr></thead>
      <tbody>
        {filas.map(([k, s, d]) => <tr key={k}><td className="py-0.5 text-muted">{k}</td><td className="text-right tabular-nums">{soles(s)}</td>{conDolares && <td className="text-right tabular-nums">{dolares(d)}</td>}</tr>)}
        <tr className="border-t border-line font-semibold"><td className="pt-1.5">Esperado en caja</td><td className="pt-1.5 text-right tabular-nums">{soles(r.esperado.soles)}</td>{conDolares && <td className="pt-1.5 text-right tabular-nums">{dolares(r.esperado.dolares)}</td>}</tr>
      </tbody>
    </table>
  );
}

/** Cobros del turno por método (los que no son efectivo sirven para cuadrar el POS, Yape o el banco). */
export function CobrosPorMetodo({ turno }: { turno: any }) {
  const l = turno.resumen.porMetodo;
  if (!l.length) return <p className="text-sm text-muted">Aún no hay cobros en este turno.</p>;
  return (
    <ul className="flex flex-wrap gap-2 text-sm">
      {l.map((m: any) => <li key={m.metodo} className="rounded-full border border-line bg-[#FAF8F4] px-3 py-1">
        <strong className="font-medium">{m.metodo}</strong> · {m.dolares ? `${soles(m.soles)} + ${dolares(m.dolares)}` : soles(m.montoSoles)} <span className="text-muted">({m.cantidad})</span>
        {m.devuelto > 0 && <span className="text-bad"> · −{soles(m.devuelto)}</span>}</li>)}
    </ul>
  );
}

/* ---------- Formularios ---------- */
export function FormAbrirTurno() {
  const { abierto, cerrar } = useAbrirTurno();
  return (
    <FormularioModal abierto={abierto} alCerrar={cerrar} titulo="Abrir turno de caja" esquema={abrirTurnoSchema} boton="Abrir turno"
      valores={{ fondoInicial: '', nota: '' }} enviar={d => apiPanel('/gestion/turnos', { method: 'POST', body: d })}>
      {f => <div className="grid gap-4">
        <p className="text-sm text-muted">Cuenta el efectivo que recibes para dar vuelto (fondo inicial). Lo que cobres o devuelvas en efectivo quedará en tu turno hasta que lo cierres con el arqueo.</p>
        <Campo etiqueta="Fondo inicial en efectivo (S/)" error={err(f, 'fondoInicial')}><input type="number" step="0.01" min="0" inputMode="decimal" placeholder="p. ej. 200.00" {...f.register('fondoInicial')} /></Campo>
        <Campo etiqueta="Nota (opcional)" error={err(f, 'nota')} ayuda="p. ej. «Recibí la caja de Carla con S/ 200»."><input maxLength={200} {...f.register('nota')} /></Campo>
      </div>}
    </FormularioModal>
  );
}

export function FormMovimiento({ turno, abierto, alCerrar }: { turno: any; abierto: boolean; alCerrar: () => void }) {
  const e = turno?.resumen.esperado;
  return (
    <FormularioModal abierto={abierto} alCerrar={alCerrar} titulo="Ingreso o retiro de efectivo" esquema={movimientoCajaSchema} boton="Registrar"
      valores={{ tipo: 'Retiro', moneda: 'PEN', monto: '', motivo: '' }} enviar={d => apiPanel(`/gestion/turnos/${turno.id}/movimientos`, { method: 'POST', body: d })}>
      {f => <div className="grid gap-4 sm:grid-cols-2">
        <p className="text-sm text-muted sm:col-span-2">En la caja debería haber <strong className="text-ink">{soles(e?.soles)}</strong>{e?.dolares ? <> y <strong className="text-ink">{dolares(e.dolares)}</strong></> : ''}.
          Registra cada retiro (depósito en la caja fuerte, entrega al administrador) o ingreso (sencillo) para que el arqueo cuadre. No se pueden borrar: si te equivocas, registra el movimiento inverso.</p>
        <Campo etiqueta="Tipo" error={err(f, 'tipo')}><select {...f.register('tipo')}><option value="Retiro">{ETIQUETAS.Retiro}</option><option value="Ingreso">{ETIQUETAS.Ingreso}</option></select></Campo>
        <Campo etiqueta="Moneda" error={err(f, 'moneda')}><select {...f.register('moneda')}><option value="PEN">Soles (S/)</option><option value="USD">Dólares (US$)</option></select></Campo>
        <Campo etiqueta="Monto" error={err(f, 'monto')}><input type="number" step="0.01" min="0.01" inputMode="decimal" {...f.register('monto')} /></Campo>
        <Campo etiqueta="Motivo" error={err(f, 'motivo')}><input maxLength={200} placeholder="p. ej. depósito en la caja fuerte" {...f.register('motivo')} /></Campo>
      </div>}
    </FormularioModal>
  );
}

const BILLETES = DENOMINACIONES_SOLES.filter(d => d >= 10);
const MONEDAS = DENOMINACIONES_SOLES.filter(d => d < 10);
const nombreDenominacion = (d: number) => `S/ ${d < 1 ? d.toFixed(2) : d}`;

/** Arqueo: cuenta la caja (por billetes y monedas o el total) y cierra el turno. Con diferencia se exige una observación. */
export function FormArqueo({ turno, abierto, alCerrar, alCerrado }: { turno: any; abierto: boolean; alCerrar: () => void; alCerrado?: (id: number) => void }) {
  const [detallado, setDetallado] = useState(true);
  const [conteo, setConteo] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(''); const [usd, setUsd] = useState(''); const [obs, setObs] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (abierto) { setDetallado(true); setConteo({}); setTotal(''); setUsd(''); setObs(''); setErrores({}); setGeneral(null); } }, [abierto]);
  if (!turno) return null;
  const e = turno.resumen.esperado;
  const contado = detallado ? sumarDenominaciones(conteo) : Number(total) || 0;
  const difS = redondear(contado - e.soles), difD = redondear((Number(usd) || 0) - e.dolares);
  const conDiferencia = Math.abs(difS) >= 0.005 || Math.abs(difD) >= 0.005;

  const enviar = async () => {
    const v = cerrarTurnoSchema.safeParse({
      denominaciones: detallado ? Object.fromEntries(DENOMINACIONES_SOLES.map(d => [String(d), conteo[String(d)] || 0])) : null,
      contadoSoles: detallado ? contado : total, contadoDolares: usd || 0, observaciones: obs
    });
    setGeneral(null);
    if (!v.success) { const x = primerError(v.error); setErrores({ [x.campo ?? 'contadoSoles']: x.mensaje }); return; }
    if (conDiferencia && !v.data.observaciones) { setErrores({ observaciones: 'Explica el motivo de la diferencia.' }); return; }
    setErrores({}); setEnviando(true);
    try {
      const x = await apiPanel(`/gestion/turnos/${turno.id}/cerrar`, { method: 'POST', body: v.data });
      avisar(x.mensaje, conDiferencia ? 'warn' : 'ok');
      alCerrar(); refrescar(); alCerrado?.(x.id);
    } catch (er) { const a = er as ApiError; if (a.campo) setErrores({ [a.campo]: a.message }); else setGeneral(a.message); }
    finally { setEnviando(false); }
  };

  const denominacion = (d: number) => {
    const k = String(d), n = Number(conteo[k]) || 0;
    return (
      <Campo key={k} etiqueta={nombreDenominacion(d)} error={errores[`denominaciones.${k}`]} ayuda={n ? `= ${soles(d * n)}` : undefined}>
        <input type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={conteo[k] ?? ''} onChange={x => setConteo(c => ({ ...c, [k]: x.target.value }))} />
      </Campo>
    );
  };
  const leyenda = 'mb-2 text-xs font-medium uppercase tracking-[0.14em] text-gold-dark';
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo={`Cerrar turno N.° ${turno.id}: arqueo`} ancho="max-w-4xl"
      pie={<><BotonP variante="claro" onClick={alCerrar}>Cancelar</BotonP><BotonP disabled={enviando} onClick={enviar}><Calculator className="size-4" />{enviando ? 'Cerrando…' : 'Cerrar turno'}</BotonP></>}>
      <form onSubmit={x => { x.preventDefault(); enviar(); }} noValidate>
        <AlertaForm texto={general} />
        <p className="mb-4 text-sm text-muted">Cuenta todo el efectivo de la caja, incluido el fondo inicial. Al cerrar ya no podrás registrar cobros en este turno ni cambiar el arqueo.</p>
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="grid gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-ocean" checked={detallado} onChange={x => setDetallado(x.target.checked)} />Contar por billetes y monedas</label>
            {detallado ? <>
              <fieldset><legend className={leyenda}>Billetes</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{BILLETES.map(denominacion)}</div></fieldset>
              <fieldset><legend className={leyenda}>Monedas</legend><div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{MONEDAS.map(denominacion)}</div></fieldset>
              {errores.contadoSoles && <p role="alert" className="text-xs text-bad">{errores.contadoSoles}</p>}
            </> : <Campo etiqueta="Efectivo contado en soles (S/)" error={errores.contadoSoles}>
              <input type="number" step="0.01" min="0" inputMode="decimal" value={total} onChange={x => setTotal(x.target.value)} /></Campo>}
            <Campo etiqueta="Dólares contados (US$)" error={errores.contadoDolares} ayuda={e.dolares ? `Deberían ser ${dolares(e.dolares)}.` : 'Déjalo vacío si no hay dólares en la caja.'}>
              <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" value={usd} onChange={x => setUsd(x.target.value)} /></Campo>
            <Campo etiqueta={conDiferencia ? 'Observaciones (obligatorias: explica la diferencia)' : 'Observaciones (opcional)'} error={errores.observaciones}>
              <textarea rows={2} className="!h-auto py-2" maxLength={500} value={obs} onChange={x => setObs(x.target.value)} /></Campo>
          </div>
          <aside aria-live="polite" aria-label="Resumen del arqueo" className="grid h-fit gap-3 rounded-xl border border-line bg-[#FAF8F4] p-4 text-sm">
            <DesgloseEfectivo turno={turno} />
            <div className="grid gap-1 border-t border-line pt-3">
              <div className="flex justify-between"><span>Contado</span><span className="tabular-nums">{soles(contado)}</span></div>
              <div className="flex justify-between"><span>Diferencia</span><Diferencia valor={difS} /></div>
              {(e.dolares !== 0 || Number(usd) > 0) && <div className="flex justify-between"><span>Diferencia en dólares</span><Diferencia valor={difD} moneda="USD" /></div>}
            </div>
          </aside>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Vistas ---------- */
const Dato = ({ etiqueta, valor, sub, destacado = false }: { etiqueta: string; valor: React.ReactNode; sub?: React.ReactNode; destacado?: boolean }) => (
  <div className={`rounded-xl p-3 ${destacado ? 'bg-gold-soft' : 'bg-[#FAF8F4]'}`}>
    <p className="text-xs text-muted">{etiqueta}</p><p className="text-lg font-medium text-ocean tabular-nums">{valor}</p>{sub && <p className="text-xs text-muted">{sub}</p>}
  </div>
);

/** Turno de caja del usuario en la pantalla «Caja y pagos»: abrirlo, registrar retiros e ingresos y cerrarlo con el arqueo. */
export function MiTurno() {
  const router = useRouter();
  const { turno, cargado } = useTurno();
  const abrir = useAbrirTurno(s => s.abrir);
  const [movimiento, setMovimiento] = useState(false);
  const [arqueo, setArqueo] = useState(false);
  if (!cargado) return <div className="mb-4 h-32 animate-pulse rounded-2xl border border-line bg-white" aria-hidden />;
  if (!turno) return (
    <section aria-label="Mi turno de caja" className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-gold bg-gold-soft p-5 print:hidden">
      <div className="flex items-start gap-3"><Vault className="mt-0.5 size-6 shrink-0 text-gold-dark" aria-hidden />
        <div><h2 className="font-medium">No tienes un turno de caja abierto</h2>
          <p className="text-sm text-muted">Ábrelo con el fondo inicial para registrar cobros. Al terminar, cuenta la caja y ciérralo con el arqueo.</p></div></div>
      <BotonP variante="oro" onClick={abrir}><LockKeyholeOpen className="size-4" />Abrir turno</BotonP>
    </section>
  );
  const r = turno.resumen;
  const largo = horasAbierto(turno) >= HORAS_TURNO_LARGO;
  return (
    <section aria-label="Mi turno de caja" className="mb-4 rounded-2xl border border-line bg-white p-5 print:hidden">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 font-medium"><Vault className="size-4 text-gold-dark" aria-hidden />Mi turno de caja N.° {turno.id}<Estado valor="Abierto" /></h2>
          <p className="text-sm text-muted">Desde el {fechaHora(turno.fechaApertura)}{turno.notaApertura ? ` · ${turno.notaApertura}` : ''}</p>
          {largo && <p className="mt-1 text-sm text-warn">Lleva más de {HORAS_TURNO_LARGO} h abierto: ciérralo con el arqueo al terminar tu turno.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <BotonP variante="claro" onClick={() => setMovimiento(true)}><ArrowLeftRight className="size-4" />Ingreso o retiro</BotonP>
          <Link href={`/panel/caja/turnos/${turno.id}`} className="inline-flex min-h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-medium hover:bg-sand">Ver detalle</Link>
          <BotonP onClick={() => setArqueo(true)}><Calculator className="size-4" />Cerrar turno</BotonP>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato etiqueta="Fondo inicial" valor={soles(turno.fondoInicial)} />
        <Dato etiqueta="Efectivo esperado en caja" valor={soles(r.esperado.soles)} sub={r.esperado.dolares ? `y ${dolares(r.esperado.dolares)}` : undefined} destacado />
        <Dato etiqueta="Cobrado en el turno" valor={soles(r.cobrado)} sub={`${r.pagos} pago(s), todos los medios`} />
        <Dato etiqueta="Retiros de efectivo" valor={soles(r.retiros.soles)} sub={r.ingresos.soles ? `Ingresos: ${soles(r.ingresos.soles)}` : undefined} />
      </div>
      <CobrosPorMetodo turno={turno} />
      <FormMovimiento turno={turno} abierto={movimiento} alCerrar={() => setMovimiento(false)} />
      <FormArqueo turno={turno} abierto={arqueo} alCerrar={() => setArqueo(false)} alCerrado={id => router.push(`/panel/caja/turnos/${id}`)} />
    </section>
  );
}

/** Indicador del encabezado: turno abierto o aviso para abrirlo. */
export function TurnoChip() {
  const { turno, cargado } = useTurno();
  if (!cargado) return <span className="ml-auto" aria-hidden />;
  return (
    <Link href="/panel/caja" title={turno ? `Efectivo esperado: ${soles(turno.resumen.esperado.soles)}` : 'Abre tu turno de caja para registrar cobros'}
      className={`ml-auto hidden items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm md:flex ${turno ? 'border-ok/30 bg-ok-bg text-ok' : 'border-line bg-white text-muted hover:bg-sand'}`}>
      <Vault className="size-4" aria-hidden />{turno ? `Turno de caja N.° ${turno.id}` : 'Sin turno de caja'}
    </Link>
  );
}

/** Aviso dentro de un cobro o una devolución en efectivo cuando falta el turno. */
export function AvisoTurno({ texto }: { texto: string }) {
  const abrir = useAbrirTurno(s => s.abrir);
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn">
      <span>{texto}</span><BotonP variante="oro" className="!min-h-8" onClick={abrir}><LockKeyholeOpen className="size-4" />Abrir turno</BotonP>
    </div>
  );
}
