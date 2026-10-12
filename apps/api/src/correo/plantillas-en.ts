import { urlWeb } from '../config/env';
import { HOTEL } from '../config/hotel';
import { boton, esc, marco, pie, soles, tabla, textoTabla } from './plantillas';
import type { ComprobanteCorreo, Mensaje, ReclamoCorreo, ReservaCorreo } from './plantillas';

const fecha = (iso: string) => new Intl.DateTimeFormat('en-GB', { dateStyle:'full', timeZone:'UTC' }).format(new Date(iso.slice(0,10)+'T12:00:00Z'));
const enlace = (r: ReservaCorreo) => `${urlWeb()}/mi-reserva?codigo=${encodeURIComponent(r.codigo)}`;
const saludo = (r: ReservaCorreo) => `Hello ${r.cliente.trim().split(/\s+/)[0]},`;
const filas = (r: ReservaCorreo): [string,string][] => [
  ['Booking code',r.codigo], ['Room',`${r.tipoHabitacion} No. ${r.habitacion}`],
  ['Check-in',`${fecha(r.fechaEntrada)} · from 15:00`], ['Check-out',`${fecha(r.fechaSalida)} · by 12:00`],
  ['Nights',String(r.noches)], ['Guests',String(r.huespedes)], ['Total',soles(r.total)], ['Paid',soles(r.pagado)], ['Balance due',soles(r.saldo)]
];
function mensaje(asunto: string, titulo: string, introduccion: string, datos: [string,string][], detalle = '', accion?: { texto:string; url:string }): Mensaje {
  return { asunto, html:marco(titulo, `<p>${esc(introduccion)}</p>${tabla(datos)}${detalle ? `<p>${esc(detalle)}</p>` : ''}${accion ? boton(accion.texto,accion.url) : ''}`, 'en'),
    texto:`${titulo}\n\n${introduccion}\n\n${textoTabla(datos)}\n\n${detalle}${accion ? `\n${accion.texto}: ${accion.url}` : ''}${pie()}` };
}
export function confirmacion(r: ReservaCorreo, online:boolean) {
  const pago = r.saldo > 0.009 ? (online ? 'Pay on arrival or online from My booking.' : 'Pay on arrival.') : 'Your booking is fully paid.';
  return mensaje(`Booking ${r.codigo} confirmed · ${HOTEL.nombre}`, 'Your booking is confirmed', `${saludo(r)} thank you for choosing ${HOTEL.nombre}.`, filas(r),
    `${pago} Cancellation is free up to 72 hours before 15:00 on your arrival date. For non-resident accommodation tax relief, bring your passport and Andean Migration Card (TAM).`, { texto:'View my booking',url:enlace(r) });
}
export function cancelacion(r:ReservaCorreo) {
  return mensaje(`Booking ${r.codigo} cancelled · ${HOTEL.nombre}`, 'Your booking has been cancelled', saludo(r), filas(r),
    r.pagado > 0.009 ? `We recorded payments of ${soles(r.pagado)}. We will contact you to arrange your refund.` : 'No payment was collected. We hope to welcome you to Paracas soon.');
}
export function pago(r:ReservaCorreo,p:{ monto:number; pasarela:string; referencia:string|null }) {
  return mensaje(`Payment received · Booking ${r.codigo}`, 'We received your payment', `${saludo(r)} your payment was approved.`,
    [['Booking',r.codigo],['Amount',soles(p.monto)],['Payment provider',p.pasarela],['Transaction',p.referencia ?? '—'],['Balance due',soles(r.saldo)]], '', { texto:'View my booking',url:enlace(r) });
}
export function recordatorio(r:ReservaCorreo,online:boolean) {
  return mensaje(`See you on ${fecha(r.fechaEntrada)} · Booking ${r.codigo}`, 'Your arrival is coming up', saludo(r), filas(r),
    `We are about 3 hours 30 minutes from Lima via the Panamericana Sur (Paracas exit at km 245). Tell us your arrival time on WhatsApp. Bring your ${r.exoneradoIgv ? 'passport and Andean Migration Card (TAM)' : 'identity document'}.${r.saldo > 0.009 ? (online ? ' Pay your balance online or on arrival.' : ' Pay your balance on arrival.') : ' Your booking is fully paid.'}`, {texto:'View my booking',url:enlace(r)});
}
export function encuesta(r:ReservaCorreo,token:string) {
  return mensaje(`How was your stay at ${HOTEL.nombre}?`, 'Thank you for your visit', saludo(r), [['Booking',r.codigo]],
    'We hope you enjoyed Paracas. Help us improve by answering two questions. It takes less than a minute.', {texto:'Answer the survey',url:`${urlWeb()}/encuesta?token=${encodeURIComponent(token)}`});
}
export function devolucion(r:ReservaCorreo,d:{ monto:number; medio:string; pasarela:string|null; metodo:string; motivo:string }) {
  return mensaje(`Refund of ${soles(d.monto)} · Booking ${r.codigo}`, 'Your refund is confirmed', saludo(r),
    [['Booking',r.codigo],['Refund amount',soles(d.monto)],['Reason',d.motivo]], d.medio === 'Pasarela' ? `Refunded to your original payment method through ${d.pasarela}. Your bank may take a few business days to show it on your statement.` : 'We recorded the refund delivered by the hotel.');
}
export function comprobante(c:ComprobanteCorreo) {
  const nombre = ({'01':'Electronic invoice','03':'Electronic sales receipt','07':'Electronic credit note','08':'Electronic debit note'} as Record<string,string>)[c.tipo] ?? 'Electronic document';
  const m = mensaje(`${nombre} ${c.serie}-${c.numero} · ${HOTEL.nombre}`, nombre, 'Your electronic document has been issued.',
    [['Document',`${c.serie}-${c.numero}`],['Issue date',fecha(c.fechaEmision)],['Customer',c.clienteNombre],['Booking',c.codigoReserva],
      ...(c.modifica ? [['Amends',c.modifica]] as [string,string][] : []), ['Taxable amount',soles(c.gravada)],['Exported services',soles(c.exportacion)],['VAT (IGV)',soles(c.igv)],['Total',soles(c.total)]],
    c.proveedor === 'Simulado' ? 'TEST document issued in simulation mode: it has no tax validity.' : 'You can verify this document on the SUNAT verification portal.', c.enlacePdf ? {texto:'Download PDF',url:c.enlacePdf} : undefined);
  if (c.enlaceXml) { m.html = m.html.replace('</h1>', `</h1><p><a href="${esc(c.enlaceXml)}">Download XML</a></p>`); m.texto += `\nXML: ${c.enlaceXml}`; }
  return m;
}

