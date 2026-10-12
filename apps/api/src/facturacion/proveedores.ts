import { createHash } from 'crypto';
import { HOTEL } from '../config/hotel';

/* ==========================================================
   Proveedores de facturación electrónica (OSE / PSE).
   · Simulado → solo desarrollo y pruebas: «acepta» al instante, sin validez tributaria.
   · Nubefact → API JSON de Nubefact (PSE y OSE autorizado por SUNAT): genera el XML UBL 2.1,
                lo firma y lo envía a SUNAT. Las credenciales salen de su panel («ruta» y «token»).
   ========================================================== */

export interface ItemComprobante {
  codigo: string; descripcion: string; unidad: string; cantidad: number; valorUnitario: number; precioUnitario: number;
  afectacion: '10' | '40';   // catálogo 07: 10 gravado – operación onerosa, 40 exportación
  igv: number; total: number;
}
export interface DocumentoElectronico {
  tipo: '01' | '03' | '07'; serie: string; numero: number; fechaEmision: string; tipoOperacion: string;
  clienteTipoDoc: string; clienteNumDoc: string; clienteNombre: string; clienteDireccion: string | null; clienteEmail: string | null;
  gravada: number; exportacion: number; igv: number; total: number; items: ItemComprobante[];
  /** Solo notas de crédito: comprobante que modifica y motivo (catálogo 09). */
  nota?: { tipo: '01' | '03'; serie: string; numero: number; motivo: string; sustento: string };
}
export interface ResultadoOse {
  estado: 'Pendiente' | 'Aceptado' | 'Observado' | 'Rechazado'; mensaje: string;
  hash?: string | null; cadenaQr?: string | null; enlacePdf?: string | null; enlaceXml?: string | null; enlaceCdr?: string | null; respuesta?: unknown;
}
/** `transitorio` = no se sabe si el OSE lo recibió (red, 5xx, credenciales): el comprobante queda pendiente y se reintenta. */
export class ErrorOse extends Error { constructor(m: string, readonly transitorio: boolean) { super(m); } }

export interface ProveedorFacturacion {
  nombre: 'Simulado' | 'Nubefact';
  emitir(d: DocumentoElectronico): Promise<ResultadoOse>;
  /** null si el OSE no conoce el documento. */
  consultar(d: DocumentoElectronico): Promise<ResultadoOse | null>;
  anular(d: DocumentoElectronico, motivo: string): Promise<{ mensaje: string; respuesta?: unknown }>;
}

const nombreTipo = (t: string) => ({ '01': 'Factura', '03': 'Boleta', '07': 'Nota de crédito' })[t] ?? t;

/* ---------------- Simulado ---------------- */
export const Simulado: ProveedorFacturacion = {
  nombre: 'Simulado',
  async emitir(d) {
    const hash = createHash('sha256').update(`${d.serie}-${d.numero}|${d.total}|${d.clienteNumDoc}`).digest('base64').slice(0, 28);
    // Formato del código QR de la representación impresa (SUNAT): RUC|tipo|serie|número|IGV|total|fecha|tipo doc|N.° doc|hash|
    const qr = [HOTEL.ruc, d.tipo, d.serie, d.numero, d.igv.toFixed(2), d.total.toFixed(2), d.fechaEmision, d.clienteTipoDoc, d.clienteNumDoc, hash, ''].join('|');
    return { estado: 'Aceptado', mensaje: `La ${nombreTipo(d.tipo)} número ${d.serie}-${d.numero}, ha sido aceptada (SIMULADO: sin validez tributaria).`,
      hash, cadenaQr: qr, respuesta: { simulado: true } };
  },
  async consultar() { return null; },
  async anular(d, motivo) { return { mensaje: `Comunicación de baja simulada de ${d.serie}-${d.numero}: ${motivo}` }; }
};

/* ---------------- Nubefact ----------------
   Códigos de su API JSON. Revisa estos valores con tu cuenta DEMO de Nubefact antes de producción. */
const NF = {
  tipoComprobante: { '01': 1, '03': 2, '07': 3 } as Record<string, number>,   // 3 = nota de crédito
  operacion: { '0101': 1, '0202': 2 } as Record<string, number>,          // sunat_transaction: 1 venta interna, 2 exportación
  tipoIgv: { '10': 1, '40': 16 } as Record<string, number>,               // tipo_de_igv: 1 gravado oneroso, 16 exportación
  monedaSoles: 1
};
const fechaNf = (iso: string) => iso.split('-').reverse().join('-');   // DD-MM-AAAA

