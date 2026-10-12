'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BarChart3, Bell, BellRing, CalendarRange, ChevronDown, DoorOpen, ExternalLink, HelpCircle, Hourglass, LayoutDashboard, LogOut, Mail, Menu, NotebookText, ReceiptText, ScrollText, Search, Tags, UserCog, Users, Wallet, X } from 'lucide-react';
import { hoyLima } from '@marea/shared';
import { iniciales } from '@/lib/formato';
import { apiPanel, useRefresco, useSesion } from '@/stores/sesion';
import { DialogoConfirmacion, Estado, Modal, BotonP } from '@/components/panel/base';
import { FichaReserva, FormularioNuevaReserva, FormularioPago, useFicha } from '@/components/panel/reservas';
import { Emblema } from '@/components/logo';
import { FormAbrirTurno, horasAbierto, TurnoChip } from '@/components/panel/caja';

const MINUTOS_INACTIVIDAD = Number(process.env.NEXT_PUBLIC_PANEL_INACTIVIDAD_MIN || 30);
const MENU = [
  { grupo: 'General', items: [['/panel/dashboard', 'Dashboard', LayoutDashboard], ['/panel/recepcion', 'Recepción', BellRing]] },
  { grupo: 'Operación', items: [['/panel/reservas', 'Reservas', CalendarRange], ['/panel/habitaciones', 'Habitaciones', DoorOpen], ['/panel/clientes', 'Clientes', Users], ['/panel/caja', 'Caja y pagos', Wallet], ['/panel/comprobantes', 'Comprobantes', ReceiptText], ['/panel/reclamaciones', 'Reclamaciones', NotebookText], ['/panel/correos', 'Correos', Mail]] },
  { grupo: 'Administración', admin: true, items: [['/panel/reportes', 'Reportes', BarChart3], ['/panel/tarifas', 'Tipos y tarifas', Tags], ['/panel/usuarios', 'Usuarios', UserCog], ['/panel/bitacora', 'Bitácora', ScrollText]] }
] as const;
const SOLO_ADMIN = ['/panel/reportes', '/panel/tarifas', '/panel/usuarios', '/panel/bitacora'];

