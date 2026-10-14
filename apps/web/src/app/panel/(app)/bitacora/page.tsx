'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ENTIDADES_BITACORA, hoyLima, sumarDias } from '@marea/shared';
import { fechaHora } from '@/lib/formato';
import { BotonP, Cabecera, Cargando, ErrorCarga, Modal, useDatos } from '@/components/panel/base';
import { Tabla, columnas } from '@/components/panel/tabla';
import { useFicha } from '@/components/panel/reservas';

const ENTIDAD: Record<string, string> = { reserva: 'Reserva', pago: 'Pago', turno: 'Turno de caja', cliente: 'Cliente', habitacion: 'Habitación', mantenimiento: 'Mantenimiento', tipo: 'Tipo y tarifa', usuario: 'Usuario',
  reclamo: 'Reclamo', comprobante: 'Comprobante', correo: 'Correo', sesion: 'Sesión' };
const esCambio = (v: any) => v && typeof v === 'object' && 'antes' in v && 'despues' in v;
const texto = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Bitácora de auditoría: solo lectura y solo para administradores. */
export default function Bitacora() {
  const hoy = hoyLima();
  const [desde, setDesde] = useState(sumarDias(hoy, -6)); const [hasta, setHasta] = useState(hoy);
  const [usuarioId, setUsuarioId] = useState(''); const [entidad, setEntidad] = useState(''); const [buscar, setBuscar] = useState(''); const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(buscar.trim()), 350); return () => clearTimeout(t); }, [buscar]);
  const qs = new URLSearchParams(Object.entries({ desde, hasta, usuarioId, entidad, buscar: q, limite: '2000' }).filter(([, v]) => v)).toString();
  const { datos, error, cargando, recargar } = useDatos<any[]>(`/gestion/bitacora?${qs}`);
  const { datos: usuarios } = useDatos<any[]>('/gestion/usuarios');
  const abrir = useFicha(s => s.abrir);
  const [ver, setVer] = useState<any>(null);
  const c = columnas<any>();
  const cols = [
    c.accessor('fecha', { header: 'Fecha', cell: i => <span className="whitespace-nowrap">{fechaHora(i.getValue())}</span> }),
    c.accessor('usuario', { header: 'Usuario', cell: i => <>{i.getValue()}{i.row.original.ip && <span className="block text-xs text-muted">IP {i.row.original.ip}</span>}</> }),
    c.accessor('accion', { header: 'Acción', cell: i => <code className="text-xs">{i.getValue()}</code> }),
    c.accessor('entidadId', { header: 'Registro', cell: i => { const e = i.row.original; return e.entidad === 'reserva' && e.entidadId
      ? <button className="font-mono font-semibold text-ocean underline decoration-gold" onClick={x => { x.stopPropagation(); abrir(e.entidadId); }}>{e.entidadId}</button>
      : e.entidad === 'turno' && e.entidadId ? <Link href={`/panel/caja/turnos/${e.entidadId}`} onClick={x => x.stopPropagation()} className="text-ocean underline decoration-gold">Turno N.° {e.entidadId}</Link>
      : e.entidad === 'mantenimiento' && e.entidadId ? <Link href={`/panel/mantenimiento?orden=${e.entidadId}`} onClick={x => x.stopPropagation()} className="text-ocean underline decoration-gold">Orden N.° {e.entidadId}</Link>
      : <>{ENTIDAD[e.entidad] ?? e.entidad}{e.entidadId && <span className="block text-xs text-muted">{e.entidadId}</span>}</>; } }),
    c.accessor('descripcion', { header: 'Descripción', cell: i => <span className="line-clamp-2 max-w-xl">{i.getValue()}</span> })
  ];
  const sel = 'h-10 rounded-lg border border-[#D9D6CE] bg-white px-2 text-sm';
  return (
    <>
      <Cabecera titulo="Bitácora de auditoría" sub="Quién hizo qué, cuándo y desde qué IP. Los registros no se pueden modificar ni borrar." />
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4">
        <label className="grid gap-1 text-xs text-muted">Desde<input type="date" className={sel} value={desde} onChange={e => setDesde(e.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted">Hasta<input type="date" className={sel} value={hasta} onChange={e => setHasta(e.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted">Usuario<select className={sel} value={usuarioId} onChange={e => setUsuarioId(e.target.value)}>
          <option value="">Todos</option>{usuarios?.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label>
        <label className="grid gap-1 text-xs text-muted">Tipo de registro<select className={sel} value={entidad} onChange={e => setEntidad(e.target.value)}>
          <option value="">Todos</option>{ENTIDADES_BITACORA.map(x => <option key={x} value={x}>{ENTIDAD[x]}</option>)}</select></label>
        <label className="grid min-w-52 flex-1 gap-1 text-xs text-muted">Buscar<input className={sel} value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Código, acción, descripción…" /></label>
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Registros de la bitácora">
        {error ? <ErrorCarga mensaje={error} recargar={recargar} cargando={cargando} /> : !datos ? <Cargando /> : <Tabla etiqueta="bitácora" datos={datos} columnas={cols} alFila={setVer} porPagina={30} buscador={false} vacio="Sin registros con esos filtros."
          csv={{ nombre: `bitacora-${desde}-${hasta}.csv`, encabezados: ['Fecha', 'Usuario', 'IP', 'Acción', 'Entidad', 'Registro', 'Descripción', 'Datos'],
            filas: e => [e.fecha, e.usuario, e.ip, e.accion, e.entidad, e.entidadId, e.descripcion, e.datos ? JSON.stringify(e.datos) : ''] }} />}
      </section>
      <p className="mt-3 flex items-start gap-2 text-sm text-muted"><ShieldCheck className="size-4 shrink-0" aria-hidden />Las contraseñas nunca se registran: solo consta que fueron restablecidas.</p>
      <Modal abierto={!!ver} alCerrar={() => setVer(null)} titulo="Detalle del registro" ancho="max-w-2xl" pie={<BotonP onClick={() => setVer(null)}>Cerrar</BotonP>}>
        {ver && <div className="grid gap-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            {[['Fecha', fechaHora(ver.fecha)], ['Usuario', ver.usuario], ['Acción', ver.accion], ['Registro', `${ENTIDAD[ver.entidad] ?? ver.entidad} ${ver.entidadId ?? ''}`], ['IP', ver.ip ?? '—']].map(([k, v]) =>
              <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium break-all">{v}</dd></div>)}
            <div className="sm:col-span-2"><dt className="text-xs text-muted">Descripción</dt><dd>{ver.descripcion}</dd></div>
          </dl>
          {ver.datos && (Object.values(ver.datos).some(esCambio) ? (
            <table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-xs text-muted"><th className="py-1.5">Campo</th><th>Antes</th><th>Después</th></tr></thead>
              <tbody>{Object.entries(ver.datos).filter(([, v]) => esCambio(v)).map(([k, v]: [string, any]) =>
                <tr key={k} className="border-b border-[#EFEDE7]"><td className="py-1.5 font-medium">{k}</td><td className="text-bad">{texto(v.antes)}</td><td className="text-ok">{texto(v.despues)}</td></tr>)}</tbody></table>
          ) : <pre className="overflow-x-auto rounded-lg bg-sand p-3 text-xs">{JSON.stringify(ver.datos, null, 2)}</pre>)}
        </div>}
      </Modal>
    </>
  );
}
