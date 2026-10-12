'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, Hourglass, MailCheck, MailX, RotateCcw, Server } from 'lucide-react';
import { ETIQUETAS, hoyLima, sumarDias } from '@marea/shared';
import { fechaHora } from '@/lib/formato';
import { apiPanel, refrescar } from '@/stores/sesion';
import { avisar } from '@/stores/avisos';
import { BotonP, Cabecera, Cargando, Estado, Kpi, Modal, useDatos } from '@/components/panel/base';
import { Tabla, columnas } from '@/components/panel/tabla';
import { useFicha } from '@/components/panel/reservas';

const TIPOS = ['confirmacion', 'cancelacion', 'pago', 'devolucion', 'recordatorio', 'encuesta', 'comprobante', 'reclamo_constancia', 'reclamo_respuesta'];

export default function Pagina() {
  return <Suspense fallback={<Cargando />}><Correos /></Suspense>;
}

/** Bandeja de salida: qué correos salieron, cuáles fallaron y por qué; vista previa y reintentos. */
function Correos() {
  const params = useSearchParams();
  const hoy = hoyLima();
  const [desde, setDesde] = useState(sumarDias(hoy, -6)); const [hasta, setHasta] = useState(hoy);
  const [estado, setEstado] = useState(params.get('estado') ?? ''); const [tipo, setTipo] = useState('');
  const [buscar, setBuscar] = useState(''); const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(buscar.trim()), 350); return () => clearTimeout(t); }, [buscar]);
  useEffect(() => { const e = params.get('estado'); if (e !== null) setEstado(e); }, [params]);   // enlaces de la campana
  // Los fallidos se buscan en todo el historial (pueden ser de días anteriores)
  const rango = estado === 'Fallido' ? { desde: sumarDias(hoy, -365), hasta: hoy } : { desde, hasta };
  const qs = new URLSearchParams(Object.entries({ ...rango, estado, tipo, buscar: q }).filter(([, v]) => v)).toString();
  const { datos } = useDatos<any[]>(`/gestion/correos?${qs}`);
  const { datos: r } = useDatos<any>('/gestion/correos/resumen');
  const abrir = useFicha(s => s.abrir);
  const [ver, setVer] = useState<any>(null);
  const accion = async (ruta: string) => {
    try { const x = await apiPanel(ruta, { method: 'POST', body: {} }); avisar(x.mensaje); refrescar(); } catch (e: any) { avisar(e.message, 'error'); }
  };
  const c = columnas<any>();
  const cols = [
    c.accessor('fechaCreacion', { header: 'Fecha', cell: i => <span className="whitespace-nowrap">{fechaHora(i.getValue())}</span> }),
    c.accessor('tipo', { header: 'Tipo', cell: i => ETIQUETAS[i.getValue()] ?? i.getValue() }),
    c.accessor('para', { header: 'Para', cell: i => <>{i.getValue()}<span className="block max-w-72 truncate text-xs text-muted">{i.row.original.asunto}</span></> }),
    c.accessor(x => x.codigoReserva ?? x.numeroReclamo, { id: 'origen', header: 'Origen', cell: i => i.row.original.codigoReserva
      ? <button className="font-mono font-semibold text-ocean underline decoration-gold" onClick={e => { e.stopPropagation(); abrir(i.row.original.codigoReserva); }}>{i.row.original.codigoReserva}</button>
      : i.row.original.numeroReclamo ? `Reclamo ${i.row.original.numeroReclamo}` : '—' }),
    c.accessor('estado', { header: 'Estado', cell: i => <><Estado valor={i.getValue()} />{i.row.original.error && <span className="block max-w-64 text-xs text-bad">{i.row.original.error}</span>}
      {i.row.original.estado === 'Pendiente' && i.row.original.intentos > 0 && <span className="block text-xs text-muted">Intento {i.row.original.intentos} de 5 · próximo {fechaHora(i.row.original.proximoIntento)}</span>}</> }),
    c.display({ id: 'acciones', header: () => <span className="sr-only">Acciones</span>, cell: i => <span className="flex gap-1">
      <button onClick={e => { e.stopPropagation(); apiPanel(`/gestion/correos/${i.row.original.id}`).then(setVer).catch(x => avisar(x.message, 'error')); }} title="Vista previa" aria-label={`Ver el correo a ${i.row.original.para}`} className="grid size-8 place-items-center rounded-lg hover:bg-sand"><Eye className="size-4" /></button>
      {i.row.original.estado === 'Fallido' && <button onClick={e => { e.stopPropagation(); accion(`/gestion/correos/${i.row.original.id}/reintentar`); }} title="Reintentar" aria-label={`Reintentar el correo a ${i.row.original.para}`} className="grid size-8 place-items-center rounded-lg hover:bg-sand"><RotateCcw className="size-4" /></button>}
    </span> })
  ];
  const sel = 'h-10 rounded-lg border border-[#D9D6CE] bg-white px-2 text-sm';
  return (
    <>
      <Cabecera titulo="Correos" sub="Bandeja de salida de los correos automáticos al huésped y al consumidor.">
        {!!r?.fallidos && <BotonP onClick={() => accion('/gestion/correos/reintentar-fallidos')}><RotateCcw className="size-4" />Reintentar {r.fallidos} fallido(s)</BotonP>}
      </Cabecera>
      {r && <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icono={MailX} tono={r.fallidos ? 'bad' : 'ok'} etiqueta="Fallidos" valor={r.fallidos} sub="Tras 5 intentos; revisa la dirección o el SMTP" />
        <Kpi icono={Hourglass} tono={r.atrasados ? 'warn' : 'ok'} etiqueta="Pendientes" valor={r.pendientes} sub={r.atrasados ? `${r.atrasados} con más de 30 min en cola` : 'En cola de envío'} />
        <Kpi icono={MailCheck} tono="ok" etiqueta="Enviados (24 h)" valor={r.enviados24h} sub={r.ultimoEnvio ? `Último: ${fechaHora(r.ultimoEnvio)}` : 'Sin envíos aún'} />
        <Kpi icono={Server} tono={r.smtp ? 'info' : 'warn'} etiqueta="Servidor de correo" valor={r.smtp ? 'SMTP' : 'Simulado'} sub={r.smtp ?? 'Sin SMTP_HOST: los correos no salen'} />
      </div>}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4">
        <label className="grid gap-1 text-xs text-muted">Desde<input type="date" className={sel} value={desde} disabled={estado === 'Fallido'} onChange={e => setDesde(e.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted">Hasta<input type="date" className={sel} value={hasta} disabled={estado === 'Fallido'} onChange={e => setHasta(e.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted">Estado<select className={sel} value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="">Todos</option>{['Pendiente', 'Enviado', 'Simulado', 'Fallido'].map(x => <option key={x} value={x}>{ETIQUETAS[x]}</option>)}</select></label>
        <label className="grid gap-1 text-xs text-muted">Tipo<select className={sel} value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Todos</option>{TIPOS.map(x => <option key={x} value={x}>{ETIQUETAS[x]}</option>)}</select></label>
        <label className="grid min-w-52 flex-1 gap-1 text-xs text-muted">Buscar<input className={sel} value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Correo, asunto, reserva o N.° de hoja…" /></label>
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Correos">
        {!datos ? <Cargando /> : <Tabla etiqueta="correos" datos={datos} columnas={cols} buscador={false} porPagina={30} vacio="No hay correos con esos filtros."
          csv={{ nombre: `correos-${rango.desde}-${rango.hasta}.csv`, encabezados: ['Fecha', 'Tipo', 'Para', 'Asunto', 'Estado', 'Intentos', 'Error', 'Reserva', 'Reclamo'],
            filas: x => [x.fechaCreacion, x.tipo, x.para, x.asunto, x.estado, x.intentos, x.error, x.codigoReserva, x.numeroReclamo] }} />}
      </section>
      <Modal abierto={!!ver} alCerrar={() => setVer(null)} titulo="Vista previa del correo" ancho="max-w-3xl" pie={<BotonP onClick={() => setVer(null)}>Cerrar</BotonP>}>
        {ver && <div className="grid gap-3 text-sm">
          <p><strong>Para:</strong> {ver.para} · <strong>Asunto:</strong> {ver.asunto}</p>
          {/* Sin permisos (sandbox vacío): el HTML del correo no puede ejecutar código en el panel */}
          <iframe title="Contenido del correo" sandbox="" srcDoc={ver.html} className="h-[60vh] w-full rounded-lg border border-line bg-white" />
        </div>}
      </Modal>
    </>
  );
}