export default function LayoutPanel({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ruta = usePathname();
  const { token, usuario, salir } = useSesion();
  const [hidratado, setHidratado] = useState(false);
  const [menu, setMenu] = useState(false);
  const [guia, setGuia] = useState(false);
  const admin = usuario?.rol === 'Administrador';

  useEffect(() => {
    const listo = () => setHidratado(true);
    if (useSesion.persist.hasHydrated()) listo();
    return useSesion.persist.onFinishHydration(listo);
  }, []);
  useEffect(() => { if (hidratado && (!token || usuario?.debeCambiarClave)) router.replace('/panel'); }, [hidratado, token, usuario, router]);
  useEffect(() => { setMenu(false); useFicha.getState().cerrar(); }, [ruta]);

  if (!hidratado || !token || !usuario) return <div className="grid min-h-screen place-items-center" role="status"><span className="size-8 animate-spin rounded-full border-2 border-line border-t-ocean" /><span className="sr-only">Cargando…</span></div>;
  const prohibida = SOLO_ADMIN.some(r => ruta.startsWith(r)) && !admin;

  return (
    <div className="min-h-screen bg-[#F3F4F1] text-[0.95rem]">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[300] focus:bg-ocean focus:p-3 focus:text-white">Saltar al contenido</a>
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 print:hidden flex-col bg-ocean-3 text-[#C9D6D9] transition-transform lg:translate-x-0 ${menu ? 'translate-x-0 shadow-[0_0_0_100vmax_rgba(0,0,0,.35)]' : '-translate-x-full'}`} aria-label="Menú principal">
        <div className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
          <Emblema className="size-10 shrink-0" mini />
          <span className="font-serif text-lg uppercase leading-none tracking-[0.1em] text-white">Marea Alta<span className="block font-sans text-[0.6rem] tracking-[0.3em] text-gold">Gestión</span></span>
          <button className="ml-auto lg:hidden" onClick={() => setMenu(false)} aria-label="Cerrar menú"><X /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {MENU.filter(g => !('admin' in g) || admin).map(g => (
            <div key={g.grupo}><p className="px-3 pb-1.5 pt-4 text-[0.64rem] uppercase tracking-[0.2em] text-[#8AA3AA]">{g.grupo}</p>
              {g.items.map(([href, t, I]) => { const activo = ruta.startsWith(href); return (
                <Link key={href} href={href} aria-current={activo ? 'page' : undefined}
                  className={`relative mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 ${activo ? 'bg-gold/15 text-white before:absolute before:-left-3 before:inset-y-2 before:w-[3px] before:rounded-r before:bg-gold' : 'hover:bg-white/5 hover:text-white'}`}>
                  <I className={`size-[18px] ${activo ? 'text-gold' : 'text-[#8BA5AC]'}`} aria-hidden />{t}</Link>); })}
            </div>))}
        </nav>
        <Link href="/" target="_blank" className="flex items-center gap-2 border-t border-white/5 px-5 py-4 text-sm text-[#8BA5AC] hover:text-white"><ExternalLink className="size-4" />Ver web del hotel</Link>
      </aside>

      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur lg:ml-64 lg:px-7 print:hidden">
        <button className="grid size-10 place-items-center rounded-lg border border-line lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menú"><Menu className="size-5" /></button>
        <Buscador />
        <TurnoChip />
        <span className="hidden text-sm capitalize text-muted xl:block">{new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <button className="grid size-10 place-items-center rounded-lg border border-line bg-white hover:bg-sand" onClick={() => setGuia(true)} aria-label="Guía rápida" title="Guía rápida"><HelpCircle className="size-5" /></button>
        <Alertas />
        <MenuUsuario nombre={usuario.nombre} rol={usuario.rol} salir={() => salir()} />
      </header>

      <main id="contenido" tabIndex={-1} className="p-4 outline-none lg:ml-64 lg:p-7 print:ml-0 print:p-0">
        {prohibida ? <div className="rounded-2xl border border-line bg-white p-10 text-center text-muted">Esta sección es solo para administradores.</div> : children}
      </main>

      <FichaReserva /><FormularioPago /><FormularioNuevaReserva /><FormAbrirTurno /><DialogoConfirmacion />
      <Guia abierto={guia} alCerrar={() => setGuia(false)} admin={admin} />
      <Inactividad alExpirar={() => salir('inactividad')} />
    </div>
  );
}

function MenuUsuario({ nombre, rol, salir }: { nombre: string; rol: string; salir: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false); }; document.addEventListener('click', f); return () => document.removeEventListener('click', f); }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAbierto(a => !a)} aria-expanded={abierto} aria-haspopup="menu" className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3">
        <span className="grid size-8 place-items-center rounded-full bg-ocean text-xs font-medium text-white">{iniciales(nombre)}</span>
        <span className="hidden text-left leading-tight md:block"><span className="block text-sm font-medium">{nombre}</span><span className="text-xs text-muted">{rol}</span></span>
        <ChevronDown className="size-4 text-muted" aria-hidden />
      </button>
      {abierto && <div role="menu" className="absolute right-0 mt-2 w-52 rounded-xl border border-line bg-white p-1 shadow-xl">
        <Link role="menuitem" href="/panel/perfil" className="block rounded-lg px-3 py-2 text-sm hover:bg-sand" onClick={() => setAbierto(false)}>Mi cuenta</Link>
        <button role="menuitem" onClick={salir} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-bad hover:bg-bad-bg"><LogOut className="size-4" />Cerrar sesión</button>
      </div>}
    </div>
  );
}

