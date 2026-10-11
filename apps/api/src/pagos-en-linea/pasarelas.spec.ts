import { createHmac } from 'crypto';
import { Culqi, ErrorPasarela, firmaMercadoPagoValida, MercadoPago, Niubiz, Orden } from './pasarelas';

/** Contratos de las pasarelas con fetch simulado: qué se envía y cómo se interpreta cada respuesta. */
const orden: Orden = { id: '0b7f6a7e-4a43-4c39-9a35-1b2a6f0c9d11', numero: 1234, monto: 900, email: 'ana@correo.pe', codigoReserva: 'MA2600042', titular: 'Ana Quispe', expira: new Date('2026-10-11T20:00:00Z') };
let llamadas: { url: string; init: any }[] = [];
function respuestas(...rs: { status?: number; json?: unknown; texto?: string }[]) {
  llamadas = [];
  global.fetch = jest.fn(async (url: any, init: any) => {
    llamadas.push({ url: String(url), init });
    const r = rs.shift() ?? { status: 500, texto: '' };
    return new Response(r.texto ?? JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as any;
}
const cuerpo = (i: number) => JSON.parse(llamadas[i].init.body);

beforeEach(() => Object.assign(process.env, {
  CULQI_LLAVE_PUBLICA: 'pk_test_x', CULQI_LLAVE_SECRETA: 'sk_test_secreta', MP_ACCESS_TOKEN: 'TEST-123', NIUBIZ_COMERCIO: '341198210',
  NIUBIZ_USUARIO: 'integraciones@niubiz.com.pe', NIUBIZ_CLAVE: 'clave', NIUBIZ_PRODUCCION: 'false', WEB_URL: 'https://www.mareaalta.pe', API_URL_PUBLICA: 'https://api.mareaalta.pe/api'
}));

describe('Culqi', () => {
  it('cobra en céntimos con la llave secreta y aprueba el cargo creado (201)', async () => {
    respuestas({ status: 201, json: { object: 'charge', id: 'chr_test_1', amount: 90000, reference_code: 'kwd3', outcome: { type: 'venta_exitosa', user_message: 'Su compra ha sido exitosa.' }, source: { last_four: '1111' } } });
    const r = await Culqi.cobrar(orden, 'tkn_test_abc123');
    expect(llamadas[0].url).toBe('https://api.culqi.com/v2/charges');
    expect(llamadas[0].init.headers.Authorization).toBe('Bearer sk_test_secreta');
    expect(cuerpo(0)).toMatchObject({ amount: 90000, currency_code: 'PEN', email: 'ana@correo.pe', source_id: 'tkn_test_abc123', metadata: { orden: orden.id } });
    expect(r).toMatchObject({ aprobado: true, referencia: 'chr_test_1', metodo: 'Tarjeta', mensaje: 'Su compra ha sido exitosa.' });
  });
  it('Yape se registra como Yape; tarjeta rechazada devuelve el mensaje para el usuario', async () => {
    respuestas({ status: 402, json: { object: 'error', type: 'card_error', user_message: 'Tu tarjeta no tiene fondos suficientes.', merchant_message: 'insufficient_funds' } });
    const r = await Culqi.cobrar(orden, 'ype_test_abc123');
    expect(r).toMatchObject({ aprobado: false, metodo: 'Yape', mensaje: 'Tu tarjeta no tiene fondos suficientes.' });
  });
  it('3-D Secure pendiente no es un cobro; un 5xx es un error transitorio', async () => {
    respuestas({ status: 200, json: { action_code: 'REVIEW', user_message: 'Validación requerida' } });
    expect((await Culqi.cobrar(orden, 'tkn_test_abc123')).aprobado).toBe(false);
    respuestas({ status: 503, json: {} });
    await expect(Culqi.cobrar(orden, 'tkn_test_abc123')).rejects.toBeInstanceOf(ErrorPasarela);
  });
});

describe('Mercado Pago', () => {
  it('crea la preferencia con referencia a la orden y usa el enlace de pruebas con token TEST-', async () => {
    respuestas({ status: 201, json: { id: 'pref-1', init_point: 'https://mp/prod', sandbox_init_point: 'https://mp/sandbox' } });
    const d = await MercadoPago.preparar(orden);
    expect(llamadas[0].url).toBe('https://api.mercadopago.com/checkout/preferences');
    expect(llamadas[0].init.headers['X-Idempotency-Key']).toBe(orden.id);
    expect(cuerpo(0)).toMatchObject({ external_reference: orden.id, auto_return: 'approved', notification_url: 'https://api.mareaalta.pe/api/webhooks/mercadopago',
      items: [{ currency_id: 'PEN', unit_price: 900, quantity: 1 }], back_urls: { success: `https://www.mareaalta.pe/pago?orden=${orden.id}` } });
    expect(d).toEqual({ url: 'https://mp/sandbox', preferencia: 'pref-1' });
  });
  it('traduce el pago consultado: aprobado, rechazado o aún pendiente', async () => {
    respuestas({ json: { id: 99, status: 'approved', transaction_amount: 900, currency_id: 'PEN', external_reference: orden.id, payment_method_id: 'yape', payment_type_id: 'account_money' } });
    expect(await MercadoPago.consultar('99')).toMatchObject({ ordenId: orden.id, monto: 900, resultado: { aprobado: true, referencia: '99', metodo: 'Yape' } });
    respuestas({ json: { id: 98, status: 'rejected', status_detail: 'cc_rejected_insufficient_amount', external_reference: orden.id, payment_type_id: 'credit_card' } });
    expect((await MercadoPago.consultar('98')).resultado).toMatchObject({ aprobado: false, metodo: 'Tarjeta' });
    respuestas({ json: { id: 97, status: 'in_process', external_reference: orden.id } });
    expect((await MercadoPago.consultar('97')).resultado).toBeNull();
    await expect(MercadoPago.consultar('../../otro')).rejects.toBeInstanceOf(ErrorPasarela);
  });
  it('valida la firma x-signature del webhook (HMAC-SHA256 del manifiesto)', () => {
    const secreto = 'mi-secreto', ts = '1704908010', requestId = 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e';
    const v1 = createHmac('sha256', secreto).update(`id:123456;request-id:${requestId};ts:${ts};`).digest('hex');
    expect(firmaMercadoPagoValida({ firma: `ts=${ts},v1=${v1}`, requestId, dataId: '123456', secreto })).toBe(true);
    expect(firmaMercadoPagoValida({ firma: `ts=${ts},v1=${v1}`, requestId, dataId: '999999', secreto })).toBe(false);
    expect(firmaMercadoPagoValida({ firma: undefined, requestId, dataId: '123456', secreto })).toBe(false);
  });
});

describe('Niubiz', () => {
  it('token de seguridad (GET con Basic) → sesión → datos del botón de pago', async () => {
    respuestas({ status: 201, texto: 'eyJ.token.jwt' }, { json: { sessionKey: 'abc123', expirationTime: 1602183788142 } });
    const d = await Niubiz.preparar(orden, { ip: '190.1.2.3' });
    expect(llamadas[0].url).toBe('https://apisandbox.vnforappstest.com/api.security/v1/security');
    expect(llamadas[0].init.method).toBe('GET');
    expect(llamadas[0].init.headers.Authorization).toBe('Basic ' + Buffer.from('integraciones@niubiz.com.pe:clave').toString('base64'));
    expect(llamadas[1].url).toBe('https://apisandbox.vnforappstest.com/api.ecommerce/v2/ecommerce/token/session/341198210');
    expect(llamadas[1].init.headers.Authorization).toBe('eyJ.token.jwt');
    expect(cuerpo(1)).toMatchObject({ channel: 'web', amount: 900, antifraud: { clientIp: '190.1.2.3' } });
    expect(d).toMatchObject({ sessionKey: 'abc123', comercio: '341198210', numeroPedido: '1234', monto: '900.00', accion: `https://api.mareaalta.pe/api/pagos-en-linea/${orden.id}/niubiz` });
  });
  it('autorización: ACTION_CODE 000 aprueba; otro código rechaza con la descripción', async () => {
    respuestas({ status: 201, texto: 'tok' }, { json: { order: { transactionId: '0993' }, dataMap: { ACTION_CODE: '000', ACTION_DESCRIPTION: 'Aprobado y completado con exito', STATUS: 'Authorized', TRANSACTION_ID: '0993', CARD: '455170******8329' } } });
    const ok = await Niubiz.autorizar(orden, '3ECC447FB24D438F8C447FB24D338FAF');
    expect(cuerpo(1)).toMatchObject({ channel: 'web', captureType: 'manual', order: { tokenId: '3ECC447FB24D438F8C447FB24D338FAF', purchaseNumber: '1234', amount: 900, currency: 'PEN' } });
    expect(ok).toMatchObject({ aprobado: true, referencia: '0993', respuesta: { tarjeta: '455170******8329' } });
    respuestas({ status: 201, texto: 'tok' }, { status: 400, json: { errorCode: 400, errorMessage: 'Not Authorized', data: { ACTION_CODE: '180', ACTION_DESCRIPTION: 'Tarjeta no valida', STATUS: 'Not Authorized' } } });
    expect(await Niubiz.autorizar(orden, '3ECC447FB24D438F8C447FB24D338FAF')).toMatchObject({ aprobado: false, mensaje: 'Tarjeta no valida' });
  });
});
