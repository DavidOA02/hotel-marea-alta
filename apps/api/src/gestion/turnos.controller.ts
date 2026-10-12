import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { abrirTurnoSchema, cerrarTurnoSchema, hoyLima, movimientoCajaSchema, revisarTurnoSchema } from '@marea/shared';
import { z } from 'zod';
import { ZodPipe } from '../comun/zod.pipe';
import { fechaFiltro } from '../comun/filtros';
import { UsuarioSesion } from '../auth/auth.service';
import { Roles, SesionGuard, Usuario } from '../auth/guards';
import { TurnosCaja } from '../pagos/turnos.service';

/** Caja por turnos: apertura con fondo inicial, ingresos y retiros de efectivo, arqueo al cerrar y revisión del administrador. */
@Controller('gestion/turnos')
@UseGuards(SesionGuard)
export class TurnosController {
  constructor(private readonly turnos: TurnosCaja) {}

  @Get('actual')
  actual(@Usuario() u: UsuarioSesion) {
    return this.turnos.actual(u);
  }

  @Get()
  listar(@Usuario() u: UsuarioSesion, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    const d = fechaFiltro(desde, 'desde') || hoyLima();
    return this.turnos.listar(u, d, fechaFiltro(hasta, 'hasta') || d);
  }

  @Get(':id')
  detalle(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion) {
    return this.turnos.detalle(id, u);
  }

  @Post()
  abrir(@Usuario() u: UsuarioSesion, @Body(new ZodPipe(abrirTurnoSchema)) d: z.output<typeof abrirTurnoSchema>) {
    return this.turnos.abrir(u, d);
  }

  @Post(':id/movimientos')
  movimiento(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(movimientoCajaSchema)) d: z.output<typeof movimientoCajaSchema>) {
    return this.turnos.movimiento(id, u, d);
  }

  @Post(':id/cerrar') @HttpCode(200)
  cerrar(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(cerrarTurnoSchema)) d: z.output<typeof cerrarTurnoSchema>) {
    return this.turnos.cerrar(id, u, d);
  }

  @Post(':id/revisar') @HttpCode(200) @Roles('Administrador')
  revisar(@Param('id', ParseIntPipe) id: number, @Usuario() u: UsuarioSesion, @Body(new ZodPipe(revisarTurnoSchema)) d: z.output<typeof revisarTurnoSchema>) {
    return this.turnos.revisar(id, u, d);
  }
}
