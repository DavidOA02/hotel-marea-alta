import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { asignarLimpiezaSchema, cancelarMantenimientoSchema, hoyLima, mantenimientoSchema, resolverMantenimientoSchema, sumarDias, tareaLimpiezaSchema, terminarLimpiezaSchema } from '@marea/shared';
import { z } from 'zod';
import { falla } from '../comun/errores';
import { fechaFiltro } from '../comun/filtros';
import { ZodPipe } from '../comun/zod.pipe';
import { UsuarioSesion } from '../auth/auth.service';
import { SesionGuard, Usuario } from '../auth/guards';
import { Limpieza } from '../operacion/limpieza.service';
import { Mantenimiento } from '../operacion/mantenimiento.service';

/** Limpieza de habitaciones: plan del día y tareas (programar, asignar, empezar, terminar, anular). */
@Controller('gestion/limpieza')
@UseGuards(SesionGuard)
export class LimpiezaController {
  constructor(private readonly limpieza: Limpieza) {}

  @Get()
  plan() {
    return this.limpieza.plan();
  }

  @Post()
  crear(@Usuario() u: UsuarioSesion, @Body(new ZodPipe(tareaLimpiezaSchema)) d: z.output<typeof tareaLimpiezaSchema>) {
    return this.limpieza.crear(d, u);
  }

  @Post(':id/asignar') @HttpCode(200)
  asignar(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(asignarLimpiezaSchema)) d: z.output<typeof asignarLimpiezaSchema>) {
    return this.limpieza.asignar(id, d);
  }

  @Post(':id/iniciar') @HttpCode(200)
  iniciar(@Param('id', ParseIntPipe) id: number) {
    return this.limpieza.iniciar(id);
  }

  @Post(':id/terminar') @HttpCode(200)
  terminar(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(terminarLimpiezaSchema)) d: z.output<typeof terminarLimpiezaSchema>) {
    return this.limpieza.terminar(id, d, u);
  }

  @Post(':id/anular') @HttpCode(200)
  anular(@Param('id', ParseIntPipe) id: number) {
    return this.limpieza.anular(id);
  }
}

/** Mantenimiento: órdenes por habitación o área común, con bloqueo de la habitación por fechas. */
@Controller('gestion/mantenimiento')
@UseGuards(SesionGuard)
export class MantenimientoController {
  constructor(private readonly mantenimiento: Mantenimiento) {}

  @Get('resumen')
  resumen() {
    return this.mantenimiento.resumen();
  }

  @Get()
  listar(@Query('vista') vista = 'abiertas', @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const h = fechaFiltro(hasta, 'hasta') || hoyLima(), d = fechaFiltro(desde, 'desde') || sumarDias(h, -29);
    if (h < d) throw falla(400, 'La fecha final debe ser posterior a la inicial.', 'hasta');
    return this.mantenimiento.listar(vista, d, h);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number) {
    return this.mantenimiento.detalle(id);
  }

  @Post()
  crear(@Usuario() u: UsuarioSesion, @Body(new ZodPipe(mantenimientoSchema)) d: z.output<typeof mantenimientoSchema>) {
    return this.mantenimiento.crear(d, u);
  }

  @Put(':id')
  editar(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(mantenimientoSchema)) d: z.output<typeof mantenimientoSchema>) {
    return this.mantenimiento.editar(id, d);
  }

  @Post(':id/iniciar') @HttpCode(200)
  iniciar(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion) {
    return this.mantenimiento.iniciar(id, u);
  }

  @Post(':id/resolver') @HttpCode(200)
  resolver(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(resolverMantenimientoSchema)) d: z.output<typeof resolverMantenimientoSchema>) {
    return this.mantenimiento.resolver(id, d, u);
  }

  @Post(':id/cancelar') @HttpCode(200)
  cancelar(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(cancelarMantenimientoSchema)) d: z.output<typeof cancelarMantenimientoSchema>) {
    return this.mantenimiento.cancelar(id, d, u);
  }
}
