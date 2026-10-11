import { createHmac, timingSafeEqual } from 'crypto';
import { NombrePasarela, urlApi, urlWeb } from '../config/env';

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

/* ---------------- Simulada ---------------- */
export const Simulada = {
  preparar: async (_o: Orden) => ({ modo: 'simulada' }),
  resultado: (o: Orden, aprobar: boolean): Resultado => aprobar
    ? { aprobado: true, referencia: `SIM-${o.numero}`, metodo: 'Tarjeta', mensaje: 'Pago simulado aprobado.', respuesta: { simulado: true } }
    : { aprobado: false, referencia: null, metodo: 'Tarjeta', mensaje: 'Pago simulado rechazado.', respuesta: { simulado: true } }
};

/* ---------------- Culqi ---------------- */
export const Culqi = {
  preparar: async (o: Orden) => ({
    llavePublica: process.env.CULQI_LLAVE_PUBLICA, script: 'https://js.culqi.com/checkout-js', montoCentimos: centimos(o.monto), moneda: 'PEN'
  }),
  /** Crea el cargo con el token de Culqi Checkout (tarjeta «tkn_…» o Yape «ype_…»). */
  async cobrar(o: Orden, token: string): Promise<Resultado> {
    const metodo: MetodoPago = token.startsWith('ype_') ? 'Yape' : 'Tarjeta';
    const r = await llamar('https://api.culqi.com/v2/charges', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.CULQI_LLAVE_SECRETA}` },
      json: { amount: centimos(o.monto), currency_code: 'PEN', email: o.email, source_id: token, description: `Reserva ${o.codigoReserva}`.slice(0, 80),
        metadata: { orden: o.id, reserva: o.codigoReserva } }
    });
    const b = r.cuerpo ?? {};
    if (r.status === 201 && b.object === 'charge') {
      return { aprobado: true, referencia: b.id, metodo, mensaje: b.outcome?.user_message ?? b.user_message ?? 'Pago aprobado.',
        respuesta: { id: b.id, referencia: b.reference_code, codigo: b.outcome?.code ?? b.response_code, tarjeta: b.source?.last_four ? `****${b.source.last_four}` : undefined } };
    }
    if (b.action_code === 'REVIEW')   // la tarjeta pide 3-D Secure: no hubo cargo
      return { aprobado: false, referencia: null, metodo, mensaje: 'Tu banco pide una validación adicional (3-D Secure). Prueba con otra tarjeta o paga con Yape.', respuesta: { action_code: b.action_code } };
    if (r.status >= 500) throw new ErrorPasarela(`Culqi respondió ${r.status}.`);
    return { aprobado: false, referencia: b.charge_id ?? null, metodo, mensaje: b.user_message ?? 'El pago fue rechazado.',
      respuesta: { tipo: b.type, codigo: b.code ?? b.decline_code, mensaje: b.merchant_message } };
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
