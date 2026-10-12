import { createHmac, timingSafeEqual } from 'crypto';
import { NombrePasarela, urlApi, urlWeb } from '../config/env';
import { HOTEL } from '../config/hotel';

/* ==========================================================
   Pasarelas de pago. Cada una traduce entre nuestra «orden» y la API del proveedor:
   · Simulada     → solo desarrollo y pruebas (aprobar / rechazar desde la página de pago).
   · Culqi        → Checkout Custom tokeniza la tarjeta o Yape en el navegador; la API crea el cargo.
   · Mercado Pago → Checkout Pro (redirección); el pago se confirma consultando la API (webhook o retorno).
   · Niubiz       → Botón de Pago Web: sesión → formulario de Niubiz → autorización en la API.
   El monto siempre lo pone la API y el resultado se verifica con la pasarela, nunca con lo que diga el navegador.
   ========================================================== */

export interface Orden { id: string; numero: number; monto: number; email: string; codigoReserva: string; titular: string; expira: Date }
export type MetodoPago = 'Tarjeta' | 'Yape' | 'Transferencia';
/** Resultado definitivo de un cobro. `null` = la pasarela aún no lo decide (p. ej. pago pendiente en Mercado Pago). */
export interface Resultado { aprobado: boolean; referencia: string | null; metodo: MetodoPago; mensaje: string; respuesta: Record<string, unknown> }

export class ErrorPasarela extends Error {}
/** Falló la preparación: todavía no se llamó al endpoint que devuelve dinero. */
export class ErrorDevolucionNoEnviada extends ErrorPasarela {}
const TIEMPO_MS = 20_000;