/** Buscador global de reservas y clientes (atajo: tecla /). */
function Buscador() {
  const router = useRouter();
  const abrir = useFicha(s => s.abrir);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ reservas: any[]; clientes: any[] } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const f = (e: KeyboardEvent) => { const t = document.activeElement?.tagName; if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t ?? '') && !document.querySelector('dialog[open]')) { e.preventDefault(); ref.current?.focus(); } };
    document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f);
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(async () => {
      const [reservas, clientes] = await Promise.all([apiPanel(`/gestion/reservas?limite=5&buscar=${encodeURIComponent(q.trim())}`), apiPanel(`/gestion/clientes?limite=5&buscar=${encodeURIComponent(q.trim())}`)]).catch(() => [[], []]);
      setRes({ reservas, clientes });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const limpiar = () => { setQ(''); setRes(null); };
  const items = res ? [...res.reservas.map(r => ({ k: 'r' + r.codigo, ir: () => abrir(r.codigo), t: <><b className="font-mono">{r.codigo}</b> · {r.cliente}<span className="block text-xs text-muted">{r.habitacion} · {r.fechaEntrada} → {r.fechaSalida}</span></>, e: r.estado })),
    ...res.clientes.map(c => ({ k: 'c' + c.id, ir: () => router.push(`/panel/clientes/${c.id}`), t: <><b>{c.nombres} {c.apellidos}</b><span className="block text-xs text-muted">{c.tipoDocumento} {c.numeroDocumento} · {c.email}</span></>, e: null }))] : [];
  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar reserva o cliente…" aria-label="Buscar reserva o cliente (atajo: tecla /)"
        role="combobox" aria-expanded={!!res} aria-controls="buscador-res" autoComplete="off"
        onKeyDown={e => { if (e.key === 'Escape') limpiar(); if (e.key === 'Enter' && items[0]) { e.preventDefault(); items[0].ir(); limpiar(); } }}
        className="h-10 w-full rounded-full border border-line bg-[#F7F6F2] pl-9 pr-10 text-sm outline-none focus:border-gold focus:bg-white" />
      <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-white px-1.5 text-xs text-muted xl:block">/</kbd>
      {res && <div id="buscador-res" role="listbox" className="absolute left-0 top-12 z-50 w-[min(460px,92vw)] rounded-xl border border-line bg-white p-1.5 shadow-xl">
        {items.length ? items.map(i => <button key={i.k} role="option" aria-selected={false} type="button" onClick={() => { i.ir(); limpiar(); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-gold-soft focus:bg-gold-soft focus:outline-none">
          <span>{i.t}</span>{i.e && <Estado valor={i.e} />}</button>) : <p className="px-3 py-3 text-sm text-muted">Sin resultados para «{q}».</p>}
      </div>}
    </div>
  );
}

/** Campana de alertas operativas. */
function Alertas() {
  const n = useRefresco(s => s.n);
  const [items, setItems] = useState<[number, string, string][]>([]);
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    const cargar = () => Promise.all([apiPanel('/gestion/recepcion'), apiPanel('/gestion/reclamaciones?estado=Pendiente'), apiPanel('/gestion/correos/resumen').catch(() => null),
      apiPanel('/gestion/turnos/actual').catch(() => null)]).then(([r, rc, co, tu]: any) => {
      const hoy = hoyLima(); const venc = rc.filter((x: any) => x.fechaLimiteRespuesta < hoy).length;
      const h = tu?.horasTurnoLargo, largo = tu?.turno && horasAbierto(tu.turno) >= h ? 1 : 0;
      setItems(([[largo, `Tu turno de caja lleva más de ${h} h abierto: ciérralo con el arqueo`, '/panel/caja'],
        [tu?.abiertosLargos ?? 0, `${tu?.abiertosLargos} turno(s) de caja de otros usuarios llevan más de ${h} h abiertos`, '/panel/caja?vista=turnos'],
        [tu?.porRevisar ?? 0, `${tu?.porRevisar} arqueo(s) con diferencia por revisar`, '/panel/caja?vista=turnos'],
        [co?.fallidos ?? 0, `${co?.fallidos} correo(s) no se pudieron enviar`, '/panel/correos?estado=Fallido'],
        [co?.atrasados ?? 0, `${co?.atrasados} correo(s) llevan más de 30 min en cola`, '/panel/correos?estado=Pendiente'],
        [r.llegadas.length, `${r.llegadas.length} llegada(s) pendientes de check-in`, '/panel/recepcion'],
        [r.salidas.length, `${r.salidas.length} salida(s) de hoy`, '/panel/recepcion'], [r.limpieza.length, `${r.limpieza.length} habitación(es) por limpiar`, '/panel/habitaciones'],
        [venc, `${venc} reclamo(s) con plazo vencido`, '/panel/reclamaciones'], [rc.length - venc, `${rc.length - venc} reclamo(s) por responder`, '/panel/reclamaciones']] as [number, string, string][]).filter(x => x[0] > 0));
    }).catch(() => {});
    cargar(); const t = setInterval(cargar, 120000); return () => clearInterval(t);
  }, [n]);
  const total = items.reduce((s, x) => s + x[0], 0);
  return (
    <div className="relative">
      <button onClick={() => setAbierto(a => !a)} aria-expanded={abierto} aria-label={total ? `Alertas: ${total} pendientes` : 'Alertas: nada pendiente'} className="relative grid size-10 place-items-center rounded-lg border border-line bg-white hover:bg-sand">
        <Bell className="size-5" />{total > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full border-2 border-white bg-bad px-1 text-[0.65rem] text-white">{total > 99 ? '99+' : total}</span>}
      </button>
      {abierto && <div className="absolute right-0 mt-2 w-80 rounded-xl border border-line bg-white p-2 shadow-xl">
        <p className="px-2 pb-1 text-xs uppercase tracking-[0.14em] text-muted">Pendientes de hoy</p>
        {items.length ? items.map(([, t, h]) => <Link key={t} href={h} onClick={() => setAbierto(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-sand">{t}</Link>)
          : <p className="px-3 py-3 text-sm text-muted">Todo al día. No hay pendientes.</p>}
      </div>}
    </div>
  );
}

/** Cierre de sesión tras X minutos sin actividad (PC compartida de recepción), con aviso previo. */
function Inactividad({ alExpirar }: { alExpirar: () => void }) {
  const ultima = useRef(Date.now());
  const [resta, setResta] = useState<number | null>(null);
  useEffect(() => {
    const limite = MINUTOS_INACTIVIDAD * 60_000, aviso = Math.min(120_000, limite / 2);
    const marcar = () => { ultima.current = Date.now(); };
    const ev = ['mousedown', 'keydown', 'touchstart', 'wheel'];
    ev.forEach(e => document.addEventListener(e, marcar, { passive: true }));
    const t = setInterval(() => {
      const quieto = Date.now() - ultima.current;
      if (quieto >= limite) alExpirar();
      else setResta(quieto >= limite - aviso ? Math.ceil((limite - quieto) / 1000) : null);
    }, 1000);
    return () => { ev.forEach(e => document.removeEventListener(e, marcar)); clearInterval(t); };
  }, [alExpirar]);
  if (resta === null) return null;
  return (
    <div role="alertdialog" aria-live="assertive" aria-label="Aviso de inactividad" className="fixed bottom-6 left-1/2 z-[150] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-xl bg-ocean-3 px-4 py-3 text-white shadow-2xl">
      <Hourglass className="size-5 text-gold" aria-hidden />
      <span>Por seguridad, tu sesión se cerrará en <strong>{Math.floor(resta / 60)}:{String(resta % 60).padStart(2, '0')}</strong> por inactividad.</span>
      <button onClick={() => { ultima.current = Date.now(); setResta(null); }} className="rounded-lg bg-gold-dark px-3 py-1.5 text-sm font-medium">Seguir trabajando</button>
    </div>
  );
}

function Guia({ abierto, alCerrar, admin }: { abierto: boolean; alCerrar: () => void; admin: boolean }) {
  const pasos = [
    ['Al empezar el turno', 'En «Caja y pagos» pulsa «Abrir turno» con el efectivo que recibes (fondo inicial). Luego abre Recepción: llegadas y salidas de hoy, huéspedes en el hotel y habitaciones por limpiar. La campana resume lo pendiente.'],
    ['Check-in', 'En «Llegadas de hoy» pulsa Check-in. Si el huésped es extranjero exonerado de IGV, pide su pasaporte y la Tarjeta Andina de Migración.'],
    ['Cobrar', 'En la ficha de la reserva pulsa Registrar pago. Para Yape, Plin o transferencia anota el N.° de operación en «Referencia». Los cobros en efectivo exigen tu turno de caja abierto.'],
    ['Al terminar el turno', 'Si llevaste efectivo a la caja fuerte, regístralo como retiro. Luego pulsa «Cerrar turno», cuenta billetes y monedas (y dólares, si hay) y explica cualquier diferencia. Imprime el arqueo para entregarlo firmado.'],
    ['Check-out', 'Solo con saldo S/ 0.00. La habitación pasa a «Por limpiar»; márcala como limpia cuando esté lista.'],
    ['Teléfono y walk-in', 'Usa «Nueva reserva» o «Walk-in» (con check-in inmediato). El sistema asigna la habitación y calcula el IGV.'],
    ['Cambio de habitación', 'En la ficha pulsa «Cambiar habitación»: elige una libre, decide si se mantiene o se recalcula la tarifa y anota el motivo. Si el huésped ya está en el hotel, la habitación anterior pasa a «Por limpiar».'],
    ['Comprobante electrónico', 'Con la reserva pagada, en la ficha pulsa «Emitir»: boleta con el documento del huésped o factura con RUC. A los extranjeros exonerados se les emite factura de exportación.'],
    ['Correos', 'La confirmación, la cancelación, los pagos, el recordatorio dos días antes de la llegada, la encuesta tras el check-out y los comprobantes se envían solos. En «Correos» ves los que fallaron (la campana avisa) y puedes reintentarlos.'],
    ['Confirmación en PDF', 'En la ficha de la reserva pulsa PDF para entregar o enviar la confirmación al huésped.'],
    ['Buscar rápido', 'Pulsa la tecla / y escribe un código, nombre, documento o correo.'],
    ['Seguridad', `La sesión se cierra tras ${MINUTOS_INACTIVIDAD} minutos sin actividad. Cada pago y reserva queda registrado con tu nombre.`],
    ...(admin ? [['Reportes y tarifas', 'Ocupación, ADR y RevPAR por periodo. Los cambios de tarifa solo afectan a reservas nuevas.'], ['Usuarios y reclamos', 'Crea cuentas con contraseña temporal. Responde los reclamos dentro de 15 días hábiles: la respuesta se envía sola al correo del consumidor.'], ['Devoluciones y notas de crédito', 'En la ficha, «Devolver» en el pago devuelve el dinero (por Culqi o Mercado Pago, o registrando efectivo o transferencia). Si es un descuento y ya hay boleta o factura, se emite sola la nota de crédito. Pasados 7 días un comprobante ya no se da de baja: usa «Nota de crédito».'], ['Arqueos', 'En «Caja y pagos» → «Turnos y arqueos» ves los turnos de todos. La campana avisa de arqueos con diferencia y de turnos abiertos hace más de 12 h; abre el arqueo, revisa la explicación y márcalo como revisado. Las devoluciones en efectivo salen de tu propio turno.'], ['Bitácora', 'Revisa quién hizo cada cambio (tarifas, pagos anulados, devoluciones, usuarios, check-out con saldo…). Los registros no se pueden borrar.'], ['Encuestas', 'En Reportes ves la calificación promedio, el NPS y los comentarios de los huéspedes.']] : [])
  ];
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} titulo={`Guía rápida · ${admin ? 'Administrador' : 'Recepción'}`} ancho="max-w-2xl" pie={<BotonP onClick={alCerrar}>Entendido</BotonP>}>
      <ol className="grid gap-4">{pasos.map(([t, d], i) => <li key={t} className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-soft text-sm font-medium text-gold-dark">{i + 1}</span><div><p className="font-medium">{t}</p><p className="text-sm text-muted">{d}</p></div></li>)}</ol>
    </Modal>
  );
}