async function nubefact(cuerpo: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(process.env.NUBEFACT_RUTA!, {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Token token="${process.env.NUBEFACT_TOKEN}"`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(cuerpo)
    });
  } catch (e: any) { throw new ErrorOse(`Sin respuesta de Nubefact: ${e?.message ?? e}`, true); }
  const b: any = await res.json().catch(() => null);
  if (res.status >= 500 || res.status === 401 || res.status === 403 || !b) throw new ErrorOse(`Nubefact respondió ${res.status}${b?.errors ? ': ' + b.errors : ''}`, true);
  return b;
}

/** Traduce la respuesta de Nubefact. Códigos SUNAT: 0 aceptado, 2000–3999 rechazo, 4000+ observaciones. */
export function interpretarNubefact(b: any): ResultadoOse {
  const codigo = Number(b?.sunat_responsecode ?? NaN);
  const base = { hash: b?.codigo_hash ?? null, cadenaQr: b?.cadena_para_codigo_qr ?? null, enlacePdf: b?.enlace_del_pdf ?? null,
    enlaceXml: b?.enlace_del_xml ?? null, enlaceCdr: b?.enlace_del_cdr ?? null, respuesta: b };
  if (b?.aceptada_por_sunat === true)
    return { ...base, estado: b.sunat_note || codigo >= 4000 ? 'Observado' : 'Aceptado', mensaje: [b.sunat_description, b.sunat_note].filter(Boolean).join(' · ') || 'Aceptado por SUNAT.' };
  if (codigo >= 2000 && codigo < 4000) return { ...base, estado: 'Rechazado', mensaje: b.sunat_description || `Rechazado por SUNAT (código ${codigo}).` };
  // Las boletas van a SUNAT en el resumen diario: Nubefact las recibe y se aceptan más tarde
  return { ...base, estado: 'Pendiente', mensaje: b?.sunat_description || b?.sunat_soap_error || 'Recibido por el OSE; pendiente de respuesta de SUNAT.' };
}

export function cuerpoNubefact(d: DocumentoElectronico) {
  const exportacion = d.tipoOperacion === '0202';
  return {
    operacion: 'generar_comprobante', tipo_de_comprobante: NF.tipoComprobante[d.tipo], serie: d.serie, numero: d.numero,
    sunat_transaction: NF.operacion[d.tipoOperacion] ?? 1,
    cliente_tipo_de_documento: d.clienteTipoDoc, cliente_numero_de_documento: d.clienteNumDoc, cliente_denominacion: d.clienteNombre,
    cliente_direccion: d.clienteDireccion ?? '', cliente_email: d.clienteEmail ?? '',
    fecha_de_emision: fechaNf(d.fechaEmision), moneda: NF.monedaSoles, porcentaje_de_igv: 18.0,
    total_gravada: d.gravada || '', total_inafecta: exportacion ? d.exportacion : '', total_igv: d.igv, total: d.total,
    enviar_automaticamente_a_la_sunat: true, enviar_automaticamente_al_cliente: false, codigo_unico: `${d.serie}-${d.numero}`, formato_de_pdf: 'A4',
    ...(d.nota ? { documento_que_se_modifica_tipo: NF.tipoComprobante[d.nota.tipo], documento_que_se_modifica_serie: d.nota.serie,
      documento_que_se_modifica_numero: d.nota.numero, tipo_de_nota_de_credito: Number(d.nota.motivo), observaciones: d.nota.sustento } : {}),
    items: d.items.map(i => ({ unidad_de_medida: i.unidad, codigo: i.codigo, descripcion: i.descripcion, cantidad: i.cantidad,
      valor_unitario: i.valorUnitario, precio_unitario: i.precioUnitario, subtotal: i.valorUnitario * i.cantidad,
      tipo_de_igv: NF.tipoIgv[i.afectacion], igv: i.igv, total: i.total }))
  };
}

export const Nubefact: ProveedorFacturacion = {
  nombre: 'Nubefact',
  async emitir(d) {
    const b = await nubefact(cuerpoNubefact(d));
    if (b.errors) {
      if (/ya existe|existe en nubefact/i.test(String(b.errors))) { const c = await this.consultar(d); if (c) return c; }
      return { estado: 'Rechazado', mensaje: `Nubefact: ${b.errors}`, respuesta: b };   // error de validación: el documento no se registró
    }
    return interpretarNubefact(b);
  },
  async consultar(d) {
    const b = await nubefact({ operacion: 'consultar_comprobante', tipo_de_comprobante: NF.tipoComprobante[d.tipo], serie: d.serie, numero: d.numero });
    if (b.errors) return null;
    return interpretarNubefact(b);
  },
  async anular(d, motivo) {
    const b = await nubefact({ operacion: 'generar_anulacion', tipo_de_comprobante: NF.tipoComprobante[d.tipo], serie: d.serie, numero: d.numero,
      motivo: motivo.slice(0, 100), codigo_unico: `${d.serie}-${d.numero}` });
    if (b.errors) throw new ErrorOse(`Nubefact no aceptó la anulación: ${b.errors}`, false);
    return { mensaje: b.sunat_description || `Comunicación de baja enviada (ticket ${b.sunat_ticket_numero ?? 'pendiente'}).`, respuesta: b };
  }
};

export const proveedor = (nombre: string): ProveedorFacturacion | null =>
  nombre === 'Nubefact' ? Nubefact : nombre === 'Simulado' && process.env.NODE_ENV !== 'production' ? Simulado : null;