export function reclamo(h:ReclamoCorreo, respuesta?:string) {
  const titulo = respuesta ? 'Response to your complaint' : 'Your complaint has been registered';
  return mensaje(`${titulo} No. ${h.numero} · ${HOTEL.nombre}`,titulo,
    respuesta || `We will reply to this email by ${fecha(h.fechaLimiteRespuesta)}.`,
    [['Complaint number',h.numero],['Consumer',h.nombreCompleto],['Document',`${h.tipoDocumento} ${h.numeroDocumento}`],['Address',h.domicilio],
      ['Phone',h.telefono],['Email',h.email],['Details',h.detalle],['Requested resolution',h.pedido],['Service or product',h.descripcionBien],
      ['Claimed amount',h.montoReclamado == null ? '—' : soles(h.montoReclamado)],['Response deadline',fecha(h.fechaLimiteRespuesta)],
      ...(h.esMenor ? [['Parent or guardian',h.apoderado ?? '']] as [string,string][] : []), ...(h.codigoReserva ? [['Booking',h.codigoReserva]] as [string,string][] : [])],
    'Submitting this complaint does not prevent you from seeking other remedies and is not a prerequisite for filing a complaint with INDECOPI. Complaints Book under Peruvian Consumer Protection Law No. 29571.');
}
