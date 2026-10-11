'use client';
import { useEffect, useState } from 'react';
import { CheckCheck, Hourglass, OctagonAlert } from 'lucide-react';
import { hoyLima } from '@marea/shared';
import { fechaHora, fechaMedia, soles } from '@/lib/formato';
import { ETIQUETAS } from '@marea/shared';
import { apiPanel, useRefresco, useSesion } from '@/stores/sesion';
import { BotonP, Cabecera, Cargando, Estado, Kpi, Modal, useDatos } from '@/components/panel/base';
import { Tabla, columnas } from '@/components/panel/tabla';
import { FormRespuesta } from '@/components/panel/formularios';

export default function Reclamaciones() {
  const { datos } = useDatos<any[]>('/gestion/reclamaciones');
  const admin = useSesion(s => s.usuario?.rol === 'Administrador');
  const [ver, setVer] = useState<any>(null);
  const [responder, setResponder] = useState<any>(null);
  const [correos, setCorreos] = useState<any[] | null>(null);
  const n = useRefresco(s => s.n);
  useEffect(() => { setCorreos(null); if (ver) apiPanel(`/gestion/reclamaciones/${ver.numero}`).then(x => setCorreos(x.correos)).catch(() => setCorreos([])); }, [ver, n]);
  const hoy = hoyLima();
  if (!datos) return <Cargando />;
  const pend = datos.filter(r => r.estado === 'Pendiente');
  const c = columnas<any>();
  const cols = [
    c.accessor('numero', { header: 'N.°', cell: i => <span className="font-mono font-semibold">{i.getValue()}</span> }),
    c.accessor('fecha', { header: 'Fecha', cell: i => fechaHora(i.getValue()) }), c.accessor('tipo', { header: 'Tipo' }),
    c.accessor('nombreCompleto', { header: 'Consumidor', cell: i => <>{i.getValue()}<span className="block text-xs text-muted">{i.row.original.email}</span></> }),
    c.accessor('fechaLimiteRespuesta', { header: 'Plazo', cell: i => { const v = i.row.original.estado === 'Pendiente' && i.getValue() < hoy; return <span className={v ? 'font-medium text-bad' : ''}>{fechaMedia(i.getValue())}{v && <span className="block text-xs">Vencido</span>}</span>; } }),
    c.accessor('estado', { header: 'Estado', cell: i => <Estado valor={i.getValue()} /> })
  ];
  return (
    <>
      <Cabecera titulo="Libro de Reclamaciones" sub="Plazo legal de respuesta: 15 días hábiles (Ley N.° 29571)." />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Kpi icono={Hourglass} tono={pend.length ? 'warn' : 'ok'} etiqueta="Pendientes" valor={pend.length} />
        <Kpi icono={OctagonAlert} tono={pend.some(r => r.fechaLimiteRespuesta < hoy) ? 'bad' : 'ok'} etiqueta="Vencidas" valor={pend.filter(r => r.fechaLimiteRespuesta < hoy).length} />
        <Kpi icono={CheckCheck} tono="ok" etiqueta="Respondidas" valor={datos.length - pend.length} />
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="Hojas de reclamación"><Tabla etiqueta="reclamaciones" datos={datos} columnas={cols} alFila={setVer} vacio="No hay hojas de reclamación." /></section>
      <Modal abierto={!!ver} alCerrar={() => setVer(null)} titulo={`${ver?.tipo ?? ''} N.° ${ver?.numero ?? ''}`} ancho="max-w-2xl"
        pie={<><BotonP variante="claro" onClick={() => setVer(null)}>Cerrar</BotonP>{admin && ver?.estado === 'Pendiente' && <BotonP onClick={() => { setResponder(ver); setVer(null); }}>Responder</BotonP>}</>}>
        {ver && <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {[['Fecha', fechaHora(ver.fecha)], ['Plazo de respuesta', fechaMedia(ver.fechaLimiteRespuesta)], ['Consumidor', ver.nombreCompleto], ['Documento', `${ver.tipoDocumento} ${ver.numeroDocumento}`],
            ['Contacto', `${ver.telefono} · ${ver.email}`], ['Domicilio', ver.domicilio], ['Bien contratado', `${ver.bienTipo}: ${ver.descripcionBien}`], ['Monto reclamado', ver.montoReclamado != null ? soles(ver.montoReclamado) : '—'],
            ...(ver.esMenor ? [['Apoderado', ver.apoderado]] : []), ...(ver.codigoReserva ? [['Reserva', ver.codigoReserva]] : [])].map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          <div className="sm:col-span-2"><dt className="text-xs text-muted">Detalle</dt><dd className="whitespace-pre-line">{ver.detalle}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-muted">Pedido</dt><dd className="whitespace-pre-line">{ver.pedido}</dd></div>
          {ver.respuesta && <div className="rounded-lg bg-ok-bg p-3 sm:col-span-2"><dt className="text-xs text-ok">Respuesta · {fechaHora(ver.fechaRespuesta)}</dt><dd className="whitespace-pre-line">{ver.respuesta}</dd></div>}
          <div className="sm:col-span-2"><dt className="text-xs text-muted">Correos al consumidor</dt><dd>{!correos ? '…' : correos.length ? <ul className="mt-1 grid gap-1">{correos.map(c =>
            <li key={c.id} className="flex items-center justify-between gap-2"><span>{ETIQUETAS[c.tipo] ?? c.tipo} · {c.para}<span className="block text-xs text-muted">{fechaHora(c.fechaEnvio ?? c.fechaCreacion)}</span></span><Estado valor={c.estado} /></li>)}</ul> : 'Sin correos (hoja anterior a los correos automáticos).'}</dd></div>
          {!admin && ver.estado === 'Pendiente' && <p className="text-muted sm:col-span-2">Solo un administrador puede responder.</p>}
        </dl>}
      </Modal>
      <FormRespuesta r={responder} abierto={!!responder} alCerrar={() => setResponder(null)} />
    </>
  );
}
