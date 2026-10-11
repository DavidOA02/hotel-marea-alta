import { urlWeb } from '../config/env';
import { HOTEL } from '../config/hotel';

/* ==========================================================
   Plantillas de correo (HTML con estilos en línea + texto plano).
   Todo dato que escribe un usuario pasa por esc() antes de ir al HTML.
   ========================================================== */
export interface Mensaje { asunto: string; html: string; texto: string }

const OCEANO = '#12303A', ORO = '#7A5C30', GRIS = '#5A635F', LINEA = '#E4E2DC';
const nf2 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const parrafos = (v: unknown) => esc(v).replace(/\r?\n/g, '<br>');
export const soles = (n: number | null | undefined) => 'S/ ' + nf2.format(Number(n || 0));
export function fechaLarga(iso: string | Date | null | undefined) {
  if (!iso) return '—';
  const d = new Date((iso instanceof Date ? iso.toISOString() : String(iso)).slice(0, 10) + 'T12:00:00Z');
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}
const primerNombre = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';

function tabla(filas: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0">${filas.map(([k, v]) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid ${LINEA};color:${GRIS};width:42%">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid ${LINEA}">${esc(v)}</td></tr>`).join('')}</table>`;
}
const textoTabla = (filas: [string, string][]) => filas.map(([k, v]) => `${k}: ${v}`).join('\n');
const boton = (texto: string, url: string) =>
  `<p style="margin:24px 0"><a href="${esc(url)}" style="background:${ORO};color:#fff;text-decoration:none;padding:12px 22px;display:inline-block;letter-spacing:1px;font-size:13px;text-transform:uppercase">${esc(texto)}</a></p>`;

function marco(titulo: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(titulo)}</title></head>
<body style="margin:0;background:#F6F3EE;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1E2A2E;font-size:15px;line-height:1.55">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-top:6px solid ${OCEANO}">
<tr><td style="padding:28px 32px 8px"><div style="font-family:Georgia,serif;font-size:22px;letter-spacing:3px;color:${OCEANO}">MAREA ALTA</div>
<div style="font-size:10px;letter-spacing:3px;color:${ORO}">HOTEL · PARACAS</div></td></tr>
<tr><td style="padding:8px 32px 28px"><h1 style="font-family:Georgia,serif;font-weight:normal;color:${OCEANO};font-size:24px;margin:16px 0 8px">${esc(titulo)}</h1>${cuerpo}</td></tr>
<tr><td style="padding:18px 32px;background:#FAF8F4;color:${GRIS};font-size:12px">${esc(HOTEL.razonSocial)} · RUC ${esc(HOTEL.ruc)}<br>${esc(HOTEL.direccion)}<br>
${esc(HOTEL.telefono)} · <a href="https://wa.me/${esc(HOTEL.whatsapp)}" style="color:${OCEANO}">WhatsApp</a> · ${esc(HOTEL.email)}</td></tr>
</table></td></tr></table></body></html>`;
}
const pie = () => `\n\n—\n${HOTEL.razonSocial} · RUC ${HOTEL.ruc}\n${HOTEL.direccion}\n${HOTEL.telefono} · WhatsApp https://wa.me/${HOTEL.whatsapp}`;

/** Datos de reserva tal como los devuelve SQL_RESERVA. */
export interface ReservaCorreo {
  codigo: string; cliente: string; tipoHabitacion: string; habitacion: string; fechaEntrada: string; fechaSalida: string; noches: number;
  huespedes: number; subtotal: number; igv: number; total: number; exoneradoIgv: boolean; pagado: number; saldo: number; horaLlegada?: string | null;
}
const filasReserva = (r: ReservaCorreo): [string, string][] => [
  ['Código de reserva', r.codigo], ['Habitación', `${r.tipoHabitacion} N.° ${r.habitacion}`],
  ['Llegada', `${fechaLarga(r.fechaEntrada)} · desde las 15:00`], ['Salida', `${fechaLarga(r.fechaSalida)} · hasta las 12:00`],
  ['Noches', String(r.noches)], ['Huéspedes', String(r.huespedes)],
  ['Total', `${soles(r.total)} ${r.exoneradoIgv ? '(exonerado de IGV)' : '(IGV incluido)'}`], ['Pagado', soles(r.pagado)], ['Saldo', soles(r.saldo)]
];
const enlaceReserva = (codigo: string) => `${urlWeb()}/mi-reserva?codigo=${encodeURIComponent(codigo)}`;

