import { Body, Controller, Get, Headers, HttpCode, Logger, Param, Post, Query, Req, Res } from '@nestjs/common';
import { pagoEnLineaSchema } from '@marea/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { falla } from '../comun/errores';
import { Limite } from '../comun/limite.guard';
import { ZodPipe } from '../comun/zod.pipe';
import { urlWeb } from '../config/env';
import { PagosEnLinea } from './pagos-en-linea.service';
import { Culqi, firmaMercadoPagoValida, MercadoPago, Niubiz, Simulada } from './pasarelas';

/** Pagos en línea desde la web pública (Mi reserva → página de pago). */
@Controller()
export class PagosEnLineaController {
  private readonly log = new Logger('Pagos en línea');
  constructor(private readonly pagos: PagosEnLinea) {}

  @Post('pagos-en-linea') @Limite(10)
  crear(@Body(new ZodPipe(pagoEnLineaSchema)) d: z.output<typeof pagoEnLineaSchema>, @Req() req: Request) {
    return this.pagos.crearOrden(d.codigo, d.email, req.ip ?? null);
  }

  @Get('pagos-en-linea/:id') @Limite(90)
  ver(@Param('id') id: string) {
    return this.pagos.ver(id);
  }

  /** Solo desarrollo: la página de pago simulada aprueba o rechaza. */
  @Post('pagos-en-linea/:id/simulada') @HttpCode(200) @Limite(10)
  async simulada(@Param('id') id: string, @Body(new ZodPipe(z.object({ aprobar: z.boolean() }))) d: { aprobar: boolean }) {
    if (process.env.NODE_ENV === 'production') throw falla(404, 'No encontrado.');
    const o = await this.pagos.paraCobrar(id, 'Simulada');
    await this.pagos.finalizar(id, Simulada.resultado(o, d.aprobar));
    return this.pagos.ver(id);
  }

  /** Culqi Checkout entrega un token (tarjeta o Yape) y aquí se crea el cargo. */
  @Post('pagos-en-linea/:id/culqi') @HttpCode(200) @Limite(10)
  async culqi(@Param('id') id: string, @Body(new ZodPipe(z.object({ token: z.string().regex(/^(tkn|ype)_[A-Za-z0-9_]{6,80}$/, 'Token de Culqi no válido.') }))) d: { token: string }) {
    const o = await this.pagos.paraCobrar(id, 'Culqi');
    try { await this.pagos.finalizar(id, await Culqi.cobrar(o, d.token)); }
    catch (e) { await this.pagos.anotar(id, e); throw falla(502, 'No pudimos confirmar el pago con Culqi. Si se hizo el cargo, el hotel lo verá; escríbenos antes de reintentar.'); }
    return this.pagos.ver(id);
  }

  /** Retorno de Mercado Pago (la página envía el payment_id): se verifica consultando la API. */
  @Post('pagos-en-linea/:id/mercadopago') @HttpCode(200) @Limite(30)
  async mercadoPago(@Param('id') id: string, @Body(new ZodPipe(z.object({ pagoId: z.coerce.string().regex(/^\d{1,20}$/) }))) d: { pagoId: string }) {
    await this.pagos.ver(id);   // valida que la orden exista
    try { await this.aplicarMercadoPago(d.pagoId, id); } catch (e) { await this.pagos.anotar(id, e); }
    return this.pagos.ver(id);
  }

  private async aplicarMercadoPago(pagoId: string, ordenEsperada?: string) {
    const p = await MercadoPago.consultar(pagoId);
    if (!p.ordenId || (ordenEsperada && p.ordenId !== ordenEsperada)) throw new Error(`El pago ${pagoId} de Mercado Pago no corresponde a esta orden.`);
    if (!p.resultado) return;   // aún pendiente: llegará otro aviso
    const o = await this.pagos.ver(p.ordenId);
    if (p.resultado.aprobado && (p.moneda !== 'PEN' || Math.abs(p.monto - o.monto) > 0.009))
      throw new Error(`Mercado Pago aprobó S/ ${p.monto} (${p.moneda}) y la orden era de S/ ${o.monto}: revisar manualmente.`);
    await this.pagos.finalizar(p.ordenId, p.resultado);
  }

  /** Avisos (webhooks) de Mercado Pago. Responde 200 siempre que el aviso sea legítimo, para que no se reintente sin fin. */
  @Post('webhooks/mercadopago') @HttpCode(200)
  async webhookMercadoPago(@Query() q: Record<string, string>, @Body() b: any, @Headers('x-signature') firma?: string, @Headers('x-request-id') requestId?: string) {
    const tipo = q.type ?? q.topic ?? b?.type;
    const dataId = String(q['data.id'] ?? q.id ?? b?.data?.id ?? '');
    const secreto = process.env.MP_WEBHOOK_SECRETO;
    if (secreto && !firmaMercadoPagoValida({ firma, requestId, dataId, secreto })) throw falla(401, 'Firma no válida.');
    if (tipo !== 'payment' || !dataId) return { recibido: true };
    try { await this.aplicarMercadoPago(dataId); }
    catch (e: any) { this.log.error(`Webhook de Mercado Pago (pago ${dataId}): ${e.message}`); }
    return { recibido: true };
  }

  /** «action» del formulario de Niubiz: llega el transactionToken, se autoriza y se vuelve a la web. */
  @Post('pagos-en-linea/:id/niubiz')
  async niubiz(@Param('id') id: string, @Body() b: Record<string, string>, @Res() res: Response) {
    try {
      const o = await this.pagos.paraCobrar(id, 'Niubiz');
      const token = String(b?.transactionToken ?? '');
      if (!/^[A-Za-z0-9]{16,64}$/.test(token)) throw new Error('Niubiz no envió el transactionToken.');
      await this.pagos.finalizar(id, await Niubiz.autorizar(o, token));
    } catch (e) {
      await this.pagos.anotar(id, e);
    }
    res.redirect(303, `${urlWeb()}/pago?orden=${encodeURIComponent(id)}`);
  }
}