async function llamar(url: string, init: { method?: string; headers?: Record<string, string>; json?: unknown } = {}): Promise<{ status: number; ok: boolean; cuerpo: any }> {
  const { json, method = 'GET', headers = {} } = init;
  let res: Response;
  try {
    res = await fetch(url, { method, signal: AbortSignal.timeout(TIEMPO_MS),
      headers: { Accept: 'application/json', ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : undefined });
  } catch (e: any) {
    throw new ErrorPasarela(`Sin respuesta de ${new URL(url).host}: ${e?.message ?? e}`);
  }
  const texto = await res.text();
  let cuerpo: any = texto;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch { /* algunas respuestas son texto plano */ }
  return { status: res.status, ok: res.ok, cuerpo };
}

const enlaceRetorno = (o: { id: string }) => `${urlWeb()}/pago?orden=${o.id}`;
const centimos = (monto: number) => Math.round(monto * 100);

/** Resultado de una devolución en la pasarela. «Pendiente» = la pasarela aún la procesa. */
export interface ResultadoDevolucion { estado: 'Completada' | 'Fallida' | 'Pendiente'; referencia: string | null; mensaje: string; respuesta: Record<string, unknown> }

/* ---------------- Simulada ---------------- */
export const Simulada = {
  preparar: async (_o: Orden) => ({ modo: 'simulada' }),
  resultado: (o: Orden, aprobar: boolean): Resultado => aprobar
    ? { aprobado: true, referencia: `SIM-${o.numero}`, metodo: 'Tarjeta', mensaje: 'Pago simulado aprobado.', respuesta: { simulado: true } }
    : { aprobado: false, referencia: null, metodo: 'Tarjeta', mensaje: 'Pago simulado rechazado.', respuesta: { simulado: true } },
  devolver: async (idDevolucion: number): Promise<ResultadoDevolucion> =>
    ({ estado: 'Completada', referencia: `SIM-DEV-${idDevolucion}`, mensaje: 'Devolución simulada.', respuesta: { simulado: true } })
};

/* ---------------- Culqi ---------------- */
/** Parámetros que entrega Culqi3DS en el navegador cuando el banco autentica al titular. */
export interface Autenticacion3DS { eci: string; xid: string; cavv: string; protocolVersion: string; directoryServerTransactionId?: string }
const culqiCabeceras = () => ({ Authorization: `Bearer ${process.env.CULQI_LLAVE_SECRETA}` });

export const Culqi = {
  preparar: async (o: Orden) => ({
    llavePublica: process.env.CULQI_LLAVE_PUBLICA, script: 'https://js.culqi.com/checkout-js', script3DS: 'https://3ds.culqi.com',
    montoCentimos: centimos(o.monto), moneda: 'PEN'
  }),
  /**
   * Crea el cargo con el token de Culqi Checkout (tarjeta «tkn_…» o Yape «ype_…»).
   * Si el antifraude pide 3-D Secure (action_code REVIEW) no hay cargo: el navegador autentica con Culqi3DS
   * y se vuelve a llamar con el mismo token, el mismo dispositivo y los parámetros 3DS.
   * Se decide por el cuerpo de la respuesta (object «charge» o action_code), no por el código HTTP.
   */
  async cobrar(o: Orden, token: string, extra: { dispositivo?: string | null; autenticacion?: Autenticacion3DS | null } = {}): Promise<Resultado | { requiere3DS: true }> {
    const metodo: MetodoPago = token.startsWith('ype_') ? 'Yape' : 'Tarjeta';
    const r = await llamar('https://api.culqi.com/v2/charges', {
      method: 'POST', headers: culqiCabeceras(),
      json: { amount: centimos(o.monto), currency_code: 'PEN', email: o.email, source_id: token, description: `Reserva ${o.codigoReserva}`.slice(0, 80),
        metadata: { orden: o.id, reserva: o.codigoReserva },
        ...(extra.dispositivo ? { antifraud_details: { device_finger_print_id: extra.dispositivo } } : {}),
        ...(extra.autenticacion ? { authentication_3DS: extra.autenticacion } : {}) }
    });
    const b = r.cuerpo ?? {};
    if (r.ok && b.object === 'charge') {
      return { aprobado: true, referencia: b.id, metodo, mensaje: b.outcome?.user_message ?? b.user_message ?? 'Pago aprobado.',
        respuesta: { id: b.id, referencia: b.reference_code, codigo: b.outcome?.code ?? b.response_code, tarjeta: b.source?.last_four ? `****${b.source.last_four}` : undefined, autenticado3DS: !!extra.autenticacion } };
    }
    if (b.action_code === 'REVIEW') {
      if (!extra.autenticacion) return { requiere3DS: true };   // aún sin cargo: falta autenticar en el navegador
      return { aprobado: false, referencia: null, metodo, mensaje: 'Tu banco no pudo confirmar la autenticación 3-D Secure. Prueba con otra tarjeta o paga con Yape.', respuesta: { action_code: b.action_code } };
    }
    if (r.status >= 500) throw new ErrorPasarela(`Culqi respondió ${r.status}.`);
    return { aprobado: false, referencia: b.charge_id ?? null, metodo, mensaje: b.user_message ?? 'El pago fue rechazado.',
      respuesta: { tipo: b.type, codigo: b.code ?? b.decline_code, mensaje: b.merchant_message } };
  },
  /** Devolución total o parcial de un cargo (POST /v2/refunds). */
  async devolver(cargo: string, monto: number): Promise<ResultadoDevolucion> {
    if (!/^chr_[A-Za-z0-9_]+$/.test(cargo)) return { estado: 'Fallida', referencia: null, mensaje: `«${cargo}» no es un cargo de Culqi: devuelve el dinero desde el CulqiPanel.`, respuesta: {} };
    const r = await llamar('https://api.culqi.com/v2/refunds', {
      method: 'POST', headers: culqiCabeceras(), json: { amount: centimos(monto), charge_id: cargo, reason: 'solicitud_comprador' }
    });
    const b = r.cuerpo ?? {};
    if (r.ok && b.object === 'refund') return { estado: 'Completada', referencia: b.id, mensaje: 'Devolución registrada en Culqi.', respuesta: { id: b.id, monto: b.amount, cargo: b.charge_id } };
    if (r.status >= 500) throw new ErrorPasarela(`Culqi respondió ${r.status} a la devolución.`);
    return { estado: 'Fallida', referencia: null, mensaje: b.merchant_message ?? b.user_message ?? `Culqi rechazó la devolución (${r.status}).`, respuesta: { tipo: b.type, codigo: b.code } };
  }
};

/* ---------------- Mercado Pago ---------------- */
const MP = 'https://api.mercadopago.com';
const mpCabeceras = () => ({ Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` });
export const MercadoPago = {
  async preparar(o: Orden) {
    const retorno = enlaceRetorno(o);
    const r = await llamar(`${MP}/checkout/preferences`, {
      method: 'POST', headers: { ...mpCabeceras(), 'X-Idempotency-Key': o.id },
      json: {
        items: [{ id: o.codigoReserva, title: `Hospedaje · Reserva ${o.codigoReserva}`, quantity: 1, currency_id: 'PEN', unit_price: o.monto }],
        payer: { email: o.email }, external_reference: o.id, statement_descriptor: 'MAREA ALTA',
        back_urls: { success: retorno, failure: retorno, pending: retorno },
        ...(retorno.startsWith('https://') ? { auto_return: 'approved' } : {}),   // Mercado Pago no vuelve solo a http://localhost
        notification_url: `${urlApi()}/webhooks/mercadopago`,
        expires: true, expiration_date_to: o.expira.toISOString()
      }
    });
    if (!r.ok || !r.cuerpo?.init_point) throw new ErrorPasarela(`Mercado Pago no creó la preferencia (${r.status}): ${r.cuerpo?.message ?? ''}`);
    const prueba = String(process.env.MP_ACCESS_TOKEN).startsWith('TEST-');
    return { url: prueba ? r.cuerpo.sandbox_init_point ?? r.cuerpo.init_point : r.cuerpo.init_point, preferencia: r.cuerpo.id };
  },
  /** Consulta el pago en la API (la única fuente confiable) y lo traduce. */
  async consultar(pagoId: string): Promise<{ ordenId: string | null; resultado: Resultado | null; monto: number; moneda: string }> {
    if (!/^\d{1,20}$/.test(pagoId)) throw new ErrorPasarela('Identificador de pago de Mercado Pago no válido.');
    const r = await llamar(`${MP}/v1/payments/${pagoId}`, { headers: mpCabeceras() });
    if (!r.ok) throw new ErrorPasarela(`Mercado Pago respondió ${r.status} al consultar el pago ${pagoId}.`);
    const p = r.cuerpo;
    const metodo: MetodoPago = p.payment_method_id === 'yape' ? 'Yape' : ['credit_card', 'debit_card', 'prepaid_card'].includes(p.payment_type_id) ? 'Tarjeta' : 'Transferencia';
    const respuesta = { id: p.id, estado: p.status, detalle: p.status_detail, medio: p.payment_method_id, tipo: p.payment_type_id };
    const base = { ordenId: p.external_reference ?? null, monto: Number(p.transaction_amount), moneda: p.currency_id };
    if (p.status === 'approved') return { ...base, resultado: { aprobado: true, referencia: String(p.id), metodo, mensaje: 'Pago aprobado por Mercado Pago.', respuesta } };
    if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(p.status))
      return { ...base, resultado: { aprobado: false, referencia: String(p.id), metodo, mensaje: `Mercado Pago no aprobó el pago (${p.status_detail ?? p.status}).`, respuesta } };
    return { ...base, resultado: null };   // pending, in_process, authorized…
  },
  /** Devolución total o parcial (POST /v1/payments/{id}/refunds). La clave de idempotencia permite reintentar sin devolver dos veces. */
  async devolver(pagoId: string, monto: number, clave: string): Promise<ResultadoDevolucion> {
    if (!/^\d{1,20}$/.test(pagoId)) return { estado: 'Fallida', referencia: null, mensaje: `«${pagoId}» no es un pago de Mercado Pago.`, respuesta: {} };
    const r = await llamar(`${MP}/v1/payments/${pagoId}/refunds`, { method: 'POST', headers: { ...mpCabeceras(), 'X-Idempotency-Key': clave }, json: { amount: monto } });
    const b = r.cuerpo ?? {};
    if (r.status >= 500) throw new ErrorPasarela(`Mercado Pago respondió ${r.status} a la devolución.`);
    if (!r.ok) return { estado: 'Fallida', referencia: null, mensaje: `Mercado Pago rechazó la devolución: ${b.message ?? r.status}.`, respuesta: { codigo: b.cause?.[0]?.code ?? b.status, mensaje: b.message } };
    const estado = b.status === 'approved' ? 'Completada' : ['rejected', 'cancelled'].includes(b.status) ? 'Fallida' : 'Pendiente';
    return { estado, referencia: b.id != null ? String(b.id) : null, mensaje: `Devolución ${b.status ?? 'registrada'} en Mercado Pago.`, respuesta: { id: b.id, estado: b.status, monto: b.amount } };
  }
};

/**
 * Firma de los webhooks de Mercado Pago (cabecera x-signature «ts=…,v1=…»):
 * HMAC-SHA256 del manifiesto «id:<data.id>;request-id:<x-request-id>;ts:<ts>;» con la clave secreta del panel.
 */
export function firmaMercadoPagoValida(p: { firma?: string; requestId?: string; dataId?: string; secreto: string }) {
  const partes = Object.fromEntries(String(p.firma ?? '').split(',').map(x => x.split('=').map(s => s.trim())).filter(x => x.length === 2));
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(p.dataId ?? '') ? String(p.dataId).toLowerCase() : p.dataId;
  const manifiesto = (id ? `id:${id};` : '') + (p.requestId ? `request-id:${p.requestId};` : '') + `ts:${partes.ts};`;
  const esperado = createHmac('sha256', p.secreto).update(manifiesto).digest('hex');
  return esperado.length === partes.v1.length && timingSafeEqual(Buffer.from(esperado), Buffer.from(partes.v1));
}

/* ---------------- Niubiz ---------------- */
const niubizBase = () => (process.env.NIUBIZ_PRODUCCION === 'true' ? 'https://apiprod.vnforapps.com' : 'https://apisandbox.vnforappstest.com');
const niubizScript = () => (process.env.NIUBIZ_PRODUCCION === 'true' ? 'https://static-content.vnforapps.com/v2/js/checkout.js' : 'https://static-content-qas.vnforapps.com/v2/js/checkout.js?qa=true');
async function niubizToken() {
  const basic = Buffer.from(`${process.env.NIUBIZ_USUARIO}:${process.env.NIUBIZ_CLAVE}`).toString('base64');
  const r = await llamar(`${niubizBase()}/api.security/v1/security`, { headers: { Authorization: `Basic ${basic}`, Accept: 'text/plain' } });
  if (!r.ok || typeof r.cuerpo !== 'string' || !r.cuerpo) throw new ErrorPasarela(`Niubiz no entregó el token de seguridad (${r.status}).`);
  return r.cuerpo;
}
export const Niubiz = {
  async preparar(o: Orden, cliente: { ip: string | null }) {
    const comercio = process.env.NIUBIZ_COMERCIO!;
    const token = await niubizToken();
    const r = await llamar(`${niubizBase()}/api.ecommerce/v2/ecommerce/token/session/${comercio}`, {
      method: 'POST', headers: { Authorization: token },
      json: { channel: 'web', amount: o.monto, antifraud: { clientIp: cliente.ip ?? undefined,
        // Los campos MDD los define Niubiz para cada comercio: ajústalos a los que te pida su equipo de integraciones
        merchantDefineData: { MDD4: o.email, MDD21: 0, MDD32: o.email, MDD75: 'Invitado', MDD77: 0 } } }
    });
    if (!r.ok || !r.cuerpo?.sessionKey) throw new ErrorPasarela(`Niubiz no creó la sesión (${r.status}): ${r.cuerpo?.errorMessage ?? ''}`);
    return { sessionKey: r.cuerpo.sessionKey, comercio, numeroPedido: String(o.numero), monto: o.monto.toFixed(2), script: niubizScript(),
      accion: `${urlApi()}/pagos-en-linea/${o.id}/niubiz`, retorno: enlaceRetorno(o) };
  },
  async devolver(transaccion: string, monto: number, referencia: string, motivo: string): Promise<ResultadoDevolucion> {
    if (!transaccion) throw new ErrorDevolucionNoEnviada('El pago no tiene ID de transacción Niubiz.');
    let token: string;
    try { token = await niubizToken(); }
    catch (e: any) { throw new ErrorDevolucionNoEnviada(e?.message ?? String(e)); }
    const base = process.env.NIUBIZ_DEVOLUCIONES_URL || (process.env.NIUBIZ_PRODUCCION === 'true' ? 'https://apiprod.vnforapps.com' : 'https://apisandbox.vnforappstest.com');
    const r = await llamar(`${base}/api.refund/v1/refund/${encodeURIComponent(process.env.NIUBIZ_COMERCIO!)}/${encodeURIComponent(transaccion)}`, {
      method:'POST', headers:{ Authorization:token }, json:{ ruc:HOTEL.ruc, comment:motivo.slice(0,100), externalReferenceId:referencia, amount:monto }
    });
    const d = r.cuerpo?.data;
    if (r.status >= 500 || r.status === 401 || r.status === 403 || !d) throw new ErrorPasarela(`Niubiz respondió ${r.status} al solicitar la devolución.`);
    if (r.ok && String(d.CODERROR) === '100' && d.CODIGODEVOLUCION?.trim())
      return { estado:'Pendiente', referencia:d.CODIGODEVOLUCION.trim(), mensaje:d.DSCERROR || 'Solicitud registrada; pendiente del banco.', respuesta:{ codigo:d.CODERROR, devolucion:d.CODIGODEVOLUCION } };
    if (String(d.CODERROR) !== '110') throw new ErrorPasarela('Niubiz no confirmó el registro de la devolución.');
    return { estado:'Fallida', referencia:null, mensaje:d.DSCERROR || r.cuerpo.errorMessage || 'Solicitud rechazada.', respuesta:{ codigo:d.CODERROR } };
  },
  async consultarDevolucion(codigo: string): Promise<ResultadoDevolucion> {
    const token = await niubizToken();
    const base = process.env.NIUBIZ_CONSULTA_DEVOLUCIONES_URL || (process.env.NIUBIZ_PRODUCCION === 'true' ? 'https://apiprod.vnforapps.com' : 'https://apitestenv.vnforapps.com');
    const r = await llamar(`${base}/api.refund/v1/queryRefund/${encodeURIComponent(process.env.NIUBIZ_COMERCIO!)}`, {
      method:'POST', headers:{ Authorization:token }, json:{ tipoBusqueda:'01', codigoBusqueda:codigo }
    });
    const d = r.cuerpo?.data;
    if (!r.ok || String(d?.CODERROR) !== '100') throw new ErrorPasarela('Niubiz no confirmó la consulta de la devolución.');
    let lista = d.DEVOLUCIONES;
    if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch { throw new ErrorPasarela('Respuesta de devolución Niubiz inválida.'); } }
    const dev = Array.isArray(lista) ? lista.find(x => String(x.CODIGODEVOLUCION) === codigo) : null;
    if (!dev) throw new ErrorPasarela('Niubiz no devolvió el código solicitado.');
    const estado = dev.ESTADO === 'S' ? 'Completada' : ['T','X','F','V'].includes(dev.ESTADO) ? 'Fallida' : 'Pendiente';
    return { estado, referencia:codigo, mensaje:dev.DESCRIPCIONESTADO || `Estado Niubiz: ${dev.ESTADO}`, respuesta:{ codigo, estado:dev.ESTADO,
      transaccion:dev.IDTRANSACCION, monto:Number(dev.IMPORTEDEVUELTO) } };
  },
  /** Autoriza la transacción con el transactionToken que Niubiz envía al formulario «action». */
  async autorizar(o: Orden, transactionToken: string): Promise<Resultado> {
    const token = await niubizToken();
    const r = await llamar(`${niubizBase()}/api.authorization/v3/authorization/ecommerce/${process.env.NIUBIZ_COMERCIO}`, {
      method: 'POST', headers: { Authorization: token },
      json: { channel: 'web', captureType: 'manual', countable: true,
        order: { tokenId: transactionToken, purchaseNumber: String(o.numero), amount: o.monto, currency: 'PEN' } }
    });
    const d = r.cuerpo?.dataMap ?? r.cuerpo?.data ?? {};
    const respuesta = { codigo: d.ACTION_CODE, descripcion: d.ACTION_DESCRIPTION, estado: d.STATUS, tarjeta: d.CARD, marca: d.BRAND,
      autorizacion: d.AUTHORIZATION_CODE, trace: d.TRACE_NUMBER, transaccion: d.TRANSACTION_ID };
    if (r.ok && d.ACTION_CODE === '000')
      return { aprobado: true, referencia: d.TRANSACTION_ID ?? r.cuerpo?.order?.transactionId ?? null, metodo: 'Tarjeta', mensaje: d.ACTION_DESCRIPTION ?? 'Pago aprobado.', respuesta };
    if (r.status >= 500 || (!r.ok && !d.ACTION_CODE)) throw new ErrorPasarela(`Niubiz respondió ${r.status}: ${r.cuerpo?.errorMessage ?? ''}`);
    return { aprobado: false, referencia: d.TRANSACTION_ID ?? null, metodo: 'Tarjeta', mensaje: d.ACTION_DESCRIPTION ?? 'La tarjeta fue rechazada.', respuesta };
  }
};

/** Prepara el checkout de la pasarela indicada. */
export function preparar(nombre: NombrePasarela, o: Orden, cliente: { ip: string | null }): Promise<Record<string, unknown>> {
  switch (nombre) {
    case 'Simulada': return Simulada.preparar(o);
    case 'Culqi': return Culqi.preparar(o);
    case 'MercadoPago': return MercadoPago.preparar(o);
    case 'Niubiz': return Niubiz.preparar(o, cliente);
  }
}