export function confirmacionReserva(r: ReservaCorreo, pagoEnLinea: boolean): Mensaje {
  const filas = filasReserva(r);
  const pago = r.saldo > 0.009 ? (pagoEnLinea ? 'Puedes pagar al llegar o en línea desde «Mi reserva».' : 'Pagas al llegar.') : 'Tu reserva está pagada.';
  return {
    asunto: `Reserva ${r.codigo} confirmada · ${HOTEL.nombre}`,
    html: marco(`¡Tu reserva está confirmada, ${primerNombre(r.cliente)}!`,
      `<p>Gracias por elegir ${esc(HOTEL.nombre)}. Estos son los datos de tu estadía:</p>${tabla(filas)}<p>${esc(pago)}</p>
       <p style="color:${GRIS};font-size:13px">Puedes cancelar sin costo hasta 72 horas antes de las 15:00 del día de llegada. Si eres extranjero exonerado de IGV, presenta tu pasaporte y la Tarjeta Andina de Migración al registrarte.</p>
       ${boton('Ver mi reserva', enlaceReserva(r.codigo))}`),
    texto: `¡Tu reserva está confirmada, ${primerNombre(r.cliente)}!\n\n${textoTabla(filas)}\n\n${pago}\nCancelación sin costo hasta 72 h antes de la llegada.\nMi reserva: ${enlaceReserva(r.codigo)}${pie()}`
  };
}

export function cancelacionReserva(r: ReservaCorreo): Mensaje {
  const devolucion = r.pagado > 0.009 ? `Registramos pagos por ${soles(r.pagado)}. Te escribiremos para coordinar la devolución.` : 'No se realizó ningún cobro.';
  return {
    asunto: `Reserva ${r.codigo} cancelada · ${HOTEL.nombre}`,
    html: marco('Tu reserva fue cancelada', `<p>Hola ${esc(primerNombre(r.cliente))}, confirmamos la cancelación de tu reserva <strong>${esc(r.codigo)}</strong>
      (${esc(r.tipoHabitacion)}, del ${esc(fechaLarga(r.fechaEntrada))} al ${esc(fechaLarga(r.fechaSalida))}).</p><p>${esc(devolucion)}</p><p>Esperamos recibirte pronto en Paracas.</p>`),
    texto: `Tu reserva ${r.codigo} fue cancelada (${r.tipoHabitacion}, del ${fechaLarga(r.fechaEntrada)} al ${fechaLarga(r.fechaSalida)}).\n${devolucion}${pie()}`
  };
}

export function pagoRecibido(r: ReservaCorreo, p: { monto: number; pasarela: string; referencia: string | null }): Mensaje {
  const filas: [string, string][] = [['Reserva', r.codigo], ['Monto', soles(p.monto)], ['Medio', `Pago en línea (${p.pasarela})`], ['Operación', p.referencia ?? '—'], ['Saldo pendiente', soles(r.saldo)]];
  return {
    asunto: `Recibimos tu pago · Reserva ${r.codigo}`,
    html: marco('Recibimos tu pago', `<p>Hola ${esc(primerNombre(r.cliente))}, tu pago fue aprobado.</p>${tabla(filas)}${boton('Ver mi reserva', enlaceReserva(r.codigo))}`),
    texto: `Recibimos tu pago.\n\n${textoTabla(filas)}\n\nMi reserva: ${enlaceReserva(r.codigo)}${pie()}`
  };
}

/** Datos de la hoja tal como están en la tabla reclamaciones. */
export interface ReclamoCorreo {
  numero: string; fecha: string | Date; tipo: string; nombreCompleto: string; tipoDocumento: string; numeroDocumento: string; domicilio: string;
  telefono: string; email: string; esMenor: boolean; apoderado: string | null; bienTipo: string; montoReclamado: number | null; codigoReserva: string | null;
  descripcionBien: string; detalle: string; pedido: string; fechaLimiteRespuesta: string; respuesta?: string | null;
}
const filasReclamo = (h: ReclamoCorreo): [string, string][] => [
  ['Hoja N.°', h.numero], ['Fecha', fechaLarga(h.fecha)], ['Tipo', h.tipo], ['Consumidor', h.nombreCompleto], ['Documento', `${h.tipoDocumento} ${h.numeroDocumento}`],
  ['Domicilio', h.domicilio], ['Teléfono', h.telefono], ['Correo', h.email], ...(h.esMenor ? [['Padre, madre o apoderado', h.apoderado ?? '']] as [string, string][] : []),
  ['Bien contratado', `${h.bienTipo}: ${h.descripcionBien}`], ['Monto reclamado', h.montoReclamado != null ? soles(h.montoReclamado) : '—'],
  ...(h.codigoReserva ? [['Reserva', h.codigoReserva]] as [string, string][] : []), ['Plazo de respuesta', fechaLarga(h.fechaLimiteRespuesta)]
];
const AVISO_INDECOPI = 'La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.';

