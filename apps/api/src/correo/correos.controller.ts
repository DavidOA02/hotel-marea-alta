import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { hoyLima, sumarDias } from '@marea/shared';
import { falla } from '../comun/errores';
import { SesionGuard } from '../auth/guards';
import { Bitacora } from '../auditoria/bitacora.service';
import { Correos } from './correos.service';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Panel de correos: seguimiento de la bandeja de salida, vista previa y reintentos. */
@Controller('gestion/correos')
@UseGuards(SesionGuard)
export class CorreosController {
  constructor(private readonly correos: Correos, private readonly bitacora: Bitacora) {}

  @Get()
  listar(@Query('estado') estado?: string, @Query('tipo') tipo?: string, @Query('desde') desde?: string, @Query('hasta') hasta?: string,
         @Query('buscar') buscar?: string, @Query('limite') limite = '500') {
    const h = hasta || hoyLima(), d = desde || sumarDias(h, -6);
    if (!FECHA.test(d) || !FECHA.test(h)) throw falla(400, 'Fecha no válida.', 'desde');
    if (h < d) throw falla(400, 'La fecha final debe ser posterior a la inicial.', 'hasta');
    return this.correos.buscar({ estado, tipo, desde: d, hastaExcl: sumarDias(h, 1), buscar, limite: Math.min(Math.max(Number(limite) || 500, 1), 2000) });
  }

  /** Para la campana de alertas: correos fallidos y atrasados, y si hay SMTP configurado. */
  @Get('resumen')
  resumen() {
    return this.correos.resumen();
  }

  @Get(':id')
  async ver(@Param('id', ParseIntPipe) id: number) {
    const c = await this.correos.ver(id);
    if (!c) throw falla(404, 'Correo no encontrado.');
    return c;
  }

  @Post('reintentar-fallidos') @HttpCode(200)
  async reintentarFallidos() {
    const n = await this.correos.reintentarFallidos();
    if (n) await this.bitacora.registrar({ accion: 'correo.reintentar', entidad: 'correo', descripcion: `${n} correo(s) fallido(s) devueltos a la cola de envío` });
    return { cantidad: n, mensaje: n ? `${n} correo(s) volvieron a la cola de envío.` : 'No hay correos fallidos.' };
  }

  @Post(':id/reintentar') @HttpCode(200)
  async reintentar(@Param('id', ParseIntPipe) id: number) {
    const r = await this.correos.reintentar(id);
    if (!r) throw falla(409, 'Solo se reintentan correos fallidos.');
    await this.bitacora.registrar({ accion: 'correo.reintentar', entidad: 'correo', entidadId: id, descripcion: `Reintento del correo «${r.asunto}» a ${r.para}` });
    return { id, mensaje: `El correo a ${r.para} volvió a la cola de envío.` };
  }
}
