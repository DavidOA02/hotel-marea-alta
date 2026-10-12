import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { anularComprobanteSchema, comprobanteSchema, notaCreditoSchema, notaDebitoSchema } from '@marea/shared';
import { z } from 'zod';
import { falla } from '../comun/errores';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioSesion } from '../auth/auth.service';
import { Roles, SesionGuard, Usuario } from '../auth/guards';
import { Facturacion } from './facturacion.service';

/** Comprobantes electrónicos (boletas y facturas) desde el panel. */
@Controller('gestion')
@UseGuards(SesionGuard)
export class FacturacionController {
  constructor(private readonly facturacion: Facturacion) {}

  @Get('facturacion/estado')
  estado() {
    return this.facturacion.estado();
  }

  @Post('reservas/:codigo/comprobante')
  emitir(@Param('codigo') codigo: string, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(comprobanteSchema)) d: z.output<typeof comprobanteSchema>) {
    return this.facturacion.emitir(codigo, d, u.nombre);
  }

  @Get('comprobantes')
  listar(@Query('desde') desde?: string, @Query('hasta') hasta?: string, @Query('estado') estado?: string) {
    return this.facturacion.listar(desde, hasta, estado);
  }

  @Get('comprobantes/:id')
  async ver(@Param('id', ParseIntPipe) id: number) {
    const k = await this.facturacion.ver(id);
    if (!k) throw falla(404, 'Comprobante no encontrado.');
    return k;
  }

  @Post('comprobantes/:id/sincronizar') @HttpCode(200)
  sincronizar(@Param('id', ParseIntPipe) id: number) {
    return this.facturacion.sincronizar(id);
  }

  /** Nota de crédito: anulación total pasado el plazo de baja, error en el RUC o disminución parcial del valor. */
  @Post('comprobantes/:id/nota-credito') @Roles('Administrador')
  notaCredito(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(notaCreditoSchema)) d: z.output<typeof notaCreditoSchema>) {
    return this.facturacion.emitirNota(id, d, u.nombre);
  }

  @Post('comprobantes/:id/anular') @HttpCode(200) @Roles('Administrador')
  anular(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(anularComprobanteSchema)) d: { motivo: string }) {
    return this.facturacion.anular(id, d.motivo);
  }

  @Post('comprobantes/:id/nota-debito') @Roles('Administrador')
  notaDebito(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(notaDebitoSchema)) d: z.output<typeof notaDebitoSchema>) {
    return this.facturacion.emitirDebito(id, d, u.nombre);
  }
}