export function constanciaReclamo(h: ReclamoCorreo): Mensaje {
  return {
    asunto: `Hoja de reclamación N.° ${h.numero} · Libro de Reclamaciones de ${HOTEL.nombre}`,
    html: marco(`Registramos tu ${h.tipo.toLowerCase()}`, `<p>Esta es la constancia de tu hoja de reclamación. Te responderemos a este correo a más tardar el <strong>${esc(fechaLarga(h.fechaLimiteRespuesta))}</strong>.</p>
      ${tabla(filasReclamo(h))}<p><strong>Detalle</strong><br>${parrafos(h.detalle)}</p><p><strong>Pedido</strong><br>${parrafos(h.pedido)}</p>
      <p style="color:${GRIS};font-size:12px">${esc(AVISO_INDECOPI)} Libro de Reclamaciones conforme al Código de Protección y Defensa del Consumidor (Ley N.° 29571).</p>`),
    texto: `Registramos tu ${h.tipo.toLowerCase()}. Responderemos a más tardar el ${fechaLarga(h.fechaLimiteRespuesta)}.\n\n${textoTabla(filasReclamo(h))}\n\nDetalle:\n${h.detalle}\n\nPedido:\n${h.pedido}\n\n${AVISO_INDECOPI}${pie()}`
  };
}

export function respuestaReclamo(h: ReclamoCorreo, respuesta: string): Mensaje {
  return {
    asunto: `Respuesta a tu ${h.tipo.toLowerCase()} N.° ${h.numero} · ${HOTEL.nombre}`,
    html: marco(`Respuesta a tu ${h.tipo.toLowerCase()} N.° ${h.numero}`, `<p>Hola ${esc(primerNombre(h.nombreCompleto))}:</p>
      <div style="background:#FAF8F4;border-left:3px solid ${ORO};padding:12px 16px">${parrafos(respuesta)}</div>
      <p style="margin-top:20px"><strong>Tu hoja de reclamación</strong></p>${tabla(filasReclamo(h).slice(0, 3))}<p><strong>Detalle</strong><br>${parrafos(h.detalle)}</p>
      <p style="color:${GRIS};font-size:12px">${esc(AVISO_INDECOPI)}</p>`),
    texto: `Respuesta a tu ${h.tipo.toLowerCase()} N.° ${h.numero}\n\n${respuesta}\n\nDetalle de tu hoja:\n${h.detalle}\n\n${AVISO_INDECOPI}${pie()}`
  };
}

export interface ComprobanteCorreo {
  tipo: string; serie: string; numero: number; fechaEmision: string; clienteNombre: string; gravada: number; exportacion: number; igv: number; total: number;
  enlacePdf: string | null; enlaceXml: string | null; proveedor: string; codigoReserva: string;
}
export function comprobanteEmitido(c: ComprobanteCorreo): Mensaje {
  const nombre = c.tipo === '01' ? 'Factura electrónica' : 'Boleta de venta electrónica';
  const filas: [string, string][] = [['Comprobante', `${nombre} ${c.serie}-${c.numero}`], ['Fecha de emisión', fechaLarga(c.fechaEmision)], ['Cliente', c.clienteNombre],
    ['Reserva', c.codigoReserva], ...(c.exportacion > 0 ? [['Exportación de servicios', soles(c.exportacion)]] as [string, string][] : [['Op. gravada', soles(c.gravada)], ['IGV 18 %', soles(c.igv)]] as [string, string][]),
    ['Importe total', soles(c.total)]];
  const simulado = c.proveedor === 'Simulado' ? 'Documento de PRUEBA emitido en modo simulado: no tiene validez tributaria.' : '';
  const enlaces = [c.enlacePdf && boton('Descargar PDF', c.enlacePdf), c.enlaceXml && `<p><a href="${esc(c.enlaceXml)}" style="color:${OCEANO}">Descargar XML</a></p>`].filter(Boolean).join('');
  return {
    asunto: `${nombre} ${c.serie}-${c.numero} · ${HOTEL.nombre}`,
    html: marco(nombre, `<p>Adjuntamos los datos de tu comprobante electrónico.</p>${tabla(filas)}${enlaces}
      <p style="color:${GRIS};font-size:12px">${esc(simulado || 'Puedes verificar su validez en el portal de consulta de comprobantes de SUNAT.')}</p>`),
    texto: `${nombre} ${c.serie}-${c.numero}\n\n${textoTabla(filas)}${c.enlacePdf ? `\nPDF: ${c.enlacePdf}` : ''}${c.enlaceXml ? `\nXML: ${c.enlaceXml}` : ''}\n${simulado}${pie()}`
  };
}
